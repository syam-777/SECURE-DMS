const express = require("express");
const router = express.Router();

const { aiTest, aiAsk } = require("../controllers/aiController");
const {
  aiTestValidators,
  validateRequest,
} = require("../middleware/validate");
const { authenticate } = require("../middleware/authMiddleware");

router.use(authenticate);

router.post("/test", aiTestValidators, validateRequest, aiTest);

router.post("/ask", aiAsk);

module.exports = router;