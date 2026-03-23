/**
 * Global Search — Feature 6
 * GET /api/search?q=...   → Searches employees + equipment + assignments
 */
const express = require('express');
const router = express.Router();
const { getDb } = require('../utils/database');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'Search query must be at least 2 characters.' });
    }

    const db = getDb();
    const term = `%${q.trim()}%`;

    // Search employees
    const employees = db.prepare(`
      SELECT 'employee' as type, id, employee_id as code, name as title,
        department as subtitle, email as detail, 'EMP' as badge
      FROM employees
      WHERE is_active=1 AND (name LIKE ? OR email LIKE ? OR employee_id LIKE ? OR department LIKE ? OR position LIKE ?)
      LIMIT 8
    `).all(term, term, term, term, term);

    // Search equipment — by brand, model, asset_tag, serial_number, category, location
    const equipment = db.prepare(`
      SELECT 'equipment' as type, eq.id,
        eq.asset_tag as code,
        (COALESCE(eq.brand, '') || ' ' || COALESCE(eq.model, '')) as title,
        eq.category as subtitle,
        eq.serial_number as detail,
        eq.status as badge
      FROM equipment eq
      WHERE eq.is_active=1 AND (
        eq.brand LIKE ? OR eq.model LIKE ? OR eq.asset_tag LIKE ?
        OR eq.serial_number LIKE ? OR eq.category LIKE ? OR eq.location LIKE ?
      )
      LIMIT 8
    `).all(term, term, term, term, term, term);

    // Search active assignments — by employee name or asset
    const assignments = db.prepare(`
      SELECT 'assignment' as type, a.id,
        eq.asset_tag as code,
        e.name || ' ← ' || eq.brand || ' ' || COALESCE(eq.model,'') as title,
        e.department as subtitle,
        CASE WHEN a.returned_date IS NULL THEN 'active' ELSE 'returned' END as badge,
        a.assigned_date as detail
      FROM assignments a
      JOIN employees e  ON a.employee_id  = e.id
      JOIN equipment eq ON a.equipment_id = eq.id
      WHERE (e.name LIKE ? OR eq.brand LIKE ? OR eq.model LIKE ? OR eq.asset_tag LIKE ? OR e.department LIKE ?)
      ORDER BY a.assigned_date DESC LIMIT 5
    `).all(term, term, term, term, term);

    const total = employees.length + equipment.length + assignments.length;

    res.json({
      success: true,
      query: q.trim(),
      total,
      data: { employees, equipment, assignments }
    });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ success: false, message: 'Search failed.' });
  }
});

module.exports = router;
