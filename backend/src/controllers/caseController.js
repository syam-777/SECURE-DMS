const { pool } = require("../config/database");
const {
  findUserByIdSafe,
  getUserWithRoleAndPermissions,
  findActiveOfficers,
} = require("../models/userModel");
const { logAuditEvent } = require("../models/auditLogModel");
const {
  findCaseById,
  findCaseNumberById,
  generateCaseNumber,
  createCase,
  findAllCases,
  updateCase,
  updateCaseStatus,
  setCaseAssignedTo,
  deleteCase,
  findAssignmentsByCase,
  hasOfficerAssignment,
  createAssignment,
  deleteAssignment,
  isValidStatus,
  isValidPriority,
} = require("../models/caseModel");

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.expose = true;
  return err;
}

/**
 * Assignment-first case access control for OFFICER and USER roles.
 * ADMIN and REVIEWER are handled by the RBAC permission guards on the routes.
 *
 * @param {object} caseRow full case row (must include created_by, assigned_to)
 * @param {object} actor DB-resolved actor ({ role, id })
 * @param {number|string} actorId
 * @returns {Promise<void>} throws 403 when the actor may not view the case
 */
async function assertCaseViewAccess(caseRow, actor, actorId) {
  if (!actor) {
    throw httpError(401, "Authenticated user no longer exists");
  }
  if (actor.role === "OFFICER") {
    const isPrimary =
      caseRow.assigned_to != null && Number(caseRow.assigned_to) === Number(actorId);
    const isAssignedOfficer = await hasOfficerAssignment(caseRow.id, actorId);
    if (!isPrimary && !isAssignedOfficer) {
      throw httpError(
        403,
        "You are not assigned to this case and cannot view it"
      );
    }
  }
  if (actor.role === "USER") {
    const isOwner = Number(caseRow.created_by) === Number(actorId);
    if (!isOwner) {
      throw httpError(403, "You do not have access to this case");
    }
  }
}

/**
 * Case statuses an officer is allowed to submit for review. Closed,
 * archived, and under_review are deliberately excluded so a case
 * cannot be submitted twice.
 */
const SUBMITTABLE_STATUSES = ["open", "in_progress", "returned"];

// ─── GET /api/cases ──────────────────────────────────────────
async function listCases(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const search = (req.query.search || "").trim();
    const status = (req.query.status || "").trim().toLowerCase();
    const priority = (req.query.priority || "").trim().toLowerCase();
    const sort = (req.query.sort || "id").trim();
    const order = (req.query.order || "asc").trim().toLowerCase();

    // Officers only see the cases they are involved in (created, primary
    // assignee, or officer-assigned). Users only see cases they created.
    // Resolved from the DB role, never JWT.
    let officerId = null;
    let ownerUserId = null;
    const actor = await getUserWithRoleAndPermissions(req.user.id);
    if (actor) {
      if (actor.role === "OFFICER") {
        officerId = req.user.id;
      } else if (actor.role === "USER") {
        ownerUserId = req.user.id;
      }
    }

    const data = await findAllCases({
      page,
      limit,
      search,
      status,
      priority,
      sort,
      order,
      officerId,
      ownerUserId,
    });

    return res.json({ success: true, ...data });
  } catch (err) {
    return next(err);
  }
}

// ─── POST /api/cases ─────────────────────────────────────────
async function createNewCase(req, res, next) {
  try {
    const { title, caseType, description, priority } = req.body;
    // NEVER trust client-supplied created_by. Always use the authenticated user.
    const createdById = req.user.id;

    // Generate a unique case number, retrying on the rare duplicate-key
    // race so uniqueness is guaranteed by the database.
    let newCaseId = null;
    let lastError = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const caseNumber = await generateCaseNumber();
        const insertedId = await createCase({
          caseNumber,
          title: title.trim(),
          caseType: caseType != null ? String(caseType).trim() : null,
          description:
            description != null ? String(description).trim() : null,
          priority: priority || "medium",
          createdBy: createdById,
        });
        newCaseId = insertedId;
        lastError = null;
        break;
      } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
          lastError = err;
          continue;
        }
        throw err;
      }
    }

    if (newCaseId == null) {
      throw httpError(409, "Could not generate a unique case number");
    }

    const created = await findCaseById(newCaseId);
    const caseNumber = created.case_number;

    await logAuditEvent({
      userId: createdById,
      action: "CASE_CREATED",
      resourceType: "case",
      resourceId: newCaseId,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      details: { caseNumber, title: created.title },
    });

    return res.status(201).json({ success: true, case: created });
  } catch (err) {
    return next(err);
  }
}

// ─── GET /api/cases/:id ──────────────────────────────────────
async function getCaseById(req, res, next) {
  try {
    const caseId = req.params.id;
    const caseRow = await findCaseById(caseId);
    if (!caseRow) {
      throw httpError(404, "Case not found");
    }

    // Officer case visibility is assignment-first: an OFFICER may only view a
    // case they are the primary assignee of or assigned to as an officer.
    // FRONTEND hiding is never sufficient; the backend enforces this from the
    // DB role. Being the case creator is NOT an investigation-authorization
    // bypass.
    const actor = await getUserWithRoleAndPermissions(req.user.id);
    if (actor && (actor.role === "OFFICER" || actor.role === "USER")) {
      await assertCaseViewAccess(caseRow, actor, req.user.id);
    }

    const assignments = await findAssignmentsByCase(caseId);
    return res.json({ success: true, case: caseRow, assignments });
  } catch (err) {
    return next(err);
  }
}

// ─── PUT /api/cases/:id ──────────────────────────────────────
// ADMIN may edit any case for system administration. OFFICER may only edit
// cases assigned to them (assignment-first, enforced from the DB role).
async function updateCaseById(req, res, next) {
  try {
    const caseId = req.params.id;
    const existing = await findCaseById(caseId);
    if (!existing) {
      throw httpError(404, "Case not found");
    }

    const actor = await getUserWithRoleAndPermissions(req.user.id);
    if (actor && actor.role === "OFFICER") {
      const isPrimary =
        existing.assigned_to != null &&
        Number(existing.assigned_to) === Number(req.user.id);
      const isAssignedOfficer = await hasOfficerAssignment(
        caseId,
        req.user.id
      );
      if (!isPrimary && !isAssignedOfficer) {
        throw httpError(
          403,
          "You are not assigned to this case and cannot modify it"
        );
      }
    }

    const fields = {};

    if (req.body.title !== undefined) {
      fields.title = req.body.title.trim();
    }
    if (req.body.caseType !== undefined) {
      fields.caseType =
        req.body.caseType != null ? String(req.body.caseType).trim() : null;
    }
    if (req.body.description !== undefined) {
      fields.description =
        req.body.description != null ? String(req.body.description).trim() : null;
    }
    if (req.body.priority !== undefined) {
      fields.priority = String(req.body.priority).trim().toLowerCase();
      if (!isValidPriority(fields.priority)) {
        throw httpError(400, "Invalid priority value");
      }
    }

    // id, case_number, created_by, created_at, and assignment are
    // deliberately not editable here. Assignments are managed solely
    // through the dedicated assignment endpoints.
    const updatedFields = Object.keys(fields);

    if (updatedFields.length === 0) {
      return res.json({ success: true, case: existing, message: "No changes supplied" });
    }

    await updateCase(caseId, fields);

    await logAuditEvent({
      userId: req.user.id,
      action: "CASE_UPDATED",
      resourceType: "case",
      resourceId: Number(caseId),
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      details: { caseNumber: existing.case_number, updatedFields },
    });

    const updated = await findCaseById(caseId);
    return res.json({ success: true, case: updated });
  } catch (err) {
    return next(err);
  }
}

// ─── PATCH /api/cases/:id/status ─────────────────────────────
// ADMIN may set status for administration. OFFICER may only change status of
// cases assigned to them (assignment-first, enforced from the DB role).
async function updateCaseStatusById(req, res, next) {
  try {
    const caseId = req.params.id;
    const status = String(req.body.status).trim().toLowerCase();

    const existing = await findCaseById(caseId);
    if (!existing) {
      throw httpError(404, "Case not found");
    }

    const actor = await getUserWithRoleAndPermissions(req.user.id);
    if (actor && actor.role === "OFFICER") {
      const isPrimary =
        existing.assigned_to != null &&
        Number(existing.assigned_to) === Number(req.user.id);
      const isAssignedOfficer = await hasOfficerAssignment(
        caseId,
        req.user.id
      );
      if (!isPrimary && !isAssignedOfficer) {
        throw httpError(
          403,
          "You are not assigned to this case and cannot change its status"
        );
      }
    }

    if (!isValidStatus(status)) {
      throw httpError(400, "Invalid status value");
    }

    if (existing.status === status) {
      return res.json({
        success: true,
        message: "Status is already " + status,
        case: existing,
      });
    }

    const previousStatus = existing.status;
    await updateCaseStatus(caseId, status);

    await logAuditEvent({
      userId: req.user.id,
      action: "CASE_STATUS_CHANGED",
      resourceType: "case",
      resourceId: Number(caseId),
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      details: {
        caseNumber: existing.case_number,
        caseId: Number(caseId),
        previousStatus,
        newStatus: status,
      },
    });

    const updated = await findCaseById(caseId);
    return res.json({
      success: true,
      message: "Status updated",
      case: updated,
    });
  } catch (err) {
    return next(err);
  }
}

// ─── POST /api/cases/:id/submit-for-review ───────────────────
async function submitCaseForReview(req, res, next) {
  try {
    const caseId = req.params.id;
    const caseRow = await findCaseById(caseId);
    if (!caseRow) {
      throw httpError(404, "Case not found");
    }

    // Load fresh role/permissions from the DB — never trust the JWT alone.
    const userData = await getUserWithRoleAndPermissions(req.user.id);
    if (!userData || userData.role !== "OFFICER") {
      throw httpError(
        403,
        "Only the assigned investigating officer can submit a case for review"
      );
    }

    // Assignment-first: an officer may only submit a case they are the primary
    // assignee of OR are assigned to as an officer. Whether the officer
    // created the case is irrelevant — the case must be assigned to them.
    const isPrimaryAssignee =
      caseRow.assigned_to != null &&
      Number(caseRow.assigned_to) === Number(req.user.id);
    const isAssignedOfficer =
      isPrimaryAssignee || (await hasOfficerAssignment(caseId, req.user.id));
    if (!isAssignedOfficer) {
      throw httpError(
        403,
        "You are not assigned to this case and cannot submit it for review"
      );
    }

    if (!SUBMITTABLE_STATUSES.includes(caseRow.status)) {
      const message =
        caseRow.status === "under_review"
          ? "Case is already under review"
          : caseRow.status === "closed"
          ? "Closed cases cannot be submitted for review"
          : "Only open, in_progress, or returned cases can be submitted for review";
      throw httpError(409, message);
    }

    await updateCaseStatus(caseId, "under_review");

    await logAuditEvent({
      userId: req.user.id,
      action: "CASE_SUBMITTED_FOR_REVIEW",
      resourceType: "case",
      resourceId: Number(caseId),
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      details: {
        caseNumber: caseRow.case_number,
        previousStatus: caseRow.status,
        newStatus: "under_review",
      },
    });

    const updated = await findCaseById(caseId);
    return res.json({
      success: true,
      message: "Case submitted for review",
      case: updated,
    });
  } catch (err) {
    return next(err);
  }
}

// ─── DELETE /api/cases/:id ───────────────────────────────────
async function deleteCaseById(req, res, next) {
  try {
    const caseId = req.params.id;
    const existing = await findCaseNumberById(caseId);
    if (!existing) {
      throw httpError(404, "Case not found");
    }

    await deleteCase(caseId);

    await logAuditEvent({
      userId: req.user.id,
      action: "CASE_DELETED",
      resourceType: "case",
      resourceId: Number(caseId),
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      details: { caseNumber: existing.case_number },
    });

    return res.json({
      success: true,
      message: "Case deleted",
      caseId: Number(caseId),
    });
  } catch (err) {
    return next(err);
  }
}

// ─── GET /api/cases/:id/assignments ──────────────────────────
async function getAssignments(req, res, next) {
  try {
    const caseId = req.params.id;
    const existing = await findCaseNumberById(caseId);
    if (!existing) {
      throw httpError(404, "Case not found");
    }

    // Same view access as GET /api/cases/:id so officer/user info does not
    // leak through the assignment listing.
    const caseRow = await findCaseById(caseId);
    const actor = await getUserWithRoleAndPermissions(req.user.id);
    if (actor && (actor.role === "OFFICER" || actor.role === "USER")) {
      await assertCaseViewAccess(caseRow, actor, req.user.id);
    }

    const assignments = await findAssignmentsByCase(caseId);
    return res.json({ success: true, assignments });
  } catch (err) {
    return next(err);
  }
}

// ─── GET /api/users/officers (via caseController export) ─────
// Returns the list of active OFFICER users so ADMIN can pick an
// investigating officer. Only reachable through an ADMIN-gated route.
async function listActiveOfficers(req, res, next) {
  try {
    // Defense in depth: this endpoint feeds the ADMIN assignment picker and
    // must only be reachable by ADMIN, regardless of permission overlap.
    const actor = await getUserWithRoleAndPermissions(req.user.id);
    if (!actor || actor.role !== "ADMIN") {
      throw httpError(403, "Only ADMIN can list assignable officers");
    }
    const officers = await findActiveOfficers();
    return res.json({ success: true, officers });
  } catch (err) {
    return next(err);
  }
}

/**
 * Find the existing officer assignment (if any) for a case. Officer
 * assignment is keyed by assignment_role = 'officer', which is the only
 * assignment role this application uses for case investigation.
 * @param {number} caseId
 * @returns {Promise<object|null>}
 */
async function findCurrentOfficerAssignment(caseId) {
  const rows = await findAssignmentsByCase(caseId);
  return (
    rows.find(
      (a) => String(a.assignment_role).toLowerCase() === "officer"
    ) || null
  );
}

/**
 * Validate that a target user is an active user with the OFFICER role,
 * resolved from the database (never from client-supplied data).
 * @param {number} userId
 * @returns {Promise<object|null>} the safe user row, or null if not an active officer
 */
async function requireActiveOfficer(userId) {
  const user = await findUserByIdSafe(userId);
  if (!user) {
    throw httpError(404, "User not found");
  }
  if (!user.is_active) {
    throw httpError(400, "Cannot assign an inactive officer");
  }
  if (String(user.role).toUpperCase() !== "OFFICER") {
    throw httpError(
      400,
      "Only active users with the OFFICER role can be assigned as an investigating officer"
    );
  }
  return user;
}

// ─── POST /api/cases/:id/assignments ─────────────────────────
// ADMIN-only (gated by cases:assign in the route). Assigns an investigating
// OFFICER to a case, validates the officer from the DB, keeps a single
// current officer, and logs assign/reassign audit events.
async function createNewAssignment(req, res, next) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const caseId = req.params.id;
    const { userId, assignmentRole } = req.body;
    const role = String(assignmentRole).trim().toLowerCase();

    const existing = await findCaseNumberById(caseId);
    if (!existing) {
      throw httpError(404, "Case not found");
    }

    // This workflow only supports officer assignment. Reject any other role
    // so nobody can tag an arbitrary role label onto a case.
    if (role !== "officer") {
      throw httpError(
        400,
        "Only officer assignments are supported on this endpoint"
      );
    }

    // Source of truth = database role. Only active OFFICER users qualify.
    const officer = await requireActiveOfficer(userId);
    const officerId = Number(officer.id);

    // Existing officer on this case, if any (for reassign semantics).
    const current = await findCurrentOfficerAssignment(caseId);
    const currentOfficerId =
      current && current.user_id != null ? Number(current.user_id) : null;

    let action = "CASE_ASSIGNED";
    const details = {
      caseNumber: existing.case_number,
      caseId: Number(caseId),
      targetUserId: officerId,
      targetUserName: officer.full_name,
      assignmentRole: role,
      previousOfficerId: currentOfficerId,
      previousOfficerName: current ? current.full_name : null,
      assignedById: req.user.id,
    };

    if (currentOfficerId === officerId) {
      await connection.commit();
      const assignments = await findAssignmentsByCase(caseId);
      return res.json({
        success: true,
        message: "Officer is already assigned to this case",
        assignments,
      });
    }

    // Only one current officer: remove any existing officer assignment and
    // override assigned_to so the case tracks a single investigating officer.
    if (currentOfficerId != null) {
      await deleteAssignment(caseId, currentOfficerId, "officer", connection);
      action = "CASE_REASSIGNED";
    }

    await setCaseAssignedTo(caseId, officerId, connection);

    await createAssignment(
      {
        caseId: Number(caseId),
        userId: officerId,
        assignmentRole: role,
        assignedBy: req.user.id,
      },
      connection
    );

    await logAuditEvent(
      {
        userId: req.user.id,
        action,
        resourceType: "case",
        resourceId: Number(caseId),
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        details,
      },
      connection
    );

    await connection.commit();

    const assignments = await findAssignmentsByCase(caseId);
    return res.status(201).json({
      success: true,
      message:
        action === "CASE_REASSIGNED"
          ? "Investigating officer reassigned"
          : "Investigating officer assigned",
      assignments,
    });
  } catch (err) {
    try {
      await connection.rollback();
    } catch (_) {}
    if (err.code === "ER_DUP_ENTRY") {
      return next(httpError(409, "This assignment already exists"));
    }
    return next(err);
  } finally {
    connection.release();
  }
}

// ─── DELETE /api/cases/:id/assignments/:userId ───────────────
// ADMIN-only (gated by cases:assign). Unassigns an investigating officer.
// If the removed user is the current primary assignee, clears assigned_to.
async function deleteCaseAssignment(req, res, next) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const caseId = req.params.id;
    const userId = req.params.userId;

    const existing = await findCaseNumberById(caseId);
    if (!existing) {
      throw httpError(404, "Case not found");
    }

    const user = await findUserByIdSafe(userId);
    if (!user) {
      throw httpError(404, "User not found");
    }

    const targetUserId = Number(userId);
    const deleted = await deleteAssignment(
      caseId,
      targetUserId,
      null,
      connection
    );
    if (!deleted) {
      throw httpError(404, "Assignment not found");
    }

    // If the removed user was the primary assignee, clear assigned_to so the
    // case no longer shows a current officer.
    const caseRow = await findCaseById(caseId);
    if (
      caseRow &&
      caseRow.assigned_to != null &&
      Number(caseRow.assigned_to) === targetUserId
    ) {
      await setCaseAssignedTo(caseId, null, connection);
    }

    await logAuditEvent(
      {
        userId: req.user.id,
        action: "CASE_UNASSIGNED",
        resourceType: "case",
        resourceId: Number(caseId),
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        details: {
          caseNumber: existing.case_number,
          caseId: Number(caseId),
          targetUserId,
          targetUserName: user.full_name,
          previousOfficerId: targetUserId,
          previousOfficerName: user.full_name,
          assignedById: req.user.id,
        },
      },
      connection
    );

    await connection.commit();

    const assignments = await findAssignmentsByCase(caseId);
    return res.json({
      success: true,
      message: "Assignment removed",
      assignments,
    });
  } catch (err) {
    try {
      await connection.rollback();
    } catch (_) {}
    return next(err);
  } finally {
    connection.release();
  }
}

module.exports = {
  listCases,
  createNewCase,
  getCaseById,
  updateCaseById,
  updateCaseStatusById,
  submitCaseForReview,
  deleteCaseById,
  getAssignments,
  listActiveOfficers,
  createNewAssignment,
  deleteCaseAssignment,
};
