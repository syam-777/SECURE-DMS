const bcrypt = require("bcryptjs");

const {
  findUserByEmail,
  findUserByIdSafe,
  findAllUsers,
  createUser,
  updateUser,
  updateUserRole,
  activateUser,
  deactivateUser,
  usernameExists,
} = require("../models/userModel");
const { findRoleById, findRoleByName } = require("../models/roleModel");
const { logAuditEvent } = require("../models/auditLogModel");

const BCRYPT_COST = 10;

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.expose = true;
  return err;
}

// ─── GET /api/users ───────────────────────────────────────────
async function listUsers(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const search = (req.query.search || "").trim();

    const data = await findAllUsers({ page, limit, search });
    return res.json({ success: true, ...data });
  } catch (err) {
    return next(err);
  }
}

// ─── GET /api/users/:id ──────────────────────────────────────
async function getUserById(req, res, next) {
  try {
    const user = await findUserByIdSafe(req.params.id);
    if (!user) {
      throw httpError(404, "User not found");
    }
    return res.json({ success: true, user });
  } catch (err) {
    return next(err);
  }
}

// ─── POST /api/users ─────────────────────────────────────────
async function createNewUser(req, res, next) {
  try {
    const { fullName, email, password, roleId } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    const existing = await findUserByEmail(normalizedEmail);
    if (existing) {
      throw httpError(409, "An account with this email already exists");
    }

    let targetRoleId = roleId;
    if (!targetRoleId) {
      const defaultRole = await findRoleByName("USER");
      if (!defaultRole) {
        throw httpError(500, "Default USER role is not configured");
      }
      targetRoleId = defaultRole.id;
    } else {
      const requestedRole = await findRoleById(targetRoleId);
      if (!requestedRole) {
        throw httpError(400, "Invalid role ID");
      }
    }

    const localPart = (normalizedEmail.split("@")[0] || "user")
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, "")
      .slice(0, 90) || "user";

    let username = localPart;
    if (await usernameExists(username)) {
      for (let i = 1; i < 1000; i++) {
        const candidate = `${localPart.slice(0, 90 - String(i).length - 1)}_${i}`;
        if (!(await usernameExists(candidate))) {
          username = candidate;
          break;
        }
      }
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    const created = await createUser({
      username,
      email: normalizedEmail,
      passwordHash,
      full_name: fullName.trim(),
      roleId: targetRoleId,
    });

    await logAuditEvent({
      userId: req.user.id,
      action: "ADMIN_USER_CREATED",
      resourceType: "user",
      resourceId: created.id,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      details: { email: normalizedEmail, targetUserId: created.id },
    });

    const user = await findUserByIdSafe(created.id);
    return res.status(201).json({ success: true, user });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return next(httpError(409, "An account with this email already exists"));
    }
    return next(err);
  }
}

// ─── PUT /api/users/:id ──────────────────────────────────────
async function updateUserById(req, res, next) {
  try {
    const targetId = req.params.id;
    const target = await findUserByIdSafe(targetId);
    if (!target) {
      throw httpError(404, "User not found");
    }

    const fields = {};

    if (req.body.fullName !== undefined) {
      fields.full_name = req.body.fullName.trim();
    }

    if (req.body.email !== undefined) {
      const normalizedEmail = req.body.email.trim().toLowerCase();
      if (normalizedEmail !== target.email) {
        const existingUser = await findUserByEmail(normalizedEmail);
        if (existingUser) {
          throw httpError(409, "Email is already in use");
        }
      }
      fields.email = normalizedEmail;
    }

    if (req.body.username !== undefined) {
      const newUsername = req.body.username.trim().toLowerCase();
      if (newUsername !== target.username) {
        if (await usernameExists(newUsername)) {
          throw httpError(409, "Username is already taken");
        }
      }
      fields.username = newUsername;
    }

    if (req.body.password !== undefined) {
      fields.passwordHash = await bcrypt.hash(req.body.password, BCRYPT_COST);
    }

    if (Object.keys(fields).length === 0) {
      return res.json({ success: true, user: target });
    }

    await updateUser(targetId, fields);

    await logAuditEvent({
      userId: req.user.id,
      action: "ADMIN_USER_UPDATED",
      resourceType: "user",
      resourceId: Number(targetId),
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      details: { targetUserId: Number(targetId), updatedFields: Object.keys(fields) },
    });

    const updated = await findUserByIdSafe(targetId);
    return res.json({ success: true, user: updated });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return next(httpError(409, "Username or email already exists"));
    }
    return next(err);
  }
}

// ─── PATCH /api/users/:id/deactivate ─────────────────────────
async function deactivateUserById(req, res, next) {
  try {
    const targetId = req.params.id;
    const target = await findUserByIdSafe(targetId);
    if (!target) {
      throw httpError(404, "User not found");
    }
    if (Number(targetId) === req.user.id) {
      throw httpError(400, "Cannot deactivate your own account");
    }
    if (!target.is_active) {
      return res.json({ success: true, message: "User is already inactive", user: target });
    }

    await deactivateUser(targetId);

    await logAuditEvent({
      userId: req.user.id,
      action: "USER_DEACTIVATED",
      resourceType: "user",
      resourceId: Number(targetId),
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      details: { targetUserId: Number(targetId) },
    });

    const updated = await findUserByIdSafe(targetId);
    return res.json({ success: true, message: "User deactivated", user: updated });
  } catch (err) {
    return next(err);
  }
}

// ─── PATCH /api/users/:id/activate ───────────────────────────
async function activateUserById(req, res, next) {
  try {
    const targetId = req.params.id;
    const target = await findUserByIdSafe(targetId);
    if (!target) {
      throw httpError(404, "User not found");
    }
    if (target.is_active) {
      return res.json({ success: true, message: "User is already active", user: target });
    }

    await activateUser(targetId);

    await logAuditEvent({
      userId: req.user.id,
      action: "USER_ACTIVATED",
      resourceType: "user",
      resourceId: Number(targetId),
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      details: { targetUserId: Number(targetId) },
    });

    const updated = await findUserByIdSafe(targetId);
    return res.json({ success: true, message: "User activated", user: updated });
  } catch (err) {
    return next(err);
  }
}

// ─── PATCH /api/users/:id/role ───────────────────────────────
async function changeUserRole(req, res, next) {
  try {
    const targetId = Number(req.params.id);
    if (targetId === req.user.id) {
      throw httpError(400, "Cannot change your own role");
    }

    const target = await findUserByIdSafe(targetId);
    if (!target) {
      throw httpError(404, "User not found");
    }

    let resolvedRole = null;

    if (req.body.roleId) {
      resolvedRole = await findRoleById(req.body.roleId);
      if (!resolvedRole) {
        throw httpError(400, "Invalid role ID");
      }
    } else if (req.body.role) {
      resolvedRole = await findRoleByName(req.body.role.trim().toUpperCase());
      if (!resolvedRole) {
        throw httpError(400, "Invalid role name");
      }
    } else {
      throw httpError(400, "Either roleId or role is required");
    }

    if (target.role === resolvedRole.name) {
      return res.json({ success: true, message: "Role is already set to " + resolvedRole.name, user: target });
    }

    const previousRole = target.role;
    await updateUserRole(targetId, resolvedRole.id);

    await logAuditEvent({
      userId: req.user.id,
      action: "USER_ROLE_CHANGED",
      resourceType: "user",
      resourceId: targetId,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      details: {
        targetUserId: targetId,
        previousRole,
        newRole: resolvedRole.name,
      },
    });

    const updated = await findUserByIdSafe(targetId);
    return res.json({ success: true, message: "Role updated", user: updated });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listUsers,
  getUserById,
  createNewUser,
  updateUserById,
  deactivateUserById,
  activateUserById,
  changeUserRole,
};
