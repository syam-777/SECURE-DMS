const { pool } = require("../config/database");

/**
 * Find a user by email, including the password_hash (used internally
 * during login only — never returned to clients).
 * @param {string} email
 * @returns {Promise<object|null>} user row or null
 */
async function findUserByEmail(email) {
  const [rows] = await pool.query(
    "SELECT id, username, email, password_hash, full_name, role_id, is_active, created_at, updated_at " +
      "FROM users WHERE email = ? LIMIT 1",
    [email]
  );
  return rows[0] || null;
}

/**
 * Find a user by id, including the password_hash (internal use).
 * @param {number|string} id
 * @returns {Promise<object|null>} user row or null
 */
async function findUserById(id) {
  const [rows] = await pool.query(
    "SELECT id, username, email, password_hash, full_name, role_id, is_active, created_at, updated_at " +
      "FROM users WHERE id = ? LIMIT 1",
    [id]
  );
  return rows[0] || null;
}

/**
 * Insert a new user.
 * @param {{ username:string, email:string, passwordHash:string, full_name:string, roleId:number }} data
 * @returns {Promise<{id:number}>} inserted id
 */
async function createUser(data) {
  const [result] = await pool.query(
    "INSERT INTO users (username, email, password_hash, full_name, role_id) VALUES (?, ?, ?, ?, ?)",
    [data.username, data.email, data.passwordHash, data.full_name, data.roleId]
  );
  return { id: result.insertId };
}

/**
 * Check whether a username already exists.
 * @param {string} username
 * @returns {Promise<boolean>}
 */
async function usernameExists(username) {
  const [rows] = await pool.query(
    "SELECT id FROM users WHERE username = ? LIMIT 1",
    [username]
  );
  return rows.length > 0;
}

/**
 * Fetch a user together with their role name and the list of
 * permission names for that role. Never returns password_hash.
 * @param {number|string} id
 * @returns {Promise<null|{id:number, username:string, email:string, full_name:string, role:string|null, is_active:number|boolean, permissions:string[]}>}
 */
async function getUserWithRoleAndPermissions(id) {
  const [userRows] = await pool.query(
    "SELECT u.id, u.username, u.email, u.full_name, u.is_active, r.name AS role " +
      "FROM users u " +
      "LEFT JOIN roles r ON r.id = u.role_id " +
      "WHERE u.id = ? LIMIT 1",
    [id]
  );
  const user = userRows[0];
  if (!user) {
    return null;
  }

  const [permRows] = await pool.query(
    "SELECT p.name AS permission " +
      "FROM role_permissions rp " +
      "JOIN permissions p ON p.id = rp.permission_id " +
      "JOIN users u ON u.role_id = rp.role_id " +
      "WHERE u.id = ?",
    [id]
  );

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    is_active: user.is_active,
    permissions: permRows.map((r) => r.permission),
  };
}

/**
 * Fetch a single user joined with role name. Never returns password_hash.
 * @param {number|string} id
 * @returns {Promise<null|object>}
 */
async function findUserByIdSafe(id) {
  const [rows] = await pool.query(
    "SELECT u.id, u.username, u.email, u.full_name, u.role_id, r.name AS role, " +
      "u.is_active, u.created_at, u.updated_at " +
      "FROM users u " +
      "LEFT JOIN roles r ON r.id = u.role_id " +
      "WHERE u.id = ? LIMIT 1",
    [id]
  );
  return rows[0] || null;
}

/**
 * Return a paginated list of users with role name. Never returns password_hash.
 * @param {{ page:number, limit:number, search?:string }} opts
 * @returns {Promise<{ users: object[], total: number, page: number, limit: number, totalPages: number }>}
 */
async function findAllUsers({ page = 1, limit = 20, search = "" } = {}) {
  const offset = (Math.max(1, Number(page)) - 1) * Number(limit);
  const lim = Math.min(100, Math.max(1, Number(limit)));
  const likeClause = search ? "AND (u.username LIKE ? OR u.email LIKE ? OR u.full_name LIKE ?)" : "";
  const params = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];

  const countResult = await pool.query(
    "SELECT COUNT(*) AS total FROM users u WHERE 1=1 " + likeClause,
    params
  );
  const total = countResult[0][0].total;

  const dataResult = await pool.query(
    "SELECT u.id, u.username, u.email, u.full_name, u.role_id, r.name AS role, " +
      "u.is_active, u.created_at, u.updated_at " +
      "FROM users u " +
      "LEFT JOIN roles r ON r.id = u.role_id " +
      "WHERE 1=1 " + likeClause + " ORDER BY u.id ASC LIMIT ? OFFSET ?",
    [...params, lim, offset]
  );

  return {
    users: dataResult[0],
    total,
    page: Math.max(1, Number(page)),
    limit: lim,
    totalPages: Math.ceil(total / lim),
  };
}

/**
 * Update user fields. Never allows direct password_hash manipulation.
 * @param {number|string} id
 * @param {{ full_name?:string, email?:string, username?:string, passwordHash?:string }} fields
 * @returns {Promise<boolean>} true if a row was updated
 */
async function updateUser(id, fields) {
  const sets = [];
  const vals = [];

  if (fields.full_name !== undefined) {
    sets.push("full_name = ?");
    vals.push(fields.full_name);
  }
  if (fields.email !== undefined) {
    sets.push("email = ?");
    vals.push(fields.email);
  }
  if (fields.username !== undefined) {
    sets.push("username = ?");
    vals.push(fields.username);
  }
  if (fields.passwordHash !== undefined) {
    sets.push("password_hash = ?");
    vals.push(fields.passwordHash);
  }

  if (sets.length === 0) return false;

  vals.push(id);
  const [result] = await pool.query(
    "UPDATE users SET " + sets.join(", ") + " WHERE id = ?",
    vals
  );
  return result.affectedRows > 0;
}

/**
 * Change a user's role.
 * @param {number|string} userId
 * @param {number} roleId
 * @returns {Promise<boolean>}
 */
async function updateUserRole(userId, roleId) {
  const [result] = await pool.query(
    "UPDATE users SET role_id = ? WHERE id = ?",
    [roleId, userId]
  );
  return result.affectedRows > 0;
}

/**
 * Set is_active = true for a user.
 * @param {number|string} id
 * @returns {Promise<boolean>}
 */
async function activateUser(id) {
  const [result] = await pool.query(
    "UPDATE users SET is_active = TRUE WHERE id = ?",
    [id]
  );
  return result.affectedRows > 0;
}

/**
 * Set is_active = false for a user.
 * @param {number|string} id
 * @returns {Promise<boolean>}
 */
async function deactivateUser(id) {
  const [result] = await pool.query(
    "UPDATE users SET is_active = FALSE WHERE id = ?",
    [id]
  );
  return result.affectedRows > 0;
}

module.exports = {
  findUserByEmail,
  findUserById,
  findUserByIdSafe,
  findAllUsers,
  createUser,
  updateUser,
  updateUserRole,
  activateUser,
  deactivateUser,
  usernameExists,
  getUserWithRoleAndPermissions,
};
