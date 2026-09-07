const { pool } = require("../config/database");
const { logAuditEvent } = require("../models/auditLogModel");
const {
  getReviewerStats,
  findReviewableCases,
  findCaseForReview,
  findReviewableDocuments,
  findDocumentForReview,
  findReviewHistory,
} = require("../models/reviewModel");

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.expose = true;
  return err;
}

// ─── GET /api/reviews/stats ─────────────────────────────────
async function getStats(req, res, next) {
  try {
    const stats = await getReviewerStats(req.user.id);
    return res.json({ success: true, stats });
  } catch (err) {
    return next(err);
  }
}

// ─── GET /api/reviews/cases ─────────────────────────────────
async function listCaseReviews(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const status = (req.query.status || "").trim();

    const data = await findReviewableCases({ page, limit, status });
    return res.json({ success: true, ...data });
  } catch (err) {
    return next(err);
  }
}

// ─── GET /api/reviews/documents ─────────────────────────────
async function listDocumentReviews(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const status = (req.query.status || "").trim();

    const data = await findReviewableDocuments({ page, limit, status });
    return res.json({ success: true, ...data });
  } catch (err) {
    return next(err);
  }
}

// ─── GET /api/reviews/history ───────────────────────────────
async function getReviewHistory(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const type = (req.query.type || "").trim();

    const data = await findReviewHistory({
      reviewerId: req.user.id,
      page,
      limit,
      type,
    });
    return res.json({ success: true, ...data });
  } catch (err) {
    return next(err);
  }
}

// ─── PATCH /api/reviews/cases/:id/approve ───────────────────
async function approveCase(req, res, next) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const caseId = req.params.id;
    const caseRow = await findCaseForReview(caseId);
    if (!caseRow) {
      throw httpError(404, "Case not found");
    }
    if (caseRow.status !== "under_review" && caseRow.status !== "returned") {
      throw httpError(409, "Only cases with status 'under_review' or 'returned' can be reviewed");
    }

    const reviewNote = req.body.reviewNote != null
      ? String(req.body.reviewNote).trim()
      : null;

    await connection.query(
      "UPDATE cases SET status = 'closed', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [caseId]
    );

    await connection.query(
      "INSERT INTO case_reviews (case_id, reviewer_id, action, review_note) VALUES (?, ?, 'approved', ?)",
      [caseId, req.user.id, reviewNote]
    );

    await logAuditEvent(
      {
        userId: req.user.id,
        action: "CASE_REVIEW_APPROVED",
        resourceType: "case",
        resourceId: Number(caseId),
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        details: {
          caseNumber: caseRow.case_number,
          previousStatus: caseRow.status,
          newStatus: "closed",
          reviewNote,
        },
      },
      connection
    );

    await connection.commit();

    const updated = await findCaseForReview(caseId);
    return res.json({
      success: true,
      message: "Case approved and closed",
      case: updated,
    });
  } catch (err) {
    try { await connection.rollback(); } catch (_) {}
    return next(err);
  } finally {
    connection.release();
  }
}

// ─── PATCH /api/reviews/cases/:id/reject ────────────────────
async function rejectCase(req, res, next) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const caseId = req.params.id;
    const caseRow = await findCaseForReview(caseId);
    if (!caseRow) {
      throw httpError(404, "Case not found");
    }
    if (caseRow.status !== "under_review" && caseRow.status !== "returned") {
      throw httpError(409, "Only cases with status 'under_review' or 'returned' can be reviewed");
    }

    const reviewNote = String(req.body.reviewNote || "").trim();
    if (!reviewNote) {
      throw httpError(400, "A review note is required to reject a case");
    }

    await connection.query(
      "UPDATE cases SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [caseId]
    );

    await connection.query(
      "INSERT INTO case_reviews (case_id, reviewer_id, action, review_note) VALUES (?, ?, 'rejected', ?)",
      [caseId, req.user.id, reviewNote]
    );

    await logAuditEvent(
      {
        userId: req.user.id,
        action: "CASE_REVIEW_REJECTED",
        resourceType: "case",
        resourceId: Number(caseId),
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        details: {
          caseNumber: caseRow.case_number,
          previousStatus: caseRow.status,
          newStatus: "in_progress",
          reviewNote,
        },
      },
      connection
    );

    await connection.commit();

    const updated = await findCaseForReview(caseId);
    return res.json({
      success: true,
      message: "Case rejected and returned to officer",
      case: updated,
    });
  } catch (err) {
    try { await connection.rollback(); } catch (_) {}
    return next(err);
  } finally {
    connection.release();
  }
}

// ─── PATCH /api/reviews/cases/:id/return ────────────────────
async function returnCase(req, res, next) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const caseId = req.params.id;
    const caseRow = await findCaseForReview(caseId);
    if (!caseRow) {
      throw httpError(404, "Case not found");
    }
    if (caseRow.status !== "under_review" && caseRow.status !== "returned") {
      throw httpError(409, "Only cases with status 'under_review' or 'returned' can be reviewed");
    }

    const reviewNote = String(req.body.reviewNote || "").trim();
    if (!reviewNote) {
      throw httpError(400, "A review note is required to return a case");
    }

    await connection.query(
      "UPDATE cases SET status = 'returned', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [caseId]
    );

    await connection.query(
      "INSERT INTO case_reviews (case_id, reviewer_id, action, review_note) VALUES (?, ?, 'returned', ?)",
      [caseId, req.user.id, reviewNote]
    );

    await logAuditEvent(
      {
        userId: req.user.id,
        action: "CASE_REVIEW_RETURNED",
        resourceType: "case",
        resourceId: Number(caseId),
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        details: {
          caseNumber: caseRow.case_number,
          previousStatus: caseRow.status,
          newStatus: "returned",
          reviewNote,
        },
      },
      connection
    );

    await connection.commit();

    const updated = await findCaseForReview(caseId);
    return res.json({
      success: true,
      message: "Case returned for revision",
      case: updated,
    });
  } catch (err) {
    try { await connection.rollback(); } catch (_) {}
    return next(err);
  } finally {
    connection.release();
  }
}

// ─── PATCH /api/reviews/documents/:id/approve ───────────────
async function approveDocument(req, res, next) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const documentId = req.params.id;
    const docRow = await findDocumentForReview(documentId);
    if (!docRow) {
      throw httpError(404, "Document not found");
    }
    if (docRow.status !== "pending_review") {
      throw httpError(409, "Only documents with status 'pending_review' can be reviewed");
    }

    const reviewNote = req.body.reviewNote != null
      ? String(req.body.reviewNote).trim()
      : null;

    await connection.query(
      "UPDATE documents SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [documentId]
    );

    await connection.query(
      "INSERT INTO document_reviews (document_id, reviewer_id, action, review_note) VALUES (?, ?, 'approved', ?)",
      [documentId, req.user.id, reviewNote]
    );

    await logAuditEvent(
      {
        userId: req.user.id,
        action: "DOCUMENT_REVIEW_APPROVED",
        resourceType: "document",
        resourceId: Number(documentId),
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        details: {
          documentId: Number(documentId),
          documentTitle: docRow.title,
          previousStatus: docRow.status,
          newStatus: "active",
          reviewNote,
        },
      },
      connection
    );

    await connection.commit();

    const updated = await findDocumentForReview(documentId);
    return res.json({
      success: true,
      message: "Document approved",
      document: updated,
    });
  } catch (err) {
    try { await connection.rollback(); } catch (_) {}
    return next(err);
  } finally {
    connection.release();
  }
}

// ─── PATCH /api/reviews/documents/:id/reject ────────────────
async function rejectDocument(req, res, next) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const documentId = req.params.id;
    const docRow = await findDocumentForReview(documentId);
    if (!docRow) {
      throw httpError(404, "Document not found");
    }
    if (docRow.status !== "pending_review") {
      throw httpError(409, "Only documents with status 'pending_review' can be reviewed");
    }

    const reviewNote = String(req.body.reviewNote || "").trim();
    if (!reviewNote) {
      throw httpError(400, "A review note is required to reject a document");
    }

    await connection.query(
      "UPDATE documents SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [documentId]
    );

    await connection.query(
      "INSERT INTO document_reviews (document_id, reviewer_id, action, review_note) VALUES (?, ?, 'rejected', ?)",
      [documentId, req.user.id, reviewNote]
    );

    await logAuditEvent(
      {
        userId: req.user.id,
        action: "DOCUMENT_REVIEW_REJECTED",
        resourceType: "document",
        resourceId: Number(documentId),
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        details: {
          documentId: Number(documentId),
          documentTitle: docRow.title,
          previousStatus: docRow.status,
          newStatus: "active",
          reviewNote,
        },
      },
      connection
    );

    await connection.commit();

    const updated = await findDocumentForReview(documentId);
    return res.json({
      success: true,
      message: "Document rejected",
      document: updated,
    });
  } catch (err) {
    try { await connection.rollback(); } catch (_) {}
    return next(err);
  } finally {
    connection.release();
  }
}

// ─── PATCH /api/reviews/documents/:id/return ────────────────
async function returnDocument(req, res, next) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const documentId = req.params.id;
    const docRow = await findDocumentForReview(documentId);
    if (!docRow) {
      throw httpError(404, "Document not found");
    }
    if (docRow.status !== "pending_review") {
      throw httpError(409, "Only documents with status 'pending_review' can be reviewed");
    }

    const reviewNote = String(req.body.reviewNote || "").trim();
    if (!reviewNote) {
      throw httpError(400, "A review note is required to return a document");
    }

    await connection.query(
      "UPDATE documents SET status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [documentId]
    );

    await connection.query(
      "INSERT INTO document_reviews (document_id, reviewer_id, action, review_note) VALUES (?, ?, 'returned', ?)",
      [documentId, req.user.id, reviewNote]
    );

    await logAuditEvent(
      {
        userId: req.user.id,
        action: "DOCUMENT_REVIEW_RETURNED",
        resourceType: "document",
        resourceId: Number(documentId),
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        details: {
          documentId: Number(documentId),
          documentTitle: docRow.title,
          previousStatus: docRow.status,
          newStatus: "active",
          reviewNote,
        },
      },
      connection
    );

    await connection.commit();

    const updated = await findDocumentForReview(documentId);
    return res.json({
      success: true,
      message: "Document returned for revision",
      document: updated,
    });
  } catch (err) {
    try { await connection.rollback(); } catch (_) {}
    return next(err);
  } finally {
    connection.release();
  }
}

module.exports = {
  getStats,
  listCaseReviews,
  listDocumentReviews,
  getReviewHistory,
  approveCase,
  rejectCase,
  returnCase,
  approveDocument,
  rejectDocument,
  returnDocument,
};
