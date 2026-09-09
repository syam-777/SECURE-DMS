const express = require("express");
const router = express.Router();

const {
  registerPasskeyOptions,
  registerPasskeyVerify,
  loginPasskeyOptions,
  loginPasskeyVerify,
} = require("../controllers/passkeyController");

const { passkeyLoginLimiter } = require("../middleware/passkeyLoginLimiter");
const { authenticate } = require("../middleware/authMiddleware");

// Protected WebAuthn registration routes.
router.post("/register/options", authenticate, registerPasskeyOptions);
router.post("/register/verify", authenticate, registerPasskeyVerify);

// Public WebAuthn authentication routes.
router.post("/login/options", passkeyLoginLimiter, loginPasskeyOptions);
router.post("/login/verify", passkeyLoginLimiter, loginPasskeyVerify);

module.exports = router;