/**
 * Department-wise Reports — Feature 2
 * GET /api/reports/by-department  → Full department breakdown
 * GET /api/reports/summary        → Overall cost summary
 * GET /api/reports/category-cost  → Cost per category
 */
const express = require('express');
const router = express.Router();
const { getDb } = require('../utils/database');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// GET /api/reports/by-department
router.get('/by-department', (req, res) => {
  try {
    const db = getDb();

    // Per-department: headcount, active assignments, total asset value
    const deptStats = db.prepare(`
      SELECT
        e.department,
        COUNT(DISTINCT e.id) as total_employees,
        COUNT(CASE WHEN a.returned_date IS NULL THEN 1 END) as active_assignments,
        COUNT(DISTINCT CASE WHEN a.returned_date IS NULL THEN a.equipment_id END) as assigned_assets,
        COALESCE(SUM(CASE WHEN a.returned_date IS NULL THEN eq.purchase_price ELSE 0 END), 0) as total_asset_value,
        COALESCE(AVG(CASE WHEN a.returned_date IS NULL THEN eq.purchase_price END), 0) as avg_asset_value
      FROM employees e
      LEFT JOIN assignments a ON a.employee_id = e.id
      LEFT JOIN equipment eq ON a.equipment_id = eq.id AND a.returned_date IS NULL
      WHERE e.is_active = 1 AND e.department IS NOT NULL
      GROUP BY e.department
      ORDER BY total_employees DESC
    `).all();

    // Per-department: breakdown by category
    const deptCategoryBreakdown = db.prepare(`
      SELECT
        e.department,
        eq.category,
        COUNT(*) as count,
        SUM(COALESCE(eq.purchase_price, 0)) as value
      FROM employees e
      JOIN assignments a ON a.employee_id = e.id AND a.returned_date IS NULL
      JOIN equipment eq ON a.equipment_id = eq.id
      WHERE e.is_active = 1 AND e.department IS NOT NULL
      GROUP BY e.department, eq.category
      ORDER BY e.department, count DESC
    `).all();

    // Attach category breakdown to each dept
    const byDept = {};
    deptStats.forEach(d => { byDept[d.department] = { ...d, categories: [] }; });
    deptCategoryBreakdown.forEach(r => {
      if (byDept[r.department]) byDept[r.department].categories.push({ category: r.category, count: r.count, value: Math.round(r.value) });
    });

    const result = Object.values(byDept).map(d => ({
      ...d,
      employee_count: d.total_employees,  // alias for frontend compat
      asset_per_employee: d.total_employees > 0 ? (d.active_assignments / d.total_employees).toFixed(2) : '0',
      total_asset_value: Math.round(d.total_asset_value || 0),
    }));
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('Reports by-dept error:', err);
    res.status(500).json({ success: false, message: 'Failed to load department report.' });
  }
});

// GET /api/reports/summary
router.get('/summary', (req, res) => {
  try {
    const db = getDb();

    const overall = db.prepare(`
      SELECT
        COUNT(*) as total_assets,
        COALESCE(SUM(purchase_price), 0) as total_investment,
        COALESCE(AVG(purchase_price), 0) as avg_asset_cost,
        COUNT(CASE WHEN status='available' THEN 1 END) as available,
        COUNT(CASE WHEN status='assigned' THEN 1 END) as assigned,
        COUNT(CASE WHEN status='maintenance' THEN 1 END) as in_maintenance,
        COUNT(CASE WHEN status='retired' THEN 1 END) as retired
      FROM equipment WHERE is_active=1
    `).get();

    const categoryBreakdown = db.prepare(`
      SELECT category,
        COUNT(*) as count,
        COALESCE(SUM(purchase_price), 0) as total_value,
        COALESCE(AVG(purchase_price), 0) as avg_value,
        COUNT(CASE WHEN status='assigned' THEN 1 END) as assigned,
        COUNT(CASE WHEN status='available' THEN 1 END) as available
      FROM equipment WHERE is_active=1
      GROUP BY category ORDER BY total_value DESC
    `).all();

    const monthlySpend = db.prepare(`
      SELECT strftime('%Y-%m', purchase_date) as month,
        COUNT(*) as purchases,
        SUM(COALESCE(purchase_price, 0)) as spend
      FROM equipment
      WHERE purchase_date IS NOT NULL AND is_active=1
        AND purchase_date >= date('now', '-12 months')
      GROUP BY month ORDER BY month ASC
    `).all();

    const maintenanceCost = db.prepare(`
      SELECT
        COALESCE(SUM(cost), 0) as total_maintenance_cost,
        COUNT(*) as total_maintenance_events,
        COUNT(CASE WHEN status='completed' THEN 1 END) as completed
      FROM maintenance_records
    `).get();

    res.json({
      success: true,
      data: {
        overall: { ...overall, total_investment: Math.round(overall.total_investment) },
        categoryBreakdown: categoryBreakdown.map(c => ({ ...c, total_value: Math.round(c.total_value), avg_value: Math.round(c.avg_value) })),
        monthlySpend,
        maintenance: maintenanceCost
      }
    });
  } catch (err) {
    console.error('Reports summary error:', err);
    res.status(500).json({ success: false, message: 'Failed to load summary.' });
  }
});

// GET /api/reports/category-cost
router.get('/category-cost', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT category,
        COUNT(*) as count,
        COALESCE(SUM(purchase_price), 0) as total_cost,
        COALESCE(MIN(purchase_price), 0) as min_cost,
        COALESCE(MAX(purchase_price), 0) as max_cost,
        COALESCE(AVG(purchase_price), 0) as avg_cost
      FROM equipment WHERE is_active=1 AND purchase_price IS NOT NULL
      GROUP BY category ORDER BY total_cost DESC
    `).all();
    res.json({ success: true, data: rows.map(r => ({ ...r, total_cost: Math.round(r.total_cost), avg_cost: Math.round(r.avg_cost) })) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to load category cost report.' });
  }
});

module.exports = router;

// GET /api/reports/cost-analysis — Cost breakdown by category + yearly spend
router.get('/cost-analysis', (req, res) => {
  try {
    const db = getDb();

    const totalSpend = db.prepare(
      "SELECT COALESCE(SUM(purchase_price), 0) as total FROM equipment WHERE is_active=1 AND purchase_price IS NOT NULL"
    ).get().total || 1;

    const byCategory = db.prepare(`
      SELECT category,
        COUNT(*) as total_items,
        COALESCE(SUM(purchase_price), 0) as total_cost,
        COALESCE(AVG(purchase_price), 0) as avg_cost,
        COALESCE(MAX(purchase_price), 0) as max_cost
      FROM equipment WHERE is_active=1 AND purchase_price IS NOT NULL
      GROUP BY category ORDER BY total_cost DESC
    `).all().map(r => ({
      ...r,
      total_cost: Math.round(r.total_cost),
      avg_cost: Math.round(r.avg_cost),
      max_cost: Math.round(r.max_cost),
      percentage_of_total: Math.round((r.total_cost / totalSpend) * 100)
    }));

    const yearlySpend = db.prepare(`
      SELECT strftime('%Y', purchase_date) as year,
        COUNT(*) as total_items,
        COALESCE(SUM(purchase_price), 0) as total_spend
      FROM equipment
      WHERE purchase_date IS NOT NULL AND is_active=1
      GROUP BY year ORDER BY year DESC
    `).all().map(r => ({ ...r, total_spend: Math.round(r.total_spend) }));

    res.json({
      success: true,
      data: {
        by_category: byCategory,
        yearly_spend: yearlySpend,
        total_spend: Math.round(totalSpend)
      }
    });
  } catch (err) {
    console.error('Cost analysis error:', err);
    res.status(500).json({ success: false, message: 'Failed to load cost analysis: ' + err.message });
  }
});
