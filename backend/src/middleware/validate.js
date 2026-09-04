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

// ─── Case management validators ───────────────────────────────
const CASE_STATUSES = ["open", "in_progress", "under_review", "closed", "archived"];
const CASE_PRIORITIES = ["low", "medium", "high", "critical"];

const createCaseValidators = [
  body("title")
    .trim()
    .notEmpty()
    .withMessage("title is required")
    .isLength({ max: 255 })
    .withMessage("title must be 255 characters or fewer"),
  body("caseType")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 50 })
    .withMessage("caseType must be 50 characters or fewer"),
  body("description")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 5000 })
    .withMessage("description must be 5000 characters or fewer"),
  body("priority")
    .optional()
    .trim()
    .toLowerCase()
    .isIn(CASE_PRIORITIES)
    .withMessage("priority must be one of: " + CASE_PRIORITIES.join(", ")),
];

const updateCaseValidators = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("Case ID must be a positive integer"),
  body("title")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("title cannot be empty")
    .isLength({ max: 255 })
    .withMessage("title must be 255 characters or fewer"),
  body("caseType")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 50 })
    .withMessage("caseType must be 50 characters or fewer"),
  body("description")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 5000 })
    .withMessage("description must be 5000 characters or fewer"),
  body("priority")
    .optional()
    .trim()
    .toLowerCase()
    .isIn(CASE_PRIORITIES)
    .withMessage("priority must be one of: " + CASE_PRIORITIES.join(", ")),
];

const caseIdParamValidator = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("Case ID must be a positive integer"),
];

const updateCaseStatusValidators = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("Case ID must be a positive integer"),
  body("status")
    .trim()
    .toLowerCase()
    .notEmpty()
    .withMessage("status is required")
    .isIn(CASE_STATUSES)
    .withMessage("status must be one of: " + CASE_STATUSES.join(", ")),
];

const caseListValidators = [
  ...paginationValidators,
  query("status")
    .optional()
    .trim()
    .toLowerCase()
    .isIn(CASE_STATUSES)
    .withMessage("status must be one of: " + CASE_STATUSES.join(", ")),
  query("priority")
    .optional()
    .trim()
    .toLowerCase()
    .isIn(CASE_PRIORITIES)
    .withMessage("priority must be one of: " + CASE_PRIORITIES.join(", ")),
  query("sort")
    .optional()
    .trim()
    .matches(/^[A-Za-z_]+$/)
    .withMessage("sort must contain only letters and underscores"),
  query("order")
    .optional()
    .trim()
    .toLowerCase()
    .isIn(["asc", "desc"])
    .withMessage("order must be 'asc' or 'desc'"),
];

const createAssignmentValidators = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("Case ID must be a positive integer"),
  body("userId")
    .isInt({ min: 1 })
    .withMessage("userId must be a positive integer"),
  body("assignmentRole")
    .trim()
    .notEmpty()
    .withMessage("assignmentRole is required")
    .isLength({ max: 50 })
    .withMessage("assignmentRole must be 50 characters or fewer")
    .matches(/^[a-z_]+$/)
    .withMessage("assignmentRole may only contain lowercase letters and underscores"),
];

const deleteAssignmentValidators = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("Case ID must be a positive integer"),
  param("userId")
    .isInt({ min: 1 })
    .withMessage("User ID must be a positive integer"),
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
  createCaseValidators,
  updateCaseValidators,
  caseIdParamValidator,
  updateCaseStatusValidators,
  caseListValidators,
  createAssignmentValidators,
  deleteAssignmentValidators,
};
