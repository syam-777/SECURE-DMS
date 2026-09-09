const express = require("express");
const router = express.Router();

const { getDashboard } = require("../controllers/dashboardController");
const { authenticate, authorize } = require("../middleware/authMiddleware");

// All dashboard routes require authentication.
router.use(authenticate);

// GET /api/dashboard — aggregate statistics, recent cases, and recent activity
router.get("/", authorize("dashboard:read"), getDashboard);

module.exports = router;