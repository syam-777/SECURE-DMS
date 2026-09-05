const { pool } = require("../config/database");

/**
 * Reusable audit logging helper. Writes one row to audit_logs.
 * On failure it logs a safe, generic message to the console and does
 * NOT throw, so an auditing problem never breaks the request flow.
 *
 * An optional `connection` (a MySQL transaction connection) may be
 * supplied so the audit record can commit/roll back with the calling
 * transaction (used by the officer-verification approval flow).
 *
 * NOTE: Never pass passwords, JWT tokens, or raw official ID values
 * to `details`.
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
 * @param {object} [connection]
 * @returns {Promise<void>}
 */
async function logAuditEvent(data, connection) {
  const details = data.details && typeof data.details === "object" ? data.details : null;

  try {
    const exec = connection || pool;
    await exec.query(
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

const AUDIT_SORTABLE_COLUMNS = [
  "id",
  "action",
  "resource_type",
  "resource_id",
  "user_id",
  "created_at",
];

const AUDIT_LIST_SELECT =
  "SELECT id, user_id, action, resource_type, resource_id, " +
  "ip_address, user_agent, details, created_at FROM audit_logs";

/**
 * Builds the WHERE clause and parameter list shared by the read-only
 * audit log queries. Only filters that are actually supplied are applied.
 */
function buildAuditFilters({ action = "", resourceType = "", userId = "", from = "", to = "" } = {}) {
  const where = [];
  const params = [];

  if (action && String(action).trim()) {
    where.push("action = ?");
    params.push(String(action).trim());
  }

  if (resourceType && String(resourceType).trim()) {
    where.push("resource_type = ?");
    params.push(String(resourceType).trim());
  }

  if (userId && Number(userId) > 0) {
    where.push("user_id = ?");
    params.push(Number(userId));
  }

  if (from) {
    const fromDate = new Date(from);
    if (!isNaN(fromDate.getTime())) {
      where.push("created_at >= ?");
      params.push(fromDate);
    }
  }

  if (to) {
    const toDate = new Date(to);
    if (!isNaN(toDate.getTime())) {
      where.push("created_at <= ?");
      params.push(toDate);
    }
  }

  return { where, params };
}

/**
 * Paginated, filtered read of audit_logs. Read-only.
 *
 * @param {{
 *   page?: number,
 *   limit?: number,
 *   action?: string,
 *   resourceType?: string,
 *   userId?: number|string,
 *   from?: string,
 *   to?: string,
 *   sort?: string,
 *   order?: string
 * }} options
 * @returns {Promise<Array>}
 */
async function findAuditLogs(options = {}) {
  const safePage = Math.max(1, Number(options.page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(options.limit) || 20));
  const offset = (safePage - 1) * safeLimit;

  const { where, params } = buildAuditFilters(options);

  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  const sortCol = AUDIT_SORTABLE_COLUMNS.includes(options.sort) ? options.sort : "created_at";
  const orderDir = String(options.order).toLowerCase() === "asc" ? "ASC" : "DESC";

  const [rows] = await pool.query(
    AUDIT_LIST_SELECT +
      " " +
      whereSql +
      " ORDER BY " +
      sortCol +
      " " +
      orderDir +
      ", id DESC LIMIT ? OFFSET ?",
    [...params, safeLimit, offset]
  );

  return rows;
}

/**
 * Counts audit rows matching the same filters used by findAuditLogs.
 *
 * @param {{
 *   action?: string,
 *   resourceType?: string,
 *   userId?: number|string,
 *   from?: string,
 *   to?: string
 * }} options
 * @returns {Promise<number>}
 */
async function countAuditLogs(options = {}) {
  const { where, params } = buildAuditFilters(options);

  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

  const [rows] = await pool.query("SELECT COUNT(*) AS total FROM audit_logs " + whereSql, params);

  return rows[0].total;
}

/**
 * Returns a single audit record by id, or null when not found. Read-only.
 *
 * @param {number|string} id
 * @returns {Promise<object|null>}
 */
async function findAuditLogById(id) {
  const [rows] = await pool.query(AUDIT_LIST_SELECT + " WHERE id = ? LIMIT 1", [id]);
  return rows[0] || null;
}

module.exports = {
  logAuditEvent,
  findAuditLogs,
  countAuditLogs,
  findAuditLogById,
};
