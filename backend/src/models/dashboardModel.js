const { pool } = require("../config/database");
const { CASE_STATUSES, CASE_PRIORITIES } = require("./caseModel");
const { DOCUMENT_STATUSES } = require("./documentModel");

/**
 * Phase 10 dashboard aggregates. Read-only summary counts across cases,
 * documents, and pending reviews. Every status/priority is zero-filled so
 * the response shape is stable even for an empty database.
 */
async function getDashboardSummary() {
  const [caseCounts, documentCounts, pendingRows] = await Promise.all([
    pool.query(
      "SELECT status, priority, COUNT(*) AS total FROM cases GROUP BY status, priority",
    ),
    pool.query("SELECT status, COUNT(*) AS total FROM documents GROUP BY status"),
    pool.query("SELECT COUNT(*) AS total FROM cases WHERE status = ?", [
      "under_review",
    ]),
  ]);

  const casesByStatus = Object.fromEntries(CASE_STATUSES.map((s) => [s, 0]));
  const casesByPriority = Object.fromEntries(
    CASE_PRIORITIES.map((p) => [p, 0])
  );
  const documentsByStatus = Object.fromEntries(
    DOCUMENT_STATUSES.map((s) => [s, 0])
  );

  let totalCases = 0;
  for (const row of caseCounts[0]) {
    if (casesByStatus[row.status] !== undefined) {
      casesByStatus[row.status] += Number(row.total);
    }
    if (casesByPriority[row.priority] !== undefined) {
      casesByPriority[row.priority] += Number(row.total);
    }
    totalCases += Number(row.total);
  }

  let totalDocuments = 0;
  for (const row of documentCounts[0]) {
    if (documentsByStatus[row.status] !== undefined) {
      documentsByStatus[row.status] += Number(row.total);
    }
    totalDocuments += Number(row.total);
  }

  return {
    totalCases,
    casesByStatus,
    casesByPriority,
    totalDocuments,
    activeDocuments: documentsByStatus.active,
    documentsByStatus,
    pendingReviews: Number(pendingRows[0][0].total),
  };
}

/**
 * Latest cases for the dashboard, newest updated first.
 * @param {number} [limit=5]
 * @returns {Promise<object[]>}
 */
async function getRecentCases(limit = 5) {
  const [rows] = await pool.query(
    "SELECT id, case_number, title, status, priority, updated_at " +
      "FROM cases ORDER BY updated_at DESC, id DESC LIMIT ?",
    [limit]
  );

  return rows.map((row) => ({
    id: row.id,
    caseNumber: row.case_number,
    title: row.title,
    status: row.status,
    priority: row.priority,
    updatedAt: row.updated_at,
  }));
}

/**
 * Latest audit records for the dashboard, newest first, joined with the
 * acting user's display info. Returns raw rows; the controller sanitizes
 * details before returning them to the client.
 * @param {number} [limit=10]
 * @returns {Promise<object[]>}
 */
async function getRecentActivity(limit = 10) {
  const [rows] = await pool.query(
    "SELECT a.id, a.user_id, a.action, a.resource_type, a.resource_id, " +
      "a.details, a.created_at, u.username, u.full_name " +
      "FROM audit_logs a " +
      "LEFT JOIN users u ON u.id = a.user_id " +
      "ORDER BY a.created_at DESC, a.id DESC LIMIT ?",
    [limit]
  );

  return rows;
}

module.exports = {
  getDashboardSummary,
  getRecentCases,
  getRecentActivity,
};