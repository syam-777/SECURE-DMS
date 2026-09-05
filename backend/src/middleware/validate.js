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

// ─── Document management validators ───────────────────────────
const DOCUMENT_STATUSES = ["active", "archived", "deleted"];

const documentIdParamValidator = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("Document ID must be a positive integer"),
];

const documentVersionParamValidator = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("Document ID must be a positive integer"),
  param("versionNumber")
    .isInt({ min: 1 })
    .withMessage("versionNumber must be a positive integer"),
];

const documentListValidators = [
  ...paginationValidators,
  query("status")
    .optional()
    .trim()
    .toLowerCase()
    .isIn(DOCUMENT_STATUSES)
    .withMessage("status must be one of: " + DOCUMENT_STATUSES.join(", ")),
  query("documentType")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("documentType must be 50 characters or fewer"),
  query("caseId")
    .optional()
    .trim()
    .isInt({ min: 1 })
    .withMessage("caseId must be a positive integer"),
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

const uploadDocumentValidators = [
  body("title")
    .trim()
    .notEmpty()
    .withMessage("title is required")
    .isLength({ max: 255 })
    .withMessage("title must be 255 characters or fewer"),
  body("description")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 5000 })
    .withMessage("description must be 5000 characters or fewer"),
  body("documentType")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: 50 })
    .withMessage("documentType must be 50 characters or fewer"),
  body("caseId")
    .optional({ nullable: true })
    .trim()
    .custom((value) => {
      if (value === "") return true;
      const num = Number(value);
      return Number.isInteger(num) && num >= 1;
    })
    .withMessage("caseId must be a positive integer"),
];

// ─── Phase 8 search validators ────────────────────────────────
const SEARCH_SORT_PATTERN = /^[A-Za-z_]+$/;

const caseSearchValidators = [
  query("q")
    .optional()
    .trim()
    .isString()
    .isLength({ max: 100 })
    .withMessage("q must be a string up to 100 characters"),
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
  query("caseType")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("caseType must be 50 characters or fewer"),
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("page must be a positive integer"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100"),
  query("sort")
    .optional()
    .trim()
    .matches(SEARCH_SORT_PATTERN)
    .withMessage("sort must contain only letters and underscores"),
  query("order")
    .optional()
    .trim()
    .toLowerCase()
    .isIn(["asc", "desc"])
    .withMessage("order must be 'asc' or 'desc'"),
];

const documentSearchValidators = [
  query("q")
    .optional()
    .trim()
    .isString()
    .isLength({ max: 100 })
    .withMessage("q must be a string up to 100 characters"),
  query("status")
    .optional()
    .trim()
    .toLowerCase()
    .isIn(DOCUMENT_STATUSES)
    .withMessage("status must be one of: " + DOCUMENT_STATUSES.join(", ")),
  query("documentType")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("documentType must be 50 characters or fewer"),
  query("caseId")
    .optional()
    .trim()
    .isInt({ min: 1 })
    .withMessage("caseId must be a positive integer"),
  query("page")
    .optional()
    .isInt({ min: 1 })
    .withMessage("page must be a positive integer"),
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100"),
  query("sort")
    .optional()
    .trim()
    .matches(SEARCH_SORT_PATTERN)
    .withMessage("sort must contain only letters and underscores"),
  query("order")
    .optional()
    .trim()
    .toLowerCase()
    .isIn(["asc", "desc"])
    .withMessage("order must be 'asc' or 'desc'"),
];

const AUDIT_SORT_PATTERN = /^[A-Za-z_]+$/;

const auditLogIdParamValidator = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("Audit log ID must be a positive integer"),
];

const auditLogsListValidators = [
  query("action")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("action must be 50 characters or fewer"),
  query("resourceType")
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage("resourceType must be 50 characters or fewer"),
  query("userId")
    .optional()
    .trim()
    .isInt({ min: 1 })
    .withMessage("userId must be a positive integer"),
  query("from")
    .optional()
    .trim()
    .isISO8601()
    .withMessage("from must be a valid ISO 8601 date/time"),
  query("to")
    .optional()
    .trim()
    .isISO8601()
    .withMessage("to must be a valid ISO 8601 date/time"),
  ...paginationValidators,
  query("sort")
    .optional()
    .trim()
    .matches(AUDIT_SORT_PATTERN)
    .withMessage("sort must contain only letters and underscores"),
  query("order")
    .optional()
    .trim()
    .toLowerCase()
    .isIn(["asc", "desc"])
    .withMessage("order must be 'asc' or 'desc'"),
];

// ─── Phase 11 officer verification validators ──────────────────
const SUBMIT_VERIFICATION_MAX_ID_NUMBER = 255;

const submitVerificationValidators = [
  body("fullName")
    .trim()
    .notEmpty()
    .withMessage("Full name is required")
    .isLength({ max: 255 })
    .withMessage("Full name must be 255 characters or fewer"),
  body("officialIdType")
    .trim()
    .notEmpty()
    .withMessage("Official ID type is required")
    .isLength({ max: 50 })
    .withMessage("Official ID type must be 50 characters or fewer"),
  body("officialIdNumber")
    .trim()
    .notEmpty()
    .withMessage("Official ID number is required")
    .isLength({ min: 3, max: SUBMIT_VERIFICATION_MAX_ID_NUMBER })
    .withMessage(
      `Official ID number must be between 3 and ${SUBMIT_VERIFICATION_MAX_ID_NUMBER} characters`
    ),
];

const verificationIdParamValidator = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("Verification ID must be a positive integer"),
];

const APPROVE_REVIEW_NOTE_MAX = 2000;

const approveVerificationValidators = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("Verification ID must be a positive integer"),
  body("reviewNote")
    .optional({ nullable: true })
    .trim()
    .isLength({ max: APPROVE_REVIEW_NOTE_MAX })
    .withMessage(`reviewNote must be ${APPROVE_REVIEW_NOTE_MAX} characters or fewer`),
];

const rejectVerificationValidators = [
  param("id")
    .isInt({ min: 1 })
    .withMessage("Verification ID must be a positive integer"),
  body("reviewNote")
    .trim()
    .notEmpty()
    .withMessage("A review note is required for rejection")
    .isLength({ max: APPROVE_REVIEW_NOTE_MAX })
    .withMessage(`reviewNote must be ${APPROVE_REVIEW_NOTE_MAX} characters or fewer`),
];

const VERIFICATION_STATUSES = ["pending", "approved", "rejected"];

const verificationListValidators = [
  query("status")
    .optional()
    .trim()
    .toLowerCase()
    .isIn(VERIFICATION_STATUSES)
    .withMessage("status must be one of: " + VERIFICATION_STATUSES.join(", ")),
  query("userId")
    .optional()
    .trim()
    .isInt({ min: 1 })
    .withMessage("userId must be a positive integer"),
  ...paginationValidators,
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
  documentIdParamValidator,
  documentVersionParamValidator,
  documentListValidators,
  uploadDocumentValidators,
  caseSearchValidators,
  documentSearchValidators,
  auditLogIdParamValidator,
  auditLogsListValidators,
  submitVerificationValidators,
  verificationIdParamValidator,
  approveVerificationValidators,
  rejectVerificationValidators,
  verificationListValidators,
};
