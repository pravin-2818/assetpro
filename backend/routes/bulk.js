/**
 * Bulk Operations Route
 * - POST /api/bulk/equipment    → Bulk add equipment (JSON array)
 * - POST /api/bulk/import/csv   → CSV import equipment
 * - POST /api/bulk/retire       → Bulk retire equipment
 * - POST /api/bulk/delete       → Bulk soft-delete equipment (admin)
 * - GET  /api/bulk/template     → Download CSV template
 */

const express = require('express');
const router = express.Router();
let multer;
try { multer = require("multer"); } catch(e) { multer = null; }
const { getDb } = require('../utils/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { createAuditLog } = require('../services/auditService');

// Multer: memory storage (no disk write)
const upload = multer ? multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) cb(null, true);
    else cb(new Error('Only CSV files are accepted.'));
  }
}) : null;

router.use(authenticate);

// ── GET /api/bulk/template ──────────────────────────────────────
router.get('/template', (req, res) => {
  const csv = [
    'asset_tag,category,brand,model,serial_number,status,condition,purchase_date,purchase_price,warranty_expiry,location,notes',
    'AST-XXXX,Laptop,Dell,XPS 15,SN12345,available,good,2024-01-15,85000,2026-01-15,Floor 2 - IT Room,Sample laptop',
    'AST-YYYY,Monitor,LG,27UK850,MON98765,available,excellent,2024-02-01,35000,,Floor 2 - Design,Large monitor',
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="equipment-import-template.csv"');
  res.send(csv);
});

// ── POST /api/bulk/import/csv ───────────────────────────────────
router.post('/import/csv', requireRole('admin', 'manager'), (req, res, next) => {
  if (!multer) return res.status(501).json({ success: false, message: 'File upload requires multer package. Run: npm install multer' });
  next();
}, (multer ? upload.single('file') : (req,res,next)=>next()), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No CSV file uploaded.' });

  const csvText = req.file.buffer.toString('utf-8');
  const lines = csvText.replace(/\r/g, '').split('\n').filter(Boolean);
  if (lines.length < 2) return res.status(400).json({ success: false, message: 'CSV is empty or has no data rows.' });

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
  const requiredFields = ['category'];
  const missing = requiredFields.filter(f => !headers.includes(f));
  if (missing.length) {
    return res.status(400).json({ success: false, message: `CSV missing required columns: ${missing.join(', ')}` });
  }

  const db = getDb();
  const results = { inserted: 0, skipped: 0, errors: [] };

  const insertStmt = db.prepare(`
    INSERT INTO equipment (asset_tag, category, brand, model, serial_number, status, condition,
      purchase_date, purchase_price, warranty_expiry, location, notes)
    VALUES (@asset_tag, @category, @brand, @model, @serial_number, @status, @condition,
      @purchase_date, @purchase_price, @warranty_expiry, @location, @notes)
  `);

  const validStatuses = ['available', 'assigned', 'maintenance', 'retired', 'lost'];
  const validConditions = ['excellent', 'good', 'fair', 'poor'];

  // Count for auto asset tag
  let eqCount = db.prepare('SELECT COUNT(*) as c FROM equipment').get().c;

  const importMany = db.transaction(() => {
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row = {};
      headers.forEach((h, idx) => { row[h] = vals[idx] || null; });

      if (!row.category) { results.errors.push(`Row ${i + 1}: 'category' is required`); continue; }

      // Auto asset tag
      if (!row.asset_tag) { row.asset_tag = `AST-${String(++eqCount).padStart(4, '0')}`; }
      // Validate enums
      if (row.status && !validStatuses.includes(row.status)) row.status = 'available';
      if (row.condition && !validConditions.includes(row.condition)) row.condition = 'good';
      row.purchase_price = row.purchase_price ? parseFloat(row.purchase_price) || null : null;

      try {
        insertStmt.run(row);
        results.inserted++;
        createAuditLog('equipment', null, 'INSERT', null, { source: 'csv_import', row }, req);
      } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
          results.skipped++;
          results.errors.push(`Row ${i + 1}: Duplicate asset_tag or serial_number (${row.asset_tag})`);
        } else {
          results.errors.push(`Row ${i + 1}: ${err.message}`);
        }
      }
    }
  });

  try {
    importMany();
    res.json({ success: true, message: `Import complete. ${results.inserted} inserted, ${results.skipped} skipped.`, data: results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/bulk/equipment ──────────────────────────────────
// Body: { items: [ { category, brand, model, ... }, ... ] }
router.post('/equipment', requireRole('admin', 'manager'), (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, message: 'items must be a non-empty array.' });
  }
  if (items.length > 100) {
    return res.status(400).json({ success: false, message: 'Max 100 items per bulk request.' });
  }

  const db = getDb();
  let eqCount = db.prepare('SELECT COUNT(*) as c FROM equipment').get().c;
  const results = { inserted: 0, errors: [] };

  const insertStmt = db.prepare(`
    INSERT INTO equipment (asset_tag, category, brand, model, serial_number, status, condition,
      purchase_date, purchase_price, warranty_expiry, location, notes)
    VALUES (@asset_tag, @category, @brand, @model, @serial_number, @status, @condition,
      @purchase_date, @purchase_price, @warranty_expiry, @location, @notes)
  `);

  const bulkInsert = db.transaction(() => {
    items.forEach((item, i) => {
      if (!item.category) { results.errors.push(`Item ${i + 1}: category required`); return; }
      if (!item.asset_tag) item.asset_tag = `AST-${String(++eqCount).padStart(4, '0')}`;
      item.status = item.status || 'available';
      item.condition = item.condition || 'good';
      try {
        insertStmt.run(item);
        results.inserted++;
      } catch (err) {
        results.errors.push(`Item ${i + 1} (${item.asset_tag}): ${err.message}`);
      }
    });
  });

  bulkInsert();
  createAuditLog('equipment', null, 'INSERT', null, { source: 'bulk', count: results.inserted }, req);
  res.json({ success: true, message: `${results.inserted} items inserted.`, data: results });
});

// ── POST /api/bulk/retire ─────────────────────────────────────
// Body: { ids: [1, 2, 3] }
router.post('/retire', requireRole('admin', 'manager'), (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: 'ids must be a non-empty array.' });
  }

  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  const assigned = db.prepare(
    `SELECT COUNT(*) as c FROM equipment WHERE id IN (${placeholders}) AND status='assigned'`
  ).get(...ids);

  if (assigned.c > 0) {
    return res.status(409).json({ success: false, message: `${assigned.c} item(s) are currently assigned. Return them first.` });
  }

  const result = db.prepare(
    `UPDATE equipment SET status='retired', updated_at=datetime('now') WHERE id IN (${placeholders}) AND is_active=1`
  ).run(...ids);

  createAuditLog('equipment', null, 'UPDATE', null, { action: 'bulk_retire', ids, count: result.changes }, req);
  res.json({ success: true, message: `${result.changes} equipment items retired.`, data: { changes: result.changes } });
});

// ── POST /api/bulk/delete ──────────────────────────────────────
router.post('/delete', requireRole('admin'), (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: 'ids must be a non-empty array.' });
  }

  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  const assigned = db.prepare(
    `SELECT COUNT(*) as c FROM equipment WHERE id IN (${placeholders}) AND status='assigned'`
  ).get(...ids);

  if (assigned.c > 0) {
    return res.status(409).json({ success: false, message: `${assigned.c} item(s) are assigned and cannot be deleted.` });
  }

  const result = db.prepare(
    `UPDATE equipment SET is_active=0, updated_at=datetime('now') WHERE id IN (${placeholders})`
  ).run(...ids);

  createAuditLog('equipment', null, 'DELETE', { ids }, null, req);
  res.json({ success: true, message: `${result.changes} equipment items deleted.`, data: { changes: result.changes } });
});

module.exports = router;
