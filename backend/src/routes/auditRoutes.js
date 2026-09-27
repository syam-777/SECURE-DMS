const express = require("express");
const router = express.Router();

const {
  listAuditLogs,
  getAuditLogFilters,
  getAuditLogById,
  verifyBlockchain,
  getBlockchainBlocks,
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

router.get(
  "/:id",
  authorize("audit:read"),
  auditLogIdParamValidator,
  validateRequest,
  getAuditLogById
);

module.exports = router;