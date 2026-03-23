/**
 * Image Upload Route - graceful fallback if multer not installed
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { getDb } = require('../utils/database');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

// Try to load multer
let multer = null;
let upload = null;
try {
  multer = require('multer');
  const uploadDir = path.join(__dirname, '../uploads/equipment');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `eq-${req.params.id}-${Date.now()}${ext}`);
    }
  });
  upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (/\.(jpg|jpeg|png|gif|webp)$/i.test(file.originalname)) cb(null, true);
      else cb(new Error('Only image files allowed'));
    }
  });
} catch(e) { /* multer not installed */ }

// POST /api/upload/equipment/:id
router.post('/equipment/:id', requireRole('admin', 'manager'), (req, res) => {
  if (!upload) {
    return res.status(501).json({ success: false, message: 'Image upload requires multer. Run: npm install multer' });
  }
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    if (!req.file) return res.status(400).json({ success: false, message: 'No image uploaded.' });
    const imageUrl = `/uploads/equipment/${req.file.filename}`;
    const db = getDb();
    db.prepare("UPDATE equipment SET image_url=?, updated_at=datetime('now') WHERE id=?").run(imageUrl, req.params.id);
    res.json({ success: true, data: { image_url: imageUrl } });
  });
});

// DELETE /api/upload/equipment/:id
router.delete('/equipment/:id', requireRole('admin'), (req, res) => {
  const db = getDb();
  const eq = db.prepare('SELECT image_url FROM equipment WHERE id=?').get(req.params.id);
  if (eq?.image_url) {
    const fp = path.join(__dirname, '..', eq.image_url);
    if (fs.existsSync(fp)) { try { fs.unlinkSync(fp); } catch(e) {} }
    db.prepare("UPDATE equipment SET image_url=NULL, updated_at=datetime('now') WHERE id=?").run(req.params.id);
  }
  res.json({ success: true, message: 'Image removed.' });
});

module.exports = router;
