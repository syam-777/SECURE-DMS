const { pool } = require("../config/database");

/**
 * Approval signature model (SIH Digital Approval Signature).
 *
 * Persists the cryptographic signature created for an approved case
 * review. Every query accepts the existing transaction executor pattern:
 * pass a transactional connection to join the caller's transaction, or
 * omit it to use the shared pool.
 */

const SIGNATURE_COLUMNS =
  "id, review_id, case_id, payload, signature, algorithm, key_id, signed_at, created_at";

/**
 * Find the approval signature for a specific approval review row.
 * @param {number|string} reviewId - case_reviews.id
 * @param {object} [exec] - pool or transactional connection.
 * @returns {Promise<object|null>} row (snake_case columns) or null.
 */
async function findApprovalSignatureByReviewId(reviewId, exec) {
  const executor = exec || pool;
  const [rows] = await executor.query(
    "SELECT " +
      SIGNATURE_COLUMNS +
      " FROM approval_signatures WHERE review_id = ? LIMIT 1",
    [reviewId]
  );
  return rows[0] || null;
}

/**
 * Insert a new approval signature row.
 * Duplicate review_id rows are prevented by the UNIQUE(review_id)
 * constraint (uq_as_review) — a duplicate insert fails and, inside a
 * transaction, rolls the whole approval back.
 * @param {{
 *   reviewId: number|string,
 *   caseId: number|string,
 *   payload: string,
 *   signature: string,
 *   algorithm: string,
 *   keyId: string
 * }} data
 * @param {object} [exec] - pool or transactional connection.
 * @returns {Promise<{id: number}>}
 */
async function insertApprovalSignature(data, exec) {
  const executor = exec || pool;
  const [result] = await executor.query(
    "INSERT INTO approval_signatures (review_id, case_id, payload, signature, algorithm, key_id) " +
      "VALUES (?, ?, ?, ?, ?, ?)",
    [
      data.reviewId,
      data.caseId,
      data.payload,
      data.signature,
      data.algorithm,
      data.keyId,
    ]
  );
  return { id: result.insertId };
}

/**
 * Find the most recent approval signature for a case.
 * @param {number|string} caseId - cases.id
 * @param {object} [exec] - pool or transactional connection.
 * @returns {Promise<object|null>} row (snake_case columns) or null.
 */
async function findApprovalSignatureByCaseId(caseId, exec) {
  const executor = exec || pool;
  const [rows] = await executor.query(
    "SELECT " +
      SIGNATURE_COLUMNS +
      " FROM approval_signatures WHERE case_id = ? ORDER BY id DESC LIMIT 1",
    [caseId]
  );
  return rows[0] || null;
}

module.exports = {
  findApprovalSignatureByReviewId,
  insertApprovalSignature,
  findApprovalSignatureByCaseId,
};