const express = require("express");
const router = express.Router();

const {
  register,
  login,
  me,
  logout,
} = require("../controllers/authController");
const {
  registerValidators,
  loginValidators,
  validateRequest,
} = require("../middleware/validate");
const { authLimiter } = require("../middleware/rateLimiter");
const { authenticate } = require("../middleware/authMiddleware");

// Public routes — rate limited.
router.post("/register", authLimiter, registerValidators, validateRequest, register);
router.post("/login", authLimiter, loginValidators, validateRequest, login);

// Protected routes.
router.get("/me", authenticate, me);
router.post("/logout", authenticate, logout);

module.exports = router;
