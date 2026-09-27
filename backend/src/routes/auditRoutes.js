const express = require("express");
const router = express.Router();

const {
  listAuditLogs,
  getAuditLogFilters,
  getAuditLogById,
  verifyBlockchain,
  getBlockchainBlocks,
  debugLedgerInfo,
  debugLedgerHash,
} = require("../controllers/auditController");
const {
  authenticate,
  authorize,
} = require("../middleware/authMiddleware");
const {
  auditLogsListValidators,
  auditLogIdParamValidator,
  validateRequest,
} = require("../middleware/validate");

router.use(authenticate);

router.get("/", authorize("audit:read"), auditLogsListValidators, validateRequest, listAuditLogs);

// MUST stay above "/:id" below.
// Express matches "/filters" against "/:id" (single segment), so declaring
// it afterwards would send the literal string "filters" into
// auditLogIdParamValidator and reject it with a 400.
router.get("/filters", authorize("audit:read"), getAuditLogFilters);

router.get(
  "/blockchain/verify",
  authorize("audit:read"),
  verifyBlockchain
);

router.get(
  "/blockchain/blocks",
  authorize("audit:read"),
  getBlockchainBlocks
);

// TEMPORARY diagnostic endpoint. Inherits router-level `authenticate` plus
// authorize("audit:read"). Remove before production.
router.get(
  "/blockchain/debug",
  authorize("audit:read"),
  debugLedgerInfo
);

// TEMPORARY diagnostic. Dumps genesis created_at in every representation plus
// every computeBlockHashCandidates variant, flagged against the stored hash.
// Read-only. Remove before production.
router.get(
  "/blockchain/debug-hash",
  authorize("audit:read"),
  debugLedgerHash
);

router.get(
  "/:id",
  authorize("audit:read"),
  auditLogIdParamValidator,
  validateRequest,
  getAuditLogById
);

module.exports = router;