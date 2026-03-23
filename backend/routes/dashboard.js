const express = require('express');
const router = express.Router();
const { getDb } = require('../utils/database');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/stats', (req, res) => {
  try {
    const db = getDb();
    const role = req.user.role;

    const equipmentStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status='available' THEN 1 END) as available,
        COUNT(CASE WHEN status='assigned' THEN 1 END) as assigned,
        COUNT(CASE WHEN status='maintenance' THEN 1 END) as maintenance,
        COUNT(CASE WHEN status='retired' THEN 1 END) as retired,
        COALESCE(SUM(purchase_price), 0) as total_value
      FROM equipment WHERE is_active=1
    `).get();

    const employeeStats = db.prepare(`
      SELECT COUNT(*) as total, COUNT(DISTINCT department) as departments
      FROM employees WHERE is_active=1
    `).get();

    const assignmentStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN returned_date IS NULL THEN 1 END) as active,
        COUNT(CASE WHEN expected_return IS NOT NULL AND returned_date IS NULL
          AND expected_return < datetime('now') THEN 1 END) as overdue
      FROM assignments
    `).get();

    const categoryBreakdown = db.prepare(`
      SELECT category, COUNT(*) as total,
        COUNT(CASE WHEN status='available' THEN 1 END) as available,
        COUNT(CASE WHEN status='assigned' THEN 1 END) as assigned,
        COALESCE(SUM(purchase_price), 0) as total_value
      FROM equipment WHERE is_active=1
      GROUP BY category ORDER BY total DESC LIMIT 8
    `).all();

    const monthlyAssignments = db.prepare(`
      SELECT strftime('%Y-%m', assigned_date) as month, COUNT(*) as count
      FROM assignments
      WHERE assigned_date >= date('now', '-6 months')
      GROUP BY month ORDER BY month ASC
    `).all();

    const warrantyExpiring = db.prepare(`
      SELECT id, asset_tag, brand, model, warranty_expiry
      FROM equipment
      WHERE warranty_expiry IS NOT NULL
        AND warranty_expiry BETWEEN date('now') AND date('now', '+30 days')
        AND is_active=1
      ORDER BY warranty_expiry ASC LIMIT 5
    `).all();

    // Maintenance due soon (next 7 days) — Feature 1
    // Count active maintenance records (scheduled + in_progress)
    const maintenanceStats = db.prepare(`
      SELECT
        COUNT(*) as total_active,
        COUNT(CASE WHEN status='scheduled' THEN 1 END) as scheduled,
        COUNT(CASE WHEN status='in_progress' THEN 1 END) as in_progress
      FROM maintenance_records
      WHERE status IN ('scheduled', 'in_progress')
    `).get();

    const maintenanceDue = db.prepare(`
      SELECT m.id, m.equipment_id, m.next_service_date, m.type,
        eq.asset_tag, eq.brand, eq.model, eq.category
      FROM maintenance_records m
      JOIN equipment eq ON m.equipment_id = eq.id
      WHERE m.next_service_date IS NOT NULL
        AND m.next_service_date BETWEEN date('now') AND date('now', '+7 days')
        AND m.status != 'cancelled'
        AND eq.is_active = 1
      ORDER BY m.next_service_date ASC LIMIT 5
    `).all();

    const actLimit = role === 'admin' ? 10 : (role === 'manager' ? 8 : 5);
    const recentActivity = db.prepare(`
      SELECT al.*, u.full_name as user_name
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE 1=1
      ORDER BY al.created_at DESC LIMIT ${actLimit}
    `).all();

    const departmentBreakdown = db.prepare(`
      SELECT e.department,
        COUNT(DISTINCT e.id) as employees,
        COUNT(CASE WHEN a.returned_date IS NULL THEN 1 END) as active_assignments
      FROM employees e
      LEFT JOIN assignments a ON a.employee_id = e.id
      WHERE e.is_active=1 AND e.department IS NOT NULL
      GROUP BY e.department ORDER BY employees DESC LIMIT 8
    `).all();

    res.json({
      success: true,
      data: {
        equipment: equipmentStats,
        employees: employeeStats,
        assignments: assignmentStats,
        categoryBreakdown,
        departmentBreakdown,
        recentActivity,
        monthlyAssignments,
        warrantyExpiring,
        maintenanceDue,        // Feature 1 addition
        maintenanceStats,
        userRole: role
      }
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ success: false, message: 'Failed to load dashboard stats.' });
  }
});

module.exports = router;
