const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/asset_management.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = NORMAL');
  }
  return db;
}

async function initDatabase() {
  const database = getDb();

  database.exec(`
    -- Users table (authentication)
    CREATE TABLE IF NOT EXISTS users (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      username     TEXT    NOT NULL UNIQUE,
      password     TEXT    NOT NULL,
      role         TEXT    NOT NULL DEFAULT 'manager' CHECK(role IN ('admin','manager')),
      email        TEXT    UNIQUE,
      full_name    TEXT,
      is_active    INTEGER NOT NULL DEFAULT 1,
      last_login   TEXT,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- Employees table
    CREATE TABLE IF NOT EXISTS employees (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id  TEXT,
      name         TEXT    NOT NULL,
      email        TEXT,
      department   TEXT,
      position     TEXT,
      mobile_phone TEXT,
      desk_phone   TEXT,
      location     TEXT,
      is_active    INTEGER NOT NULL DEFAULT 1,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- Equipment table
    CREATE TABLE IF NOT EXISTS equipment (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_tag     TEXT    UNIQUE,
      category      TEXT    NOT NULL,
      brand         TEXT,
      model         TEXT,
      serial_number TEXT    UNIQUE,
      status        TEXT    NOT NULL DEFAULT 'available'
                    CHECK(status IN ('procurement','available','assigned','maintenance','retiring','retired','lost')),
      condition     TEXT    DEFAULT 'good'
                    CHECK(condition IN ('excellent','good','fair','poor')),
      purchase_date TEXT,
      purchase_price REAL,
      warranty_expiry TEXT,
      location      TEXT,
      notes         TEXT,
      image_url     TEXT,
      is_active     INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- Assignments table
    CREATE TABLE IF NOT EXISTS assignments (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id   INTEGER NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
      equipment_id  INTEGER NOT NULL REFERENCES equipment(id) ON DELETE RESTRICT,
      assigned_by   INTEGER REFERENCES users(id),
      assigned_date TEXT    NOT NULL DEFAULT (datetime('now')),
      expected_return TEXT,
      returned_date TEXT,
      return_reason TEXT,
      condition_on_return TEXT,
      notes         TEXT,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- Audit log table
    CREATE TABLE IF NOT EXISTS audit_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name  TEXT    NOT NULL,
      record_id   INTEGER,
      action      TEXT    NOT NULL CHECK(action IN ('INSERT','UPDATE','DELETE','LOGIN','LOGOUT','EXPORT','TRANSITION')),
      old_values  TEXT,
      new_values  TEXT,
      user_id     INTEGER REFERENCES users(id),
      ip_address  TEXT,
      user_agent  TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- Notifications table
    CREATE TABLE IF NOT EXISTS notifications (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      type        TEXT    NOT NULL,
      title       TEXT    NOT NULL,
      message     TEXT    NOT NULL,
      reference_id INTEGER,
      reference_table TEXT,
      is_read     INTEGER NOT NULL DEFAULT 0,
      user_id     INTEGER REFERENCES users(id),
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );


    -- Maintenance records table
    CREATE TABLE IF NOT EXISTS maintenance_records (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id   INTEGER NOT NULL REFERENCES equipment(id) ON DELETE RESTRICT,
      type           TEXT    NOT NULL CHECK(type IN ('scheduled','service','repair','inspection','upgrade','cleaning','other')),
      title          TEXT    NOT NULL,
      description    TEXT,
      scheduled_date TEXT,
      completed_date TEXT,
      status         TEXT    NOT NULL DEFAULT 'scheduled'
                     CHECK(status IN ('scheduled','in_progress','completed','cancelled')),
      cost           REAL,
      vendor         TEXT,
      notes          TEXT,
      created_by     INTEGER REFERENCES users(id),
      created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- Asset lifecycle transitions table
    CREATE TABLE IF NOT EXISTS lifecycle_events (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id   INTEGER NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
      from_status    TEXT,
      to_status      TEXT    NOT NULL,
      reason         TEXT,
      changed_by     INTEGER REFERENCES users(id),
      created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );


    -- Maintenance Logs
    CREATE TABLE IF NOT EXISTS maintenance_logs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id    INTEGER NOT NULL REFERENCES equipment(id),
      service_type    TEXT    NOT NULL,
      performed_by    TEXT,
      performed_date  TEXT    NOT NULL,
      cost            REAL,
      description     TEXT,
      next_service_date TEXT,
      parts_replaced  TEXT,
      logged_by       INTEGER REFERENCES users(id),
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- Maintenance Schedules
    CREATE TABLE IF NOT EXISTS maintenance_schedules (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id    INTEGER NOT NULL REFERENCES equipment(id),
      service_type    TEXT    NOT NULL,
      frequency_days  INTEGER,
      next_service_date TEXT  NOT NULL,
      notes           TEXT,
      is_active       INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- Asset Lifecycle (status transition log)
    CREATE TABLE IF NOT EXISTS asset_lifecycle (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id INTEGER NOT NULL REFERENCES equipment(id),
      from_status  TEXT,
      to_status    TEXT    NOT NULL,
      reason       TEXT,
      changed_by   INTEGER REFERENCES users(id),
      created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_assignments_employee ON assignments(employee_id);
    CREATE INDEX IF NOT EXISTS idx_assignments_equipment ON assignments(equipment_id);
    CREATE INDEX IF NOT EXISTS idx_assignments_returned ON assignments(returned_date);
    CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status);
    CREATE INDEX IF NOT EXISTS idx_equipment_category ON equipment(category);
    CREATE INDEX IF NOT EXISTS idx_audit_table ON audit_logs(table_name, record_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_employees_dept ON employees(department);
    CREATE INDEX IF NOT EXISTS idx_maint_equip ON maintenance_logs(equipment_id);
    CREATE INDEX IF NOT EXISTS idx_maint_sched ON maintenance_schedules(equipment_id, next_service_date);
    CREATE INDEX IF NOT EXISTS idx_lifecycle    ON asset_lifecycle(equipment_id);


    CREATE INDEX IF NOT EXISTS idx_maintenance_equipment ON maintenance_records(equipment_id);
    CREATE INDEX IF NOT EXISTS idx_maintenance_status    ON maintenance_records(status);
    CREATE INDEX IF NOT EXISTS idx_maintenance_scheduled ON maintenance_records(scheduled_date);
    CREATE INDEX IF NOT EXISTS idx_lifecycle_equipment   ON lifecycle_events(equipment_id);

  `);

  // Seed default admin user if not exists
  const adminExists = database.prepare("SELECT id FROM users WHERE username = 'admin'").get();
  if (!adminExists) {
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('admin123', 12);
    database.prepare(`
      INSERT INTO users (username, password, role, full_name, email)
      VALUES ('admin', ?, 'admin', 'System Administrator', 'admin@company.com')
    `).run(hash);
    console.log('✅ Default admin user created (admin/admin123)');
  }

  // Migration: add missing columns to maintenance_records if they don't exist
  try {
    const maintCols = database.prepare("PRAGMA table_info(maintenance_records)").all().map(c => c.name);
    if (!maintCols.includes('title'))   database.exec("ALTER TABLE maintenance_records ADD COLUMN title TEXT NOT NULL DEFAULT 'Maintenance'");
    if (!maintCols.includes('vendor'))  database.exec("ALTER TABLE maintenance_records ADD COLUMN vendor TEXT");
    if (!maintCols.includes('performed_by')) database.exec("ALTER TABLE maintenance_records ADD COLUMN performed_by TEXT");
    if (!maintCols.includes('next_service_date')) database.exec("ALTER TABLE maintenance_records ADD COLUMN next_service_date TEXT");
  } catch(e) { /* columns already exist */ }

  // Migration: ensure expected_return column in assignments
  try {
    const asnCols = database.prepare("PRAGMA table_info(assignments)").all().map(c => c.name);
    if (!asnCols.includes('expected_return')) database.exec("ALTER TABLE assignments ADD COLUMN expected_return TEXT");
  } catch(e) { /* already exists */ }

  console.log('✅ Database initialized successfully');
  return database;
}

module.exports = { getDb, initDatabase };
