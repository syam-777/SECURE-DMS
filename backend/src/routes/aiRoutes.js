const express = require("express");
const router = express.Router();

const { aiTest } = require("../controllers/aiController");
const {
  aiTestValidators,
  validateRequest,
} = require("../middleware/validate");
const { authenticate } = require("../middleware/authMiddleware");

// All AI routes require authentication.
router.use(authenticate);

// POST /api/ai/test — protected Gemini text generation test endpoint
router.post("/test", aiTestValidators, validateRequest, aiTest);

module.exports = router;