const { pool } = require("../config/database");
const { CASE_STATUSES, CASE_PRIORITIES } = require("./caseModel");
const { REVIEW_ACTIONS } = require("./reviewModel");
const {
  aggregateDocuments: securityAggregateDocuments,
  aggregateUsers: securityAggregateUsers,
} = require("./securityCenterModel");

/**
 * Admin Analytics model — read-only system-wide aggregates for the Admin
 * Analytics / System Dashboard (GET /api/admin/analytics).
 *
 * Every function accepts an optional `exec` executor (pool or a test pool)
 * so the isolated test suite can bind every query to the test database.
 * Aggregates are zero-filled so the response shape is stable even for an
 * empty database. Digitized counts only — this model NEVER returns users'
 * password hashes, document contents, checksums, file paths, stored file
 * names, IPs, user agents, or keys.
 */

// Real AI-related audit actions recorded by the existing controllers.
// Verified against the codebase:
//   - AI_CASE_QUESTION_ASKED          (aiController)
//   - AI_CASE_SUMMARY_GENERATED       (caseController)
//   - DOCUMENT_CLASSIFIED             (documentController)
//   - DOCUMENT_ENTITIES_EXTRACTED     (documentController)
const AI_ACTIONS = {
  questions: "AI_CASE_QUESTION_ASKED",
  summaries: "AI_CASE_SUMMARY_GENERATED",
  classifications: "DOCUMENT_CLASSIFIED",
  entityExtractions: "DOCUMENT_ENTITIES_EXTRACTED",
};

const RECENT_ACTIVITY_LIMIT = 20;

/**
 * Aggregate case records by status, priority, and case type. Status and
 * priority are zero-filled over their canonical values; case type is a
 * free-form string so only types that actually exist are returned.
 * @param {import("mysql2/promise").Pool} exec
 * @returns {Promise<{
 *   total: number,
 *   byStatus: Array<{status: string, count: number}>,
 *   byPriority: Array<{priority: string, count: number}>,
 *   byType: Array<{type: string, count: number}>
 * }>}
 */
async function aggregateCases(exec) {
  const executor = exec || pool;
  const [rows] = await executor.query(
    "SELECT status, priority, case_type, COUNT(*) AS total " +
      "FROM cases GROUP BY status, priority, case_type"
  );

  const statusCounts = new Map(CASE_STATUSES.map((s) => [s, 0]));
  const priorityCounts = new Map(CASE_PRIORITIES.map((p) => [p, 0]));
  const typeCounts = new Map();

  let total = 0;
  for (const row of rows) {
    const n = Number(row.total);
    total += n;
    if (statusCounts.has(row.status)) {
      statusCounts.set(row.status, statusCounts.get(row.status) + n);
    }
    if (priorityCounts.has(row.priority)) {
      priorityCounts.set(row.priority, priorityCounts.get(row.priority) + n);
    }
    if (row.case_type != null) {
      typeCounts.set(row.case_type, (typeCounts.get(row.case_type) || 0) + n);
    }
  }

  return {
    total,
    byStatus: CASE_STATUSES.map((status) => ({
      status,
      count: statusCounts.get(status),
    })),
    byPriority: CASE_PRIORITIES.map((priority) => ({
      priority,
      count: priorityCounts.get(priority),
    })),
    byType: sortCountRows([...typeCounts.entries()], "type"),
  };
}

/**
 * Aggregate documents: total documents, total versions, and existing
 * document types. Version integrity is provided separately via
 * aggregateIntegrity().
 * @param {import("mysql2/promise").Pool} exec
 * @returns {Promise<{
 *   total: number,
 *   versions: number,
 *   byType: Array<{type: string, count: number}>
 * }>}
 */
async function aggregateDocuments(exec) {
  const executor = exec || pool;
  const [[docCount], [versionCount], [typeRows]] = await Promise.all([
    executor.query("SELECT COUNT(*) AS total FROM documents"),
    executor.query("SELECT COUNT(*) AS total FROM document_versions"),
    executor.query(
      "SELECT document_type, COUNT(*) AS total FROM documents " +
        "WHERE document_type IS NOT NULL GROUP BY document_type"
    ),
  ]);

  return {
    total: Number(docCount[0].total),
    versions: Number(versionCount[0].total),
    byType: sortCountRows(
      typeRows.map((r) => [r.document_type, Number(r.total)]),
      "type"
    ),
  };
}

/**
 * Users: total registered users plus a per-role breakdown. Reuses the
 * existing Security Center user aggregation.
 * @param {import("mysql2/promise").Pool} exec
 * @returns {Promise<{ total: number, byRole: Array<{role: string, count: number}> }>}
 */
async function aggregateUsers(exec) {
  const executor = exec || pool;
  const base = await securityAggregateUsers(executor);
  return { total: base.total, byRole: base.byRole };
}

/**
 * Case reviews by actual decision value (approved/rejected/returned),
 * zero-filled over the canonical review actions.
 * @param {import("mysql2/promise").Pool} exec
 * @returns {Promise<{ total: number, byDecision: Array<{decision: string, count: number}> }>}
 */
async function aggregateReviews(exec) {
  const executor = exec || pool;
  const [rows] = await executor.query(
    "SELECT action, COUNT(*) AS total FROM case_reviews GROUP BY action"
  );

  const counts = new Map(REVIEW_ACTIONS.map((a) => [a, 0]));
  let total = 0;
  for (const row of rows) {
    const n = Number(row.total);
    total += n;
    if (counts.has(row.action)) {
      counts.set(row.action, counts.get(row.action) + n);
    }
  }

  return {
    total,
    byDecision: REVIEW_ACTIONS.map((decision) => ({
      decision,
      count: counts.get(decision),
    })),
  };
}

/**
 * Document version integrity counts (verified / failed / not verified).
 * Reuses the existing Security Center last-check-wins derivation so the
 * Admin Analytics page and the Security Center page always agree.
 * @param {import("mysql2/promise").Pool} exec
 * @returns {Promise<{ verified: number, failed: number, notVerified: number }>}
 */
async function aggregateIntegrity(exec) {
  const executor = exec || pool;
  const base = await securityAggregateDocuments(executor);
  return base.integrity;
}

/**
 * AI activity counts derived from real audit log actions. Actions that
 * have never occurred (or do not exist) simply count 0.
 * @param {import("mysql2/promise").Pool} exec
 * @returns {Promise<{
 *   questions: number,
 *   summaries: number,
 *   classifications: number,
 *   entityExtractions: number
 * }>}
 */
async function aggregateAi(exec) {
  const executor = exec || pool;
  const [rows] = await executor.query(
    "SELECT action, COUNT(*) AS total FROM audit_logs " +
      "WHERE action IN (?, ?, ?, ?) GROUP BY action",
    Object.values(AI_ACTIONS)
  );

  const counts = new Map(Object.values(AI_ACTIONS).map((action) => [action, 0]));
  for (const row of rows) {
    if (counts.has(row.action)) {
      counts.set(row.action, Number(row.total) || 0);
    }
  }

  return {
    questions: counts.get(AI_ACTIONS.questions),
    summaries: counts.get(AI_ACTIONS.summaries),
    classifications: counts.get(AI_ACTIONS.classifications),
    entityExtractions: counts.get(AI_ACTIONS.entityExtractions),
  };
}

/**
 * Most recent audit events, newest first. Returns RAW rows joined with the
 * acting user's display info; the controller sanitizes and projects them
 * before they reach the client.
 * @param {import("mysql2/promise").Pool} exec
 * @param {number} [limit=20]
 * @returns {Promise<Array<{ id: number, user_id: number|null, action: string, resource_type: string|null, resource_id: number|null, details: object|null, created_at: Date, username: string|null, full_name: string|null }>>}
 */
async function getRecentActivity(exec, limit = RECENT_ACTIVITY_LIMIT) {
  const executor = exec || pool;
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || RECENT_ACTIVITY_LIMIT));
  const [rows] = await executor.query(
    "SELECT a.id, a.user_id, a.action, a.resource_type, a.resource_id, " +
      "a.details, a.created_at, u.username, u.full_name " +
      "FROM audit_logs a " +
      "LEFT JOIN users u ON u.id = a.user_id " +
      "ORDER BY a.created_at DESC, a.id DESC LIMIT ?",
    [safeLimit]
  );
  return rows;
}

/**
 * Sorts [name, count] pairs by count descending, then name ascending, and
 * maps them to { [labelKey]: name, count } objects.
 * @param {Array<[string, number]>} entries
 * @param {string} labelKey
 * @returns {Array<{ [labelKey]: string, count: number }>}
 */
function sortCountRows(entries, labelKey) {
  return entries
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .map(([label, count]) => ({ [labelKey]: label, count }));
}

/**
 * Full Admin Analytics overview. All aggregates are read-only and run
 * against a single executor (product pool by default; tests pass the
 * isolated test pool).
 * @param {import("mysql2/promise").Pool} [exec]
 * @returns {Promise<object>}
 */
async function getAdminAnalyticsOverview(exec) {
  const executor = exec || pool;
  const [cases, documents, users, reviews, integrity, ai, activity] =
    await Promise.all([
      aggregateCases(executor),
      aggregateDocuments(executor),
      aggregateUsers(executor),
      aggregateReviews(executor),
      aggregateIntegrity(executor),
      aggregateAi(executor),
      getRecentActivity(executor),
    ]);

  return {
    cases,
    documents,
    users,
    reviews,
    integrity,
    ai,
    activity,
  };
}

module.exports = {
  AI_ACTIONS,
  RECENT_ACTIVITY_LIMIT,
  aggregateCases,
  aggregateDocuments,
  aggregateUsers,
  aggregateReviews,
  aggregateIntegrity,
  aggregateAi,
  getRecentActivity,
  getAdminAnalyticsOverview,
};