/**
 * AssetPro — Scheduler Service
 * Uses node-cron to auto-send emails daily.
 *
 * Jobs:
 *  1. 08:00 AM daily → Send return reminders for assignments due in 7 days
 *  2. 08:30 AM daily → Send warranty expiry alerts to assigned employees
 *
 * Usage in server.js:
 *   require('./services/schedulerService');
 */

let cron;
try { cron = require('node-cron'); } catch(e) {
  console.warn('[Scheduler] node-cron not installed. Run: npm install node-cron');
}

const { getDb } = require('../utils/database');
const { sendReturnReminderEmail, sendWarrantyExpiryEmail } = require('./emailService');

// ── JOB 1: Return Reminders (daily 8:00 AM) ───────────────────
async function runReturnReminders() {
  console.log('[Scheduler] 🔔 Running return reminder job...');
  try {
    const db = getDb();
    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
    const targetDate = sevenDaysLater.toISOString().slice(0, 10);

    const assignments = db.prepare(`
      SELECT
        a.id, a.expected_return,
        e.name  AS employee_name,
        e.email AS employee_email,
        eq.asset_tag, eq.brand, eq.model,
        CAST((julianday(a.expected_return) - julianday('now')) AS INTEGER) AS days_left
      FROM assignments a
      JOIN employees  e  ON e.id  = a.employee_id
      JOIN equipment  eq ON eq.id = a.equipment_id
      WHERE a.returned_date IS NULL
        AND a.expected_return IS NOT NULL
        AND date(a.expected_return) = date(?)
        AND e.email IS NOT NULL AND e.email != ''
    `).all(targetDate);

    console.log(`[Scheduler] Found ${assignments.length} reminder(s) to send for ${targetDate}`);

    for (const a of assignments) {
      try {
        await sendReturnReminderEmail({
          employeeEmail: a.employee_email,
          employeeName:  a.employee_name,
          assetTag:      a.asset_tag,
          brand:         a.brand  || '',
          model:         a.model  || '',
          expectedReturnDate: a.expected_return,
          daysLeft:      a.days_left || 7,
        });
        console.log(`[Scheduler] ✅ Reminder → ${a.employee_email} (${a.asset_tag})`);
      } catch (err) {
        console.error(`[Scheduler] ❌ Reminder failed for ${a.employee_email}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Scheduler] Return reminder job error:', err.message);
  }
}

// ── JOB 2: Warranty Expiry Alerts (daily 8:30 AM) ─────────────
async function runWarrantyAlerts() {
  console.log('[Scheduler] 🛡️  Running warranty alert job...');
  try {
    const db = getDb();

    // Get assets with warranty expiring in exactly 30 days AND assigned to an employee
    const assets = db.prepare(`
      SELECT
        eq.id, eq.asset_tag, eq.brand, eq.model, eq.warranty_expiry,
        e.name  AS employee_name,
        e.email AS employee_email,
        CAST((julianday(eq.warranty_expiry) - julianday('now')) AS INTEGER) AS days_left
      FROM equipment eq
      JOIN assignments a ON a.equipment_id = eq.id AND a.returned_date IS NULL
      JOIN employees   e ON e.id = a.employee_id
      WHERE eq.warranty_expiry IS NOT NULL
        AND eq.is_active = 1
        AND date(eq.warranty_expiry) = date('now', '+30 days')
        AND e.email IS NOT NULL AND e.email != ''
    `).all();

    console.log(`[Scheduler] Found ${assets.length} warranty alert(s) to send`);

    for (const asset of assets) {
      try {
        await sendWarrantyExpiryEmail({
          employeeEmail:  asset.employee_email,
          employeeName:   asset.employee_name,
          assetTag:       asset.asset_tag,
          brand:          asset.brand  || '',
          model:          asset.model  || '',
          warrantyExpiry: asset.warranty_expiry,
          daysLeft:       asset.days_left || 30,
        });
        console.log(`[Scheduler] ✅ Warranty alert → ${asset.employee_email} (${asset.asset_tag})`);
      } catch (err) {
        console.error(`[Scheduler] ❌ Warranty alert failed for ${asset.employee_email}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Scheduler] Warranty alert job error:', err.message);
  }
}

// ── Start cron jobs ───────────────────────────────────────────
if (cron) {
  // Return reminders — every day at 8:00 AM
  cron.schedule('0 8 * * *', () => {
    runReturnReminders().catch(console.error);
  });

  // Warranty alerts — every day at 8:30 AM
  cron.schedule('30 8 * * *', () => {
    runWarrantyAlerts().catch(console.error);
  });

  console.log('[Scheduler] ✅ Jobs scheduled:');
  console.log('             📅 08:00 AM daily → Return reminders');
  console.log('             🛡️  08:30 AM daily → Warranty alerts');
} else {
  console.warn('[Scheduler] ⚠️  node-cron not available. Install with: npm install node-cron');
}

// Export for manual triggering / testing
module.exports = { runReturnReminders, runWarrantyAlerts };
