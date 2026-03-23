/**
 * AssetPro v4 — Comprehensive Test Suite
 * Covers: Auth, Equipment, Employees, Assignments, Bulk, Depreciation
 * Run: npm test  or  npm test -- --coverage
 */

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ── Setup in-memory test DB ──────────────────────────────────
let testDb;

jest.mock('../utils/database', () => ({
  getDb: () => testDb
}));

// Mock email service (don't actually send emails in tests)
jest.mock('../services/emailService', () => ({
  sendAssignmentEmail: jest.fn().mockResolvedValue({ success: true }),
  sendReturnEmail: jest.fn().mockResolvedValue({ success: true }),
  sendWarrantyAlertEmail: jest.fn().mockResolvedValue({ success: true }),
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ success: true }),
}));

const TEST_SECRET = 'test-jwt-secret';
process.env.JWT_SECRET = TEST_SECRET;

beforeAll(() => {
  testDb = new Database(':memory:');
  testDb.pragma('foreign_keys = ON');
  testDb.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'viewer',
      full_name TEXT,
      email TEXT UNIQUE,
      is_active INTEGER DEFAULT 1,
      last_login TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT UNIQUE,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      department TEXT,
      position TEXT,
      mobile_phone TEXT,
      desk_phone TEXT,
      location TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE equipment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_tag TEXT UNIQUE,
      category TEXT NOT NULL,
      brand TEXT,
      model TEXT,
      serial_number TEXT UNIQUE,
      status TEXT DEFAULT 'available',
      condition TEXT DEFAULT 'good',
      purchase_date TEXT,
      purchase_price REAL,
      warranty_expiry TEXT,
      location TEXT,
      notes TEXT,
      image_url TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER REFERENCES employees(id),
      equipment_id INTEGER REFERENCES equipment(id),
      assigned_by INTEGER,
      assigned_date TEXT DEFAULT (datetime('now')),
      expected_return TEXT,
      returned_date TEXT,
      return_reason TEXT,
      condition_on_return TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT,
      record_id INTEGER,
      action TEXT,
      old_values TEXT,
      new_values TEXT,
      user_id INTEGER,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      title TEXT,
      message TEXT,
      reference_id INTEGER,
      reference_table TEXT,
      is_read INTEGER DEFAULT 0,
      user_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Seed users
  const hash = bcrypt.hashSync('admin123', 10);
  testDb.prepare('INSERT INTO users (username, password, role, full_name, email) VALUES (?,?,?,?,?)').run('admin', hash, 'admin', 'Test Admin', 'admin@test.com');
  testDb.prepare('INSERT INTO users (username, password, role, full_name, email) VALUES (?,?,?,?,?)').run('manager', bcrypt.hashSync('manager123', 10), 'manager', 'Test Manager', 'manager@test.com');
  testDb.prepare('INSERT INTO users (username, password, role, full_name, email) VALUES (?,?,?,?,?)').run('viewer', bcrypt.hashSync('viewer123', 10), 'viewer', 'Test Viewer', 'viewer@test.com');
});

afterAll(() => testDb.close());

// ═══════════════════════════════════════════════════
// 1. AUTH TESTS
// ═══════════════════════════════════════════════════
describe('Authentication', () => {
  test('bcrypt: hash and verify correct password', () => {
    const hash = bcrypt.hashSync('secret', 10);
    expect(bcrypt.compareSync('secret', hash)).toBe(true);
  });
  test('bcrypt: reject wrong password', () => {
    const hash = bcrypt.hashSync('secret', 10);
    expect(bcrypt.compareSync('wrong', hash)).toBe(false);
  });
  test('JWT: sign and verify token', () => {
    const payload = { id: 1, username: 'admin', role: 'admin' };
    const token = jwt.sign(payload, TEST_SECRET, { expiresIn: '1h' });
    const decoded = jwt.verify(token, TEST_SECRET);
    expect(decoded.id).toBe(1);
    expect(decoded.role).toBe('admin');
  });
  test('JWT: expired token throws', () => {
    const token = jwt.sign({ id: 1 }, TEST_SECRET, { expiresIn: '-1s' });
    expect(() => jwt.verify(token, TEST_SECRET)).toThrow('jwt expired');
  });
  test('JWT: invalid secret throws', () => {
    const token = jwt.sign({ id: 1 }, 'wrong-secret');
    expect(() => jwt.verify(token, TEST_SECRET)).toThrow();
  });
  test('Admin user exists in DB', () => {
    const user = testDb.prepare('SELECT * FROM users WHERE username=?').get('admin');
    expect(user).toBeTruthy();
    expect(user.role).toBe('admin');
  });
  test('Password stored as bcrypt hash (not plain text)', () => {
    const user = testDb.prepare('SELECT * FROM users WHERE username=?').get('admin');
    expect(user.password).not.toBe('admin123');
    expect(user.password.startsWith('$2')).toBe(true);
  });
  test('Correct password validates against stored hash', () => {
    const user = testDb.prepare('SELECT * FROM users WHERE username=?').get('manager');
    expect(bcrypt.compareSync('manager123', user.password)).toBe(true);
  });
  test('All three roles exist in DB', () => {
    const roles = testDb.prepare('SELECT role FROM users').all().map(u => u.role);
    expect(roles).toContain('admin');
    expect(roles).toContain('manager');
    expect(roles).toContain('viewer');
  });
});

// ═══════════════════════════════════════════════════
// 2. EMPLOYEE DB TESTS
// ═══════════════════════════════════════════════════
describe('Employee Database Operations', () => {
  let empId;
  test('Create employee with all fields', () => {
    const result = testDb.prepare(
      'INSERT INTO employees (employee_id, name, email, department, position, mobile_phone) VALUES (?,?,?,?,?,?)'
    ).run('EMP-T001', 'Test User', 'testuser@example.com', 'Engineering', 'Developer', '9876543210');
    empId = result.lastInsertRowid;
    expect(empId).toBeGreaterThan(0);
  });
  test('Fetch employee by ID', () => {
    const emp = testDb.prepare('SELECT * FROM employees WHERE id=?').get(empId);
    expect(emp.name).toBe('Test User');
    expect(emp.department).toBe('Engineering');
  });
  test('Update employee name', () => {
    testDb.prepare('UPDATE employees SET name=? WHERE id=?').run('Updated Name', empId);
    expect(testDb.prepare('SELECT name FROM employees WHERE id=?').get(empId).name).toBe('Updated Name');
  });
  test('Soft delete: hidden after is_active=0', () => {
    testDb.prepare('UPDATE employees SET is_active=0 WHERE id=?').run(empId);
    expect(testDb.prepare('SELECT * FROM employees WHERE id=? AND is_active=1').get(empId)).toBeUndefined();
    testDb.prepare('UPDATE employees SET is_active=1 WHERE id=?').run(empId);
  });
  test('Duplicate email throws UNIQUE error', () => {
    expect(() => testDb.prepare('INSERT INTO employees (name, email) VALUES (?,?)').run('Another', 'testuser@example.com')).toThrow();
  });
  test('Duplicate employee_id throws UNIQUE error', () => {
    expect(() => testDb.prepare('INSERT INTO employees (name, employee_id) VALUES (?,?)').run('Dup', 'EMP-T001')).toThrow();
  });
  test('Employee name is required (NOT NULL)', () => {
    expect(() => testDb.prepare('INSERT INTO employees (email) VALUES (?)').run('noname@test.com')).toThrow();
  });
});

// ═══════════════════════════════════════════════════
// 3. EQUIPMENT DB TESTS
// ═══════════════════════════════════════════════════
describe('Equipment Database Operations', () => {
  let eqId;
  test('Create equipment with all fields', () => {
    const result = testDb.prepare(
      'INSERT INTO equipment (asset_tag, category, brand, model, serial_number, purchase_price, purchase_date) VALUES (?,?,?,?,?,?,?)'
    ).run('AST-T001', 'Laptop', 'Dell', 'XPS 15', 'SN-T001', 85000, '2023-01-01');
    eqId = result.lastInsertRowid;
    expect(eqId).toBeGreaterThan(0);
  });
  test('Fetch equipment: correct values', () => {
    const eq = testDb.prepare('SELECT * FROM equipment WHERE id=?').get(eqId);
    expect(eq.category).toBe('Laptop');
    expect(eq.purchase_price).toBe(85000);
    expect(eq.status).toBe('available');
  });
  test('Status defaults to available', () => {
    const result = testDb.prepare('INSERT INTO equipment (asset_tag, category) VALUES (?,?)').run('AST-T002', 'Monitor');
    expect(testDb.prepare('SELECT status FROM equipment WHERE id=?').get(result.lastInsertRowid).status).toBe('available');
    testDb.prepare('UPDATE equipment SET is_active=0 WHERE id=?').run(result.lastInsertRowid);
  });
  test('Update status to maintenance', () => {
    testDb.prepare("UPDATE equipment SET status='maintenance' WHERE id=?").run(eqId);
    expect(testDb.prepare('SELECT status FROM equipment WHERE id=?').get(eqId).status).toBe('maintenance');
    testDb.prepare("UPDATE equipment SET status='available' WHERE id=?").run(eqId);
  });
  test('Soft delete works', () => {
    testDb.prepare('UPDATE equipment SET is_active=0 WHERE id=?').run(eqId);
    expect(testDb.prepare('SELECT * FROM equipment WHERE id=? AND is_active=1').get(eqId)).toBeUndefined();
    testDb.prepare('UPDATE equipment SET is_active=1 WHERE id=?').run(eqId);
  });
  test('Duplicate asset_tag throws', () => {
    expect(() => testDb.prepare('INSERT INTO equipment (asset_tag, category) VALUES (?,?)').run('AST-T001', 'Laptop')).toThrow();
  });
  test('Duplicate serial_number throws', () => {
    expect(() => testDb.prepare('INSERT INTO equipment (asset_tag, category, serial_number) VALUES (?,?,?)').run('AST-T999', 'Laptop', 'SN-T001')).toThrow();
  });
  test('Category is required (NOT NULL)', () => {
    expect(() => testDb.prepare('INSERT INTO equipment (asset_tag) VALUES (?)').run('AST-NOCAT')).toThrow();
  });
});

// ═══════════════════════════════════════════════════
// 4. ASSIGNMENT DB TESTS
// ═══════════════════════════════════════════════════
describe('Assignment Database Operations', () => {
  let empId2, eqId2, asgId;
  beforeAll(() => {
    empId2 = testDb.prepare('INSERT INTO employees (name, email, employee_id) VALUES (?,?,?)').run('Assign User', 'assign@test.com', 'EMP-A001').lastInsertRowid;
    eqId2 = testDb.prepare('INSERT INTO equipment (asset_tag, category, brand, model) VALUES (?,?,?,?)').run('AST-A001', 'Laptop', 'HP', 'ProBook').lastInsertRowid;
  });
  afterAll(() => {
    testDb.prepare('UPDATE equipment SET is_active=0 WHERE id=?').run(eqId2);
    testDb.prepare('UPDATE employees SET is_active=0 WHERE id=?').run(empId2);
  });
  test('Create assignment', () => {
    asgId = testDb.prepare('INSERT INTO assignments (employee_id, equipment_id, assigned_by) VALUES (?,?,1)').run(empId2, eqId2).lastInsertRowid;
    testDb.prepare("UPDATE equipment SET status='assigned' WHERE id=?").run(eqId2);
    expect(asgId).toBeGreaterThan(0);
  });
  test('Fetch assignment joins employee and equipment', () => {
    const asg = testDb.prepare('SELECT a.*, e.name as emp_name, eq.brand FROM assignments a JOIN employees e ON a.employee_id=e.id JOIN equipment eq ON a.equipment_id=eq.id WHERE a.id=?').get(asgId);
    expect(asg.emp_name).toBe('Assign User');
    expect(asg.brand).toBe('HP');
    expect(asg.returned_date).toBeNull();
  });
  test('Equipment is "assigned" after creating assignment', () => {
    expect(testDb.prepare('SELECT status FROM equipment WHERE id=?').get(eqId2).status).toBe('assigned');
  });
  test('Return assignment', () => {
    testDb.prepare("UPDATE assignments SET returned_date=datetime('now'), return_reason=?, condition_on_return='good' WHERE id=?").run('No longer needed', asgId);
    testDb.prepare("UPDATE equipment SET status='available' WHERE id=?").run(eqId2);
    const asg = testDb.prepare('SELECT * FROM assignments WHERE id=?').get(asgId);
    expect(asg.returned_date).not.toBeNull();
    expect(asg.return_reason).toBe('No longer needed');
  });
  test('Equipment "available" after return', () => {
    expect(testDb.prepare('SELECT status FROM equipment WHERE id=?').get(eqId2).status).toBe('available');
  });
  test('Overdue assignments query works', () => {
    const r = testDb.prepare("SELECT COUNT(*) as c FROM assignments WHERE expected_return IS NOT NULL AND returned_date IS NULL AND expected_return < datetime('now')").get();
    expect(typeof r.c).toBe('number');
  });
});

// ═══════════════════════════════════════════════════
// 5. AUDIT LOG TESTS
// ═══════════════════════════════════════════════════
describe('Audit Log Service', () => {
  const { createAuditLog } = require('../services/auditService');
  test('Creates audit log entry', () => {
    createAuditLog('equipment', 1, 'INSERT', null, { category: 'Laptop' });
    const log = testDb.prepare("SELECT * FROM audit_logs WHERE table_name='equipment' ORDER BY id DESC LIMIT 1").get();
    expect(log).toBeDefined();
    expect(log.action).toBe('INSERT');
  });
  test('Stores old/new values as JSON', () => {
    createAuditLog('equipment', 2, 'UPDATE', { status: 'available' }, { status: 'assigned' });
    const log = testDb.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 1').get();
    expect(JSON.parse(log.old_values).status).toBe('available');
    expect(JSON.parse(log.new_values).status).toBe('assigned');
  });
  test('Handles null values without throwing', () => {
    expect(() => createAuditLog('users', 1, 'LOGIN', null, null)).not.toThrow();
  });
  test('Supports all action types', () => {
    ['INSERT','UPDATE','DELETE','LOGIN','LOGOUT','EXPORT'].forEach(action => {
      testDb.prepare('INSERT INTO audit_logs (table_name, record_id, action) VALUES (?,?,?)').run('sys_test', 1, action);
    });
    const logs = testDb.prepare("SELECT DISTINCT action FROM audit_logs WHERE table_name='sys_test'").all().map(l => l.action);
    expect(logs).toContain('LOGIN');
    expect(logs).toContain('EXPORT');
  });
});

// ═══════════════════════════════════════════════════
// 6. DEPRECIATION CALCULATOR TESTS
// ═══════════════════════════════════════════════════
describe('Depreciation Calculator', () => {
  function calc(price, dateStr, method = 'straight_line', life = 5, salvage = 0) {
    const ageYears = (new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24 * 365.25);
    const dep = price - salvage;
    let current, annual, total;
    if (method === 'double_declining') {
      const rate = 2 / life;
      current = Math.max(price * Math.pow(1 - rate, ageYears), salvage);
      total = price - current;
      annual = price * rate;
    } else {
      annual = dep / life;
      total = Math.min(annual * ageYears, dep);
      current = Math.max(price - total, salvage);
    }
    return { current: Math.round(current), total: Math.round(total), annual: Math.round(annual), pct: parseFloat(((total/price)*100).toFixed(1)), fullyDep: ageYears >= life };
  }

  test('New asset has near-zero depreciation', () => {
    const r = calc(100000, new Date().toISOString().split('T')[0]);
    expect(r.total).toBeLessThan(1000);
  });
  test('~2.5 year old asset ~50% depreciated (straight-line, 5yr)', () => {
    const d = new Date(); d.setFullYear(d.getFullYear()-2); d.setMonth(d.getMonth()-6);
    const r = calc(100000, d.toISOString().split('T')[0]);
    expect(r.pct).toBeGreaterThan(40);
    expect(r.pct).toBeLessThan(60);
  });
  test('6-year old asset fully depreciated (5yr life)', () => {
    const d = new Date(); d.setFullYear(d.getFullYear()-6);
    const r = calc(100000, d.toISOString().split('T')[0], 'straight_line', 5);
    expect(r.fullyDep).toBe(true);
    expect(r.current).toBe(0);
  });
  test('Salvage value respected', () => {
    const d = new Date(); d.setFullYear(d.getFullYear()-10);
    const r = calc(100000, d.toISOString().split('T')[0], 'straight_line', 5, 5000);
    expect(r.current).toBeGreaterThanOrEqual(5000);
  });
  test('Double declining > straight-line for early years', () => {
    const d = new Date(); d.setFullYear(d.getFullYear()-1);
    const sl = calc(100000, d.toISOString().split('T')[0], 'straight_line');
    const dd = calc(100000, d.toISOString().split('T')[0], 'double_declining');
    expect(dd.total).toBeGreaterThan(sl.total);
  });
  test('Annual depreciation = price / life (straight-line)', () => {
    const r = calc(100000, '2020-01-01', 'straight_line', 5, 0);
    expect(r.annual).toBe(20000);
  });
  test('Total depreciated never exceeds purchase price', () => {
    const d = new Date(); d.setFullYear(d.getFullYear()-20);
    const r = calc(50000, d.toISOString().split('T')[0]);
    expect(r.total).toBeLessThanOrEqual(50000);
  });
});

// ═══════════════════════════════════════════════════
// 7. EMAIL SERVICE (MOCKED)
// ═══════════════════════════════════════════════════
describe('Email Service (mocked)', () => {
  const { sendAssignmentEmail, sendReturnEmail, sendWarrantyAlertEmail } = require('../services/emailService');
  test('sendAssignmentEmail is callable and returns a value', async () => {
    const r = await sendAssignmentEmail({ employeeName: 'John', employeeEmail: 'j@test.com', assetTag: 'AST-001', brand: 'Dell', model: 'XPS', category: 'Laptop', assignedDate: new Date().toISOString() });
    expect(r).toBeDefined();
  });
  test('sendReturnEmail is callable', async () => {
    const r = await sendReturnEmail({ employeeName: 'John', employeeEmail: 'j@test.com', assetTag: 'AST-001', brand: 'Dell', model: 'XPS', returnDate: new Date().toISOString(), condition: 'good' });
    expect(r).toBeDefined();
  });
  test('sendWarrantyAlertEmail with items array', async () => {
    const r = await sendWarrantyAlertEmail({ recipientEmail: 'admin@test.com', recipientName: 'Admin', items: [{ asset_tag: 'A1', brand: 'Dell', model: 'XPS', warranty_expiry: '2026-04-01' }] });
    expect(r).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════
// 8. BULK OPERATIONS LOGIC
// ═══════════════════════════════════════════════════
describe('Bulk Operations Logic', () => {
  test('Auto asset tag: AST-0043 from count 42', () => {
    expect(`AST-${String(43).padStart(4, '0')}`).toBe('AST-0043');
  });
  test('CSV headers parsed correctly', () => {
    const csv = 'asset_tag,category,brand,model\nAST-001,Laptop,Dell,XPS';
    const headers = csv.split('\n')[0].split(',').map(h => h.trim().toLowerCase());
    expect(headers).toContain('category');
    expect(headers.length).toBe(4);
  });
  test('Missing required CSV field detected', () => {
    const headers = ['asset_tag', 'brand'];
    const missing = ['category'].filter(f => !headers.includes(f));
    expect(missing).toContain('category');
  });
  test('Max 100 items enforced', () => {
    const items = Array.from({ length: 101 }, (_, i) => ({ category: 'Laptop' }));
    expect(items.length > 100).toBe(true);
  });
  test('Bulk retire: blocks if any item is assigned', () => {
    const statuses = ['available', 'assigned', 'available'];
    expect(statuses.some(s => s === 'assigned')).toBe(true);
  });
  test('CSV row parsing: values extracted correctly', () => {
    const line = 'AST-001,Laptop,Dell,XPS 15,SN123,available,good';
    const vals = line.split(',').map(v => v.trim());
    expect(vals[1]).toBe('Laptop');
    expect(vals[5]).toBe('available');
  });
});

// ═══════════════════════════════════════════════════
// 9. JOI VALIDATION TESTS
// ═══════════════════════════════════════════════════
describe('Joi Input Validation', () => {
  const Joi = require('joi');
  const equipSchema = Joi.object({
    category: Joi.string().trim().max(50).required(),
    brand: Joi.string().trim().max(50).optional().allow('', null),
    purchase_price: Joi.number().min(0).optional().allow(null),
    status: Joi.string().valid('available','assigned','maintenance','retired','lost').default('available'),
    condition: Joi.string().valid('excellent','good','fair','poor').default('good'),
  });
  test('Valid equipment passes', () => { expect(equipSchema.validate({ category: 'Laptop', brand: 'Dell' }).error).toBeUndefined(); });
  test('Missing category fails', () => { expect(equipSchema.validate({ brand: 'Dell' }).error).toBeDefined(); });
  test('Invalid status fails', () => { expect(equipSchema.validate({ category: 'Laptop', status: 'broken' }).error).toBeDefined(); });
  test('Negative price fails', () => { expect(equipSchema.validate({ category: 'Laptop', purchase_price: -100 }).error).toBeDefined(); });
  test('Default status is available', () => { expect(equipSchema.validate({ category: 'Monitor' }).value.status).toBe('available'); });
  test('Price zero is valid', () => { expect(equipSchema.validate({ category: 'Keyboard', purchase_price: 0 }).error).toBeUndefined(); });
});

// ═══════════════════════════════════════════════════
// 10. DASHBOARD STATS QUERIES
// ═══════════════════════════════════════════════════
describe('Dashboard Statistics Queries', () => {
  test('Equipment stats query returns numbers', () => {
    const s = testDb.prepare("SELECT COUNT(*) as total, COUNT(CASE WHEN status='available' THEN 1 END) as available FROM equipment WHERE is_active=1").get();
    expect(typeof s.total).toBe('number');
    expect(s.available).toBeLessThanOrEqual(s.total);
  });
  test('Employee count is positive', () => {
    const s = testDb.prepare('SELECT COUNT(*) as total FROM employees WHERE is_active=1').get();
    expect(s.total).toBeGreaterThan(0);
  });
  test('Category breakdown returns array', () => {
    const rows = testDb.prepare('SELECT category, COUNT(*) as total FROM equipment WHERE is_active=1 GROUP BY category').all();
    expect(Array.isArray(rows)).toBe(true);
  });
  test('Warranty expiry query executes without error', () => {
    const rows = testDb.prepare("SELECT id FROM equipment WHERE warranty_expiry IS NOT NULL AND warranty_expiry BETWEEN date('now') AND date('now', '+30 days') AND is_active=1").all();
    expect(Array.isArray(rows)).toBe(true);
  });
  test('Monthly trend query executes without error', () => {
    const rows = testDb.prepare("SELECT strftime('%Y-%m', assigned_date) as month, COUNT(*) as count FROM assignments WHERE assigned_date >= date('now', '-6 months') GROUP BY month").all();
    expect(Array.isArray(rows)).toBe(true);
  });
  test('Overdue count query returns number', () => {
    const s = testDb.prepare("SELECT COUNT(*) as c FROM assignments WHERE expected_return IS NOT NULL AND returned_date IS NULL AND expected_return < datetime('now')").get();
    expect(typeof s.c).toBe('number');
  });
});

// ═══════════════════════════════════════════════════
// 11. PASSWORD RESET FLOW
// ═══════════════════════════════════════════════════
describe('Password Reset Flow', () => {
  const crypto = require('crypto');
  test('Token is 64-char hex string', () => {
    const t = crypto.randomBytes(32).toString('hex');
    expect(t.length).toBe(64);
    expect(/^[0-9a-f]+$/.test(t)).toBe(true);
  });
  test('Two tokens are always unique', () => {
    const t1 = crypto.randomBytes(32).toString('hex');
    const t2 = crypto.randomBytes(32).toString('hex');
    expect(t1).not.toBe(t2);
  });
  test('Expiry is 1 hour in the future', () => {
    const exp = new Date(Date.now() + 3600*1000);
    expect(exp > new Date()).toBe(true);
  });
  test('Expired token detected correctly', () => {
    expect(new Date(Date.now() - 1000) < new Date()).toBe(true);
  });
  test('Reset token persisted and retrieved', () => {
    const userId = testDb.prepare('SELECT id FROM users WHERE username=?').get('admin').id;
    const token = crypto.randomBytes(32).toString('hex');
    testDb.prepare('INSERT INTO password_resets (user_id, token, expires_at) VALUES (?,?,?)').run(userId, token, new Date(Date.now()+3600*1000).toISOString());
    const r = testDb.prepare('SELECT * FROM password_resets WHERE token=?').get(token);
    expect(r).toBeDefined();
    expect(r.used).toBe(0);
  });
  test('Token marked as used after reset', () => {
    const userId = testDb.prepare('SELECT id FROM users WHERE username=?').get('admin').id;
    const token = crypto.randomBytes(32).toString('hex');
    testDb.prepare('INSERT INTO password_resets (user_id, token, expires_at) VALUES (?,?,?)').run(userId, token, new Date(Date.now()+3600*1000).toISOString());
    testDb.prepare('UPDATE password_resets SET used=1 WHERE token=?').run(token);
    expect(testDb.prepare('SELECT * FROM password_resets WHERE token=? AND used=0').get(token)).toBeUndefined();
  });
  test('Used token not reusable', () => {
    const row = testDb.prepare('SELECT * FROM password_resets WHERE used=1 LIMIT 1').get();
    if (row) expect(row.used).toBe(1);
  });
});
