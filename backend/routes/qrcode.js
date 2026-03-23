const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const { getDb } = require('../utils/database');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET /api/qrcode/equipment/:id — Generate QR code for equipment
router.get('/equipment/:id', async (req, res) => {
  const db = getDb();
  const equipment = db.prepare('SELECT * FROM equipment WHERE id = ? AND is_active = 1').get(req.params.id);
  if (!equipment) return res.status(404).json({ success: false, message: 'Equipment not found.' });

  const data = JSON.stringify({
    id: equipment.id,
    asset_tag: equipment.asset_tag,
    category: equipment.category,
    brand: equipment.brand,
    model: equipment.model,
    serial_number: equipment.serial_number,
    status: equipment.status
  });

  try {
    const format = req.query.format || 'png';
    if (format === 'svg') {
      const svg = await QRCode.toString(data, { type: 'svg', width: 300, margin: 2 });
      res.setHeader('Content-Type', 'image/svg+xml');
      res.send(svg);
    } else {
      const buffer = await QRCode.toBuffer(data, { type: 'png', width: 300, margin: 2, color: { dark: '#1a1e2a', light: '#ffffff' } });
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', `inline; filename="qr-${equipment.asset_tag || equipment.id}.png"`);
      res.send(buffer);
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'QR generation failed.' });
  }
});

module.exports = router;
