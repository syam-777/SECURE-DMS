const rateLimit = require("express-rate-limit");

/**
 * Authentication rate limiter: 10 requests per 15 minutes per IP.
 * Applied to login and registration routes to slow brute-force attempts.
 * A human-friendly message is exposed only when the limit is hit.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
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
  authLimiter,
};
