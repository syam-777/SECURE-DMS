const express = require("express");
const router = express.Router();

const {
  listAuditLogs,
  getAuditLogById,
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

router.get(
  "/",
  authorize("audit:read"),
  auditLogsListValidators,
  validateRequest,
  listAuditLogs
);

router.get(
  "/:id",
  authorize("audit:read"),
  auditLogIdParamValidator,
  validateRequest,
  getAuditLogById
);

module.exports = router;