const { pool } = require("../config/database");

/**
 * Reusable audit logging helper. Writes one row to audit_logs.
 * On failure it logs a safe, generic message to the console and does
 * NOT throw, so an auditing problem never breaks the request flow.
 *
 * NOTE: Never pass passwords or JWT tokens to `details`.
 *
 * @param {{
 *   userId: number|string|null,
 *   action: string,
 *   resourceType?: string|null,
 *   resourceId?: number|string|null,
 *   ipAddress?: string|null,
 *   userAgent?: string|null,
 *   details?: object|null
 * }} data
 * @returns {Promise<void>}
 */
async function logAuditEvent(data) {
  const details = data.details && typeof data.details === "object" ? data.details : null;

  try {
    await pool.query(
      "INSERT INTO audit_logs " +
        "(user_id, action, resource_type, resource_id, ip_address, user_agent, details) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        data.userId != null ? data.userId : null,
        data.action,
        data.resourceType != null ? data.resourceType : null,
        data.resourceId != null ? data.resourceId : null,
        data.ipAddress != null ? data.ipAddress : null,
        data.userAgent != null ? data.userAgent : null,
        details ? JSON.stringify(details) : null,
      ]
    );
  } catch (err) {
    // Do not break the request or leak sensitive info because of auditing.
    // A fixed, generic message is logged — never echo the DB/query text.
    console.error("Audit log write failed (entry omitted)");
  }
}

module.exports = {
  logAuditEvent,
};
