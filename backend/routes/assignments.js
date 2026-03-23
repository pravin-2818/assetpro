/**
 * Assignments Route — v5
 * All endpoints wrapped in try/catch
 * Full Joi validation on POST/PATCH
 */
const express = require('express');
const router  = express.Router();
const Joi     = require('joi');
const { getDb }                          = require('../utils/database');
const { authenticate, requireRole }      = require('../middleware/auth');
const { validate, schemas }              = require('../middleware/validation');
const { createAuditLog }                 = require('../services/auditService');
const { sendAssignmentEmail, sendReturnEmail, sendReturnReminderEmail, sendWarrantyExpiryEmail, sendExpectedReturnUpdatedEmail } = require('../services/emailService');

router.use(authenticate);

// ── GET /api/assignments ──────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { status, employee_id, equipment_id, search, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = 'WHERE 1=1';
    const params = [];
    if (status === 'active')    { where += ' AND a.returned_date IS NULL'; }
    if (status === 'returned')  { where += ' AND a.returned_date IS NOT NULL'; }
    if (employee_id)            { where += ' AND a.employee_id = ?'; params.push(Number(employee_id)); }
    if (equipment_id)           { where += ' AND a.equipment_id = ?'; params.push(Number(equipment_id)); }
    if (search) {
      where += ' AND (e.name LIKE ? OR eq.brand LIKE ? OR eq.model LIKE ? OR eq.asset_tag LIKE ? OR e.department LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    const total = db.prepare(`SELECT COUNT(*) as count FROM assignments a JOIN employees e ON a.employee_id=e.id JOIN equipment eq ON a.equipment_id=eq.id ${where}`).get(...params).count;
    const rows  = db.prepare(`
      SELECT a.*,
        e.name        as employee_name,
        e.department,
        e.employee_id as emp_id,
        eq.category, eq.brand, eq.model, eq.serial_number, eq.asset_tag,
        u.full_name   as assigned_by_name
      FROM assignments a
      JOIN  employees  e  ON a.employee_id  = e.id
      JOIN  equipment  eq ON a.equipment_id = eq.id
      LEFT JOIN users  u  ON a.assigned_by  = u.id
      ${where}
      ORDER BY a.assigned_date DESC
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), offset);

    res.json({ success: true, data: rows, meta: { total, page: parseInt(page), limit: parseInt(limit) } });
  } catch (err) {
    console.error('[GET /assignments]', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch assignments.' });
  }
});

// ── GET /api/assignments/stats/overview ──────────────────────
router.get('/stats/overview', (req, res) => {
  try {
    const db    = getDb();
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN returned_date IS NULL THEN 1 END) as active,
        COUNT(CASE WHEN returned_date IS NOT NULL THEN 1 END) as returned,
        COUNT(CASE WHEN expected_return IS NOT NULL
          AND returned_date IS NULL
          AND expected_return < datetime('now') THEN 1 END) as overdue
      FROM assignments
    `).get();
    res.json({ success: true, data: stats });
  } catch (err) {
    console.error('[GET /assignments/stats]', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch stats.' });
  }
});

// ── POST /api/assignments ─────────────────────────────────────
router.post('/', requireRole('admin', 'manager'), validate(schemas.assignment), (req, res) => {
  try {
    const db = getDb();

    // Validate employee exists
    const employee  = db.prepare('SELECT * FROM employees WHERE id = ? AND is_active = 1').get(req.body.employee_id);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found or inactive.' });

    // Validate equipment exists and is available
    const equipment = db.prepare('SELECT * FROM equipment WHERE id = ? AND is_active = 1').get(req.body.equipment_id);
    if (!equipment) return res.status(404).json({ success: false, message: 'Equipment not found.' });
    if (equipment.status !== 'available') {
      return res.status(409).json({ success: false, message: `Equipment is currently "${equipment.status}" — not available for assignment.` });
    }

    // Transaction: create assignment + update equipment status
    const newId = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO assignments (employee_id, equipment_id, assigned_by, expected_return, notes)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        req.body.employee_id,
        req.body.equipment_id,
        req.user.id,
        req.body.expected_return || null,
        req.body.notes           || null
      );
      db.prepare("UPDATE equipment SET status='assigned', updated_at=datetime('now') WHERE id=?")
        .run(req.body.equipment_id);
      return result.lastInsertRowid;
    })();

    const assignment = db.prepare(`
      SELECT a.*, e.name as employee_name, eq.brand, eq.model, eq.asset_tag
      FROM assignments a
      JOIN employees e  ON a.employee_id  = e.id
      JOIN equipment eq ON a.equipment_id = eq.id
      WHERE a.id = ?
    `).get(newId);

    createAuditLog('assignments', newId, 'INSERT', null, req.body, req);

    // Non-blocking email
    const assigner = db.prepare('SELECT full_name FROM users WHERE id=?').get(req.user.id);
    if (employee.email) {
      sendAssignmentEmail({
        employeeName: employee.name, employeeEmail: employee.email,
        assetTag: equipment.asset_tag, brand: equipment.brand || '',
        model: equipment.model || '', category: equipment.category,
        assignedDate: new Date().toISOString(),
        expectedReturn: req.body.expected_return,
        assignedByName: assigner ? assigner.full_name : 'Admin',
      }).catch(e => console.error('Assignment email error:', e.message));
    }

    res.status(201).json({ success: true, message: 'Equipment assigned successfully.', data: assignment });
  } catch (err) {
    console.error('[POST /assignments]', err.message);
    res.status(500).json({ success: false, message: 'Failed to create assignment.' });
  }
});

// ── POST /api/assignments/:id/return ─────────────────────────
router.post('/:id/return', requireRole('admin', 'manager'), validate(schemas.returnAssignment), (req, res) => {
  try {
    const db         = getDb();
    const assignment = db.prepare('SELECT * FROM assignments WHERE id = ?').get(req.params.id);
    if (!assignment)           return res.status(404).json({ success: false, message: 'Assignment not found.' });
    if (assignment.returned_date) return res.status(409).json({ success: false, message: 'Equipment already returned.' });

    db.transaction(() => {
      db.prepare(`
        UPDATE assignments
        SET returned_date = datetime('now'), return_reason = ?, condition_on_return = ?,
            notes = COALESCE(?, notes), updated_at = datetime('now')
        WHERE id = ?
      `).run(req.body.return_reason, req.body.condition_on_return, req.body.notes || null, req.params.id);

      db.prepare("UPDATE equipment SET status='available', updated_at=datetime('now') WHERE id=?")
        .run(assignment.equipment_id);
    })();

    const updated  = db.prepare('SELECT * FROM assignments WHERE id = ?').get(req.params.id);
    createAuditLog('assignments', req.params.id, 'UPDATE', assignment, req.body, req);

    // Non-blocking return email
    const emp = db.prepare('SELECT * FROM employees WHERE id=?').get(assignment.employee_id);
    const eq  = db.prepare('SELECT * FROM equipment  WHERE id=?').get(assignment.equipment_id);
    if (emp?.email && eq) {
      sendReturnEmail({
        employeeName: emp.name, employeeEmail: emp.email,
        assetTag: eq.asset_tag, brand: eq.brand || '', model: eq.model || '',
        returnDate: new Date().toISOString(), condition: req.body.condition_on_return,
      }).catch(e => console.error('Return email error:', e.message));
    }

    res.json({ success: true, message: 'Equipment returned successfully.', data: updated });
  } catch (err) {
    console.error('[POST /assignments/:id/return]', err.message);
    res.status(500).json({ success: false, message: 'Failed to process return.' });
  }
});

// ── POST /api/assignments/:id/send-return-reminder ────────────
// Manually send return reminder email (called 1 week before return date)
router.post('/:id/send-return-reminder', requireRole('admin', 'manager'), (req, res) => {
  try {
    const db = getDb();
    const assignment = db.prepare(`
      SELECT a.*, e.name as employee_name, e.email, eq.asset_tag, eq.brand, eq.model
      FROM assignments a
      JOIN employees e ON a.employee_id = e.id
      JOIN equipment eq ON a.equipment_id = eq.id
      WHERE a.id = ?
    `).get(req.params.id);
    
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found.' });
    if (assignment.returned_date) return res.status(409).json({ success: false, message: 'Equipment already returned.' });
    if (!assignment.expected_return) return res.status(400).json({ success: false, message: 'No return date set for this assignment.' });

    if (assignment.email) {
      sendReturnReminderEmail({
        employeeEmail: assignment.email,
        employeeName: assignment.employee_name,
        assetTag: assignment.asset_tag,
        brand: assignment.brand || '',
        model: assignment.model || '',
        expectedReturnDate: assignment.expected_return,
        assignmentId: req.params.id
      }).catch(e => console.error('Return reminder email error:', e.message));
    }

    createAuditLog('assignments', req.params.id, 'SEND_REMINDER', null, { type: 'return_reminder' }, req);
    res.json({ success: true, message: 'Return reminder email sent successfully.' });
  } catch (err) {
    console.error('[POST /assignments/:id/send-return-reminder]', err.message);
    res.status(500).json({ success: false, message: 'Failed to send reminder email.' });
  }
});

// ── GET /api/assignments/reminders/pending ────────────────────
// Get all assignments with upcoming return dates (within 7 days)
router.get('/reminders/pending', requireRole('admin', 'manager'), (req, res) => {
  try {
    const db = getDb();
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const deadline = sevenDaysFromNow.toISOString().split('T')[0];
    
    const reminders = db.prepare(`
      SELECT a.*, e.name as employee_name, e.email, eq.asset_tag, eq.brand, eq.model,
             CAST((julianday(a.expected_return) - julianday('now')) AS INTEGER) as days_until_return
      FROM assignments a
      JOIN employees e ON a.employee_id = e.id
      JOIN equipment eq ON a.equipment_id = eq.id
      WHERE a.returned_date IS NULL 
        AND a.expected_return IS NOT NULL
        AND a.expected_return <= ?
        AND a.expected_return > datetime('now')
      ORDER BY a.expected_return ASC
    `).all(deadline);

    res.json({ success: true, data: reminders, meta: { count: reminders.length } });
  } catch (err) {
    console.error('[GET /assignments/reminders/pending]', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch pending reminders.' });
  }
});

// ── POST /api/assignments/reminders/send-all ──────────────────
// Send return reminders for all assignments with upcoming return dates (within 7 days)
router.post('/reminders/send-all', requireRole('admin', 'manager'), (req, res) => {
  try {
    const db = getDb();
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const deadline = sevenDaysFromNow.toISOString().split('T')[0];
    
    const reminders = db.prepare(`
      SELECT a.*, e.name as employee_name, e.email, eq.asset_tag, eq.brand, eq.model
      FROM assignments a
      JOIN employees e ON a.employee_id = e.id
      JOIN equipment eq ON a.equipment_id = eq.id
      WHERE a.returned_date IS NULL 
        AND a.expected_return IS NOT NULL
        AND a.expected_return <= ?
        AND a.expected_return > datetime('now')
      ORDER BY a.expected_return ASC
    `).all(deadline);

    let successCount = 0;
    reminders.forEach(reminder => {
      if (reminder.email) {
        sendReturnReminderEmail({
          employeeEmail: reminder.email,
          employeeName: reminder.employee_name,
          assetTag: reminder.asset_tag,
          brand: reminder.brand || '',
          model: reminder.model || '',
          expectedReturnDate: reminder.expected_return,
          assignmentId: reminder.id
        }).then(() => successCount++).catch(e => console.error('Return reminder email error:', e.message));
      }
    });

    createAuditLog('assignments', 0, 'SEND_REMINDERS_BATCH', null, { count: reminders.length }, req);
    res.json({ success: true, message: `Reminder emails queued for ${reminders.length} assignments.`, data: { totalReminders: reminders.length } });
  } catch (err) {
    console.error('[POST /assignments/reminders/send-all]', err.message);
    res.status(500).json({ success: false, message: 'Failed to send reminders.' });
  }
});

module.exports = router;

// GET /api/assignments/:id — single assignment
router.get('/:id', authenticate, (req, res) => {
  try {
    const db = getDb();
    const row = db.prepare(`
      SELECT a.*, e.name as employee_name, e.department, e.employee_id as emp_code,
             eq.asset_tag, eq.brand, eq.model, eq.category, eq.serial_number
      FROM assignments a
      JOIN employees e  ON a.employee_id  = e.id
      JOIN equipment eq ON a.equipment_id = eq.id
      WHERE a.id = ?
    `).get(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Assignment not found.' });
    res.json({ success: true, data: row });
  } catch(err) {
    res.status(500).json({ success: false, message: 'Failed to load assignment.' });
  }
});

// PUT /api/assignments/:id — edit expected_return & notes
router.put('/:id', authenticate, requireRole('admin', 'manager'), (req, res) => {
  try {
    const db = getDb();
    const old = db.prepare('SELECT * FROM assignments WHERE id = ?').get(req.params.id);
    if (!old) return res.status(404).json({ success: false, message: 'Assignment not found.' });
    const { expected_return, notes } = req.body;
    db.prepare(`
      UPDATE assignments SET expected_return = ?, notes = ?, updated_at = datetime('now') WHERE id = ?
    `).run(expected_return || null, notes || null, req.params.id);
    createAuditLog('assignments', req.params.id, 'UPDATE', old, req.body, req);
    const updated = db.prepare('SELECT * FROM assignments WHERE id = ?').get(req.params.id);

    // Send email only when expected_return date actually changed
    const oldDate = old.expected_return ? String(old.expected_return).split('T')[0] : null;
    const newDate = expected_return ? String(expected_return).split('T')[0] : null;
    if (oldDate !== newDate) {
      const emp     = db.prepare('SELECT * FROM employees WHERE id=?').get(old.employee_id);
      const eq      = db.prepare('SELECT * FROM equipment  WHERE id=?').get(old.equipment_id);
      const updater = db.prepare('SELECT full_name FROM users WHERE id=?').get(req.user.id);
      if (emp?.email && eq) {
        sendExpectedReturnUpdatedEmail({
          employeeName:  emp.name,
          employeeEmail: emp.email,
          assetTag:      eq.asset_tag,
          brand:         eq.brand  || '',
          model:         eq.model  || '',
          oldReturnDate: old.expected_return,
          newReturnDate: expected_return || null,
          updatedByName: updater ? updater.full_name : 'Admin',
        }).catch(e => console.error('[Email] Return date update error:', e.message));
      }
    }

    res.json({ success: true, message: 'Assignment updated.', data: updated });
  } catch(err) {
    res.status(500).json({ success: false, message: 'Failed to update assignment.' });
  }
});

// DELETE /api/assignments/:id — delete RETURNED assignment record (admin only)
router.delete('/:id', requireRole('admin'), (req, res) => {
  try {
    const db = getDb();
    const assignment = db.prepare('SELECT * FROM assignments WHERE id = ?').get(req.params.id);
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found.' });
    if (!assignment.returned_date) {
      return res.status(409).json({ success: false, message: 'Cannot delete active assignment. Return equipment first.' });
    }
    db.prepare('DELETE FROM assignments WHERE id = ?').run(req.params.id);
    createAuditLog('assignments', req.params.id, 'DELETE', assignment, null, req);
    res.json({ success: true, message: 'Assignment record deleted.' });
  } catch(err) {
    console.error('[DELETE /assignments/:id]', err.message);
    res.status(500).json({ success: false, message: 'Failed to delete assignment.' });
  }
});

