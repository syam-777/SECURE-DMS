const { body, param, query, validationResult } = require("express-validator");

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

const adminCreateUserValidators = [
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
  body("password")
    .isLength({ min: PASSWORD_MIN_LENGTH })
    .withMessage(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
    .matches(/[a-zA-Z]/)
    .withMessage("Password must contain at least one letter")
    .matches(/[0-9]/)
    .withMessage("Password must contain at least one number"),
  body("roleId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("roleId must be a positive integer"),
];

const adminUpdateUserValidators = [
  body("fullName")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Full name cannot be empty")
    .isLength({ max: 150 })
    .withMessage("Full name must be 150 characters or fewer"),
  body("email")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Email cannot be empty")
    .normalizeEmail()
    .isEmail()
    .withMessage("A valid email is required"),
  body("username")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("Username cannot be empty")
    .isLength({ min: 3, max: 100 })
    .withMessage("Username must be 3-100 characters")
    .matches(/^[a-zA-Z0-9._-]+$/)
    .withMessage("Username may only contain letters, numbers, dots, dashes, and underscores"),
  body("password")
    .optional()
    .isLength({ min: PASSWORD_MIN_LENGTH })
    .withMessage(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
    .matches(/[a-zA-Z]/)
    .withMessage("Password must contain at least one letter")
    .matches(/[0-9]/)
    .withMessage("Password must contain at least one number"),
];

const changeRoleValidators = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("User ID must be a positive integer"),
  body("roleId")
    .optional()
    .isInt({ min: 1 })
    .withMessage("roleId must be a positive integer"),
  body("role")
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage("role must be a non-empty string up to 50 characters"),
];

const updatePermissionsValidators = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("Role ID must be a positive integer"),
  body("permissionIds")
    .optional()
    .isArray()
    .withMessage("permissionIds must be an array"),
  body("permissionIds.*")
    .optional()
    .isInt({ min: 1 })
    .withMessage("Each permission ID must be a positive integer"),
];

const paginationValidators = [
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("page must be a positive integer"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100"),
  query("search")
    .optional()
    .isString()
    .isLength({ max: 100 })
    .withMessage("search must be a string up to 100 characters"),
];

module.exports = {
  registerValidators,
  loginValidators,
  validateRequest,
  adminCreateUserValidators,
  adminUpdateUserValidators,
  changeRoleValidators,
  updatePermissionsValidators,
  paginationValidators,
};
