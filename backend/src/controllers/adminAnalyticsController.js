const {
  getAdminAnalyticsOverview,
} = require("../models/adminAnalyticsModel");
const { safeAuditDetails } = require("./auditController");

/**
 * Additional key categories that must never leave the analytics endpoint:
 * API keys, checksums, signatures, and raw payloads. The shared audit
 * sanitizer already covers passwords/tokens/paths; this layer closes the
 * remaining gaps without changing shared audit behavior.
 */
const ANALYTICS_SENSITIVE_KEY_PATTERN =
  /key|checksum|signature|payload|hash|passphrase|pem|cert/i;

const HEX_CHECKSUM_PATTERN = /^[0-9a-f]{64}$/i;

/**
 * Recursively strips keys/values that this endpoint must never expose.
 * Applied after safeAuditDetails so the two sanitizers compose.
 * @param {*} value
 * @returns {*}
 */
function stripAnalyticsSensitive(value) {
  if (value == null) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map(stripAnalyticsSensitive);
  }
  if (typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value)) {
      if (ANALYTICS_SENSITIVE_KEY_PATTERN.test(key)) {
        continue;
      }
      out[key] = stripAnalyticsSensitive(value[key]);
    }
    return out;
  }
  if (typeof value === "string" && HEX_CHECKSUM_PATTERN.test(value)) {
    return "[REDACTED]";
  }
  return value;
}

/**
 * Admin Analytics / System Dashboard controller — read-only system-wide
 * aggregates for GET /api/admin/analytics. Errors are forwarded to the
 * central error handler like every other controller.
 */

/**
 * Projects one raw recent-activity row into the safe client event shape.
 * Only safe fields are emitted: id, action, resourceType, resourceId,
 * actor, createdAt, and a sanitized details object. IP addresses, user
 * agents, user ids, storage paths, file names, checksums, and credentials
 * never leave the server.
 * @param {object} row raw audit_logs row joined with the acting user
 * @returns {object|null}
 */
function toSafeActivityEvent(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    actor: row.username || row.full_name || null,
    createdAt: row.created_at,
    details: stripAnalyticsSensitive(safeAuditDetails(row.details)),
  };
}

async function getAnalytics(req, res, next) {
  try {
    const overview = await getAdminAnalyticsOverview();
    return res.json({
      success: true,
      ...overview,
      activity: overview.activity.map(toSafeActivityEvent),
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getAnalytics,
  toSafeActivityEvent,
};