/**
 * Export Route - Excel always works, PDF requires pdfkit
 */
const express = require('express');
const router  = express.Router();
const XLSX    = require('xlsx');
const { getDb } = require('../utils/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { createAuditLog } = require('../services/auditService');

router.use(authenticate);
router.use(requireRole('admin', 'manager'));

// Try pdfService
let pdfService = null;
try { pdfService = require('../services/pdfService'); } catch(e) {}

// ── Helper: Excel download ─────────────────────────────────────
function sendXlsx(res, data, sheetName, filename) {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buf);
}

// ── Equipment Excel ────────────────────────────────────────────
router.get('/equipment', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT e.asset_tag, e.category, e.brand, e.model, e.serial_number,
             e.status, e.condition, e.purchase_date, e.purchase_price,
             e.warranty_expiry, e.location,
             emp.name as assigned_to, emp.department,
             e.notes, e.created_at
      FROM equipment e
      LEFT JOIN assignments a ON e.id = a.equipment_id AND a.returned_date IS NULL
      LEFT JOIN employees emp ON a.employee_id = emp.id
      WHERE e.is_active = 1
      ORDER BY e.asset_tag
    `).all();
    createAuditLog('equipment', null, 'EXPORT', null, { type:'excel', count:rows.length }, req);
    sendXlsx(res, rows, 'Equipment', 'equipment-export.xlsx');
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

// ── Employees Excel ────────────────────────────────────────────
router.get('/employees', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT e.employee_id, e.name, e.email, e.department, e.position,
             e.mobile_phone, e.desk_phone, e.location,
             COUNT(a.id) as active_assignments
      FROM employees e
      LEFT JOIN assignments a ON e.id = a.employee_id AND a.returned_date IS NULL
      WHERE e.is_active = 1
      GROUP BY e.id ORDER BY e.department, e.name
    `).all();
    createAuditLog('employees', null, 'EXPORT', null, { type:'excel', count:rows.length }, req);
    sendXlsx(res, rows, 'Employees', 'employees-export.xlsx');
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

// ── Assignments Excel ──────────────────────────────────────────
router.get('/assignments', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT emp.name as employee_name, emp.department,
             eq.asset_tag, eq.brand, eq.model, eq.category,
             a.assigned_date, a.expected_return, a.returned_date,
             a.return_reason, a.condition_on_return, a.notes
      FROM assignments a
      JOIN employees emp ON a.employee_id = emp.id
      JOIN equipment eq  ON a.equipment_id = eq.id
      ORDER BY a.assigned_date DESC
    `).all();
    createAuditLog('assignments', null, 'EXPORT', null, { type:'excel', count:rows.length }, req);
    sendXlsx(res, rows, 'Assignments', 'assignments-export.xlsx');
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

// ── PDF routes ─────────────────────────────────────────────────
router.get('/equipment/pdf', (req, res) => {
  if (!pdfService) return res.status(501).json({ success:false, message:'PDF export requires pdfkit. Run: npm install pdfkit' });
  try {
    const db = getDb();
    const rows = db.prepare(`SELECT e.*, emp.name as assigned_to_name FROM equipment e LEFT JOIN assignments a ON e.id=a.equipment_id AND a.returned_date IS NULL LEFT JOIN employees emp ON a.employee_id=emp.id WHERE e.is_active=1 ORDER BY e.asset_tag`).all();
    pdfService.generateEquipmentPDF(rows, res);
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.get('/employees/pdf', (req, res) => {
  if (!pdfService) return res.status(501).json({ success:false, message:'PDF export requires pdfkit. Run: npm install pdfkit' });
  try {
    const db = getDb();
    const rows = db.prepare(`SELECT e.*, COUNT(a.id) as active_assignments FROM employees e LEFT JOIN assignments a ON e.id=a.employee_id AND a.returned_date IS NULL WHERE e.is_active=1 GROUP BY e.id ORDER BY e.name`).all();
    pdfService.generateEmployeesPDF(rows, res);
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

router.get('/assignments/pdf', (req, res) => {
  if (!pdfService) return res.status(501).json({ success:false, message:'PDF export requires pdfkit. Run: npm install pdfkit' });
  try {
    const db = getDb();
    const rows = db.prepare(`SELECT a.*, emp.name as employee_name, emp.department, eq.asset_tag, eq.brand, eq.model, eq.category FROM assignments a JOIN employees emp ON a.employee_id=emp.id JOIN equipment eq ON a.equipment_id=eq.id ORDER BY a.assigned_date DESC`).all();
    pdfService.generateAssignmentsPDF(rows, res);
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

module.exports = router;
