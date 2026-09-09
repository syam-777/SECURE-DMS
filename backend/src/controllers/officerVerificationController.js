const crypto = require("crypto");

const { pool } = require("../config/database");
const { findUserById, getUserWithRoleAndPermissions, updateUserRole } = require("../models/userModel");
const { findRoleById, findRoleByName } = require("../models/roleModel");
const { logAuditEvent } = require("../models/auditLogModel");
const {
  createVerification,
  findPendingVerificationByUserId,
  findLatestVerificationByUserId,
  findVerificationById,
  findVerifications,
  countVerifications,
  approveVerification: approveVerificationStatus,
  rejectVerification: rejectVerificationStatus,
} = require("../models/officerVerificationModel");

const OFFICER_ROLE_NAME = "OFFICER";
const OFFICER_ROLE_MESSAGE =
  "OFFICER role can only be assigned through officer verification approval";

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.expose = true;
  return err;
}

/**
 * Normalize an official identifier before hashing: trim surrounding
 * whitespace and uppercase it so `abc-123` and `ABC-123 ` hash alike.
 * Never store or log the normalized raw value.
 * @param {string} raw
 * @returns {string}
 */
function normalizeOfficialId(raw) {
  return String(raw || "").trim().toUpperCase();
}

/**
 * SHA-256 hex digest of a normalized official identifier.
 * @param {string} normalized
 * @returns {string}
 */
function hashOfficialId(normalized) {
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

/**
 * Strip sensitive fields (official_id_hash, raw identifier — raw is never
 * persisted anyway) from a verification row before returning it to a
 * normal API client. Snake-case columns are mapped to camelCase.
 * @param {object} row
 * @returns {object}
 */
function safeVerification(row, { userInfo = false } = {}) {
  if (!row) {
    return null;
  }

  const safe = {
    id: row.id,
    userId: row.user_id,
    fullName: row.full_name,
    officialIdType: row.official_id_type,
    officialIdLast4: row.official_id_last4,
    status: row.status,
    reviewedBy: row.reviewed_by,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
  };

  if (userInfo) {
    safe.username = row.username;
    safe.userFullName = row.user_full_name;
    safe.userEmail = row.user_email;
  }

  return safe;
}

// ─── POST /api/verifications ───────────────────────────────────
async function submitVerification(req, res, next) {
  try {
    const { fullName, officialIdType, officialIdNumber } = req.body;
    const normalizedFullName = String(fullName || "").trim();
    const normalizedType = String(officialIdType || "").trim();
    const normalizedId = normalizeOfficialId(officialIdNumber);

    const applicant = await findUserById(req.user.id);
    if (!applicant || !applicant.is_active) {
      throw httpError(403, "Your account is inactive");
    }

    if (applicant.role_id != null) {
      const currentRole = await findRoleById(applicant.role_id);
      if (currentRole && currentRole.name === OFFICER_ROLE_NAME) {
        throw httpError(409, "You are already an OFFICER");
      }
      // Phase 11 permission ownership keeps verifications:submit on USER.
      // ADMIN inherits every permission via the seed cross-join; hard-block
      // here so privileged accounts cannot enter the workflow.
      if (currentRole && currentRole.name === "ADMIN") {
        throw httpError(409, "ADMIN accounts cannot request OFFICER verification");
      }
    }

    const pending = await findPendingVerificationByUserId(req.user.id);
    if (pending) {
      throw httpError(409, "A verification request is already pending");
    }

    const officialIdHash = hashOfficialId(normalizedId);
    const officialIdLast4 = normalizedId.slice(-4);

    const created = await createVerification({
      userId: req.user.id,
      fullName: normalizedFullName,
      officialIdType: normalizedType,
      officialIdHash,
      officialIdLast4,
    });

    await logAuditEvent({
      userId: req.user.id,
      action: "OFFICER_VERIFICATION_SUBMITTED",
      resourceType: "verification",
      resourceId: created.id,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      details: {
        verificationId: created.id,
        userId: req.user.id,
        officialIdType: normalizedType,
        officialIdLast4,
        status: "pending",
      },
    });

    const verification = await findVerificationById(created.id);
    return res.status(201).json({
      success: true,
      message: "Verification request submitted",
      verification: safeVerification(verification),
    });
  } catch (err) {
    return next(err);
  }
}

// ─── GET /api/verifications/me ─────────────────────────────────
async function getMyVerification(req, res, next) {
  try {
    const verification = await findLatestVerificationByUserId(req.user.id);
    if (!verification) {
      throw httpError(404, "No verification request found for this user");
    }
    return res.json({
      success: true,
      verification: safeVerification(verification),
    });
  } catch (err) {
    return next(err);
  }
}

// ─── GET /api/verifications ────────────────────────────────────
async function listVerifications(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;

    const options = {
      page,
      limit,
      status: (req.query.status || "").trim(),
      userId: (req.query.userId || "").trim(),
      sort: (req.query.sort || "submitted_at").trim(),
      order: (req.query.order || "desc").trim().toLowerCase(),
    };

    const verifications = await findVerifications(options);
    const total = await countVerifications(options);
    const totalPages = Math.ceil(total / limit);

    return res.json({
      success: true,
      verifications: verifications.map((v) => safeVerification(v, { userInfo: true })),
      total,
      page,
      limit,
      totalPages,
    });
  } catch (err) {
    return next(err);
  }
}

// ─── GET /api/verifications/:id ────────────────────────────────
async function getVerification(req, res, next) {
  try {
    const verification = await findVerificationById(req.params.id);
    if (!verification) {
      throw httpError(404, "Verification request not found");
    }

    const data = await getUserWithRoleAndPermissions(req.user.id);
    const canReview = (data && data.permissions || []).includes("verifications:review");

    if (!canReview && Number(verification.user_id) !== Number(req.user.id)) {
      throw httpError(403, "You do not have permission to view this verification");
    }

    return res.json({
      success: true,
      verification: safeVerification(verification, { userInfo: canReview }),
    });
  } catch (err) {
    return next(err);
  }
}

// ─── PATCH /api/verifications/:id/approve ──────────────────────
async function approveVerificationRequest(req, res, next) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const verification = await findVerificationById(req.params.id, {
      connection,
      forUpdate: true,
    });
    if (!verification) {
      throw httpError(404, "Verification request not found");
    }
    if (verification.status !== "pending") {
      throw httpError(409, "Only pending requests can be approved");
    }
    if (Number(verification.user_id) === Number(req.user.id)) {
      throw httpError(409, "You cannot approve your own verification request");
    }

    const officerRole = await findRoleByName(OFFICER_ROLE_NAME);
    if (!officerRole) {
      throw httpError(500, "OFFICER role is not configured");
    }

    const applicant = await findUserById(verification.user_id, {
      connection,
      forUpdate: true,
    });
    if (!applicant || !applicant.is_active) {
      throw httpError(409, "Applicant account is inactive");
    }
    if (applicant.role_id === officerRole.id) {
      throw httpError(409, "User is already an OFFICER");
    }

    const reviewNote = req.body.reviewNote != null ? String(req.body.reviewNote).trim() : null;

    let previousRole = null;
    if (applicant.role_id != null) {
      const priorRole = await findRoleById(applicant.role_id);
      previousRole = priorRole ? priorRole.name : null;
    }

    await updateUserRole(verification.user_id, officerRole.id, connection);

    await approveVerificationStatus(req.params.id, connection, {
      reviewedBy: req.user.id,
      reviewNote,
    });

    await logAuditEvent(
      {
        userId: req.user.id,
        action: "OFFICER_VERIFICATION_APPROVED",
        resourceType: "verification",
        resourceId: Number(req.params.id),
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        details: {
          verificationId: Number(req.params.id),
          userId: verification.user_id,
          previousRole,
          newRole: OFFICER_ROLE_NAME,
          reviewedBy: req.user.id,
          status: "approved",
        },
      },
      connection
    );

    await connection.commit();

    const updated = await findVerificationById(req.params.id);
    return res.json({
      success: true,
      message: "Verification approved",
      verification: safeVerification(updated, { userInfo: true }),
    });
  } catch (err) {
    try {
      await connection.rollback();
    } catch (_) {
      // Already rolled back / connection released; nothing to do.
    }
    return next(err);
  } finally {
    connection.release();
  }
}

// ─── PATCH /api/verifications/:id/reject ───────────────────────
async function rejectVerificationRequest(req, res, next) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const verification = await findVerificationById(req.params.id, {
      connection,
      forUpdate: true,
    });
    if (!verification) {
      throw httpError(404, "Verification request not found");
    }
    if (verification.status !== "pending") {
      throw httpError(409, "Only pending requests can be rejected");
    }

    const reviewNote = String(req.body.reviewNote || "").trim();

    await rejectVerificationStatus(req.params.id, connection, {
      reviewedBy: req.user.id,
      reviewNote,
    });

    await logAuditEvent(
      {
        userId: req.user.id,
        action: "OFFICER_VERIFICATION_REJECTED",
        resourceType: "verification",
        resourceId: Number(req.params.id),
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
        details: {
          verificationId: Number(req.params.id),
          userId: verification.user_id,
          reviewedBy: req.user.id,
          status: "rejected",
        },
      },
      connection
    );

    await connection.commit();

    const updated = await findVerificationById(req.params.id);
    return res.json({
      success: true,
      message: "Verification rejected",
      verification: safeVerification(updated, { userInfo: true }),
    });
  } catch (err) {
    try {
      await connection.rollback();
    } catch (_) {
      // Already rolled back / connection released; nothing to do.
    }
    return next(err);
  } finally {
    connection.release();
  }
}

module.exports = {
  submitVerification,
  getMyVerification,
  listVerifications,
  getVerification,
  approveVerificationRequest,
  rejectVerificationRequest,
  OFFICER_ROLE_MESSAGE,
};