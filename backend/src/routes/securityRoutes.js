const express = require("express");
const router = express.Router();

const {
  getOverview,
} = require("../controllers/securityCenterController");
const {
  authenticate,
  authorize,
} = require("../middleware/authMiddleware");

router.use(authenticate);

router.get("/overview", authorize("audit:read"), getOverview);

module.exports = router;