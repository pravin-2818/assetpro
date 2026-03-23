/**
 * AssetPro v5 — Integration Tests (Feature 4)
 * Real HTTP endpoint tests using supertest
 * Tests: Auth, Equipment CRUD, Employees, Assignments, Search, Maintenance, Reports, Lifecycle
 * Run: npm test
 */

const request = require('supertest');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

// ── In-memory DB setup ───────────────────────────────────────
let testDb;
const TEST_SECRET = 'integration-test-secret-key-32chars';
process.env.JWT_SECRET = TEST_SECRET;
process.env.NODE_ENV = 'test';

jest.mock('../utils/database', () => ({ getDb: () => testDb }));
jest.mock('../services/emailService', () => ({
  sendAssignmentEmail: jest.fn().mockResolvedValue({ success: true }),
  sendReturnEmail: jest.fn().mockResolvedValue({ success: true }),
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ success: true }),
}));

const app = require('../server');

beforeAll(() => {
  testDb = new Database(':memory:');
  testDb.pragma('foreign_keys = ON');
  testDb.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL, role TEXT DEFAULT 'viewer', full_name TEXT,
      email TEXT UNIQUE, is_active INTEGER DEFAULT 1,
      last_login TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id TEXT UNIQUE, name TEXT NOT NULL,
      email TEXT UNIQUE, department TEXT, position TEXT, mobile_phone TEXT, desk_phone TEXT,
      location TEXT, is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE equipment (
      id INTEGER PRIMARY KEY AUTOINCREMENT, asset_tag TEXT UNIQUE, category TEXT NOT NULL,
      brand TEXT, model TEXT, serial_number TEXT UNIQUE, status TEXT DEFAULT 'available',
      condition TEXT DEFAULT 'good', purchase_date TEXT, purchase_price REAL,
      warranty_expiry TEXT, location TEXT, notes TEXT, image_url TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER REFERENCES employees(id),
      equipment_id INTEGER REFERENCES equipment(id), assigned_by INTEGER,
      assigned_date TEXT DEFAULT (datetime('now')), expected_return TEXT,
      returned_date TEXT, return_reason TEXT, condition_on_return TEXT, notes TEXT,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, table_name TEXT, record_id INTEGER,
      action TEXT, old_values TEXT, new_values TEXT, user_id INTEGER,
      ip_address TEXT, user_agent TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, title TEXT, message TEXT,
      reference_id INTEGER, reference_table TEXT, is_read INTEGER DEFAULT 0,
      user_id INTEGER, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, token TEXT UNIQUE,
      expires_at TEXT, used INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE maintenance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT, equipment_id INTEGER REFERENCES equipment(id),
      type TEXT NOT NULL, description TEXT NOT NULL, performed_by TEXT, cost REAL DEFAULT 0,
      status TEXT DEFAULT 'completed', scheduled_date TEXT, completed_date TEXT,
      next_service_date TEXT, notes TEXT, created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Seed test users
  const adminHash = bcrypt.hashSync('admin123', 4);
  const viewerHash = bcrypt.hashSync('viewer123', 4);
  testDb.prepare("INSERT INTO users (username,password,role,full_name,email) VALUES (?,?,?,?,?)").run('admin','admin123_placeholder','admin','Test Admin','admin@test.com');
  testDb.prepare("UPDATE users SET password=? WHERE username='admin'").run(adminHash);
  testDb.prepare("INSERT INTO users (username,password,role,full_name,email) VALUES (?,?,?,?,?)").run('viewer', viewerHash, 'viewer', 'Test Viewer', 'viewer@test.com');

  // Seed test data
  testDb.prepare("INSERT INTO employees (employee_id,name,email,department,position) VALUES (?,?,?,?,?)").run('EMP001','Karthik Subramanian','karthik@test.com','Engineering','Developer');
  testDb.prepare("INSERT INTO equipment (asset_tag,category,brand,model,serial_number,status,purchase_price,purchase_date) VALUES (?,?,?,?,?,?,?,?)").run('AST-0001','Laptop','Dell','XPS 15','SN123','available',85000,'2023-01-15');
  testDb.prepare("INSERT INTO equipment (asset_tag,category,brand,model,serial_number,status) VALUES (?,?,?,?,?,?)").run('AST-0002','Monitor','LG','27UK850','SN456','available');
});

// ── Auth tokens ───────────────────────────────────────────────
let adminToken, viewerToken;

// ═══════════════════════════════════════════════════════════════
describe('🔐 Auth — Login & Access Control', () => {

  test('POST /api/auth/login → 200 with valid credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('token');
    expect(res.body.data.user.role).toBe('admin');
    adminToken = res.body.data.token;
  });

  test('POST /api/auth/login → 401 with wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'wrongpassword' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test('POST /api/auth/login → 400 with missing fields', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'admin' });
    expect(res.status).toBe(400);
  });

  test('GET /api/auth/me → 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('GET /api/auth/me → 200 with valid token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe('admin');
  });

  test('Viewer login returns viewer role token', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'viewer', password: 'viewer123' });
    expect(res.status).toBe(200);
    viewerToken = res.body.data.token;
    expect(res.body.data.user.role).toBe('viewer');
  });
});

// ═══════════════════════════════════════════════════════════════
describe('💻 Equipment — CRUD & Lifecycle', () => {

  let createdEquipId;

  test('GET /api/equipment → 200 returns array', async () => {
    const res = await request(app).get('/api/equipment').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  test('GET /api/equipment → 401 without auth', async () => {
    const res = await request(app).get('/api/equipment');
    expect(res.status).toBe(401);
  });

  test('POST /api/equipment → 201 creates equipment', async () => {
    const res = await request(app)
      .post('/api/equipment')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ category: 'Laptop', brand: 'HP', model: 'EliteBook 840', serial_number: 'SN-TEST-001', status: 'available', condition: 'excellent', purchase_price: 95000, purchase_date: '2024-01-10' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.brand).toBe('HP');
    createdEquipId = res.body.data.id;
  });

  test('POST /api/equipment → 400 without required category', async () => {
    const res = await request(app)
      .post('/api/equipment')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ brand: 'Test', model: 'Test' });
    expect(res.status).toBe(400);
  });

  test('GET /api/equipment/:id → 200 returns single asset', async () => {
    const res = await request(app).get(`/api/equipment/${createdEquipId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(createdEquipId);
    expect(res.body.data).toHaveProperty('allowed_transitions');
    expect(res.body.data).toHaveProperty('assignment_history');
  });

  test('GET /api/equipment → filter by category works', async () => {
    const res = await request(app).get('/api/equipment?category=Laptop').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    res.body.data.forEach(eq => expect(eq.category).toBe('Laptop'));
  });

  test('GET /api/equipment/categories → returns category list', async () => {
    const res = await request(app).get('/api/equipment/categories').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('Viewer cannot POST equipment (403)', async () => {
    const res = await request(app)
      .post('/api/equipment')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ category: 'Laptop' });
    expect(res.status).toBe(403);
  });

  test('Lifecycle transition available → maintenance works', async () => {
    const res = await request(app)
      .post(`/api/equipment/${createdEquipId}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ new_status: 'maintenance', reason: 'Annual service' });
    expect(res.status).toBe(200);
    expect(res.body.transition.to).toBe('maintenance');
  });

  test('Invalid lifecycle transition is rejected (409)', async () => {
    // maintenance → procurement is not allowed
    const res = await request(app)
      .post(`/api/equipment/${createdEquipId}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ new_status: 'procurement' });
    expect(res.status).toBe(409);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('👥 Employees — CRUD', () => {
  let createdEmpId;

  test('GET /api/employees → 200 returns array', async () => {
    const res = await request(app).get('/api/employees').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('POST /api/employees → 201 creates employee', async () => {
    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Deepa Venkataraman', email: 'deepa.v@test.com', department: 'Engineering', position: 'QA Engineer' });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('Deepa Venkataraman');
    createdEmpId = res.body.data.id;
  });

  test('POST /api/employees → 400 without name', async () => {
    const res = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'noname@test.com' });
    expect(res.status).toBe(400);
  });

  test('GET /api/employees/departments → returns departments', async () => {
    const res = await request(app).get('/api/employees/departments').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('🔗 Assignments — Create & Return', () => {
  let assignmentId;

  test('POST /api/assignments → 201 assigns equipment', async () => {
    const res = await request(app)
      .post('/api/assignments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ employee_id: 1, equipment_id: 2, notes: 'Integration test assignment' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    assignmentId = res.body.data.id;
  });

  test('POST /api/assignments → 409 if equipment already assigned', async () => {
    const res = await request(app)
      .post('/api/assignments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ employee_id: 1, equipment_id: 2 });
    expect(res.status).toBe(409);
  });

  test('GET /api/assignments → 200 returns list', async () => {
    const res = await request(app).get('/api/assignments').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('GET /api/assignments?status=active → only active assignments', async () => {
    const res = await request(app).get('/api/assignments?status=active').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    res.body.data.forEach(a => expect(a.returned_date).toBeNull());
  });

  test('POST /api/assignments/:id/return → 200 returns equipment', async () => {
    const res = await request(app)
      .post(`/api/assignments/${assignmentId}/return`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ return_reason: 'Test return', condition_on_return: 'good' });
    expect(res.status).toBe(200);
    expect(res.body.data.returned_date).not.toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
describe('🔍 Global Search — Feature 6', () => {

  test('GET /api/search?q=Karthik → finds employee', async () => {
    const res = await request(app).get('/api/search?q=Karthik').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.data.employees.length).toBeGreaterThanOrEqual(1);
  });

  test('GET /api/search?q=Dell → finds equipment', async () => {
    const res = await request(app).get('/api/search?q=Dell').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.equipment.length).toBeGreaterThanOrEqual(1);
  });

  test('GET /api/search?q=AST → finds by asset tag', async () => {
    const res = await request(app).get('/api/search?q=AST').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.equipment.length).toBeGreaterThanOrEqual(1);
  });

  test('GET /api/search?q=x → 400 for single char query', async () => {
    const res = await request(app).get('/api/search?q=x').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });

  test('GET /api/search → 401 without auth', async () => {
    const res = await request(app).get('/api/search?q=test');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('🔧 Maintenance Tracker — Feature 1', () => {
  let maintenanceId;

  test('POST /api/maintenance → 201 creates record', async () => {
    const res = await request(app)
      .post('/api/maintenance')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        equipment_id: 1, type: 'service', description: 'Annual service check',
        performed_by: 'IT Team', cost: 2500, status: 'completed',
        completed_date: '2024-03-01', next_service_date: '2025-03-01'
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    maintenanceId = res.body.data.id;
  });

  test('GET /api/maintenance → 200 returns records', async () => {
    const res = await request(app).get('/api/maintenance').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('GET /api/maintenance/equipment/:id → returns history', async () => {
    const res = await request(app).get('/api/maintenance/equipment/1').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.meta).toHaveProperty('total_cost');
    expect(res.body.meta.total_records).toBeGreaterThanOrEqual(1);
  });

  test('POST /api/maintenance → 400 without description', async () => {
    const res = await request(app)
      .post('/api/maintenance')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ equipment_id: 1, type: 'service' });
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('📊 Reports — Feature 2', () => {

  test('GET /api/reports/by-department → returns dept breakdown', async () => {
    const res = await request(app).get('/api/reports/by-department').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    if (res.body.data.length > 0) {
      const dept = res.body.data[0];
      expect(dept).toHaveProperty('department');
      expect(dept).toHaveProperty('total_employees');
      expect(dept).toHaveProperty('categories');
    }
  });

  test('GET /api/reports/summary → returns cost summary', async () => {
    const res = await request(app).get('/api/reports/summary').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('overall');
    expect(res.body.data).toHaveProperty('categoryBreakdown');
    expect(res.body.data.overall).toHaveProperty('total_assets');
    expect(res.body.data.overall).toHaveProperty('total_investment');
  });

  test('GET /api/reports/category-cost → returns category costs', async () => {
    const res = await request(app).get('/api/reports/category-cost').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
describe('📋 Audit Log & Dashboard', () => {

  test('GET /api/history → 200 returns audit logs', async () => {
    const res = await request(app).get('/api/history').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('GET /api/dashboard/stats → 200 returns stats', async () => {
    const res = await request(app).get('/api/dashboard/stats').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('equipment');
    expect(res.body.data).toHaveProperty('employees');
    expect(res.body.data).toHaveProperty('assignments');
    expect(res.body.data).toHaveProperty('maintenanceDue');
  });
});
