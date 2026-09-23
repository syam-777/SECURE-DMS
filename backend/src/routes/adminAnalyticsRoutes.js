const express = require("express");
const router = express.Router();

const {
  getAnalytics,
} = require("../controllers/adminAnalyticsController");
const {
  authenticate,
  authorize,
} = require("../middleware/authMiddleware");

router.use(authenticate);

router.get("/", authorize("audit:read"), getAnalytics);

module.exports = router;