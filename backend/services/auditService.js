const { getDb } = require('../utils/database');

function createAuditLog(tableName, recordId, action, oldValues, newValues, req = null) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO audit_logs (table_name, record_id, action, old_values, new_values, user_id, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      tableName,
      recordId,
      action,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null,
      req?.user?.id || null,
      req?.realIP || null,
      req?.userInfo?.userAgent || null
    );
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

module.exports = { createAuditLog };
