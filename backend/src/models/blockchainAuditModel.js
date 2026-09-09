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
 * @returns {Promise<{
 *   valid: boolean,
 *   blocks: number,
 *   lastBlockIndex: number|null,
 *   message: string,
 *   failures: Array<{blockIndex: number, reason: string}>
 * }>}
 */
async function verifyAuditBlockchain(exec) {
  const executor = exec || pool;
  const [rows] = await executor.query(
    "SELECT b.*, a.user_id, a.action, a.resource_type, a.resource_id, " +
      "a.ip_address " +
      "FROM blockchain_audit_ledger b " +
      "LEFT JOIN audit_logs a ON a.id = b.audit_log_id " +
      "ORDER BY b.block_index ASC"
  );

  const failures = [];
  let previousHash = GENESIS_PREVIOUS_HASH;
  let lastValidIndex = null;

  for (let index = 0; index < rows.length; index++) {
    const block = rows[index];
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

    const createdIso = new Date(block.created_at).toISOString();
    const recomputedBlockHash = computeBlockHash({
      previousHash: block.previous_hash,
      blockIndex: block.block_index,
      dataHash: block.data_hash,
      createdAtIso: createdIso,
    });

    if (recomputedBlockHash !== block.block_hash) {
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
  canonicalAuditPayload,
  GENESIS_PREVIOUS_HASH,
};
