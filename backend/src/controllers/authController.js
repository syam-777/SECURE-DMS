const bcrypt = require("bcryptjs");

const { pool } = require("../config/database");
const { signToken } = require("../config/jwt");
const {
  findUserByEmail,
  createUser,
  usernameExists,
  getUserWithRoleAndPermissions,
} = require("../models/userModel");
const { logAuditEvent } = require("../models/auditLogModel");

const BCRYPT_COST = 10;

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.expose = true;
  return err;
}

/**
 * Derive a unique username from an email local-part.
 * Example: "john.doe@example.com" -> "john.doe", then "john.doe_1" if taken.
 */
async function deriveUniqueUsername(email) {
  const localPart = (email.split("@")[0] || "user")
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 90);

  let candidate = localPart || "user";
  if (!(await usernameExists(candidate))) {
    return candidate;
  }

  for (let i = 1; i < 1000; i++) {
    const suffix = `_${i}`;
    const next = `${localPart.slice(0, 100 - suffix.length)}${suffix}`;
    if (!(await usernameExists(next))) {
      return next;
    }
  }

  // Extremely unlikely fallback — keep trying with a larger suffix.
  let i = 1000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const candidateName = `${localPart.slice(0, 80)}_${i}`;
    if (!(await usernameExists(candidateName))) {
      return candidateName;
    }
    i++;
  }
}

async function getRoleIdByName(roleName) {
  const [rows] = await pool.query("SELECT id FROM roles WHERE name = ? LIMIT 1", [
    roleName,
  ]);
  return rows[0] ? rows[0].id : null;
}

/**
 * POST /api/auth/register
 * Creates a new user with the USER role. Never issues a token.
 */
async function register(req, res, next) {
  try {
    const { fullName, email, password } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    const existing = await findUserByEmail(normalizedEmail);
    if (existing) {
      throw httpError(409, "An account with this email already exists");
    }

    const username = await deriveUniqueUsername(normalizedEmail);

    const userRoleId = await getRoleIdByName("USER");
    if (userRoleId == null) {
      throw httpError(
        500,
        "Default USER role is not configured. Contact an administrator."
      );
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    const created = await createUser({
      username,
      email: normalizedEmail,
      passwordHash,
      full_name: fullName.trim(),
      roleId: userRoleId,
    });

    await logAuditEvent({
      userId: created.id,
      action: "REGISTER",
      resourceType: "user",
      resourceId: created.id,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      details: { email: normalizedEmail },
    });

    const user = await getUserWithRoleAndPermissions(created.id);

    return res.status(201).json({
      success: true,
      message: "Account created successfully",
      user: safeUser(user),
    });
  } catch (err) {
    // Detect duplicate unique key (email or username race).
    if (err.code === "ER_DUP_ENTRY") {
      return next(httpError(409, "An account with this email already exists"));
    }
    return next(err);
  }
}

/**
 * POST /api/auth/login
 * Validates credentials, issues a JWT, records LOGIN audit event.
 */
async function login(req, res, next) {
  const ipAddress = req.ip;
  const userAgent = req.get("user-agent");
  const { email, password } = req.body;
  const normalizedEmail = (email || "").trim().toLowerCase();

  try {
    const user = await findUserByEmail(normalizedEmail);
    const passwordValid =
      user && (await bcrypt.compare(password || "", user.password_hash));

    if (!user || !passwordValid) {
      await logAuditEvent({
        userId: null,
        action: "LOGIN_FAILED",
        resourceType: "user",
        ipAddress,
        userAgent,
        details: { email: normalizedEmail },
      });
      throw httpError(401, "Invalid email or password");
    }

    if (!user.is_active) {
      await logAuditEvent({
        userId: user.id,
        action: "LOGIN_FAILED",
        resourceType: "user",
        resourceId: user.id,
        ipAddress,
        userAgent,
        details: { email: user.email, reason: "account_disabled" },
      });
      throw httpError(403, "Account disabled");
    }

    const token = signToken({ id: user.id });

    const userData = await getUserWithRoleAndPermissions(user.id);

    await logAuditEvent({
      userId: user.id,
      action: "LOGIN",
      resourceType: "user",
      resourceId: user.id,
      ipAddress,
      userAgent,
      details: { email: user.email },
    });

    return res.json({
      success: true,
      token,
      user: safeUser(userData),
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /api/auth/me
 * Returns fresh current user info + permissions.
 */
async function me(req, res, next) {
  try {
    const userData = await getUserWithRoleAndPermissions(req.user.id);
    if (!userData) {
      throw httpError(401, "User no longer exists");
    }
    return res.json({
      success: true,
      user: safeUser(userData),
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /api/auth/logout
 * Stateless: the client discards the token. We record a LOGOUT audit
 * event and do not pretend to revoke the stateless JWT.
 */
async function logout(req, res, next) {
  try {
    await logAuditEvent({
      userId: req.user.id,
      action: "LOGOUT",
      resourceType: "user",
      resourceId: req.user.id,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      details: { email: req.user.email },
    });

    return res.json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    return next(err);
  }
}

/**
 * Strip anything not meant for the client (e.g. password_hash, role_id)
 * from a user object. Accepts either the rich userData shape from
 * getUserWithRoleAndPermissions or a plain row.
 */
function safeUser(user) {
  if (!user) {
    return null;
  }
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    email: user.email,
    role: user.role != null ? user.role : null,
    is_active: user.is_active != null ? Boolean(user.is_active) : undefined,
    permissions: user.permissions || [],
  };
}

module.exports = {
  register,
  login,
  me,
  logout,
  safeUser,
};
