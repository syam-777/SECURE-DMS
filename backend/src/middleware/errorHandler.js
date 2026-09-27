function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
}

function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || err.status || 500;

  if (statusCode >= 500) {
    console.error("Unhandled server error:", err);
  }

  const response = {
    success: false,
    message: err.expose && err.message
      ? err.message
      : "Internal server error",
  };

  res.status(statusCode).json(response);
}

module.exports = {
  notFoundHandler,
  errorHandler,
};