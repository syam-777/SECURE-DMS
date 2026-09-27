const {
  findAllRoles,
  findRoleById,
  getRolePermissions,
  setRolePermissions,
  permissionExists,
} = require("../models/roleModel");
const { logAuditEvent } = require("../models/auditLogModel");

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.expose = true;
  return err;
}

// ─── GET /api/roles ──────────────────────────────────────────
async function listRoles(req, res, next) {
  try {
    const roles = await findAllRoles();
    return res.json({ success: true, roles });
  } catch (err) {
    return next(err);
  }
}

// ─── GET /api/roles/:id/permissions ──────────────────────────
async function getRolePerms(req, res, next) {
  try {
    const role = await findRoleById(req.params.id);
    if (!role) {
      throw httpError(404, "Role not found");
    }

    const permissions = await getRolePermissions(role.id);
    return res.json({
      success: true,
      role: {
        id: role.id,
        name: role.name,
        description: role.description,
        permissions,
      },
    });
  } catch (err) {
    return next(err);
  }
}

// ─── PUT /api/roles/:id/permissions ──────────────────────────
async function updateRolePerms(req, res, next) {
  try {
    const roleId = Number(req.params.id);
    const role = await findRoleById(roleId);
    if (!role) {
      throw httpError(404, "Role not found");
    }

    const { permissionIds } = req.body;

    if (!Array.isArray(permissionIds)) {
      throw httpError(400, "permissionIds must be an array");
    }

    const validIds = [];
    for (const id of permissionIds) {
      const pid = Number(id);
      if (!Number.isInteger(pid) || pid < 1) {
        throw httpError(400, `Invalid permission ID: ${id}`);
      }
      if (!(await permissionExists(pid))) {
        throw httpError(400, `Permission ID ${pid} does not exist`);
      }
      validIds.push(pid);
    }

    const uniqueIds = [...new Set(validIds)];
    const permissions = await setRolePermissions(roleId, uniqueIds);

    await logAuditEvent({
      userId: req.user.id,
      action: "ROLE_PERMISSIONS_UPDATED",
      resourceType: "permission",
      resourceId: roleId,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      details: {
        roleId,
        role: role.name,
        permissionIds: uniqueIds,
      },
    });

    return res.json({
      success: true,
      role: {
        id: role.id,
        name: role.name,
        description: role.description,
        permissions,
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listRoles,
  getRolePerms,
  updateRolePerms,
};
