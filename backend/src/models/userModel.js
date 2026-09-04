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

module.exports = {
  findUserByEmail,
  findUserById,
  createUser,
  usernameExists,
  getUserWithRoleAndPermissions,
};
