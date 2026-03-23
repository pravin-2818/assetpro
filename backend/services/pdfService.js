let PDFDocument;
try { PDFDocument = require('pdfkit'); } catch(e) { PDFDocument = null; }

/**
 * PDF Export Service using PDFKit
 * Generates professional PDF reports for equipment, employees, assignments
 */



const COLORS = {
  primary: '#6366f1',
  dark: '#111827',
  gray: '#6b7280',
  lightGray: '#f3f4f6',
  border: '#e5e7eb',
  white: '#ffffff',
  green: '#059669',
  red: '#ef4444',
  yellow: '#f59e0b',
};

/**
 * Draw table header row
 */
function drawTableHeader(doc, columns, y, pageWidth) {
  const rowH = 22;
  doc.fillColor(COLORS.primary).rect(40, y, pageWidth - 80, rowH).fill();
  doc.fillColor(COLORS.white).fontSize(9).font('Helvetica-Bold');
  let x = 44;
  columns.forEach(col => {
    doc.text(col.label, x, y + 6, { width: col.width - 4, ellipsis: true });
    x += col.width;
  });
  return y + rowH;
}

/**
 * Draw a single table row
 */
function drawTableRow(doc, row, columns, y, rowIndex, pageWidth) {
  const rowH = 20;
  if (rowIndex % 2 === 0) {
    doc.fillColor(COLORS.lightGray).rect(40, y, pageWidth - 80, rowH).fill();
  }
  doc.fillColor(COLORS.dark).fontSize(8).font('Helvetica');
  let x = 44;
  columns.forEach(col => {
    const val = row[col.key] != null ? String(row[col.key]) : '—';
    doc.text(val, x, y + 6, { width: col.width - 4, ellipsis: true });
    x += col.width;
  });
  // Bottom border
  doc.strokeColor(COLORS.border).lineWidth(0.5)
     .moveTo(40, y + rowH).lineTo(pageWidth - 40, y + rowH).stroke();
  return y + rowH;
}

/**
 * Draw page header (title + subtitle + logo text)
 */
function drawPageHeader(doc, title, subtitle) {
  const pageWidth = doc.page.width;
  // Header background
  doc.fillColor(COLORS.primary).rect(0, 0, pageWidth, 70).fill();
  // Logo text
  doc.fillColor(COLORS.white).fontSize(22).font('Helvetica-Bold').text('AssetPro', 40, 20);
  doc.fillColor('#a5b4fc').fontSize(10).font('Helvetica').text('Asset & Equipment Management System', 40, 46);
  // Title on right
  doc.fillColor(COLORS.white).fontSize(16).font('Helvetica-Bold').text(title, 0, 20, { align: 'right', width: pageWidth - 40 });
  doc.fillColor('#a5b4fc').fontSize(9).font('Helvetica').text(subtitle, 0, 42, { align: 'right', width: pageWidth - 40 });
  // Generated date
  doc.fillColor(COLORS.gray).fontSize(8).text(
    `Generated: ${new Date().toLocaleString('en-IN')}`,
    0, 80, { align: 'right', width: pageWidth - 40 }
  );
}

/**
 * Generate Equipment PDF Report
 */
function generateEquipmentPDF(equipment, res) {
  const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="equipment-report.pdf"');
  doc.pipe(res);

  const pageWidth = doc.page.width;
  drawPageHeader(doc, 'Equipment Report', `Total: ${equipment.length} items`);

  // Summary stats
  const avail = equipment.filter(e => e.status === 'available').length;
  const assigned = equipment.filter(e => e.status === 'assigned').length;
  const maint = equipment.filter(e => e.status === 'maintenance').length;
  const totalValue = equipment.reduce((sum, e) => sum + (e.purchase_price || 0), 0);

  doc.fontSize(9).fillColor(COLORS.gray).font('Helvetica');
  doc.text(`Available: ${avail}   Assigned: ${assigned}   Maintenance: ${maint}   Total Value: ₹${totalValue.toLocaleString('en-IN')}`, 40, 95);

  const columns = [
    { key: 'asset_tag',     label: 'Asset Tag',    width: 70 },
    { key: 'category',      label: 'Category',     width: 75 },
    { key: 'brand',         label: 'Brand',        width: 65 },
    { key: 'model',         label: 'Model',        width: 100 },
    { key: 'serial_number', label: 'Serial No.',   width: 100 },
    { key: 'status',        label: 'Status',       width: 70 },
    { key: 'condition',     label: 'Condition',    width: 65 },
    { key: 'purchase_price',label: 'Price (₹)',    width: 75 },
    { key: 'warranty_expiry',label: 'Warranty',    width: 80 },
    { key: 'assigned_to_name', label: 'Assigned To', width: 95 },
  ];

  let y = 115;
  y = drawTableHeader(doc, columns, y, pageWidth);

  equipment.forEach((row, i) => {
    if (y > doc.page.height - 60) {
      doc.addPage({ layout: 'landscape' });
      drawPageHeader(doc, 'Equipment Report', `Continued`);
      y = 115;
      y = drawTableHeader(doc, columns, y, pageWidth);
    }
    y = drawTableRow(doc, row, columns, y, i, pageWidth);
  });

  doc.end();
}

/**
 * Generate Employees PDF Report
 */
function generateEmployeesPDF(employees, res) {
  const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="employees-report.pdf"');
  doc.pipe(res);

  const pageWidth = doc.page.width;
  drawPageHeader(doc, 'Employees Report', `Total: ${employees.length} employees`);
  doc.fontSize(9).fillColor(COLORS.gray).font('Helvetica');
  const depts = [...new Set(employees.map(e => e.department).filter(Boolean))];
  doc.text(`Departments: ${depts.join(', ')}`, 40, 95);

  const columns = [
    { key: 'employee_id', label: 'Emp ID',       width: 75 },
    { key: 'name',        label: 'Name',          width: 130 },
    { key: 'email',       label: 'Email',         width: 150 },
    { key: 'department',  label: 'Department',    width: 100 },
    { key: 'position',    label: 'Position',      width: 120 },
    { key: 'mobile_phone',label: 'Mobile',        width: 90 },
    { key: 'active_assignments', label: 'Assets', width: 50 },
  ];

  let y = 115;
  y = drawTableHeader(doc, columns, y, pageWidth);
  employees.forEach((row, i) => {
    if (y > doc.page.height - 60) {
      doc.addPage({ layout: 'landscape' });
      drawPageHeader(doc, 'Employees Report', 'Continued');
      y = 115;
      y = drawTableHeader(doc, columns, y, pageWidth);
    }
    y = drawTableRow(doc, row, columns, y, i, pageWidth);
  });

  doc.end();
}

/**
 * Generate Assignments PDF Report
 */
function generateAssignmentsPDF(assignments, res) {
  const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="assignments-report.pdf"');
  doc.pipe(res);

  const pageWidth = doc.page.width;
  const active = assignments.filter(a => !a.returned_date).length;
  drawPageHeader(doc, 'Assignments Report', `Total: ${assignments.length} | Active: ${active}`);
  doc.fontSize(9).fillColor(COLORS.gray).font('Helvetica').text(`Active: ${active}   Returned: ${assignments.length - active}`, 40, 95);

  const columns = [
    { key: 'employee_name', label: 'Employee',      width: 110 },
    { key: 'department',    label: 'Department',    width: 90 },
    { key: 'asset_tag',     label: 'Asset Tag',     width: 75 },
    { key: 'brand',         label: 'Brand',         width: 65 },
    { key: 'model',         label: 'Model',         width: 100 },
    { key: 'assigned_date', label: 'Assigned',      width: 85 },
    { key: 'expected_return',label: 'Expected Ret.',width: 85 },
    { key: 'returned_date', label: 'Returned',      width: 85 },
    { key: 'condition_on_return', label: 'Condition', width: 65 },
  ];

  let y = 115;
  y = drawTableHeader(doc, columns, y, pageWidth);
  assignments.forEach((row, i) => {
    if (y > doc.page.height - 60) {
      doc.addPage({ layout: 'landscape' });
      drawPageHeader(doc, 'Assignments Report', 'Continued');
      y = 115;
      y = drawTableHeader(doc, columns, y, pageWidth);
    }
    y = drawTableRow(doc, row, columns, y, i, pageWidth);
  });

  doc.end();
}

/**
 * Generate a single asset detail PDF (Activity Timeline)
 */
function generateAssetDetailPDF(equipment, assignments, res) {
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="asset-${equipment.asset_tag}.pdf"`);
  doc.pipe(res);

  const pageWidth = doc.page.width;
  // Header
  doc.fillColor(COLORS.primary).rect(0, 0, pageWidth, 70).fill();
  doc.fillColor(COLORS.white).fontSize(20).font('Helvetica-Bold').text('AssetPro', 40, 20);
  doc.fillColor('#a5b4fc').fontSize(10).font('Helvetica').text('Asset Detail Report', 40, 46);
  doc.fillColor(COLORS.white).fontSize(14).font('Helvetica-Bold')
     .text(`${equipment.brand} ${equipment.model}`, 0, 26, { align: 'right', width: pageWidth - 40 });
  doc.fillColor('#a5b4fc').fontSize(9).text(equipment.asset_tag, 0, 48, { align: 'right', width: pageWidth - 40 });

  // Asset info grid
  let y = 90;
  const infoItems = [
    ['Asset Tag', equipment.asset_tag], ['Category', equipment.category],
    ['Brand', equipment.brand], ['Model', equipment.model],
    ['Serial Number', equipment.serial_number || '—'], ['Status', equipment.status],
    ['Condition', equipment.condition], ['Location', equipment.location || '—'],
    ['Purchase Price', equipment.purchase_price ? `₹${Number(equipment.purchase_price).toLocaleString('en-IN')}` : '—'],
    ['Purchase Date', equipment.purchase_date || '—'],
    ['Warranty Expiry', equipment.warranty_expiry || '—'],
  ];

  doc.fontSize(12).font('Helvetica-Bold').fillColor(COLORS.dark).text('Asset Information', 40, y);
  y += 18;
  infoItems.forEach(([label, val], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const xPos = col === 0 ? 40 : 300;
    const yPos = y + row * 22;
    doc.fontSize(8).fillColor(COLORS.gray).font('Helvetica').text(label, xPos, yPos);
    doc.fontSize(10).fillColor(COLORS.dark).font('Helvetica-Bold').text(val, xPos, yPos + 9);
  });

  y += Math.ceil(infoItems.length / 2) * 22 + 20;

  // Depreciation
  if (equipment.purchase_price && equipment.purchase_date) {
    const purchaseDate = new Date(equipment.purchase_date);
    const today = new Date();
    const ageYears = (today - purchaseDate) / (1000 * 60 * 60 * 24 * 365);
    const depRate = 0.2; // 20% straight-line
    const currentValue = Math.max(0, equipment.purchase_price * (1 - depRate * ageYears));
    const depreciation = equipment.purchase_price - currentValue;

    doc.fontSize(12).font('Helvetica-Bold').fillColor(COLORS.dark).text('Depreciation (Straight-Line @ 20% p.a.)', 40, y);
    y += 18;
    doc.fillColor(COLORS.lightGray).rect(40, y, pageWidth - 80, 50).fill();
    doc.fontSize(9).fillColor(COLORS.gray).font('Helvetica')
       .text(`Original Value: ₹${Number(equipment.purchase_price).toLocaleString('en-IN')}`, 55, y + 8)
       .text(`Age: ${ageYears.toFixed(1)} years`, 55, y + 22)
       .text(`Depreciated: ₹${depreciation.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`, 250, y + 8)
       .text(`Current Value: ₹${currentValue.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`, 250, y + 22);
    y += 65;
  }

  // Assignment history
  doc.fontSize(12).font('Helvetica-Bold').fillColor(COLORS.dark).text('Assignment History', 40, y);
  y += 18;
  if (!assignments || assignments.length === 0) {
    doc.fontSize(10).fillColor(COLORS.gray).text('No assignment history found.', 40, y);
  } else {
    const columns = [
      { key: 'employee_name', label: 'Employee',   width: 140 },
      { key: 'department',    label: 'Department', width: 110 },
      { key: 'assigned_date', label: 'Assigned',   width: 90 },
      { key: 'returned_date', label: 'Returned',   width: 90 },
      { key: 'condition_on_return', label: 'Condition', width: 80 },
      { key: 'return_reason', label: 'Reason',     width: 120 },
    ];
    y = drawTableHeader(doc, columns, y, pageWidth);
    assignments.forEach((row, i) => {
      if (y > doc.page.height - 50) {
        doc.addPage();
        y = 40;
        y = drawTableHeader(doc, columns, y, pageWidth);
      }
      y = drawTableRow(doc, row, columns, y, i, pageWidth);
    });
  }

  doc.end();
}

module.exports = { generateEquipmentPDF, generateEmployeesPDF, generateAssignmentsPDF, generateAssetDetailPDF };
