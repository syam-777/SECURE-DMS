const { pool } = require("../config/database");

/**
 * Review model — handles all database queries for the reviewer workflow.
 *
 * Phase 14: Case & Document Reviews
 *
 * Stats queries return zero-filled counters so the dashboard shape is
 * stable even for an empty database. Sort columns and status values
 * are allowlisted before interpolation.
 */

const REVIEW_ACTIONS = ["approved", "rejected", "returned"];

// ─── Reviewer Dashboard Stats ──────────────────────────────

/**
 * Return review stats for a specific reviewer: counts of pending,
 * approved, and rejected reviews they have performed, plus the
 * number of items currently awaiting review.
 * @param {number} reviewerId
 * @returns {Promise<object>}
 */
async function getReviewerStats(reviewerId) {
  const [
    [pendingCases],
    [approvedCases],
    [rejectedCases],
    [returnedCases],
    [pendingDocs],
    [approvedDocs],
    [rejectedDocs],
    [returnedDocs],
  ] = await Promise.all([
    pool.query(
      "SELECT COUNT(*) AS total FROM cases WHERE status = 'under_review'"
    ),
    pool.query(
      "SELECT COUNT(*) AS total FROM case_reviews WHERE reviewer_id = ? AND action = 'approved'",
      [reviewerId]
    ),
    pool.query(
      "SELECT COUNT(*) AS total FROM case_reviews WHERE reviewer_id = ? AND action = 'rejected'",
      [reviewerId]
    ),
    pool.query(
      "SELECT COUNT(*) AS total FROM case_reviews WHERE reviewer_id = ? AND action = 'returned'",
      [reviewerId]
    ),
    pool.query(
      "SELECT COUNT(*) AS total FROM documents WHERE status = 'pending_review'"
    ),
    pool.query(
      "SELECT COUNT(*) AS total FROM document_reviews WHERE reviewer_id = ? AND action = 'approved'",
      [reviewerId]
    ),
    pool.query(
      "SELECT COUNT(*) AS total FROM document_reviews WHERE reviewer_id = ? AND action = 'rejected'",
      [reviewerId]
    ),
    pool.query(
      "SELECT COUNT(*) AS total FROM document_reviews WHERE reviewer_id = ? AND action = 'returned'",
      [reviewerId]
    ),
  ]);

  return {
    pendingCases: Number(pendingCases[0].total),
    approvedCases: Number(approvedCases[0].total),
    rejectedCases: Number(rejectedCases[0].total),
    returnedCases: Number(returnedCases[0].total),
    pendingDocuments: Number(pendingDocs[0].total),
    approvedDocuments: Number(approvedDocs[0].total),
    rejectedDocuments: Number(rejectedDocs[0].total),
    returnedDocuments: Number(returnedDocs[0].total),
  };
}

// ─── Case Review Queue ─────────────────────────────────────

/**
 * Paginated list of cases awaiting review (status = under_review
 * or returned).
 * @param {{ page?: number, limit?: number, status?: string }} opts
 * @returns {Promise<{ cases: object[], total: number, page: number, limit: number, totalPages: number }>}
 */
async function findReviewableCases({ page = 1, limit = 20, status = "" } = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (safePage - 1) * safeLimit;

  const where = ["c.status IN ('under_review', 'returned')"];
  const params = [];

  if (status === "under_review" || status === "returned") {
    where.length = 0;
    where.push("c.status = ?");
    params.push(status);
  }

  const whereSql = "WHERE " + where.join(" AND ");

  const [countResult] = await pool.query(
    "SELECT COUNT(*) AS total FROM cases c " + whereSql,
    params
  );
  const total = countResult[0].total;

  const [rows] = await pool.query(
    "SELECT c.id, c.case_number, c.title, c.case_type, c.description, " +
      "c.status, c.priority, c.created_by, c.assigned_to, " +
      "c.created_at, c.updated_at, " +
      "creator.full_name AS creator_name, " +
      "creator.username AS creator_username, " +
      "assignee.full_name AS assignee_name, " +
      "assignee.username AS assignee_username, " +
      "lr.action AS last_review_action, " +
      "lr.review_note AS last_review_note, " +
      "lr.created_at AS last_reviewed_at " +
      "FROM cases c " +
      "LEFT JOIN users creator ON creator.id = c.created_by " +
      "LEFT JOIN users assignee ON assignee.id = c.assigned_to " +
      "LEFT JOIN (" +
        "SELECT case_id, MAX(id) AS latest_review_id " +
        "FROM case_reviews GROUP BY case_id" +
      ") latest_review ON latest_review.case_id = c.id " +
      "LEFT JOIN case_reviews lr ON lr.id = latest_review.latest_review_id " +
      whereSql +
      " ORDER BY c.updated_at DESC, c.id DESC LIMIT ? OFFSET ?",
    [...params, safeLimit, offset]
  );

  return {
    cases: rows,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(total / safeLimit),
  };
}

/**
 * Find a single case by id, joined with creator and assignee info.
 * @param {number|string} caseId
 * @returns {Promise<object|null>}
 */
async function findCaseForReview(caseId) {
  const [rows] = await pool.query(
    "SELECT c.id, c.case_number, c.title, c.case_type, c.description, " +
      "c.status, c.priority, c.created_by, c.assigned_to, " +
      "c.created_at, c.updated_at, " +
      "creator.full_name AS creator_name, " +
      "creator.username AS creator_username, " +
      "assignee.full_name AS assignee_name, " +
      "assignee.username AS assignee_username " +
      "FROM cases c " +
      "LEFT JOIN users creator ON creator.id = c.created_by " +
      "LEFT JOIN users assignee ON assignee.id = c.assigned_to " +
      "WHERE c.id = ? LIMIT 1",
    [caseId]
  );
  return rows[0] || null;
}

// ─── Document Review Queue ─────────────────────────────────

/**
 * Paginated list of documents awaiting review (status = pending_review).
 * @param {{ page?: number, limit?: number, status?: string }} opts
 * @returns {Promise<{ documents: object[], total: number, page: number, limit: number, totalPages: number }>}
 */
async function findReviewableDocuments({ page = 1, limit = 20, status = "" } = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (safePage - 1) * safeLimit;

  const where = ["d.status = 'pending_review'"];
  const params = [];

  if (["active", "archived"].includes(status)) {
    where.length = 0;
    where.push("d.status = ?");
    params.push(status);
  }

  const whereSql = "WHERE " + where.join(" AND ");

  const [countResult] = await pool.query(
    "SELECT COUNT(*) AS total FROM documents d " + whereSql,
    params
  );
  const total = countResult[0].total;

  const [rows] = await pool.query(
    "SELECT d.id, d.case_id, d.title, d.description, d.document_type, " +
      "d.status, d.current_version, d.uploaded_by, " +
      "d.created_at, d.updated_at, " +
      "u.full_name AS uploader_name, u.username AS uploader_username, " +
      "c.case_number, " +
      "lr.action AS last_review_action, " +
      "lr.review_note AS last_review_note, " +
      "lr.created_at AS last_reviewed_at " +
      "FROM documents d " +
      "LEFT JOIN users u ON u.id = d.uploaded_by " +
      "LEFT JOIN cases c ON c.id = d.case_id " +
      "LEFT JOIN (" +
        "SELECT document_id, MAX(id) AS latest_review_id " +
        "FROM document_reviews GROUP BY document_id" +
      ") latest_review ON latest_review.document_id = d.id " +
      "LEFT JOIN document_reviews lr ON lr.id = latest_review.latest_review_id " +
      whereSql +
      " ORDER BY d.updated_at DESC, d.id DESC LIMIT ? OFFSET ?",
    [...params, safeLimit, offset]
  );

  return {
    documents: rows,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(total / safeLimit),
  };
}

/**
 * Find a single document by id.
 * @param {number|string} documentId
 * @returns {Promise<object|null>}
 */
async function findDocumentForReview(documentId) {
  const [rows] = await pool.query(
    "SELECT d.id, d.case_id, d.title, d.description, d.document_type, " +
      "d.status, d.current_version, d.uploaded_by, " +
      "d.created_at, d.updated_at, " +
      "u.full_name AS uploader_name, u.username AS uploader_username, " +
      "c.case_number " +
      "FROM documents d " +
      "LEFT JOIN users u ON u.id = d.uploaded_by " +
      "LEFT JOIN cases c ON c.id = d.case_id " +
      "WHERE d.id = ? LIMIT 1",
    [documentId]
  );
  return rows[0] || null;
}

// ─── Review History ────────────────────────────────────────

/**
 * Paginated review history for a reviewer.
 * @param {{ reviewerId: number, page?: number, limit?: number, type?: string }} opts
 * @returns {Promise<{ reviews: object[], total: number, page: number, limit: number, totalPages: number }>}
 */
async function findReviewHistory({ reviewerId, page = 1, limit = 20, type = "" } = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (safePage - 1) * safeLimit;

  const reviews = [];
  let total = 0;

  if (!type || type === "case") {
    const [caseCount] = await pool.query(
      "SELECT COUNT(*) AS total FROM case_reviews WHERE reviewer_id = ?",
      [reviewerId]
    );
    const [caseRows] = await pool.query(
      "SELECT cr.id, cr.case_id AS resource_id, cr.action, cr.review_note, " +
        "cr.created_at, c.case_number, c.title AS resource_title " +
        "FROM case_reviews cr " +
        "LEFT JOIN cases c ON c.id = cr.case_id " +
        "WHERE cr.reviewer_id = ? " +
        "ORDER BY cr.created_at DESC LIMIT ? OFFSET ?",
      [reviewerId, safeLimit, offset]
    );
    for (const row of caseRows) {
      reviews.push({ ...row, review_type: "case" });
    }
    total += Number(caseCount[0].total);
  }

  if (!type || type === "document") {
    const [docCount] = await pool.query(
      "SELECT COUNT(*) AS total FROM document_reviews WHERE reviewer_id = ?",
      [reviewerId]
    );
    const [docRows] = await pool.query(
      "SELECT dr.id, dr.document_id AS resource_id, dr.action, dr.review_note, " +
        "dr.created_at, d.title AS resource_title " +
        "FROM document_reviews dr " +
        "LEFT JOIN documents d ON d.id = dr.document_id " +
        "WHERE dr.reviewer_id = ? " +
        "ORDER BY dr.created_at DESC LIMIT ? OFFSET ?",
      [reviewerId, safeLimit, offset]
    );
    for (const row of docRows) {
      reviews.push({ ...row, review_type: "document" });
    }
    total += Number(docCount[0].total);
  }

  reviews.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  return {
    reviews: reviews.slice(0, safeLimit),
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(total / safeLimit),
  };
}

module.exports = {
  REVIEW_ACTIONS,
  getReviewerStats,
  findReviewableCases,
  findCaseForReview,
  findReviewableDocuments,
  findDocumentForReview,
  findReviewHistory,
};
