const express = require("express");
const router = express.Router();

const {
  listUsers,
  getUserById,
  createNewUser,
  updateUserById,
  deactivateUserById,
  activateUserById,
  changeUserRole,
} = require("../controllers/userController");
const { authenticate, authorize } = require("../middleware/authMiddleware");
const {
  adminCreateUserValidators,
  adminUpdateUserValidators,
  changeRoleValidators,
  paginationValidators,
  validateRequest,
} = require("../middleware/validate");

// All routes require authentication.
router.use(authenticate);

// GET /api/users — list users (paginated)
router.get(
  "/",
  authorize("users:read"),
  paginationValidators,
  validateRequest,
  listUsers
);

// GET /api/users/:id — get single user
router.get(
  "/:id",
  authorize("users:read"),
  getUserById
);

// POST /api/users — create a user (ADMIN)
router.post(
  "/",
  authorize("users:write"),
  adminCreateUserValidators,
  validateRequest,
  createNewUser
);

// PUT /api/users/:id — update user fields (ADMIN)
router.put(
  "/:id",
  authorize("users:write"),
  adminUpdateUserValidators,
  validateRequest,
  updateUserById
);

// PATCH /api/users/:id/deactivate
router.patch(
  "/:id/deactivate",
  authorize("users:delete"),
  deactivateUserById
);

// PATCH /api/users/:id/activate
router.patch(
  "/:id/activate",
  authorize("users:delete"),
  activateUserById
);

// PATCH /api/users/:id/role — change user role (ADMIN)
router.patch(
  "/:id/role",
  authorize("users:write", "roles:write"),
  changeRoleValidators,
  validateRequest,
  changeUserRole
);

module.exports = router;
