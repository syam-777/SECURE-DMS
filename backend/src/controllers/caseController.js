const { findUserByIdSafe } = require("../models/userModel");
const { logAuditEvent } = require("../models/auditLogModel");
const {
  findCaseById,
  findCaseNumberById,
  generateCaseNumber,
  createCase,
  findAllCases,
  updateCase,
  updateCaseStatus,
  deleteCase,
  findAssignmentsByCase,
  assignmentExists,
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
 * Resolve and validate that a userId refers to an existing, active user.
 * @returns {Promise<object>} the safe user row
 * @throws {Error} 400 or 404 if invalid
 */
async function requireActiveUser(userId) {
  const user = await findUserByIdSafe(userId);
  if (!user) {
    throw httpError(404, "User not found");
  }
  if (!user.is_active) {
    throw httpError(400, "Cannot assign to an inactive user");
  }
  return user;
}

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

    const data = await findAllCases({
      page,
      limit,
      search,
      status,
      priority,
      sort,
      order,
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
    const assignments = await findAssignmentsByCase(caseId);
    return res.json({ success: true, case: caseRow, assignments });
  } catch (err) {
    return next(err);
  }
}

// ─── PUT /api/cases/:id ──────────────────────────────────────
async function updateCaseById(req, res, next) {
  try {
    const caseId = req.params.id;
    const existing = await findCaseById(caseId);
    if (!existing) {
      throw httpError(404, "Case not found");
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
async function updateCaseStatusById(req, res, next) {
  try {
    const caseId = req.params.id;
    const status = String(req.body.status).trim().toLowerCase();

    const existing = await findCaseById(caseId);
    if (!existing) {
      throw httpError(404, "Case not found");
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

    const assignments = await findAssignmentsByCase(caseId);
    return res.json({ success: true, assignments });
  } catch (err) {
    return next(err);
  }
}

// ─── POST /api/cases/:id/assignments ─────────────────────────
async function createNewAssignment(req, res, next) {
  try {
    const caseId = req.params.id;
    const { userId, assignmentRole } = req.body;

    const existing = await findCaseNumberById(caseId);
    if (!existing) {
      throw httpError(404, "Case not found");
    }

    const user = await requireActiveUser(userId);
    const role = String(assignmentRole).trim();

    const duplicate = await assignmentExists(caseId, userId, role);
    if (duplicate) {
      throw httpError(409, "This assignment already exists");
    }

    const assignmentId = await createAssignment({
      caseId: Number(caseId),
      userId: Number(userId),
      assignmentRole: role,
      assignedBy: req.user.id,
    });

    await logAuditEvent({
      userId: req.user.id,
      action: "CASE_ASSIGNED",
      resourceType: "case",
      resourceId: Number(caseId),
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      details: {
        caseNumber: existing.case_number,
        targetUserId: Number(userId),
        targetUserName: user.full_name,
        assignmentRole: role,
      },
    });

    const assignments = await findAssignmentsByCase(caseId);
    return res.status(201).json({
      success: true,
      message: "Assignment created",
      assignmentId,
      assignments,
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return next(httpError(409, "This assignment already exists"));
    }
    return next(err);
  }
}

// ─── DELETE /api/cases/:id/assignments/:userId ───────────────
async function deleteCaseAssignment(req, res, next) {
  try {
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

    const deleted = await deleteAssignment(caseId, userId);
    if (!deleted) {
      throw httpError(404, "Assignment not found");
    }

    await logAuditEvent({
      userId: req.user.id,
      action: "CASE_UNASSIGNED",
      resourceType: "case",
      resourceId: Number(caseId),
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      details: {
        caseNumber: existing.case_number,
        targetUserId: Number(userId),
        targetUserName: user.full_name,
      },
    });

    return res.json({
      success: true,
      message: "Assignment removed",
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listCases,
  createNewCase,
  getCaseById,
  updateCaseById,
  updateCaseStatusById,
  deleteCaseById,
  getAssignments,
  createNewAssignment,
  deleteCaseAssignment,
};
