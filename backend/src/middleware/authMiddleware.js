const { verifyToken } = require("../config/jwt");
const {
  findUserById,
  getUserWithRoleAndPermissions,
} = require("../models/userModel");

function unauthorized(message) {
  const err = new Error(message);
  err.statusCode = 401;
  err.expose = true;
  return err;
}

function forbidden(message) {
  const err = new Error(message);
  err.statusCode = 403;
  err.expose = true;
  return err;
}

/**
 * Reads `Authorization: Bearer <token>`, verifies the JWT (including
 * issuer/audience), loads the current user from the DB, and attaches
 * fresh user data to req.user. Role/permission data is NEVER taken
 * from the JWT alone — it is always re-loaded from the database.
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const [scheme, token] = authHeader.split(" ");
    if (!token || scheme.toLowerCase() !== "bearer") {
      throw unauthorized("Authentication token missing");
    }

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (err) {
      throw unauthorized("Invalid or expired token");
    }

    const user = await findUserById(decoded.sub);
    if (!user) {
      throw unauthorized("User no longer exists");
    }
    if (!user.is_active) {
      throw forbidden("Account disabled");
    }

    // Attach fresh, verified user info. Do NOT include password_hash.
    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      role_id: user.role_id,
      is_active: user.is_active,
    };

    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * Factory that returns an authorization middleware requiring the given
 * permissions (e.g. authorize("cases:read", "documents:read")).
 * Relies on fresh DB permissions from the current user's role.
 */
function authorize(...requiredPermissions) {
  return async function authorizeMiddleware(req, res, next) {
    try {
      if (!req.user) {
        throw unauthorized("Authentication required");
      }

      const data = await getUserWithRoleAndPermissions(req.user.id);
      if (!data) {
        throw unauthorized("User no longer exists");
      }

      const userPermissions = data.permissions || [];
      const missing = requiredPermissions.filter(
        (p) => !userPermissions.includes(p)
      );

      if (requiredPermissions.length > 0 && missing.length > 0) {
        throw forbidden("You do not have permission to perform this action");
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = {
  authenticate,
  authorize,
};
