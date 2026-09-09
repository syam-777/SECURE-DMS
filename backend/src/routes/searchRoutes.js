const express = require("express");
const router = express.Router();

const {
  searchCasesHandler,
  searchDocumentsHandler,
} = require("../controllers/searchController");
const { authenticate, authorize } = require("../middleware/authMiddleware");
const {
  caseSearchValidators,
  documentSearchValidators,
  validateRequest,
} = require("../middleware/validate");

// All search routes require authentication.
router.use(authenticate);

// GET /api/search/cases — search cases (paginated, filtered, sorted)
router.get(
  "/cases",
  authorize("cases:read"),
  caseSearchValidators,
  validateRequest,
  searchCasesHandler
);

// GET /api/search/documents — search documents (paginated, filtered, sorted)
router.get(
  "/documents",
  authorize("documents:read"),
  documentSearchValidators,
  validateRequest,
  searchDocumentsHandler
);

module.exports = router;