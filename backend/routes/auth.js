const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('../utils/database');
const { generateToken, authenticate, requireRole } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const { createAuditLog } = require('../services/auditService');

// POST /api/auth/login
router.post('/login', validate(schemas.login), (req, res) => {
  const { username, password } = req.body;
  const db = getDb();

  const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid username or password.' });
  }

  const validPassword = bcrypt.compareSync(password, user.password);
  if (!validPassword) {
    return res.status(401).json({ success: false, message: 'Invalid username or password.' });
  }

  // Update last login
  db.prepare('UPDATE users SET last_login = datetime(\'now\') WHERE id = ?').run(user.id);
  createAuditLog('users', user.id, 'LOGIN', null, { username }, req);

  const token = generateToken(user);
  res.json({
    success: true,
    message: 'Login successful.',
    data: {
      token,
      user: { id: user.id, username: user.username, role: user.role, full_name: user.full_name }
    }
  });
});

// GET /api/auth/me
router.get('/me', authenticate, (req, res) => {
  res.json({ success: true, data: req.user });
});

// POST /api/auth/logout
router.post('/logout', authenticate, (req, res) => {
  createAuditLog('users', req.user.id, 'LOGOUT', null, null, req);
  res.json({ success: true, message: 'Logged out successfully.' });
});

// POST /api/auth/change-password
router.post('/change-password', authenticate, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password || new_password.length < 6) {
    return res.status(400).json({ success: false, message: 'Invalid password data.' });
  }
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current_password, user.password)) {
    return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
  }
  const hash = bcrypt.hashSync(new_password, 12);
  db.prepare('UPDATE users SET password = ?, updated_at = datetime(\'now\') WHERE id = ?').run(hash, req.user.id);
  res.json({ success: true, message: 'Password changed successfully.' });
});

// POST /api/auth/forgot-password
router.post('/forgot-password', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });

  const db = getDb();
  const user = db.prepare("SELECT * FROM users WHERE email = ? AND is_active = 1").get(email);

  // Always respond success (don't reveal if email exists)
  if (!user) {
    return res.json({ success: true, message: 'If this email is registered, a reset link will be sent.' });
  }

  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 3600 * 1000).toISOString(); // 1 hour

  db.prepare(`
    INSERT OR REPLACE INTO password_resets (user_id, token, expires_at, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(user.id, token, expires);

  // Send email (non-blocking)
  const { sendPasswordResetEmail } = require('../services/emailService');
  sendPasswordResetEmail({
    email: user.email,
    username: user.username,
    resetToken: token,
    appUrl: process.env.APP_URL || req.get('origin') || 'http://localhost:3000'
  }).catch(err => console.error('Password reset email failed:', err));

  createAuditLog('users', user.id, 'UPDATE', null, { action: 'password_reset_requested' }, req);
  res.json({ success: true, message: 'If this email is registered, a reset link will be sent.', dev_token: process.env.NODE_ENV !== 'production' ? token : undefined });
});

// POST /api/auth/reset-password
router.post('/reset-password', (req, res) => {
  const { token, new_password } = req.body;
  if (!token || !new_password || new_password.length < 6) {
    return res.status(400).json({ success: false, message: 'Token and new password (min 6 chars) required.' });
  }

  const db = getDb();
  // Ensure table exists
  try {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        token TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        used INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `).run();
  } catch (e) { /* already exists */ }

  const reset = db.prepare("SELECT * FROM password_resets WHERE token = ? AND used = 0").get(token);
  if (!reset) return res.status(400).json({ success: false, message: 'Invalid or already used reset token.' });
  if (new Date(reset.expires_at) < new Date()) {
    return res.status(400).json({ success: false, message: 'Reset token has expired. Please request a new one.' });
  }

  const hash = bcrypt.hashSync(new_password, 12);
  db.prepare("UPDATE users SET password = ?, updated_at = datetime('now') WHERE id = ?").run(hash, reset.user_id);
  db.prepare("UPDATE password_resets SET used = 1 WHERE token = ?").run(token);

  createAuditLog('users', reset.user_id, 'UPDATE', null, { action: 'password_reset_completed' }, req);
  res.json({ success: true, message: 'Password has been reset successfully. You can now log in.' });
});

// POST /api/auth/users  (admin: create new user)
router.post('/users', authenticate, requireRole('admin'), (req, res) => {
  const { username, password, role, full_name, email } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ success: false, message: 'username, password and role are required.' });
  }
  const validRoles = ['admin', 'manager'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ success: false, message: 'role must be admin or manager.' });
  }
  const db = getDb();
  try {
    const hash = bcrypt.hashSync(password, 12);
    const result = db.prepare(
      'INSERT INTO users (username, password, role, full_name, email) VALUES (?, ?, ?, ?, ?)'
    ).run(username, hash, role, full_name || null, email || null);
    createAuditLog('users', result.lastInsertRowid, 'INSERT', null, { username, role }, req);
    res.status(201).json({ success: true, message: 'User created.', data: { id: result.lastInsertRowid, username, role } });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ success: false, message: 'Username or email already exists.' });
    }
    throw err;
  }
});

// GET /api/auth/users (admin: list users)
router.get('/users', authenticate, requireRole('admin'), (req, res) => {
  const db = getDb();
  const users = db.prepare("SELECT id, username, role, full_name, email, is_active, last_login, created_at FROM users").all();
  res.json({ success: true, data: users });
});

module.exports = router;
