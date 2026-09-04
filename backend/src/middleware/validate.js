const { body, validationResult } = require("express-validator");

const PASSWORD_MIN_LENGTH = 8;

const passwordRule = body("password")
  .isLength({ min: PASSWORD_MIN_LENGTH })
  .withMessage(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .matches(/[a-zA-Z]/)
  .withMessage("Password must contain at least one letter")
  .matches(/[0-9]/)
  .withMessage("Password must contain at least one number");

const registerValidators = [
  body("fullName")
    .trim()
    .notEmpty()
    .withMessage("Full name is required")
    .isLength({ max: 150 })
    .withMessage("Full name must be 150 characters or fewer"),
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .normalizeEmail()
    .isEmail()
    .withMessage("A valid email is required"),
  passwordRule,
  body("confirmPassword")
    .notEmpty()
    .withMessage("Please confirm your password"),
];

const loginValidators = [
  body("email")
    .trim()
    .notEmpty()
    .withMessage("Email is required")
    .normalizeEmail()
    .isEmail()
    .withMessage("A valid email is required"),
  body("password").notEmpty().withMessage("Password is required"),
];

function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const messages = errors.array().map((e) => e.msg);
    const err = new Error(messages.join("; "));
    err.statusCode = 400;
    err.expose = true;
    return next(err);
  }

  // Cross-field check: confirmPassword must match password.
  if (
    req.body &&
    typeof req.body.confirmPassword === "string" &&
    req.body.confirmPassword !== req.body.password
  ) {
    const err = new Error("Passwords do not match");
    err.statusCode = 400;
    err.expose = true;
    return next(err);
  }

  return next();
}

module.exports = {
  registerValidators,
  loginValidators,
  validateRequest,
};
