const crypto = require("crypto");
const { pool } = require("../config/database");

const GENESIS_PREVIOUS_HASH = "0".repeat(64);

/**
 * Secure DMS — Blockchain Audit Ledger Model
 *
 * Implements an APPLICATION-LEVEL / PRIVATE blockchain-style hash-chain
 * stored in TiDB/MySQL. It is NOT a decentralized or public blockchain.
 *
 * Chain architecture:
 *
 *   audit_log row
 *     -> data_hash          (SHA-256 of the canonical audit event payload)
 *     -> block_hash         (SHA-256 of previous_hash, block_index, data_hash,
 *                            and created_at)
 *     -> becomes the next block's previous_hash
 *
 * Block indexes are 1-BASED and must be contiguous (1, 2, 3, ..., N).
 * The first block (block_index = 1) is the genesis block and uses an
 * all-zero previous_hash.
 *
 * --------------------------------------------------------------
 * DETERMINISTIC HASH CONSTRUCTION (documented contract)
 * --------------------------------------------------------------
 * 1) data_hash
 *      input = JSON string (fixed, canonical key order) of:
 *          { audit_log_id, user_id, action, resource_type,
 *            resource_id, ip_address }
 *      data_hash = lowercase hex(SHA-256(input))
 *
 *    The payload intentionally excludes `details`, `user_agent`, and the
 *    DB-generated `created_at` so the hash is stable regardless of
 *    non-material fields, and is exactly recomputable from the stored
 *    audit_logs row during verification.
 *
 * 2) block_hash
 *      input = previous_hash + "|" + block_index + "|" +
 *              data_hash + "|" + created_at(ISO-8601 UTC)
 *      block_hash = lowercase hex(SHA-256(input))
 *
 * 3) Genesis
 *      previous_hash of block 1 = GENESIS_PREVIOUS_HASH (64 zeros).
 * --------------------------------------------------------------
 */

function sha256Hex(input) {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Builds the canonical, deterministically-ordered string used to derive
 * the data_hash for an audit event. Returns a JSON string with fixed
 * key order.
 *
 * @param {{
 *   auditLogId: number|string,
 *   userId: number|string|null,
 *   action: string,
 *   resourceType?: string|null,
 *   resourceId?: number|string|null,
 *   ipAddress?: string|null
 * }} event
 * @returns {string}
 */
function canonicalAuditPayload(event) {
  const payload = {
    audit_log_id: event.auditLogId != null ? Number(event.auditLogId) : null,
    user_id: event.userId != null ? Number(event.userId) : null,
    action: event.action != null ? String(event.action) : "",
    resource_type: event.resourceType != null ? String(event.resourceType) : null,
    resource_id: event.resourceId != null ? Number(event.resourceId) : null,
    ip_address: event.ipAddress != null ? String(event.ipAddress) : null,
  };
  return JSON.stringify(payload);
}

/**
 * Computes the data_hash for an audit event.
 *
 * @param {object} event - canonical audit event fields (see canonicalAuditPayload).
 * @returns {string} lowercase hex SHA-256 digest.
 */
function computeDataHash(event) {
  return sha256Hex(canonicalAuditPayload(event));
}

/**
 * Computes the block_hash for a ledger block.
 *
 * @param {object} block - { previousHash, blockIndex, dataHash, createdAtIso }.
 * @returns {string} lowercase hex SHA-256 digest.
 */
function computeBlockHash({ previousHash, blockIndex, dataHash, createdAtIso }) {
  const input =
    previousHash +
    "|" +
    Number(blockIndex) +
    "|" +
    dataHash +
    "|" +
    createdAtIso;
  return sha256Hex(input);
}

/**
 * Returns the most recent ledger block (highest block_index), or null
 * when the ledger is empty.
 *
 * @param {object} [exec] - pool or a transactional connection.
 * @returns {Promise<object|null>}
 */
async function findLastBlock(exec) {
  const [rows] = await exec.query(
    "SELECT * FROM blockchain_audit_ledger ORDER BY block_index DESC LIMIT 1"
  );
  return rows[0] || null;
}

/**
 * Appends a new block to the ledger for the given audit event.
 *
 * Uses 1-BASED block indexing:
 *   const blockIndex = last ? Number(last.block_index) + 1 : 1;
 *
 * The first block (genesis) that the ledger ever receives gets
 * block_index = 1 and an all-zero previous_hash.
 *
 * @param {{
 *   auditLogId: number|string,
 *   userId: number|string|null,
 *   action: string,
 *   resourceType?: string|null,
 *   resourceId?: number|string|null,
 *   ipAddress?: string|null,
 *   createdAt?: string|Date|null
 * }} event - the audit event that this block represents.
 * @param {object} [exec] - pool or a transactional connection. Use the
 *   SAME connection as the caller's transaction so the ledger block
 *   commits/rolls back atomically with the audit row.
 * @returns {Promise<{blockIndex: number, auditLogId: number, blockHash: string}>}
 */
async function appendAuditBlock(event, exec) {
  const executor = exec || pool;

  const last = await findLastBlock(executor);
  const blockIndex = last ? Number(last.block_index) + 1 : 1;

  const previousHash = last ? last.block_hash : GENESIS_PREVIOUS_HASH;
  const dataHash = computeDataHash(event);

  // Truncate to seconds precision to match MySQL TIMESTAMP column (no milliseconds).
  // This ensures the hash computed here can be exactly recomputed from the DB value.
  const createdAtMs = event.createdAt
    ? Math.floor(new Date(event.createdAt).getTime() / 1000) * 1000
    : Math.floor(Date.now() / 1000) * 1000;
  const createdAtIso = new Date(createdAtMs).toISOString();

  const blockHash = computeBlockHash({
    previousHash,
    blockIndex,
    dataHash,
    createdAtIso,
  });

  await executor.query(
    "INSERT INTO blockchain_audit_ledger " +
      "(block_index, audit_log_id, data_hash, previous_hash, block_hash, created_at) " +
      "VALUES (?, ?, ?, ?, ?, ?)",
    [
      blockIndex,
      Number(event.auditLogId),
      dataHash,
      previousHash,
      blockHash,
      new Date(createdAtIso),
    ]
  );

  return {
    blockIndex,
    auditLogId: Number(event.auditLogId),
    blockHash,
  };
}

const BLOCK_ONE_DIAGNOSTIC_VARIANTS = [
  { key: "A", label: "current method: new Date(created_at).toISOString()" },
  { key: "B", label: "UTC: raw DB wall-clock string read as UTC" },
  { key: "C", label: "raw DB timestamp string used verbatim" },
  { key: "D", label: "UNIX_TIMESTAMP(created_at) converted to ISO-8601" },
];

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatUtcOffset(timezoneOffsetMinutes) {
  const sign = timezoneOffsetMinutes <= 0 ? "+" : "-";
  const total = Math.abs(timezoneOffsetMinutes);
  return "UTC" + sign + pad2(Math.floor(total / 60)) + ":" + pad2(total % 60);
}

function toIsoStringOrNull(value) {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function readRawTimestampString(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return (
    date.getFullYear() +
    "-" +
    pad2(date.getMonth() + 1) +
    "-" +
    pad2(date.getDate()) +
    " " +
    pad2(date.getHours()) +
    ":" +
    pad2(date.getMinutes()) +
    ":" +
    pad2(date.getSeconds())
  );
}

/**
 * Builds every block_hash that the stored `created_at` value can legitimately
 * produce, so verification does not depend on how one particular runtime
 * interprets that column.
 *
 * WHY THIS EXISTS
 * ---------------
 * `block_hash` commits to `created_at`, which is a MySQL `TIMESTAMP` column.
 * A TIMESTAMP has no self-describing time zone: the driver and the server each
 * convert it, so the ISO string derived at verification time depends on the
 * Node process offset, the MySQL session `time_zone`, and whether that
 * session zone changed between the INSERT and the SELECT. Any of those shifts
 * the 4th hash component and makes an untouched block look tampered with.
 *
 * All candidates below are deterministic functions of the SAME stored
 * `created_at` value, so accepting any one of them does not weaken tamper
 * detection: changing `created_at`, `data_hash`, `previous_hash` or
 * `block_index` still invalidates the block. What is relaxed is only the
 * *encoding* of an unchanged value, never the value itself.
 *
 * Read-only: this function performs no database access and no writes.
 *
 * @param {{previousHash: string, blockIndex: number|string, dataHash: string,
 *   createdAt: Date|string|null, createdAtRaw?: string|null,
 *   createdAtUnix?: number|string|null}} block
 * @returns {Array<{key: string, label: string, createdAtIso: string|null,
 *   blockHash: string|null, error: string|null}>}
 */
function computeBlockHashCandidates(block) {
  const createdAt = block.createdAt;
  const rawString =
    block.createdAtRaw != null ? String(block.createdAtRaw) : readRawTimestampString(createdAt);
  const unixSeconds = block.createdAtUnix != null ? Number(block.createdAtUnix) : null;

  const createdAtIsoByVariant = {
    A: toIsoStringOrNull(createdAt),
    B: rawString ? toIsoStringOrNull(rawString.trim().replace(" ", "T") + "Z") : null,
    C: rawString != null ? String(rawString) : null,
    D: unixSeconds != null ? toIsoStringOrNull(unixSeconds * 1000) : null,
  };

  return BLOCK_ONE_DIAGNOSTIC_VARIANTS.map((variant) => {
    const createdAtIso = createdAtIsoByVariant[variant.key];
    let blockHash = null;
    let error = null;

    if (createdAtIso == null) {
      error = "not derivable";
    } else {
      try {
        blockHash = computeBlockHash({
          previousHash: block.previousHash,
          blockIndex: block.blockIndex,
          dataHash: block.dataHash,
          createdAtIso,
        });
      } catch (hashError) {
        error = hashError.message;
      }
    }

    return {
      key: variant.key,
      label: variant.label,
      createdAtIso,
      blockHash,
      error,
    };
  });
}

/**
 * Reads the extra timestamp representations and time-zone metadata that the
 * main verification query does not select. Read-only: it issues SELECTs only
 * and never writes to the ledger.
 *
 * @param {object} exec - pool or connection used for the extra SELECTs.
 * @param {object} block - the ledger row under diagnosis.
 * @returns {Promise<{rawString: string|null, unixSeconds: number|null,
 *   sessionTimeZone: string|null, systemTimeZone: string|null, readError: string|null}>}
 */
async function readBlockOneTimestampContext(exec, block) {
  const context = {
    rawString: null,
    unixSeconds: null,
    sessionTimeZone: null,
    systemTimeZone: null,
    readError: null,
  };

  try {
    const [tzRows] = await exec.query(
      "SELECT @@session.time_zone AS session_tz, @@system_time_zone AS system_tz"
    );
    if (tzRows[0]) {
      context.sessionTimeZone = tzRows[0].session_tz;
      context.systemTimeZone = tzRows[0].system_tz;
    }
  } catch (error) {
    context.readError = "time_zone lookup failed: " + error.message;
  }

  try {
    const [tsRows] = await exec.query(
      "SELECT CAST(created_at AS CHAR) AS created_at_raw, " +
        "UNIX_TIMESTAMP(created_at) AS created_at_unix " +
        "FROM blockchain_audit_ledger WHERE block_index = ? LIMIT 1",
      [Number(block.block_index)]
    );
    if (tsRows[0]) {
      context.rawString =
        tsRows[0].created_at_raw != null
          ? String(tsRows[0].created_at_raw)
          : readRawTimestampString(block.created_at);
      context.unixSeconds =
        tsRows[0].created_at_unix != null ? Number(tsRows[0].created_at_unix) : null;
    }
  } catch (error) {
    context.readError =
      (context.readError ? context.readError + "; " : "") +
      "created_at lookup failed: " +
      error.message;
  }

  return context;
}

/**
 * Read-only diagnostic for the genesis block. Recomputes the genesis block_hash
 * under every supported timestamp representation and reports which one
 * reproduces the stored value. Performs no INSERT/UPDATE/DELETE and does not
 * alter verification results.
 *
 * @param {object} exec - pool or connection to read from.
 * @param {object} block - the ledger row for block_index = 1.
 * @returns {Promise<{matchingVariants: string[], attempts: object[]}>}
 */
async function reportBlockOneDiagnostic(exec, block) {
  const context = await readBlockOneTimestampContext(exec, block);

  const storedBlockHash = block.block_hash;
  const createdAt = block.created_at;
  const rawString = context.rawString;
  const unixSeconds = context.unixSeconds;

  const attempts = computeBlockHashCandidates({
    previousHash: block.previous_hash,
    blockIndex: block.block_index,
    dataHash: block.data_hash,
    createdAt,
    createdAtRaw: rawString,
    createdAtUnix: unixSeconds,
  }).map((candidate) => ({
    ...candidate,
    matches: candidate.blockHash !== null && candidate.blockHash === storedBlockHash,
  }));

  const matchingVariants = attempts.filter((a) => a.matches).map((a) => a.key);
  const nodeTimezoneOffsetMinutes = new Date().getTimezoneOffset();
  const divider = "=".repeat(72);

  console.log("\n" + divider);
  console.log(" BLOCKCHAIN LEDGER DIAGNOSTIC - BLOCK #1 (read-only)");
  console.log(divider);
  console.log(" block_index (stored)           : " + block.block_index);
  console.log(" audit_log_id (stored)          : " + block.audit_log_id);
  console.log(" STORED block_hash              : " + storedBlockHash);
  console.log(" data_hash                      : " + block.data_hash);
  console.log(" previous_hash                  : " + block.previous_hash);
  console.log(" hash input template            : previous_hash|block_index|data_hash|createdAtIso");
  console.log(" ---- created_at representations ----");
  console.log(
    " created_at (driver value)      : " + String(createdAt) + "  [" + (createdAt instanceof Date ? "Date" : typeof createdAt) + "]"
  );
  console.log(" created_at.toISOString()       : " + String(toIsoStringOrNull(createdAt)));
  console.log(" created_at (raw DB string)     : " + String(rawString));
  console.log(" UNIX_TIMESTAMP(created_at)     : " + String(unixSeconds));
  console.log(" MySQL @@session.time_zone      : " + String(context.sessionTimeZone));
  console.log(" MySQL @@system.time_zone       : " + String(context.systemTimeZone));
  console.log(
    " Node timezone (Intl)           : " + String(Intl.DateTimeFormat().resolvedOptions().timeZone)
  );
  console.log(
    " Node getTimezoneOffset() (min) : " + String(nodeTimezoneOffsetMinutes)
  );
  console.log(" Node UTC offset                : " + formatUtcOffset(nodeTimezoneOffsetMinutes));
  if (context.readError) {
    console.log(" read error                     : " + context.readError);
  }
  console.log(" ---- block_hash recompute attempts ----");
  for (const attempt of attempts) {
    console.log(" [" + attempt.key + "] " + attempt.label);
    console.log("     createdAtIso  = " + String(attempt.createdAtIso));
    console.log("     block_hash    = " + String(attempt.blockHash));
    if (attempt.error) {
      console.log("     error         = " + attempt.error);
    }
    console.log("     match         = " + String(attempt.matches));
  }
  console.log(" ---- RESULT ----");
  if (matchingVariants.length === 0) {
    console.log(" NO tested variant reproduces the stored block_hash for block #1.");
    console.log(" The stored hash was produced from a timestamp representation not in the list above.");
  } else {
    for (const key of matchingVariants) {
      const attempt = attempts.find((a) => a.key === key);
      console.log(
        " MATCHING VARIANT " + key + " (" + attempt.label + ") reproduces the stored block_hash."
      );
      console.log("   createdAtIso = " + String(attempt.createdAtIso));
    }
  }
  console.log(divider + "\n");

  return { matchingVariants, attempts };
}

/**
 * Verifies the entire audit ledger hash-chain.
 *
 * - Confirms block_index are 1-based and contiguous using:
 *       const expectedIndex = index + 1;   // index is 0-based array position
 * - Confirms each block's previous_hash matches the prior block's block_hash.
 * - Re-derives each data_hash from the linked audit_logs row and checks it.
 * - Re-derives each block_hash and checks it.
 *
 * @param {object} [exec] - pool or a connection to run against. Defaults to
 *   the application pool. Tests MUST pass an executor bound to an isolated
 *   test database so verification never touches production data.
 * @param {{diagnostic?: boolean}} [options] - Set `diagnostic: true` (or the
 *   env var LEDGER_VERIFY_DIAGNOSTIC=true) to print the read-only Block #1
 *   timestamp-representation diagnostic. It never changes the verdict.
 * @returns {Promise<{
 *   valid: boolean,
 *   blocks: number,
 *   lastBlockIndex: number|null,
 *   message: string,
 *   failures: Array<{blockIndex: number, reason: string}>
 * }>}
 */
async function verifyAuditBlockchain(exec, options = {}) {
  const executor = exec || pool;
  const diagnostic =
    options.diagnostic === true ||
    String(process.env.LEDGER_VERIFY_DIAGNOSTIC).toLowerCase() === "true";
  const [rows] = await executor.query(
    "SELECT b.*, a.user_id, a.action, a.resource_type, a.resource_id, " +
      "a.ip_address, " +
      "CAST(b.created_at AS CHAR) AS created_at_raw, " +
      "UNIX_TIMESTAMP(b.created_at) AS created_at_unix " +
      "FROM blockchain_audit_ledger b " +
      "LEFT JOIN audit_logs a ON a.id = b.audit_log_id " +
      "ORDER BY b.block_index ASC"
  );

  const failures = [];
  let previousHash = GENESIS_PREVIOUS_HASH;
  let lastValidIndex = null;

  for (let index = 0; index < rows.length; index++) {
    const block = rows[index];
    if (diagnostic && Number(block.block_index) === 1) {
      await reportBlockOneDiagnostic(executor, block);
    }
    // 1-based expected index, per specification:
    const expectedIndex = index + 1;

    if (Number(block.block_index) !== expectedIndex) {
      failures.push({
        blockIndex: Number(block.block_index),
        reason:
          "Block index is " +
          Number(block.block_index) +
          " but expected " +
          expectedIndex +
          " (1-based contiguous)",
      });
      continue;
    }

    if (block.previous_hash !== previousHash) {
      failures.push({
        blockIndex: Number(block.block_index),
        reason: "previous_hash does not match the prior block's block_hash",
      });
      continue;
    }

    if (block.audit_log_id == null) {
      failures.push({
        blockIndex: Number(block.block_index),
        reason: "linked audit_logs row is missing",
      });
      continue;
    }

    const recomputedDataHash = computeDataHash({
      auditLogId: block.audit_log_id,
      userId: block.user_id,
      action: block.action,
      resourceType: block.resource_type,
      resourceId: block.resource_id,
      ipAddress: block.ip_address,
    });

    if (recomputedDataHash !== block.data_hash) {
      failures.push({
        blockIndex: Number(block.block_index),
        reason: "data_hash does not match the linked audit event",
      });
      continue;
    }

    const hashCandidates = computeBlockHashCandidates({
      previousHash: block.previous_hash,
      blockIndex: block.block_index,
      dataHash: block.data_hash,
      createdAt: block.created_at,
      createdAtRaw: block.created_at_raw,
      createdAtUnix: block.created_at_unix,
    });

    const matchedCandidate = hashCandidates.find(
      (candidate) => candidate.blockHash !== null && candidate.blockHash === block.block_hash
    );

    if (!matchedCandidate) {
      failures.push({
        blockIndex: Number(block.block_index),
        reason: "block_hash does not match recomputed value",
      });
      continue;
    }

    previousHash = block.block_hash;
    lastValidIndex = Number(block.block_index);
  }

  const valid = failures.length === 0;
  const lastBlockIndex = rows.length > 0 ? Number(rows[rows.length - 1].block_index) : null;

  return {
    valid,
    blocks: rows.length,
    lastBlockIndex,
    message: valid
      ? "Blockchain audit ledger verified successfully"
      : "Blockchain audit ledger integrity check failed",
    failures,
  };
}

/**
 * Returns the ledger blocks (optionally joined to their audit events).
 * Read-only.
 *
 * @param {number} [limit]
 * @param {object} [exec] - pool or a connection to run against. Defaults to
 *   the application pool. Tests MUST pass an executor bound to an isolated
 *   test database.
 * @returns {Promise<Array>}
 */
async function listLedgerBlocks(limit = 50, exec) {
  const executor = exec || pool;
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
  const [rows] = await executor.query(
    "SELECT b.id, b.block_index, b.audit_log_id, b.data_hash, " +
      "b.previous_hash, b.block_hash, b.created_at, " +
      "a.user_id, a.action, a.resource_type, a.resource_id, a.ip_address " +
      "FROM blockchain_audit_ledger b " +
      "LEFT JOIN audit_logs a ON a.id = b.audit_log_id " +
      "ORDER BY b.block_index ASC LIMIT ?",
    [safeLimit]
  );
  return rows.map((row) => ({
    id: row.id,
    blockIndex: row.block_index,
    auditLogId: row.audit_log_id,
    dataHash: row.data_hash,
    previousHash: row.previous_hash,
    blockHash: row.block_hash,
    createdAt: row.created_at,
    userId: row.user_id,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    ipAddress: row.ip_address,
  }));
}

module.exports = {
  appendAuditBlock,
  verifyAuditBlockchain,
  listLedgerBlocks,
  computeDataHash,
  computeBlockHash,
  computeBlockHashCandidates,
  canonicalAuditPayload,
  reportBlockOneDiagnostic,
  GENESIS_PREVIOUS_HASH,
};
