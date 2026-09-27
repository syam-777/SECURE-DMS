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

/**
 * AI document summarization rate limiter: 20 requests per minute per IP.
 * Summarization sends document content to an external AI service, so a
 * stricter, separate limiter protects both cost and abuse surface.
 * Purely additive — it does not weaken any existing limiter.
 */
const aiSummaryLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many summarization requests. Please try again later.",
    });
  },
});

module.exports = {
  authLimiter,
  aiSummaryLimiter,
};
