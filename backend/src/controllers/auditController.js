const {
  findAuditLogs,
  countAuditLogs,
  findAuditLogById,
} = require("../models/auditLogModel");

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.expose = true;
  return err;
}

const SENSITIVE_KEY_PATTERN =
  /password|passwd|secret|token|authorization|credential|file_path|stored_file_name|filepath|storedfilename|bearer/i;

const SENSITIVE_EQUALITY_KEYS = new Set([
  "path",
  "filepath",
  "file_path",
  "storedfilename",
  "stored_file_name",
  "absolutePath",
  "tempfilepath",
]);

const JWT_LIKE_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

function isJwtLike(value) {
  if (typeof value === "string") {
    return JWT_LIKE_PATTERN.test(value);
  }
  return false;
}

/**
 * Recursively strips fields/values that should never leave the audit API:
 * passwords, tokens, authorization material, and private storage metadata.
 * Useful audit metadata (email, role info, status changes, case/document IDs,
 * version numbers) is preserved. Returns null for null/undefined input.
 */
function safeAuditDetails(value) {
  if (value == null) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.map(safeAuditDetails);
  }

  if (typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        continue;
      }
      if (SENSITIVE_EQUALITY_KEYS.has(key.toLowerCase())) {
        continue;
      }
      out[key] = safeAuditDetails(value[key]);
    }
    return out;
  }

  if (isJwtLike(value)) {
    return "[REDACTED]";
  }

  return value;
}

function safeAuditRecord(record) {
  if (!record) {
    return null;
  }
  return {
    id: record.id,
    userId: record.user_id,
    action: record.action,
    resourceType: record.resource_type,
    resourceId: record.resource_id,
    ipAddress: record.ip_address,
    userAgent: record.user_agent,
    details: safeAuditDetails(record.details),
    createdAt: record.created_at,
  };
}

async function listAuditLogs(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;

    const options = {
      page,
      limit,
      action: (req.query.action || "").trim(),
      resourceType: (req.query.resourceType || "").trim(),
      userId: (req.query.userId || "").trim(),
      from: (req.query.from || "").trim(),
      to: (req.query.to || "").trim(),
      sort: (req.query.sort || "created_at").trim(),
      order: (req.query.order || "desc").trim().toLowerCase(),
    };

    const records = await findAuditLogs(options);
    const total = await countAuditLogs(options);
    const totalPages = Math.ceil(total / limit);

    return res.json({
      success: true,
      data: records.map(safeAuditRecord),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function getAuditLogById(req, res, next) {
  try {
    const record = await findAuditLogById(req.params.id);
    if (!record) {
      throw httpError(404, "Audit log not found");
    }
    return res.json({
      success: true,
      data: safeAuditRecord(record),
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listAuditLogs,
  getAuditLogById,
};