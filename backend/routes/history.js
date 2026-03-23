const express = require('express');
const router = express.Router();
const { getDb } = require('../utils/database');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { table, action, limit = 100, page = 1 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE 1=1';
    const params = [];
    if (table)  { where += ' AND al.table_name = ?'; params.push(table); }
    if (action) { where += ' AND al.action = ?';     params.push(action); }

    const total = db.prepare(`SELECT COUNT(*) as c FROM audit_logs al ${where}`).get(...params).c;
    const rows  = db.prepare(`
      SELECT al.*, u.full_name as user_name, u.username
      FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id
      ${where} ORDER BY al.created_at DESC LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), offset);

    res.json({ success: true, data: rows, meta: { total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) {
    console.error('History error:', err);
    res.status(500).json({ success: false, message: 'Failed to load audit log.' });
  }
});

router.get('/equipment/:id', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT a.*, e.name as employee_name, u.full_name as assigned_by_name
      FROM assignments a
      JOIN employees e ON a.employee_id = e.id
      LEFT JOIN users u ON a.assigned_by = u.id
      WHERE a.equipment_id = ? ORDER BY a.assigned_date DESC
    `).all(req.params.id);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load equipment history.' });
  }
});

router.get('/employee/:id', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT a.*, eq.category, eq.brand, eq.model, eq.asset_tag, eq.serial_number
      FROM assignments a JOIN equipment eq ON a.equipment_id = eq.id
      WHERE a.employee_id = ? ORDER BY a.assigned_date DESC
    `).all(req.params.id);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load employee history.' });
  }
});

module.exports = router;
