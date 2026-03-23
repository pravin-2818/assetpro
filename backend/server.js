require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { initDatabase } = require('./utils/database');
const { ipLogger } = require('./middleware/ipLogger');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

const limiter = rateLimit({ windowMs: 15*60*1000, max: 500, message: { success: false, message: 'Too many requests.' } });
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 20, message: { success: false, message: 'Too many login attempts.' } });
app.use('/api/', limiter);
app.use('/api/auth/login', authLimiter);

app.use(morgan('dev'));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(ipLogger);

app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── API Routes ────────────────────────────────────────────────
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/employees',    require('./routes/employees'));
app.use('/api/equipment',    require('./routes/equipment'));
app.use('/api/assignments',  require('./routes/assignments'));
app.use('/api/history',      require('./routes/history'));
app.use('/api/dashboard',    require('./routes/dashboard'));
app.use('/api/export',       require('./routes/export'));
app.use('/api/bulk',         require('./routes/bulk'));
app.use('/api/upload',       require('./routes/upload'));
app.use('/api/depreciation', require('./routes/depreciation'));
app.use('/api/maintenance',  require('./routes/maintenance'));   // Feature 1
app.use('/api/reports',      require('./routes/reports'));       // Feature 2
app.use('/api/search',       require('./routes/search'));        // Feature 6
app.use('/api/emailtest',    require('./routes/emailtest'));     // Email test (admin only)

app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../frontend', 'index.html')));
app.use(errorHandler);

initDatabase().then(() => {
  const { getDb } = require('./utils/database');
  const db = getDb();

  // Ensure all new tables exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS maintenance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      equipment_id INTEGER NOT NULL REFERENCES equipment(id),
      type TEXT NOT NULL,
      description TEXT NOT NULL,
      performed_by TEXT,
      cost REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'completed',
      scheduled_date TEXT,
      completed_date TEXT,
      next_service_date TEXT,
      notes TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migrate existing maintenance_records table — add missing columns safely
  const maintCols = db.prepare("PRAGMA table_info(maintenance_records)").all().map(c => c.name);
  const addIfMissing = (col, def) => {
    if (!maintCols.includes(col)) {
      db.exec(`ALTER TABLE maintenance_records ADD COLUMN ${col} ${def}`);
      console.log(`  ✅ Migration: added column maintenance_records.${col}`);
    }
  };
  addIfMissing('next_service_date', 'TEXT');
  addIfMissing('completed_date',    'TEXT');
  addIfMissing('scheduled_date',    'TEXT');
  addIfMissing('performed_by',      'TEXT');
  addIfMissing('cost',              'REAL DEFAULT 0');
  addIfMissing('notes',             'TEXT');
  addIfMissing('created_by',        'INTEGER');
  addIfMissing('updated_at',        "TEXT DEFAULT (datetime('now'))");

  // Create indexes (safe — IF NOT EXISTS)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_maint_equip ON maintenance_records(equipment_id);
    CREATE INDEX IF NOT EXISTS idx_maint_date  ON maintenance_records(scheduled_date);
    CREATE INDEX IF NOT EXISTS idx_maint_next  ON maintenance_records(next_service_date);
  `);

  app.listen(PORT, () => {
    console.log(`\n🚀 AssetPro v5 — http://localhost:${PORT}`);
    console.log(`📊 All features active: Maintenance + Reports + Search + Lifecycle`);
    console.log(`📧 Email: ${process.env.EMAIL_USER || "NOT CONFIGURED"}\n`);
  });

  // Start email scheduler (return reminders + warranty alerts)
  require("./services/schedulerService");
}).catch(err => { console.error("DB init failed:", err); process.exit(1); });

module.exports = app;
