/**
 * Equipment Route — with Asset Lifecycle (Feature 3)
 * Lifecycle: procurement → active → maintenance → retiring → retired
 */
const express = require('express');
const router = express.Router();
const { getDb } = require('../utils/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const { createAuditLog } = require('../services/auditService');

router.use(authenticate);

// Valid lifecycle transitions
const LIFECYCLE_TRANSITIONS = {
  procurement: ['active', 'retired'],
  active:      ['maintenance', 'retiring', 'retired'],
  available:   ['maintenance', 'retiring', 'retired', 'procurement'],
  maintenance: ['active', 'available', 'retiring', 'retired'],
  retiring:    ['retired'],
  assigned:    ['maintenance'],   // must return first for other transitions
  retired:     [],                // terminal state
  lost:        ['active', 'retired'],
};

// POST /api/equipment/:id/transition — Feature 3
router.post('/:id/transition', requireRole('admin', 'manager'), (req, res) => {
  try {
    const db = getDb();
    const { new_status, reason } = req.body;
    if (!new_status) return res.status(400).json({ success: false, message: 'new_status is required.' });

    const eq = db.prepare('SELECT * FROM equipment WHERE id=? AND is_active=1').get(req.params.id);
    if (!eq) return res.status(404).json({ success: false, message: 'Equipment not found.' });

    const allowed = LIFECYCLE_TRANSITIONS[eq.status] || [];
    if (!allowed.includes(new_status)) {
      return res.status(409).json({
        success: false,
        message: `Cannot transition from "${eq.status}" to "${new_status}". Allowed: ${allowed.join(', ') || 'none (terminal state)'}.`
      });
    }

    // Check no active assignment for non-maintenance transition
    if (eq.status === 'assigned' && new_status !== 'maintenance') {
      return res.status(409).json({ success: false, message: 'Return assigned equipment first before changing lifecycle status.' });
    }

    const old_status = eq.status;
    db.prepare("UPDATE equipment SET status=?, updated_at=datetime('now') WHERE id=?").run(new_status, eq.id);
    createAuditLog('equipment', eq.id, 'UPDATE', { status: old_status }, { status: new_status, transition_reason: reason }, req);

    // Log in audit with reason
    if (reason) {
      db.prepare(`INSERT INTO audit_logs (table_name, record_id, action, old_values, new_values, user_id, ip_address, created_at)
        VALUES ('equipment', ?, 'UPDATE', ?, ?, ?, ?, datetime('now'))`)
        .run(eq.id, JSON.stringify({ status: old_status }), JSON.stringify({ status: new_status, reason }), req.user.id, req.ip);
    }

    const updated = db.prepare('SELECT * FROM equipment WHERE id=?').get(eq.id);
    res.json({
      success: true,
      message: `Status changed: ${old_status} → ${new_status}`,
      data: updated,
      transition: { from: old_status, to: new_status, reason: reason || null }
    });
  } catch (err) {
    console.error('Transition error:', err);
    res.status(500).json({ success: false, message: 'Failed to transition status.' });
  }
});

// GET /api/equipment
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { search, category, status, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = 'WHERE eq.is_active = 1';
    const params = [];
    if (search) {
      where += ' AND (eq.brand LIKE ? OR eq.model LIKE ? OR eq.serial_number LIKE ? OR eq.asset_tag LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (category) { where += ' AND eq.category = ?'; params.push(category); }
    if (status)   { where += ' AND eq.status = ?';   params.push(status); }

    const total = db.prepare(`SELECT COUNT(*) as count FROM equipment eq ${where}`).get(...params).count;
    const rows = db.prepare(`
      SELECT eq.*,
        e.name as assigned_to_name, e.department as assigned_to_dept,
        a.assigned_date as current_assignment_date
      FROM equipment eq
      LEFT JOIN assignments a ON a.equipment_id = eq.id AND a.returned_date IS NULL
      LEFT JOIN employees e ON a.employee_id = e.id
      ${where}
      ORDER BY eq.created_at DESC LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), offset);
    res.json({ success: true, data: rows, meta: { total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load equipment.' });
  }
});

// GET /api/equipment/categories
router.get('/categories', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT category, COUNT(*) as total,
        COUNT(CASE WHEN status='available' THEN 1 END) as available,
        COUNT(CASE WHEN status='assigned' THEN 1 END) as assigned
      FROM equipment WHERE is_active=1 GROUP BY category ORDER BY total DESC
    `).all();
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load categories.' });
  }
});

// GET /api/equipment/:id
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const equipment = db.prepare('SELECT * FROM equipment WHERE id=? AND is_active=1').get(req.params.id);
    if (!equipment) return res.status(404).json({ success: false, message: 'Equipment not found.' });

    const history = db.prepare(`
      SELECT a.*, e.name as employee_name, e.department
      FROM assignments a JOIN employees e ON a.employee_id = e.id
      WHERE a.equipment_id = ? ORDER BY a.assigned_date DESC
    `).all(req.params.id);

    const maintenance = db.prepare(`
      SELECT * FROM maintenance_records WHERE equipment_id=? ORDER BY created_at DESC LIMIT 5
    `).all(req.params.id);

    const allowed_transitions = LIFECYCLE_TRANSITIONS[equipment.status] || [];

    res.json({
      success: true,
      data: { ...equipment, assignment_history: history, maintenance_history: maintenance, allowed_transitions }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load equipment detail.' });
  }
});

// POST /api/equipment
router.post('/', requireRole('admin', 'manager'), validate(schemas.equipment), (req, res) => {
  try {
    const db = getDb();
    if (!req.body.asset_tag) {
      const count = db.prepare('SELECT COUNT(*) as c FROM equipment').get().c;
      req.body.asset_tag = `AST-${String(count + 1).padStart(4, '0')}`;
    }
    const result = db.prepare(`
      INSERT INTO equipment (asset_tag,category,brand,model,serial_number,status,condition,
        purchase_date,purchase_price,warranty_expiry,location,notes)
      VALUES (@asset_tag,@category,@brand,@model,@serial_number,@status,@condition,
        @purchase_date,@purchase_price,@warranty_expiry,@location,@notes)
    `).run(req.body);
    const equipment = db.prepare('SELECT * FROM equipment WHERE id=?').get(result.lastInsertRowid);
    createAuditLog('equipment', result.lastInsertRowid, 'INSERT', null, req.body, req);
    res.status(201).json({ success: true, message: 'Equipment created.', data: equipment });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ success: false, message: 'Serial number or asset tag already exists.' });
    console.error('Equipment POST error:', err);
    res.status(500).json({ success: false, message: 'Failed to create equipment.' });
  }
});

// PUT /api/equipment/:id
router.put('/:id', requireRole('admin', 'manager'), validate(schemas.equipment), (req, res) => {
  try {
    const db = getDb();
    const old = db.prepare('SELECT * FROM equipment WHERE id=? AND is_active=1').get(req.params.id);
    if (!old) return res.status(404).json({ success: false, message: 'Equipment not found.' });

    db.prepare(`
      UPDATE equipment SET asset_tag=@asset_tag,category=@category,brand=@brand,model=@model,
        serial_number=@serial_number,status=@status,condition=@condition,purchase_date=@purchase_date,
        purchase_price=@purchase_price,warranty_expiry=@warranty_expiry,location=@location,notes=@notes,
        updated_at=datetime('now') WHERE id=@id
    `).run({ ...req.body, id: req.params.id });

    // Auto-create maintenance record when status changed to maintenance
    if (req.body.status === 'maintenance' && old.status !== 'maintenance') {
      try {
        const existingMaint = db.prepare("SELECT id FROM maintenance_records WHERE equipment_id=? AND status IN ('scheduled','in_progress')").get(req.params.id);
        if (!existingMaint) {
          db.prepare(`
            INSERT INTO maintenance_records (equipment_id, type, title, description, status, scheduled_date, created_by)
            VALUES (?, 'service', ?, ?, 'in_progress', date('now'), ?)
          `).run(req.params.id, `Maintenance - ${old.brand||''} ${old.model||old.asset_tag}`, `Status changed to maintenance`, req.user?.id || 1);
        }
      } catch(mErr) { console.error('Auto maintenance record error:', mErr.message); }
    }

    const updated = db.prepare('SELECT * FROM equipment WHERE id=?').get(req.params.id);
    createAuditLog('equipment', req.params.id, 'UPDATE', old, req.body, req);
    res.json({ success: true, message: 'Equipment updated.', data: updated });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ success: false, message: 'Serial number or asset tag already exists.' });
    res.status(500).json({ success: false, message: 'Failed to update equipment.' });
  }
});

// DELETE /api/equipment/:id (soft delete)
router.delete('/:id', requireRole('admin'), (req, res) => {
  try {
    const db = getDb();
    const eq = db.prepare('SELECT * FROM equipment WHERE id=? AND is_active=1').get(req.params.id);
    if (!eq) return res.status(404).json({ success: false, message: 'Equipment not found.' });
    if (eq.status === 'assigned') return res.status(409).json({ success: false, message: 'Cannot delete assigned equipment. Return it first.' });
    db.prepare("UPDATE equipment SET is_active=0, updated_at=datetime('now') WHERE id=?").run(req.params.id);
    createAuditLog('equipment', req.params.id, 'DELETE', eq, null, req);
    res.json({ success: true, message: 'Equipment deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete equipment.' });
  }
});

// POST /api/equipment/warranty/send-alert — Send warranty alert email
router.post('/warranty/send-alert', requireRole('admin', 'manager'), (req, res) => {
  try {
    const db = getDb();
    const { recipientEmail, recipientName } = req.body;
    
    if (!recipientEmail) {
      return res.status(400).json({ success: false, message: 'recipientEmail is required.' });
    }

    // Fetch warranty expiring items (next 30 days)
    const items = db.prepare(`
      SELECT id, asset_tag, brand, model, warranty_expiry
      FROM equipment
      WHERE warranty_expiry IS NOT NULL
        AND warranty_expiry BETWEEN date('now') AND date('now', '+30 days')
        AND is_active=1
      ORDER BY warranty_expiry ASC
    `).all();

    if (!items || items.length === 0) {
      return res.status(200).json({ success: true, message: 'No warranty expiring items found.' });
    }

    // Send warranty alert email (non-blocking)
    const { sendWarrantyAlertEmail } = require('../services/emailService');
    sendWarrantyAlertEmail({
      recipientEmail,
      recipientName: recipientName || req.user.full_name || 'Administrator',
      items
    }).catch(e => console.error('Warranty alert email error:', e.message));

    createAuditLog('equipment', null, 'WARRANTY_ALERT_SENT', null, { recipientEmail, itemCount: items.length }, req);
    res.json({ success: true, message: `Warranty alert sent to ${recipientEmail}.`, data: { itemCount: items.length, items } });
  } catch (err) {
    console.error('[POST /equipment/warranty/send-alert]', err.message);
    res.status(500).json({ success: false, message: 'Failed to send warranty alert.' });
  }
});

// ── GET /api/equipment/warranty/expiring-with-employees ────────
// Get warranty expiring items along with current employee assigned
router.get('/warranty/expiring-with-employees', requireRole('admin', 'manager'), (req, res) => {
  try {
    const db = getDb();
    const items = db.prepare(`
      SELECT eq.id, eq.asset_tag, eq.brand, eq.model, eq.warranty_expiry,
             e.name as employee_name, e.email as employee_email, a.id as assignment_id
      FROM equipment eq
      LEFT JOIN assignments a ON eq.id = a.equipment_id AND a.returned_date IS NULL
      LEFT JOIN employees e ON a.employee_id = e.id
      WHERE eq.warranty_expiry IS NOT NULL
        AND eq.warranty_expiry <= datetime('+30 days')
        AND eq.warranty_expiry > datetime('now')
        AND eq.is_active = 1
      ORDER BY eq.warranty_expiry ASC
    `).all();

    res.json({ success: true, data: items, meta: { count: items.length } });
  } catch (err) {
    console.error('[GET /equipment/warranty/expiring-with-employees]', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch warranty expiring items.' });
  }
});

// ── POST /api/equipment/warranty/send-expiry-alerts ───────────
// Send warranty expiry alerts to employees who have the equipment
router.post('/warranty/send-expiry-alerts', requireRole('admin', 'manager'), (req, res) => {
  try {
    const db = getDb();
    const { sendWarrantyExpiryEmail } = require('../services/emailService');
    
    const items = db.prepare(`
      SELECT eq.id, eq.asset_tag, eq.brand, eq.model, eq.warranty_expiry,
             e.name as employee_name, e.email as employee_email, a.id as assignment_id
      FROM equipment eq
      LEFT JOIN assignments a ON eq.id = a.equipment_id AND a.returned_date IS NULL
      LEFT JOIN employees e ON a.employee_id = e.id
      WHERE eq.warranty_expiry IS NOT NULL
        AND eq.warranty_expiry <= datetime('+30 days')
        AND eq.warranty_expiry > datetime('now')
        AND eq.is_active = 1
      ORDER BY eq.warranty_expiry ASC
    `).all();

    let successCount = 0;
    let noAssignmentCount = 0;
    
    items.forEach(item => {
      if (item.employee_email) {
        sendWarrantyExpiryEmail({
          employeeEmail: item.employee_email,
          employeeName: item.employee_name,
          assetTag: item.asset_tag,
          brand: item.brand || '',
          model: item.model || '',
          warrantyExpiry: item.warranty_expiry
        }).then(() => successCount++).catch(e => console.error('Warranty expiry email error:', e.message));
      } else {
        noAssignmentCount++;
      }
    });

    createAuditLog('equipment', null, 'WARRANTY_EXPIRY_ALERTS_SENT', null, { 
      itemCount: items.length, 
      emailsSent: successCount,
      noAssignment: noAssignmentCount 
    }, req);
    
    res.json({ 
      success: true, 
      message: `Warranty expiry alerts queued for ${successCount} employee(s). ${noAssignmentCount} item(s) have no active assignment.`,
      data: { 
        totalItems: items.length, 
        emailsSent: successCount,
        noAssignment: noAssignmentCount 
      } 
    });
  } catch (err) {
    console.error('[POST /equipment/warranty/send-expiry-alerts]', err.message);
    res.status(500).json({ success: false, message: 'Failed to send warranty expiry alerts.' });
  }
});

module.exports = router;
