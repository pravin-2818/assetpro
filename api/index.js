const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');

const { initDatabase } = require('../backend/utils/database');
const { ipLogger } = require('../backend/middleware/ipLogger');
const { errorHandler } = require('../backend/middleware/errorHandler');

const app = express();

let dbInitPromise;
let inlineHtmlCache;

function ensureDbInit() {
  if (!dbInitPromise) {
    dbInitPromise = initDatabase().catch((err) => {
      dbInitPromise = null;
      throw err;
    });
  }
  return dbInitPromise;
}

function buildInlineHtml() {
  if (inlineHtmlCache) return inlineHtmlCache;

  const frontendDir = path.join(__dirname, '..', 'frontend');
  const htmlPath = path.join(frontendDir, 'index.html');
  const cssPath = path.join(frontendDir, 'css', 'style.css');
  const apiJsPath = path.join(frontendDir, 'js', 'api.js');
  const appJsPath = path.join(frontendDir, 'js', 'app.js');

  let html = fs.readFileSync(htmlPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');
  const apiJs = fs.readFileSync(apiJsPath, 'utf8');
  const appJs = fs.readFileSync(appJsPath, 'utf8');

  html = html.replace('<link rel="stylesheet" href="css/style.css">', `<style>${css}</style>`);
  html = html.replace('<script src="js/api.js"></script>', `<script>${apiJs}</script>`);
  html = html.replace('<script src="js/app.js"></script>', `<script>${appJs}</script>`);

  inlineHtmlCache = html;
  return inlineHtmlCache;
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { success: false, message: 'Too many requests.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many login attempts.' }
});

app.use('/api/', limiter);
app.use('/api/auth/login', authLimiter);

app.use(morgan('dev'));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(ipLogger);

app.use('/uploads', express.static(path.join(__dirname, '..', 'backend', 'uploads')));

app.use('/api', async (req, res, next) => {
  try {
    await ensureDbInit();
    next();
  } catch (error) {
    next(error);
  }
});

app.use('/api/auth', require('../backend/routes/auth'));
app.use('/api/employees', require('../backend/routes/employees'));
app.use('/api/equipment', require('../backend/routes/equipment'));
app.use('/api/assignments', require('../backend/routes/assignments'));
app.use('/api/history', require('../backend/routes/history'));
app.use('/api/dashboard', require('../backend/routes/dashboard'));
app.use('/api/export', require('../backend/routes/export'));
app.use('/api/bulk', require('../backend/routes/bulk'));
app.use('/api/upload', require('../backend/routes/upload'));
app.use('/api/depreciation', require('../backend/routes/depreciation'));
app.use('/api/maintenance', require('../backend/routes/maintenance'));
app.use('/api/reports', require('../backend/routes/reports'));
app.use('/api/search', require('../backend/routes/search'));
app.use('/api/emailtest', require('../backend/routes/emailtest'));

app.get('*', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(buildInlineHtml());
});

app.use(errorHandler);

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`AssetPro single entry running on http://localhost:${PORT}`);
  });
}

module.exports = app;
