const express = require("express");
const cors = require("cors");

const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "Secure DMS Backend is running",
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
