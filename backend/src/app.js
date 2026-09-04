const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");
const authRoutes = require("./routes/authRoutes");

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

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
