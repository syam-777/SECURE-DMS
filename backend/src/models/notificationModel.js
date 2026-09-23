const { pool } = require("../config/database");

/**
 * Secure DMS — Notifications Model
 *
 * Persistent, per-user notification rows consumed by the dashboard bell /
 * notification center. One row per recipient (user_id is NOT NULL; there
 * is NO recipient_role column — role-wide events fan out to one row per
 * active recipient at creation time).
 *
 * SAFETY CONTRACT:
 *   - Every read/list/update query is scoped by user_id.
 *   - markNotificationRead uses `WHERE id = ? AND user_id = ?` so a
 *     notification belonging to another caller behaves as "not found".
 *   - Recipient IDs are never accepted from the frontend; they are always
 *     supplied by backend workflow code.
 *   - Only safe fields are returned. No secrets, audit payloads, raw
 *     document content, file paths, checksums, tokens, keys, or passwords.
 */

const MAX_LIMIT = 100;

function toIsoString(value) {
  if (value == null) {
    return null;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return d.toISOString();
}

/**
 * Maps a database row to the safe API projection. Never exposes user_id,
 * audit payloads, paths, checksums, or other sensitive metadata.
 */
function toApiNotification(row) {
  return {
    id: Number(row.id),
    type: row.type,
    title: row.title,
    message: row.message,
    caseId: row.case_id != null ? Number(row.case_id) : null,
    documentId: row.document_id != null ? Number(row.document_id) : null,
    isRead: row.is_read === true || row.is_read === 1,
    readAt: toIsoString(row.read_at),
    createdAt: toIsoString(row.created_at),
  };
}

const SAFE_COLUMNS =
  "id, type, title, message, case_id, document_id, is_read, read_at, created_at";

/**
 * Insert a single notification. One row per recipient.
 * @param {{
 *   userId: number,
 *   type: string,
 *   title: string,
 *   message: string,
 *   caseId?: number|null,
 *   documentId?: number|null
 * }} data
 * @param {object} [exec] - pool or a transactional connection (tests).
 * @returns {Promise<{ id: number }>}
 */
async function createNotification(
  { userId, type, title, message, caseId = null, documentId = null } = {},
  exec
) {
  const executor = exec || pool;
  const [result] = await executor.query(
    "INSERT INTO notifications (user_id, type, title, message, case_id, document_id) " +
      "VALUES (?, ?, ?, ?, ?, ?)",
    [
      userId,
      type,
      title,
      message,
      caseId != null ? Number(caseId) : null,
      documentId != null ? Number(documentId) : null,
    ]
  );
  return { id: result.insertId };
}

/**
 * Insert multiple notifications (typically one per recipient for a
 * role-wide fan-out event). Each entry supplies its own userId. Invalid
 * entries (missing or non-positive userId) are skipped silently — the
 * caller's business operation must never fail because of notifications.
 * Duplicate userIds within one batch are collapsed so an event never
 * produces more than one row per recipient.
 * @param {Array<{
 *   userId: number,
 *   type: string,
 *   title: string,
 *   message: string,
 *   caseId?: number|null,
 *   documentId?: number|null
 * }>} notifications
 * @param {object} [exec] - pool or a transactional connection (tests).
 * @returns {Promise<{ created: number }>}
 */
async function createNotificationsForUsers(notifications = [], exec) {
  const executor = exec || pool;
  let created = 0;
  const seenUserIds = new Set();
  for (const data of notifications) {
    if (!data || data.userId == null || Number(data.userId) < 1) {
      continue;
    }
    const uid = Number(data.userId);
    if (seenUserIds.has(uid)) {
      continue;
    }
    seenUserIds.add(uid);
    const [result] = await executor.query(
      "INSERT INTO notifications (user_id, type, title, message, case_id, document_id) " +
        "VALUES (?, ?, ?, ?, ?, ?)",
      [
        uid,
        data.type,
        data.title,
        data.message,
        data.caseId != null ? Number(data.caseId) : null,
        data.documentId != null ? Number(data.documentId) : null,
      ]
    );
    if (result && result.insertId != null) {
      created += 1;
    }
  }
  return { created };
}

/**
 * List a user's own notifications, newest first. Ownership is enforced
 * by user_id; pagination is validated.
 * @param {number} userId
 * @param {{ page?: number, limit?: number, unreadOnly?: boolean }} [opts]
 * @param {object} [exec]
 * @returns {Promise<{ notifications: object[], total: number, page: number, limit: number, totalPages: number }>}
 */
async function findNotificationsForUser(
  userId,
  { page = 1, limit = 20, unreadOnly = false } = {},
  exec
) {
  const executor = exec || pool;
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(MAX_LIMIT, Math.max(1, Number(limit) || 20));
  const offset = (safePage - 1) * safeLimit;

  const where = ["user_id = ?"];
  const params = [userId];
  if (unreadOnly) {
    where.push("is_read = 0");
  }
  const whereSql = "WHERE " + where.join(" AND ");

  const [countResult] = await executor.query(
    "SELECT COUNT(*) AS total FROM notifications " + whereSql,
    params
  );
  const total = Number(countResult[0].total);

  const [rows] = await executor.query(
    "SELECT " + SAFE_COLUMNS + " FROM notifications " + whereSql +
      " ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
    [...params, safeLimit, offset]
  );

  return {
    notifications: rows.map(toApiNotification),
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(total / safeLimit),
  };
}

/**
 * Count a user's unread notifications. Ownership is enforced by user_id.
 * @param {number} userId
 * @param {object} [exec]
 * @returns {Promise<number>}
 */
async function countUnreadNotifications(userId, exec) {
  const executor = exec || pool;
  const [rows] = await executor.query(
    "SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND is_read = 0",
    [userId]
  );
  return Number(rows[0].total);
}

/**
 * Mark a single notification as read, but ONLY when it belongs to the
 * given user. If the row is not the caller's (or does not exist), this
 * returns null and nothing is updated.
 * @param {number} notificationId
 * @param {number} userId
 * @param {object} [exec]
 * @returns {Promise<object|null>} the updated safe notification, or null.
 */
async function markNotificationRead(notificationId, userId, exec) {
  const executor = exec || pool;
  const [result] = await executor.query(
    "UPDATE notifications SET is_read = TRUE, read_at = COALESCE(read_at, CURRENT_TIMESTAMP) " +
      "WHERE id = ? AND user_id = ?",
    [notificationId, userId]
  );
  if (!result || result.affectedRows === 0) {
    return null;
  }
  const [rows] = await executor.query(
    "SELECT " + SAFE_COLUMNS + " FROM notifications WHERE id = ? AND user_id = ? LIMIT 1",
    [notificationId, userId]
  );
  return rows[0] ? toApiNotification(rows[0]) : null;
}

/**
 * Mark all of a user's unread notifications as read. Idempotent.
 * @param {number} userId
 * @param {object} [exec]
 * @returns {Promise<number>} remaining unread count (always 0).
 */
async function markAllNotificationsRead(userId, exec) {
  const executor = exec || pool;
  await executor.query(
    "UPDATE notifications SET is_read = TRUE, read_at = COALESCE(read_at, CURRENT_TIMESTAMP) " +
      "WHERE user_id = ? AND is_read = 0",
    [userId]
  );
  const [rows] = await executor.query(
    "SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND is_read = 0",
    [userId]
  );
  return Number(rows[0].total);
}

module.exports = {
  createNotification,
  createNotificationsForUsers,
  findNotificationsForUser,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
};