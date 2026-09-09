const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const roleRoutes = require("./routes/roleRoutes");
const caseRoutes = require("./routes/caseRoutes");
const documentRoutes = require("./routes/documentRoutes");
const searchRoutes = require("./routes/searchRoutes");
const auditRoutes = require("./routes/auditRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const officerVerificationRoutes = require("./routes/officerVerificationRoutes");
const passkeyRoutes = require("./routes/passkeyRoutes");
const aiRoutes = require("./routes/aiRoutes");
const reviewRoutes = require("./routes/reviewRoutes");

const app = express();

app.use(helmet());

const allowedOrigins = [
  process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  "https://secure-qnxwk1r40-a1-9a8d.vercel.app",
];

function isAllowedOrigin(origin) {
  if (!origin) return true; // non-browser requests (curl, server-to-server)
  if (allowedOrigins.includes(origin)) return true; // existing exact allowlist (local dev, prod)
  try {
    // Any Vercel deployment/preview: <project>-<branch>-<hash>.vercel.app
    const hostname = new URL(origin).hostname;
    return hostname.endsWith(".vercel.app");
  } catch {
    return false; // malformed origin never allowed
  }
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }

      return callback(null, false);
    },
  }),
);

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "Secure DMS Backend is running",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/roles", roleRoutes);
app.use("/api/cases", caseRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/audit-logs", auditRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/verifications", officerVerificationRoutes);
app.use("/api/passkeys", passkeyRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/reviews", reviewRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
