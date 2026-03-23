const express = require('express');
const router = express.Router();
const { getDb } = require('../utils/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const { createAuditLog } = require('../services/auditService');
const { sendWelcomeEmail } = require('../services/emailService');

// All routes require authentication
router.use(authenticate);

// GET /api/employees — List all with search/filter
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { search, department, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = 'WHERE e.is_active = 1';
  const params = [];

  if (search) {
    where += ' AND (e.name LIKE ? OR e.email LIKE ? OR e.employee_id LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (department) {
    where += ' AND e.department = ?';
    params.push(department);
  }

  const total = db.prepare(`SELECT COUNT(*) as count FROM employees e ${where}`).get(...params).count;
  const rows = db.prepare(`
    SELECT e.*,
      COUNT(CASE WHEN a.id IS NOT NULL AND a.returned_date IS NULL THEN 1 END) as active_assignments
    FROM employees e
    LEFT JOIN assignments a ON a.employee_id = e.id
    ${where}
    GROUP BY e.id
    ORDER BY e.name ASC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  res.json({ success: true, data: rows, meta: { total, page: parseInt(page), limit: parseInt(limit) } });
  } catch(err) { console.error('[GET /employees]', err.message); res.status(500).json({ success: false, message: 'Failed to fetch employees.' }); }
});

// GET /api/employees/departments — List unique departments
router.get('/departments', (req, res) => {
  try {
    const db = getDb();
  const rows = db.prepare(`
    SELECT department, COUNT(*) as count FROM employees
    WHERE is_active = 1 AND department IS NOT NULL
    GROUP BY department ORDER BY count DESC
  `).all();
  res.json({ success: true, data: rows });
  } catch(err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/employees/:id
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
  const employee = db.prepare('SELECT * FROM employees WHERE id = ? AND is_active = 1').get(req.params.id);
  if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

  const assignments = db.prepare(`
    SELECT a.*, eq.category, eq.brand, eq.model, eq.serial_number, eq.asset_tag
    FROM assignments a
    JOIN equipment eq ON a.equipment_id = eq.id
    WHERE a.employee_id = ?
    ORDER BY a.assigned_date DESC
  `).all(req.params.id);

  res.json({ success: true, data: { ...employee, assignments } });
  } catch(err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/employees
router.post('/', requireRole('admin', 'manager'), validate(schemas.employee), (req, res) => {
  const db = getDb();
  try {
    // Check if email or employee_id already exists among ACTIVE employees only
    if (req.body.email && req.body.email.trim()) {
      const existing = db.prepare('SELECT id FROM employees WHERE email = ? AND is_active = 1').get(req.body.email.trim());
      if (existing) {
        return res.status(409).json({ success: false, message: 'Email or Employee ID already exists.' });
      }
    }
    
    if (req.body.employee_id && req.body.employee_id.trim()) {
      const existing = db.prepare('SELECT id FROM employees WHERE employee_id = ? AND is_active = 1').get(req.body.employee_id.trim());
      if (existing) {
        return res.status(409).json({ success: false, message: 'Email or Employee ID already exists.' });
      }
    }

    const result = db.prepare(`
      INSERT INTO employees (employee_id, name, email, department, position, mobile_phone, desk_phone, location)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.body.employee_id || null, req.body.name, req.body.email || null, req.body.department || null, 
           req.body.position || null, req.body.mobile_phone || null, req.body.desk_phone || null, req.body.location || null);

    const employee = db.prepare('SELECT * FROM employees WHERE id = ?').get(result.lastInsertRowid);
    createAuditLog('employees', result.lastInsertRowid, 'INSERT', null, req.body, req);

    // Non-blocking welcome email
    if (employee.email) {
      const adder = db.prepare('SELECT full_name FROM users WHERE id=?').get(req.user.id);
      sendWelcomeEmail({
        employeeName:  employee.name,
        employeeEmail: employee.email,
        employeeId:    employee.employee_id  || null,
        department:    employee.department   || null,
        position:      employee.position     || null,
        addedByName:   adder ? adder.full_name : 'Admin',
      }).catch(e => console.error('[Email] Welcome email error:', e.message));
    }

    res.status(201).json({ success: true, message: 'Employee created.', data: employee });
  } catch (err) {
    console.error('[POST /employees]', err);
    res.status(500).json({ success: false, message: 'Failed to create employee.' });
  }
});

// PUT /api/employees/:id
router.put('/:id', requireRole('admin', 'manager'), validate(schemas.employee), (req, res) => {
  const db = getDb();
  const old = db.prepare('SELECT * FROM employees WHERE id = ? AND is_active = 1').get(req.params.id);
  if (!old) return res.status(404).json({ success: false, message: 'Employee not found.' });

  // Check if new email/employee_id conflicts with another ACTIVE employee
  if (req.body.email && req.body.email.trim() && req.body.email !== old.email) {
    const conflict = db.prepare('SELECT id FROM employees WHERE email = ? AND is_active = 1 AND id != ?').get(req.body.email.trim(), req.params.id);
    if (conflict) {
      return res.status(409).json({ success: false, message: 'Email already in use.' });
    }
  }
  
  if (req.body.employee_id && req.body.employee_id.trim() && req.body.employee_id !== old.employee_id) {
    const conflict = db.prepare('SELECT id FROM employees WHERE employee_id = ? AND is_active = 1 AND id != ?').get(req.body.employee_id.trim(), req.params.id);
    if (conflict) {
      return res.status(409).json({ success: false, message: 'Employee ID already in use.' });
    }
  }

  db.prepare(`
    UPDATE employees SET employee_id = ?, name = ?, email = ?, department = ?, position = ?, 
    mobile_phone = ?, desk_phone = ?, location = ?, updated_at = datetime('now') WHERE id = ?
  `).run(req.body.employee_id || null, req.body.name, req.body.email || null, req.body.department || null,
         req.body.position || null, req.body.mobile_phone || null, req.body.desk_phone || null, req.body.location || null, req.params.id);

  const updated = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  createAuditLog('employees', req.params.id, 'UPDATE', old, req.body, req);
  res.json({ success: true, message: 'Employee updated.', data: updated });
});

// DELETE /api/employees/:id (soft delete)
router.delete('/:id', requireRole('admin'), (req, res) => {
  const db = getDb();
  const employee = db.prepare('SELECT * FROM employees WHERE id = ? AND is_active = 1').get(req.params.id);
  if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

  const activeAssignments = db.prepare("SELECT COUNT(*) as c FROM assignments WHERE employee_id = ? AND returned_date IS NULL").get(req.params.id);
  if (activeAssignments.c > 0) {
    return res.status(409).json({ success: false, message: 'Cannot delete employee with active assignments. Return equipment first.' });
  }

  db.prepare("UPDATE employees SET is_active=0, updated_at=datetime('now') WHERE id=?").run(req.params.id);
  createAuditLog('employees', req.params.id, 'DELETE', employee, null, req);
  res.json({ success: true, message: 'Employee deleted.' });
});

module.exports = router;
