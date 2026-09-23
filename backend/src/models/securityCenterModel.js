const { pool } = require("../config/database");
const { verifyAuditBlockchain } = require("./blockchainAuditModel");
const { verifyApprovalSignature } = require("../services/approvalSignatureService");

/**
 * Security Center model — read-only aggregation queries for the Admin
 * Security Center overview endpoint (GET /api/security/overview).
 *
 * Produces counts and aggregate statistics ONLY: never users, payloads,
 * signatures, keys, IPs, user agents, checksums, paths, or contents.
 *
 * Every function accepts an optional `exec` executor so the isolated
 * test suite can bind every query to the test database. Aggregates are
 * zero-filled so the response shape is stable even for an empty database.
 */

// Security-relevant audit actions that genuinely exist in the codebase
// (verified against the controllers). Kept in a fixed order so the
// overview shape is deterministic. `USER_DEACTIVATED` is the real action
// recorded by userController for admin deactivation; there is no
// `ADMIN_USER_DEACTIVATED` action anywhere in the code.
const SECURITY_ACTIONS = [
  "LOGIN",
  "LOGIN_FAILED",
  "LOGOUT",
  "REGISTER",
  "USER_DEACTIVATED",
  "USER_ACTIVATED",
  "USER_ROLE_CHANGED",
  "ADMIN_USER_CREATED",
  "ADMIN_USER_UPDATED",
  "ROLE_PERMISSIONS_UPDATED",
  "CASE_DELETED",
  "CASE_SUBMITTED_FOR_REVIEW",
  "CASE_REVIEW_REJECTED",
  "CASE_REVIEW_RETURNED",
  "DOCUMENT_REVIEW_REJECTED",
  "DOCUMENT_REVIEW_RETURNED",
  "DOCUMENT_DELETED",
  "DOCUMENT_DOWNLOADED",
  "VERSION_DOWNLOADED",
  "VERSION_INTEGRITY_VERIFIED",
  "DOCUMENT_CHAIN_VIEWED",
  "OFFICER_VERIFICATION_SUBMITTED",
  "OFFICER_VERIFICATION_APPROVED",
  "OFFICER_VERIFICATION_REJECTED",
];

// ─── Users ────────────────────────────────────────────────────────

/**
 * Aggregate the user base: total / active / inactive counts plus a
 * per-role breakdown. Users without an assigned role are omitted from
 * the role breakdown (total is still authoritative).
 * @param {import("mysql2/promise").Pool} exec
 * @returns {Promise<{ total: number, active: number, inactive: number, byRole: Array<{role: string, count: number}> }>}
 */
async function aggregateUsers(exec) {
  const executor = exec || pool;
  const [[counts], [roleRows]] = await Promise.all([
    executor.query(
      "SELECT COUNT(*) AS total, " +
        "COALESCE(SUM(is_active = 1), 0) AS active, " +
        "COALESCE(SUM(is_active = 0), 0) AS inactive " +
        "FROM users"
    ),
    executor.query(
      "SELECT r.name AS role, COUNT(*) AS count " +
        "FROM users u LEFT JOIN roles r ON r.id = u.role_id " +
        "GROUP BY r.name " +
        "ORDER BY count DESC, role ASC"
    ),
  ]);

  return {
    total: Number(counts[0].total),
    active: Number(counts[0].active),
    inactive: Number(counts[0].inactive),
    byRole: roleRows
      .filter((r) => r.role != null)
      .map((r) => ({ role: r.role, count: Number(r.count) })),
  };
}

// ─── Officer verifications ────────────────────────────────────────

/**
 * Counts of officer verification submissions by status. Zero-filled.
 * @param {import("mysql2/promise").Pool} exec
 * @returns {Promise<{ pending: number, approved: number, rejected: number }>}
 */
async function aggregateOfficerVerifications(exec) {
  const executor = exec || pool;
  const [rows] = await executor.query(
    "SELECT status, COUNT(*) AS total FROM officer_verifications GROUP BY status"
  );
  const counts = { pending: 0, approved: 0, rejected: 0 };
  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(counts, row.status)) {
      counts[row.status] = Number(row.total);
    }
  }
  return counts;
}

// ─── Documents + integrity ────────────────────────────────────────

/**
 * Parse an audit `details` value (JSON column comes back as an object via
 * mysql2, but a defensive string parse keeps this robust).
 * @param {unknown} details
 * @returns {object}
 */
function parseDetails(details) {
  if (typeof details === "string") {
    try {
      return JSON.parse(details) || {};
    } catch {
      return {};
    }
  }
  return details || {};
}

/**
 * Aggregate documents, document versions, and version-integrity status.
 *
 * Integrity is derived from the LAST recorded VERSION_INTEGRITY_VERIFIED
 * audit event per (document, version) — the same last-check-wins rule the
 * chain-of-custody model uses per version.
 *
 * @param {import("mysql2/promise").Pool} exec
 * @returns {Promise<{ total: number, versions: number, integrity: { verified: number, failed: number, notVerified: number } }>}
 */
async function aggregateDocuments(exec) {
  const executor = exec || pool;
  const [[docCount], [versions], [integrityEvents]] = await Promise.all([
    executor.query("SELECT COUNT(*) AS total FROM documents"),
    executor.query("SELECT id, document_id, version_number FROM document_versions"),
    executor.query(
      "SELECT resource_id AS document_id, details, created_at, id " +
        "FROM audit_logs " +
        "WHERE action = 'VERSION_INTEGRITY_VERIFIED' " +
          "AND resource_type = 'document' " +
        "ORDER BY created_at ASC, id ASC"
    ),
  ]);

  const lastValidity = new Map();
  for (const event of integrityEvents) {
    const details = parseDetails(event.details);
    const version = details.versionNumber;
    if (version == null) {
      continue;
    }
    lastValidity.set(
      String(event.document_id) + ":" + String(version),
      details.integrityValid === true
    );
  }

  let verified = 0;
  let failed = 0;
  let notVerified = 0;
  for (const version of versions) {
    const key = String(version.document_id) + ":" + String(version.version_number);
    if (!lastValidity.has(key)) {
      notVerified++;
    } else if (lastValidity.get(key)) {
      verified++;
    } else {
      failed++;
    }
  }

  return {
    total: Number(docCount[0].total),
    versions: versions.length,
    integrity: { verified, failed, notVerified },
  };
}

// ─── Approval signatures ──────────────────────────────────────────

/**
 * Aggregate approval signatures. `signed` = stored signature rows,
 * `valid`/`invalid` are decided server-side with the configured public
 * key (fail-closed: unconfigured/broken keys never crash the endpoint),
 * and `unsigned` = approved case reviews that have no signature row.
 * Never exposes payloads, signatures, or key material.
 * @param {import("mysql2/promise").Pool} exec
 * @returns {Promise<{ signed: number, valid: number, invalid: number, unsigned: number }>}
 */
async function aggregateSignatures(exec) {
  const executor = exec || pool;
  const [[signatureRows], [unsignedResult]] = await Promise.all([
    executor.query("SELECT id, payload, signature FROM approval_signatures"),
    executor.query(
      "SELECT COUNT(*) AS total " +
        "FROM case_reviews cr " +
        "LEFT JOIN approval_signatures s ON s.review_id = cr.id " +
        "WHERE cr.action = 'approved' AND s.id IS NULL"
    ),
  ]);

  let valid = 0;
  for (const row of signatureRows) {
    if (verifyApprovalSignature(row.payload, row.signature)) {
      valid++;
    }
  }

  return {
    signed: signatureRows.length,
    valid,
    invalid: signatureRows.length - valid,
    unsigned: Number(unsignedResult[0].total),
  };
}

// ─── Audit log + security events ──────────────────────────────────

/**
 * Aggregate the audit log: total events plus a zero-filled breakdown of
 * the curated security-relevant actions.
 * @param {import("mysql2/promise").Pool} exec
 * @returns {Promise<{ totalEvents: number, securityEvents: Array<{action: string, count: number}> }>}
 */
async function aggregateAudit(exec) {
  const executor = exec || pool;
  const [[totalResult], [actionRows]] = await Promise.all([
    executor.query("SELECT COUNT(*) AS total FROM audit_logs"),
    executor.query(
      "SELECT action, COUNT(*) AS total FROM audit_logs " +
        "WHERE action IN (" + SECURITY_ACTIONS.map(() => "?").join(",") + ") " +
        "GROUP BY action",
      SECURITY_ACTIONS
    ),
  ]);

  const countByAction = new Map(
    actionRows.map((r) => [r.action, Number(r.total)])
  );
  const securityEvents = SECURITY_ACTIONS.map((action) => ({
    action,
    count: countByAction.get(action) || 0,
  }));

  return {
    totalEvents: Number(totalResult[0].total),
    securityEvents,
  };
}

// ─── Ledger ───────────────────────────────────────────────────────

/**
 * Reuse the existing hash-chain verifier. Returns only safe verdict
 * metadata (never block hashes).
 * @param {import("mysql2/promise").Pool} exec
 * @returns {Promise<{ valid: boolean, blocks: number, lastBlockIndex: number|null, message: string }>}
 */
async function aggregateLedger(exec) {
  const executor = exec || pool;
  const verdict = await verifyAuditBlockchain(executor);
  return {
    valid: verdict.valid === true,
    blocks: verdict.blocks,
    lastBlockIndex: verdict.lastBlockIndex,
    message: verdict.message,
  };
}

// ─── Notifications ────────────────────────────────────────────────

/**
 * Notification counts by type (only the type + count; no messages).
 * @param {import("mysql2/promise").Pool} exec
 * @returns {Promise<{ byType: Array<{type: string, count: number}> }>}
 */
async function aggregateNotifications(exec) {
  const executor = exec || pool;
  const [rows] = await executor.query(
    "SELECT type, COUNT(*) AS total FROM notifications GROUP BY type ORDER BY type"
  );
  return {
    byType: rows.map((r) => ({ type: r.type, count: Number(r.total) })),
  };
}

// ─── Overview ─────────────────────────────────────────────────────

/**
 * Full Security Center overview. All aggregates are read-only and run
 * against a single executor (product pool by default; tests pass the
 * isolated test pool).
 * @param {import("mysql2/promise").Pool} [exec]
 * @returns {Promise<object>}
 */
async function getSecurityOverview(exec) {
  const executor = exec || pool;
  const [
    users,
    officerVerifications,
    documents,
    signatures,
    audit,
    ledger,
    notifications,
  ] = await Promise.all([
    aggregateUsers(executor),
    aggregateOfficerVerifications(executor),
    aggregateDocuments(executor),
    aggregateSignatures(executor),
    aggregateAudit(executor),
    aggregateLedger(executor),
    aggregateNotifications(executor),
  ]);

  return {
    users,
    officerVerifications,
    documents,
    signatures,
    audit,
    ledger,
    notifications,
  };
}

module.exports = {
  SECURITY_ACTIONS,
  aggregateUsers,
  aggregateOfficerVerifications,
  aggregateDocuments,
  aggregateSignatures,
  aggregateAudit,
  aggregateLedger,
  aggregateNotifications,
  getSecurityOverview,
};