const { pool } = require("../config/database");

/**
 * Officer verification model (Phase 11).
 *
 * Raw official identifiers are never stored or selected for client
 * responses; only official_id_hash (SHA-256) and official_id_last4 are
 * persisted. All queries are parameterized; sort columns and status
 * filters are allowlisted before being interpolated into SQL.
 */

const VERIFICATION_STATUSES = ["pending", "approved", "rejected"];

const VERIFICATION_SORT_COLUMNS = [
  "id",
  "user_id",
  "status",
  "submitted_at",
  "reviewed_at",
  "reviewed_by",
];

const VERIFICATION_SELECT =
  "SELECT v.id, v.user_id, v.full_name, v.official_id_type, " +
  "v.official_id_hash, v.official_id_last4, v.status, v.reviewed_by, " +
  "v.submitted_at, v.reviewed_at, v.review_note, " +
  "u.username, u.full_name AS user_full_name, u.email AS user_email " +
  "FROM officer_verifications v " +
  "LEFT JOIN users u ON u.id = v.user_id";

/**
 * Build the WHERE clause and parameters for verification filters.
 * Status must be in the allowlist; userId must be a positive integer.
 * @param {{ status?: string, userId?: string|number }} opts
 * @returns {{ where: string[], params: (string|number)[] }}
 */
function buildVerificationFilters({ status = "", userId = "" } = {}) {
  const where = [];
  const params = [];

  if (VERIFICATION_STATUSES.includes(status)) {
    where.push("v.status = ?");
    params.push(status);
  }

  if (String(userId).trim() && Number(userId) > 0) {
    where.push("v.user_id = ?");
    params.push(Number(userId));
  }

  return { where, params };
}

/**
 * Insert a new officer verification request.
 * @param {{
 *   userId: number, fullName: string, officialIdType: string,
 *   officialIdHash: string, officialIdLast4: string
 * }} data
 * @returns {Promise<{id: number}>} inserted id
 */
async function createVerification(data) {
  const [result] = await pool.query(
    "INSERT INTO officer_verifications " +
      "(user_id, full_name, official_id_type, official_id_hash, official_id_last4) " +
      "VALUES (?, ?, ?, ?, ?)",
    [
      data.userId,
      data.fullName,
      data.officialIdType,
      data.officialIdHash,
      data.officialIdLast4,
    ]
  );
  return { id: result.insertId };
}

/**
 * Find the single pending verification for a user (used to reject
 * duplicate submissions). At most one pending request per user is
 * enforced here and inside the approval transaction.
 * @param {number|string} userId
 * @returns {Promise<object|null>}
 */
async function findPendingVerificationByUserId(userId) {
  const [rows] = await pool.query(
    VERIFICATION_SELECT + " WHERE v.user_id = ? AND v.status = 'pending' ORDER BY v.id DESC LIMIT 1",
    [userId]
  );
  return rows[0] || null;
}

/**
 * Find the most recent verification for a user (used by GET /me).
 * @param {number|string} userId
 * @returns {Promise<object|null>}
 */
async function findLatestVerificationByUserId(userId) {
  const [rows] = await pool.query(
    VERIFICATION_SELECT + " WHERE v.user_id = ? ORDER BY v.id DESC LIMIT 1",
    [userId]
  );
  return rows[0] || null;
}

/**
 * Find a single verification by id. Accepts an optional connection so
 * the caller can read it inside a transaction, optionally locking the
 * row with SELECT ... FOR UPDATE.
 * @param {number|string} id
 * @param {{ connection?: object, forUpdate?: boolean }} [opts]
 * @returns {Promise<object|null>}
 */
async function findVerificationById(id, opts = {}) {
  const exec = opts.connection || pool;
  const lockSql = opts.forUpdate ? " FOR UPDATE" : "";
  const [rows] = await exec.query(
    VERIFICATION_SELECT + " WHERE v.id = ? LIMIT 1" + lockSql,
    [id]
  );
  return rows[0] || null;
}

/**
 * Paginated, filtered read of officer verifications joined with the
 * applicant's user info. Max limit 100. Sort/status are allowlisted.
 * @param {{
 *   page?: number, limit?: number, status?: string,
 *   userId?: string|number, sort?: string, order?: string
 * }} opts
 * @returns {Promise<object[]>}
 */
async function findVerifications(opts = {}) {
  const page = Math.max(1, Number(opts.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(opts.limit) || 20));
  const offset = (page - 1) * limit;

  const { where, params } = buildVerificationFilters(opts);

  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  const sortCol = VERIFICATION_SORT_COLUMNS.includes(opts.sort)
    ? opts.sort
    : "submitted_at";
  const orderDir = String(opts.order).toLowerCase() === "asc" ? "ASC" : "DESC";

  const [rows] = await pool.query(
    VERIFICATION_SELECT +
      " " +
      whereSql +
      " ORDER BY " +
      sortCol +
      " " +
      orderDir +
      ", v.id DESC LIMIT ? OFFSET ?",
    [...params, limit, offset]
  );

  return rows;
}

/**
 * Count verifications matching the same filters used by findVerifications.
 * @param {{ status?: string, userId?: string|number }} opts
 * @returns {Promise<number>}
 */
async function countVerifications(opts = {}) {
  const { where, params } = buildVerificationFilters(opts);
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS total FROM officer_verifications v " + whereSql,
    params
  );
  return rows[0].total;
}

/**
 * Mark a verification approved. Called ONLY inside the approval
 * transaction (must pass `connection`) so that the role promotion,
 * status update, and audit record commit or roll back together.
 * @param {number|string} verificationId
 * @param {object} connection
 * @param {{ reviewedBy: number, reviewNote: string|null }} data
 * @returns {Promise<boolean>}
 */
async function approveVerification(verificationId, connection, data) {
  const [result] = await connection.query(
    "UPDATE officer_verifications SET status = 'approved', " +
      "reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, review_note = ? " +
      "WHERE id = ?",
    [data.reviewedBy, data.reviewNote, verificationId]
  );
  return result.affectedRows > 0;
}

/**
 * Mark a verification rejected. Called only inside a transaction
 * (must pass `connection`). Never touches the user's role.
 * @param {number|string} verificationId
 * @param {object} connection
 * @param {{ reviewedBy: number, reviewNote: string }} data
 * @returns {Promise<boolean>}
 */
async function rejectVerification(verificationId, connection, data) {
  const [result] = await connection.query(
    "UPDATE officer_verifications SET status = 'rejected', " +
      "reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, review_note = ? " +
      "WHERE id = ?",
    [data.reviewedBy, data.reviewNote, verificationId]
  );
  return result.affectedRows > 0;
}

module.exports = {
  VERIFICATION_STATUSES,
  VERIFICATION_SORT_COLUMNS,
  createVerification,
  findPendingVerificationByUserId,
  findLatestVerificationByUserId,
  findVerificationById,
  findVerifications,
  countVerifications,
  approveVerification,
  rejectVerification,
};