const express = require("express");
const router = express.Router();

const {
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
} = require("../controllers/reviewController");
const { authenticate, authorize } = require("../middleware/authMiddleware");
const {
  caseIdParamValidator,
  documentIdParamValidator,
  validateRequest,
} = require("../middleware/validate");

// All review routes require authentication.
router.use(authenticate);

// GET /api/reviews/stats — reviewer dashboard statistics
router.get("/stats", authorize("reviews:read"), getStats);

// GET /api/reviews/history — review history for current reviewer
router.get("/history", authorize("reviews:read"), getReviewHistory);

// GET /api/reviews/cases — paginated list of cases awaiting review
router.get("/cases", authorize("reviews:read"), listCaseReviews);

// GET /api/reviews/documents — paginated list of documents awaiting review
router.get("/documents", authorize("reviews:read"), listDocumentReviews);

// PATCH /api/reviews/cases/:id/approve — approve a case
router.patch(
  "/cases/:id/approve",
  authorize("reviews:write"),
  caseIdParamValidator,
  validateRequest,
  approveCase
);

// PATCH /api/reviews/cases/:id/reject — reject a case
router.patch(
  "/cases/:id/reject",
  authorize("reviews:write"),
  caseIdParamValidator,
  validateRequest,
  rejectCase
);

// PATCH /api/reviews/cases/:id/return — return a case for revision
router.patch(
  "/cases/:id/return",
  authorize("reviews:write"),
  caseIdParamValidator,
  validateRequest,
  returnCase
);

// PATCH /api/reviews/documents/:id/approve — approve a document
router.patch(
  "/documents/:id/approve",
  authorize("reviews:write"),
  documentIdParamValidator,
  validateRequest,
  approveDocument
);

// PATCH /api/reviews/documents/:id/reject — reject a document
router.patch(
  "/documents/:id/reject",
  authorize("reviews:write"),
  documentIdParamValidator,
  validateRequest,
  rejectDocument
);

// PATCH /api/reviews/documents/:id/return — return a document for revision
router.patch(
  "/documents/:id/return",
  authorize("reviews:write"),
  documentIdParamValidator,
  validateRequest,
  returnDocument
);

module.exports = router;
