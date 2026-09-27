const { pool } = require("../config/database");

/**
 * Return all roles. Safe for client consumption.
 * @returns {Promise<object[]>}
 */
async function findAllRoles() {
  const [rows] = await pool.query(
    "SELECT id, name, description, created_at FROM roles ORDER BY id ASC"
  );
  return rows;
}

/**
 * Find a role by id.
 * @param {number|string} id
 * @returns {Promise<object|null>}
 */
async function findRoleById(id) {
  const [rows] = await pool.query(
    "SELECT id, name, description, created_at FROM roles WHERE id = ? LIMIT 1",
    [id]
  );
  return rows[0] || null;
}

/**
 * Find a role by name.
 * @param {string} name
 * @returns {Promise<object|null>}
 */
async function findRoleByName(name) {
  const [rows] = await pool.query(
    "SELECT id, name, description, created_at FROM roles WHERE name = ? LIMIT 1",
    [name]
  );
  return rows[0] || null;
}

/**
 * Get the permission names assigned to a role.
 * @param {number|string} roleId
 * @returns {Promise<object[]>} rows with { id, name, description }
 */
async function getRolePermissions(roleId) {
  const [rows] = await pool.query(
    "SELECT p.id, p.name, p.description " +
      "FROM permissions p " +
      "JOIN role_permissions rp ON rp.permission_id = p.id " +
      "WHERE rp.role_id = ? ORDER BY p.id ASC",
    [roleId]
  );
  return rows;
}

/**
 * Replace all permission assignments for a role inside a transaction.
 * @param {number|string} roleId
 * @param {number[]} permissionIds
 * @returns {Promise<object[]>} the resulting permissions
 */
async function setRolePermissions(roleId, permissionIds) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(
      "DELETE FROM role_permissions WHERE role_id = ?",
      [roleId]
    );

    if (permissionIds.length > 0) {
      const values = permissionIds.map((pid) => [Number(roleId), Number(pid)]);
      await connection.query(
        "INSERT INTO role_permissions (role_id, permission_id) VALUES ?",
        [values]
      );
    }

    await connection.commit();
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }

  return getRolePermissions(roleId);
}

/**
 * Check whether a permission id exists.
 * @param {number|string} id
 * @returns {Promise<boolean>}
 */
async function permissionExists(id) {
  const [rows] = await pool.query(
    "SELECT id FROM permissions WHERE id = ? LIMIT 1",
    [id]
  );
  return rows.length > 0;
}

/**
 * Return all permissions. Safe for client consumption.
 * @returns {Promise<object[]>}
 */
async function findAllPermissions() {
  const [rows] = await pool.query(
    "SELECT id, name, description, created_at FROM permissions ORDER BY id ASC"
  );
  return rows;
}

module.exports = {
  findAllRoles,
  findRoleById,
  findRoleByName,
  getRolePermissions,
  setRolePermissions,
  permissionExists,
  findAllPermissions,
};
