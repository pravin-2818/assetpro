/**
 * Email Test Route — DEV ONLY
 * POST /api/emailtest/assignment   → Test assignment email
 * POST /api/emailtest/reminder     → Test return reminder email
 * POST /api/emailtest/warranty     → Test warranty expiry email
 * POST /api/emailtest/run-reminders → Manually trigger reminder job
 * POST /api/emailtest/run-warranty  → Manually trigger warranty job
 */
const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');
const {
  sendAssignmentEmail, sendReturnReminderEmail, sendWarrantyExpiryEmail
} = require('../services/emailService');
const { runReturnReminders, runWarrantyAlerts } = require('../services/schedulerService');

router.use(authenticate, requireRole('admin'));

// Test assignment email
router.post('/assignment', async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ success: false, message: 'to email required' });
  await sendAssignmentEmail({
    employeeName: 'Test Employee', employeeEmail: to,
    assetTag: 'AST-TEST-01', brand: 'Dell', model: 'Latitude 5540',
    category: 'Laptop', assignedDate: new Date().toISOString(),
    expectedReturn: new Date(Date.now() + 30*24*60*60*1000).toISOString(),
    assignedByName: 'System Admin',
  });
  res.json({ success: true, message: `Assignment test email sent to ${to}` });
});

// Test return reminder email
router.post('/reminder', async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ success: false, message: 'to email required' });
  await sendReturnReminderEmail({
    employeeEmail: to, employeeName: 'Test Employee',
    assetTag: 'AST-TEST-01', brand: 'Dell', model: 'Latitude 5540',
    expectedReturnDate: new Date(Date.now() + 7*24*60*60*1000).toISOString(),
    daysLeft: 7,
  });
  res.json({ success: true, message: `Return reminder test email sent to ${to}` });
});

// Test warranty expiry email
router.post('/warranty', async (req, res) => {
  const { to } = req.body;
  if (!to) return res.status(400).json({ success: false, message: 'to email required' });
  await sendWarrantyExpiryEmail({
    employeeEmail: to, employeeName: 'Test Employee',
    assetTag: 'AST-TEST-01', brand: 'Dell', model: 'Latitude 5540',
    warrantyExpiry: new Date(Date.now() + 30*24*60*60*1000).toISOString(),
    daysLeft: 30,
  });
  res.json({ success: true, message: `Warranty expiry test email sent to ${to}` });
});

// Manually run reminder job
router.post('/run-reminders', async (req, res) => {
  await runReturnReminders();
  res.json({ success: true, message: 'Return reminder job executed.' });
});

// Manually run warranty job
router.post('/run-warranty', async (req, res) => {
  await runWarrantyAlerts();
  res.json({ success: true, message: 'Warranty alert job executed.' });
});

module.exports = router;
