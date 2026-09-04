const isProduction = process.env.NODE_ENV === "production";

function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
}

function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || err.status || 500;

  const response = {
    success: false,
    message: err.expose && err.message ? err.message : "Internal server error",
  };

  if (!isProduction && err.stack) {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
