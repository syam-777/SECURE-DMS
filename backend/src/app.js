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

const app = express();

app.use(helmet());
app.use(cors());
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

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
