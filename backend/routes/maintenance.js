/**
 * Asset Maintenance Tracker — Feature 1
 * GET    /api/maintenance                  → All maintenance records
 * POST   /api/maintenance                  → Log new maintenance
 * GET    /api/maintenance/schedules        → Upcoming scheduled maintenance
 * GET    /api/maintenance/due              → Overdue or due-today items
 * GET    /api/maintenance/equipment/:id    → Records for one asset
 * PUT    /api/maintenance/:id              → Update maintenance record
 * DELETE /api/maintenance/:id              → Cancel/delete record (admin)
 */
const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { getDb } = require('../utils/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { createAuditLog } = require('../services/auditService');

router.use(authenticate);

const maintenanceSchema = Joi.object({
  equipment_id:     Joi.number().integer().positive().required(),
  type:             Joi.string().valid('scheduled','service','repair','inspection','upgrade','cleaning','other').required(),
  title:            Joi.string().trim().min(2).max(200).required(),
  description:      Joi.string().trim().min(3).max(500).optional().allow('', null),
  vendor:           Joi.string().trim().max(200).optional().allow('', null),
  performed_by:     Joi.string().trim().max(100).optional().allow('', null),
  cost:             Joi.number().min(0).default(0).optional().allow(null),
  status:           Joi.string().valid('scheduled','in_progress','completed','cancelled').default('scheduled'),
  scheduled_date:   Joi.string().optional().allow('', null),
  completed_date:   Joi.string().optional().allow('', null),
  next_service_date:Joi.string().optional().allow('', null),
  notes:            Joi.string().max(500).optional().allow('', null),
});

// GET /api/maintenance
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { equipment_id, status, type, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE 1=1';
    const params = [];
    if (equipment_id) { where += ' AND m.equipment_id = ?'; params.push(equipment_id); }
    if (status === 'overdue') {
      // Special filter: overdue = next_service_date in past and not cancelled
      where += " AND m.next_service_date IS NOT NULL AND m.next_service_date < date('now') AND m.status != 'cancelled'";
    } else if (status) {
      where += ' AND m.status = ?'; params.push(status);
    }
    if (type)         { where += ' AND m.type = ?';         params.push(type); }

    const total = db.prepare(`SELECT COUNT(*) as c FROM maintenance_records m ${where}`).get(...params).c;
    const rows = db.prepare(`
      SELECT m.*, eq.asset_tag, eq.brand, eq.model, eq.category, u.full_name as created_by_name
      FROM maintenance_records m
      JOIN equipment eq ON m.equipment_id = eq.id
      LEFT JOIN users u ON m.created_by = u.id
      ${where}
      ORDER BY COALESCE(m.scheduled_date, m.created_at) DESC
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), offset);
    res.json({ success: true, data: rows, meta: { total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) {
    console.error('Maintenance GET error:', err);
    res.status(500).json({ success: false, message: 'Failed to load maintenance records.' });
  }
});

// GET /api/maintenance/schedules — upcoming
router.get('/schedules', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT m.*, eq.asset_tag, eq.brand, eq.model, eq.category, eq.location
      FROM maintenance_records m
      JOIN equipment eq ON m.equipment_id = eq.id
      WHERE m.status IN ('scheduled','in_progress')
        AND m.scheduled_date IS NOT NULL
        AND m.scheduled_date >= date('now')
        AND eq.is_active = 1
      ORDER BY m.scheduled_date ASC LIMIT 20
    `).all();
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load schedules.' });
  }
});

// GET /api/maintenance/due — overdue or due within 7 days
router.get('/due', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT m.*, eq.asset_tag, eq.brand, eq.model, eq.category,
        CASE WHEN m.next_service_date < date('now') THEN 'overdue' ELSE 'due_soon' END as urgency
      FROM maintenance_records m
      JOIN equipment eq ON m.equipment_id = eq.id
      WHERE m.next_service_date IS NOT NULL
        AND m.next_service_date <= date('now', '+7 days')
        AND m.status != 'cancelled'
        AND eq.is_active = 1
      ORDER BY m.next_service_date ASC LIMIT 20
    `).all();
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load due maintenance.' });
  }
});

// GET /api/maintenance/equipment/:id
router.get('/equipment/:id', (req, res) => {
  try {
    const db = getDb();
    const eq = db.prepare('SELECT id, asset_tag, brand, model FROM equipment WHERE id=? AND is_active=1').get(req.params.id);
    if (!eq) return res.status(404).json({ success: false, message: 'Equipment not found.' });
    const records = db.prepare(`
      SELECT m.*, u.full_name as created_by_name
      FROM maintenance_records m
      LEFT JOIN users u ON m.created_by = u.id
      WHERE m.equipment_id = ?
      ORDER BY COALESCE(m.completed_date, m.scheduled_date, m.created_at) DESC
    `).all(req.params.id);
    const totalCost = records.reduce((s, r) => s + (r.cost || 0), 0);
    res.json({ success: true, data: records, equipment: eq, meta: { total_records: records.length, total_cost: totalCost } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load maintenance history.' });
  }
});


// GET /api/maintenance/stats — KPI summary for frontend
router.get('/stats', (req, res) => {
  try {
    const db = getDb();
    const stats = db.prepare(`
      SELECT
        COUNT(CASE WHEN status='scheduled' THEN 1 END) as scheduled,
        COUNT(CASE WHEN status='in_progress' THEN 1 END) as in_progress,
        COUNT(CASE WHEN status='completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status='cancelled' THEN 1 END) as cancelled,
        COALESCE(SUM(cost), 0) as total_cost,
        COUNT(CASE WHEN next_service_date IS NOT NULL AND next_service_date < date('now') AND status != 'cancelled' THEN 1 END) as overdue
      FROM maintenance_records
    `).get();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get maintenance stats.' });
  }
});

// POST /api/maintenance
router.post('/', requireRole('admin', 'manager'), (req, res) => {
  try {
    const { error, value } = maintenanceSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json({ success: false, message: 'Validation failed.', errors: error.details.map(d => ({ field: d.path[0], message: d.message })) });

    const db = getDb();
    const eq = db.prepare('SELECT id, status FROM equipment WHERE id=? AND is_active=1').get(value.equipment_id);
    if (!eq) return res.status(404).json({ success: false, message: 'Equipment not found.' });

    // If status=in_progress, set equipment to maintenance
    const doTx = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO maintenance_records
          (equipment_id, type, title, description, vendor, performed_by, cost, status,
           scheduled_date, completed_date, next_service_date, notes, created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        value.equipment_id, value.type, value.title || 'Maintenance',
        value.description || value.title || 'Maintenance task',
        value.vendor || null, value.performed_by || null,
        value.cost || 0, value.status,
        value.scheduled_date || null, value.completed_date || null,
        value.next_service_date || null, value.notes || null, req.user.id
      );

      // Update equipment status
      if (value.status === 'in_progress' || value.status === 'scheduled') {
        if (eq.status !== 'assigned') {
          db.prepare("UPDATE equipment SET status='maintenance', updated_at=datetime('now') WHERE id=?").run(value.equipment_id);
        }
      } else if (value.status === 'completed') {
        if (eq.status === 'maintenance') {
          db.prepare("UPDATE equipment SET status='available', updated_at=datetime('now') WHERE id=?").run(value.equipment_id);
        }
      }
      return result.lastInsertRowid;
    });

    const id = doTx();
    const record = db.prepare('SELECT m.*, eq.asset_tag, eq.brand, eq.model FROM maintenance_records m JOIN equipment eq ON m.equipment_id=eq.id WHERE m.id=?').get(id);
    createAuditLog('maintenance_records', id, 'INSERT', null, value, req);
    res.status(201).json({ success: true, message: 'Maintenance record created.', data: record });
  } catch (err) {
    console.error('Maintenance POST error:', err);
    res.status(500).json({ success: false, message: 'Failed to create maintenance record.' });
  }
});

// PUT /api/maintenance/:id
router.put('/:id', requireRole('admin', 'manager'), (req, res) => {
  try {
    const { error, value } = maintenanceSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(400).json({ success: false, message: 'Validation failed.', errors: error.details.map(d => d.message) });

    const db = getDb();
    const old = db.prepare('SELECT * FROM maintenance_records WHERE id=?').get(req.params.id);
    if (!old) return res.status(404).json({ success: false, message: 'Record not found.' });

    db.prepare(`
      UPDATE maintenance_records SET type=?, title=?, description=?, vendor=?, performed_by=?, cost=?, status=?,
        scheduled_date=?, completed_date=?, next_service_date=?, notes=?, updated_at=datetime('now')
      WHERE id=?
    `).run(value.type, value.title||'Maintenance', value.description||value.title||'Maintenance task',
           value.vendor||null, value.performed_by||null, value.cost||0, value.status,
           value.scheduled_date||null, value.completed_date||null, value.next_service_date||null,
           value.notes||null, req.params.id);

    if (value.status === 'completed' && old.status !== 'completed') {
      const eq = db.prepare('SELECT status FROM equipment WHERE id=?').get(old.equipment_id);
      if (eq && eq.status === 'maintenance') {
        db.prepare("UPDATE equipment SET status='available', updated_at=datetime('now') WHERE id=?").run(old.equipment_id);
      }
    }

    createAuditLog('maintenance_records', req.params.id, 'UPDATE', old, value, req);
    const updated = db.prepare('SELECT * FROM maintenance_records WHERE id=?').get(req.params.id);
    res.json({ success: true, message: 'Maintenance record updated.', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update record.' });
  }
});

// DELETE /api/maintenance/:id
router.delete('/:id', requireRole('admin'), (req, res) => {
  try {
    const db = getDb();
    const rec = db.prepare('SELECT * FROM maintenance_records WHERE id=?').get(req.params.id);
    if (!rec) return res.status(404).json({ success: false, message: 'Record not found.' });
    db.prepare('DELETE FROM maintenance_records WHERE id=?').run(req.params.id);
    createAuditLog('maintenance_records', req.params.id, 'DELETE', rec, null, req);
    res.json({ success: true, message: 'Maintenance record deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete record.' });
  }
});

module.exports = router;
