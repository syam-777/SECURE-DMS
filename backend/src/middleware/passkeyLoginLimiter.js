const rateLimit = require("express-rate-limit");

/**
 * Passkey login rate limiter: 20 requests per 15 minutes per IP.
 * A passkey login is two requests (options + verify), so the limit is
 * slightly higher than the password authLimiter. Applied to the passkey
 * login endpoints to slow challenge-spam and brute-force attempts.
 */
const passkeyLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many authentication attempts. Please try again later.",
    });
  },
});

module.exports = {
  passkeyLoginLimiter,
};