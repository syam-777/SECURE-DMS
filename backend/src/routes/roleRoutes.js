const express = require("express");
const router = express.Router();

const {
  listRoles,
  getRolePerms,
  updateRolePerms,
} = require("../controllers/roleController");
const { authenticate, authorize } = require("../middleware/authMiddleware");
const {
  updatePermissionsValidators,
  validateRequest,
} = require("../middleware/validate");

// All routes require authentication.
router.use(authenticate);

// GET /api/roles — list all roles
router.get(
  "/",
  authorize("roles:read"),
  listRoles
);

// GET /api/roles/:id/permissions — view a role's permissions
router.get(
  "/:id/permissions",
  authorize("roles:read"),
  getRolePerms
);

// PUT /api/roles/:id/permissions — replace a role's permissions
router.put(
  "/:id/permissions",
  authorize("roles:write"),
  updatePermissionsValidators,
  validateRequest,
  updateRolePerms
);

module.exports = router;
