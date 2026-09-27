const express = require("express");
const router = express.Router();

const {
  submitVerification,
  getMyVerification,
  listVerifications,
  getVerification,
  approveVerificationRequest,
  rejectVerificationRequest,
} = require("../controllers/officerVerificationController");
const { authenticate, authorize } = require("../middleware/authMiddleware");
const { authLimiter } = require("../middleware/rateLimiter");
const {
  submitVerificationValidators,
  verificationIdParamValidator,
  approveVerificationValidators,
  rejectVerificationValidators,
  verificationListValidators,
  validateRequest,
} = require("../middleware/validate");

// All routes require authentication.
router.use(authenticate);

// POST /api/verifications — USER submits their own verification request.
// /me is intentionally declared before /:id so "me" is not parsed as an id.
router.post(
  "/",
  authLimiter,
  authorize("verifications:submit"),
  submitVerificationValidators,
  validateRequest,
  submitVerification
);

// GET /api/verifications/me — USER views their own latest request.
router.get(
  "/me",
  authorize("verifications:read"),
  getMyVerification
);

// GET /api/verifications — admin list (ADMIN only; requires review right).
router.get(
  "/",
  authorize("verifications:read", "verifications:review"),
  verificationListValidators,
  validateRequest,
  listVerifications
);

// GET /api/verifications/:id — admin details, or the applicant's own.
router.get(
  "/:id",
  authorize("verifications:read"),
  verificationIdParamValidator,
  validateRequest,
  getVerification
);

// PATCH /api/verifications/:id/approve — atomic OFFICER promotion.
router.patch(
  "/:id/approve",
  authorize("verifications:review"),
  approveVerificationValidators,
  validateRequest,
  approveVerificationRequest
);

// PATCH /api/verifications/:id/reject — reject without role change.
router.patch(
  "/:id/reject",
  authorize("verifications:review"),
  rejectVerificationValidators,
  validateRequest,
  rejectVerificationRequest
);

module.exports = router;