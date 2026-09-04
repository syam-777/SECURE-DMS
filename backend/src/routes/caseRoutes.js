const express = require("express");
const router = express.Router();

const {
  listCases,
  createNewCase,
  getCaseById,
  updateCaseById,
  updateCaseStatusById,
  deleteCaseById,
  getAssignments,
  createNewAssignment,
  deleteCaseAssignment,
} = require("../controllers/caseController");
const { authenticate, authorize } = require("../middleware/authMiddleware");
const {
  createCaseValidators,
  updateCaseValidators,
  caseIdParamValidator,
  updateCaseStatusValidators,
  caseListValidators,
  createAssignmentValidators,
  deleteAssignmentValidators,
  validateRequest,
} = require("../middleware/validate");

// All case routes require authentication.
router.use(authenticate);

// GET /api/cases — list cases (paginated, filtered, searched, sorted)
router.get(
  "/",
  authorize("cases:read"),
  caseListValidators,
  validateRequest,
  listCases
);

// POST /api/cases — create a case
router.post(
  "/",
  authorize("cases:write"),
  createCaseValidators,
  validateRequest,
  createNewCase
);

// GET /api/cases/:id — get a single case
router.get(
  "/:id",
  authorize("cases:read"),
  caseIdParamValidator,
  validateRequest,
  getCaseById
);

// PUT /api/cases/:id — update editable case fields
router.put(
  "/:id",
  authorize("cases:write"),
  updateCaseValidators,
  validateRequest,
  updateCaseById
);

// PATCH /api/cases/:id/status — change a case's status
router.patch(
  "/:id/status",
  authorize("cases:write"),
  updateCaseStatusValidators,
  validateRequest,
  updateCaseStatusById
);

// DELETE /api/cases/:id — delete a case
router.delete(
  "/:id",
  authorize("cases:delete"),
  caseIdParamValidator,
  validateRequest,
  deleteCaseById
);

// GET /api/cases/:id/assignments — list a case's assignments
router.get(
  "/:id/assignments",
  authorize("cases:read"),
  caseIdParamValidator,
  validateRequest,
  getAssignments
);

// POST /api/cases/:id/assignments — assign a user to a case
router.post(
  "/:id/assignments",
  authorize("cases:assign"),
  createAssignmentValidators,
  validateRequest,
  createNewAssignment
);

// DELETE /api/cases/:id/assignments/:userId — unassign a user from a case
router.delete(
  "/:id/assignments/:userId",
  authorize("cases:assign"),
  deleteAssignmentValidators,
  validateRequest,
  deleteCaseAssignment
);

module.exports = router;
