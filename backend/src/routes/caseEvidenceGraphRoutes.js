const express = require("express");
const router = express.Router();

const {
  getCaseEvidenceGraph,
} = require("../controllers/caseEvidenceGraphController");
const {
  authenticate,
  authorize,
} = require("../middleware/authMiddleware");

// All case evidence-graph routes require authentication.
router.use(authenticate);

// GET /api/cases/:id/evidence-graph — evidence/entity relationship graph
router.get(
  "/:id/evidence-graph",
  authorize("cases:read"),
  getCaseEvidenceGraph
);

module.exports = router;