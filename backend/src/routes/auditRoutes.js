const express = require("express");
const router = express.Router();

const {
  listAuditLogs,
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