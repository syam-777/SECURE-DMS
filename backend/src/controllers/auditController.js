const {
  findAuditLogs,
  countAuditLogs,
  findAuditLogById,
  findAuditFilterOptions,
} = require("../models/auditLogModel");
const {
  verifyAuditBlockchain,
  listLedgerBlocks,
  computeBlockHashCandidates,
} = require("../models/blockchainAuditModel");
const { pool } = require("../config/database");

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.expose = true;
  return err;
}

const SENSITIVE_KEY_PATTERN =
  /password|passwd|secret|token|authorization|credential|file_path|stored_file_name|filepath|storedfilename|bearer|officialIdNumber|official_id_number|officialIdHash|official_id_hash|aadhaar|aadhaarNumber|path/i;

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

/**
 * Paginated, filtered list of audit logs.
 *
 * `page` and `limit` are clamped here with the SAME bounds the model
 * applies, so the `pagination` envelope always describes the rows that were
 * actually returned rather than the values the client happened to send.
 */
async function listAuditLogs(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const options = {
      page,
      limit,
      action: (req.query.action || "").trim(),
      resourceType: (req.query.resourceType || "").trim(),
      userId: (req.query.userId || "").trim(),
      from: (req.query.from || "").trim(),
      to: (req.query.to || "").trim(),
      search: (req.query.search || "").trim(),
      sort: (req.query.sort || "created_at").trim(),
      order: (req.query.order || "desc").trim().toLowerCase(),
    };

    const records = await findAuditLogs(options);
    const total = await countAuditLogs(options);
    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

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

/**
 * Returns the distinct action values and distinct actor ids present in
 * audit_logs, for populating the client-side filter dropdowns.
 *
 * The UI fetches this once on mount rather than deriving options from the
 * current page, because a paginated page slice cannot contain every
 * possible filter value.
 */
async function getAuditLogFilters(req, res, next) {
  try {
    const options = await findAuditFilterOptions();

    return res.json({
      success: true,
      data: options,
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

/**
 * Verifies the integrity of the entire blockchain audit ledger.
 * Returns whether the chain is valid, the number of verified blocks,
 * the last block index, and any detected failures.
 */
async function verifyBlockchain(req, res, next) {
  try {
    const result = await verifyAuditBlockchain();
    return res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Lists the blockchain audit ledger blocks (read-only).
 * Optionally limited via ?limit= (defaults to 50, max 200).
 */
async function getBlockchainBlocks(req, res, next) {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const blocks = await listLedgerBlocks(limit);
    return res.json({
      success: true,
      data: blocks.map((block) => ({
        id: block.id,
        blockIndex: block.blockIndex,
        auditLogId: block.auditLogId,
        dataHash: block.dataHash,
        previousHash: block.previousHash,
        blockHash: block.blockHash,
        createdAt: block.createdAt,
        user: block.userId != null ? Number(block.userId) : null,
        action: block.action,
        resourceType: block.resourceType,
        resourceId: block.resourceId,
        ipAddress: block.ipAddress,
      })),
      pagination: {
        limit,
        total: blocks.length,
      },
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * TEMPORARY diagnostic. Reports DB connection identity, ledger span, and the
 * genesis block. Exposes internal host/port — do not ship to production.
 */
async function debugLedgerInfo(req, res) {
  try {
    const [dbRows] = await pool.query(
      "SELECT DATABASE() AS db, @@hostname AS host, @@port AS port"
    );

    const [ledgerRows] = await pool.query(
      "SELECT COUNT(*) AS total_blocks, " +
        "MIN(block_index) AS min_block, " +
        "MAX(block_index) AS max_block " +
        "FROM blockchain_audit_ledger"
    );

    const [firstBlock] = await pool.query(
      "SELECT block_index, audit_log_id, data_hash, previous_hash, " +
        "block_hash, created_at " +
        "FROM blockchain_audit_ledger " +
        "WHERE block_index = 1"
    );

    res.json({
      connection: dbRows[0],
      ledger: ledgerRows[0],
      genesis: firstBlock[0],
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
}

/**
 * TEMPORARY diagnostic for the genesis block. Returns the stored timestamp in
 * every representation the DB can supply, plus every block_hash candidate that
 * `computeBlockHashCandidates` derives from it, flagged against the stored
 * hash. Read-only: SELECTs only.
 */
async function debugLedgerHash(req, res, next) {
  try {
    const [rows] = await pool.query(
      "SELECT b.block_index, b.block_hash, b.previous_hash, b.data_hash, " +
        "b.created_at, " +
        "CAST(b.created_at AS CHAR) AS created_at_raw, " +
        "UNIX_TIMESTAMP(b.created_at) AS created_at_unix, " +
        "@@session.time_zone AS session_tz, " +
        "@@system_time_zone AS system_tz " +
        "FROM blockchain_audit_ledger b " +
        "WHERE b.block_index = 1 LIMIT 1"
    );

    const block = rows[0];
    if (!block) {
      return res.status(404).json({ error: "block_index = 1 not found" });
    }

    const storedHash = block.block_hash;

    const candidates = computeBlockHashCandidates({
      previousHash: block.previous_hash,
      blockIndex: block.block_index,
      dataHash: block.data_hash,
      createdAt: block.created_at,
      createdAtRaw: block.created_at_raw,
      createdAtUnix: block.created_at_unix,
    }).map((candidate) => ({
      label: candidate.label,
      createdAtIso: candidate.createdAtIso,
      blockHash: candidate.blockHash,
      matchesStoredHash: candidate.blockHash !== null && candidate.blockHash === storedHash,
      error: candidate.error,
    }));

    return res.json({
      block_index: block.block_index,
      block_hash: storedHash,
      created_at: block.created_at,
      created_at_raw: block.created_at_raw,
      created_at_unix: block.created_at_unix,
      session_tz: block.session_tz,
      system_tz: block.system_tz,
      node_tz_offset_minutes: new Date().getTimezoneOffset(),
      matching_variants: candidates.filter((c) => c.matchesStoredHash).map((c) => c.label),
      candidates,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listAuditLogs,
  getAuditLogFilters,
  getAuditLogById,
  verifyBlockchain,
  getBlockchainBlocks,
  debugLedgerInfo,
  debugLedgerHash,
  safeAuditRecord,
  safeAuditDetails,
};