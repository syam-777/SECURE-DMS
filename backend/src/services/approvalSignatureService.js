const crypto = require("crypto");
const {
  getPrivateKey,
  getPublicKey,
  getApprovalSigningMetadata: getConfiguredApprovalMetadata,
} = require("../config/approvalKeys");

/**
 * Approval signature service (SIH Digital Approval Signature).
 *
 * Signs deterministic canonical case-approval statements with the
 * server-side ECDSA P-256 key pair. Only Node's built-in crypto is used;
 * no external signing package is required.
 *
 * Canonicalization is deterministic: fixed schema version, explicit
 * field ordering, normalized numbers/strings, and artifacts sorted by
 * documentId then versionNumber. The exact canonical string that is
 * signed is the string stored in approval_signatures.payload, so a
 * verifier only needs the stored payload + signature + public key.
 */

const ALGORITHM = "ECDSA-P256-SHA256";
const SCHEMA_VERSION = 1;
const ACTION = "CASE_REVIEW_APPROVED";
const DECISION = "approved";

const PAYLOAD_KEYS = [
  "schemaVersion",
  "action",
  "reviewId",
  "caseId",
  "caseNumber",
  "reviewerId",
  "reviewerUsername",
  "decision",
  "reviewNote",
  "approvedAt",
  "artifacts",
];

function numericField(value, name) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(
      `approval payload field "${name}" must be a finite number (got ${JSON.stringify(value)})`
    );
  }
  return n;
}

function stringField(value) {
  return value == null ? "" : String(value);
}

/**
 * Build the deterministic canonical payload string for a case approval.
 * @param {{
 *   reviewId: number|string,
 *   caseId: number|string,
 *   caseNumber?: string,
 *   reviewerId: number|string,
 *   reviewerUsername?: string,
 *   reviewNote?: string|null,
 *   approvedAt?: Date|string,
 *   artifacts?: Array<{documentId, documentTitle?, versionNumber, checksum?}>
 * }} data
 * @returns {string} the exact canonical string to be signed and stored.
 */
function canonicalizeApprovalPayload(data) {
  const reviewId = numericField(data.reviewId, "reviewId");
  const caseId = numericField(data.caseId, "caseId");
  const reviewerId = numericField(data.reviewerId, "reviewerId");

  const reviewNote =
    data.reviewNote != null && String(data.reviewNote).trim() !== ""
      ? String(data.reviewNote).trim()
      : null;

  const artifacts = (Array.isArray(data.artifacts) ? data.artifacts : [])
    .filter(
      (a) =>
        a &&
        a.documentId != null &&
        a.versionNumber != null &&
        Number.isFinite(Number(a.documentId)) &&
        Number.isFinite(Number(a.versionNumber))
    )
    .map((a) => ({
      documentId: Number(a.documentId),
      documentTitle: stringField(a.documentTitle),
      versionNumber: Number(a.versionNumber),
      checksum: stringField(a.checksum),
    }))
    .sort(
      (x, y) =>
        x.documentId - y.documentId || x.versionNumber - y.versionNumber
    );

  const payload = {
    schemaVersion: SCHEMA_VERSION,
    action: ACTION,
    reviewId,
    caseId,
    caseNumber: stringField(data.caseNumber),
    reviewerId,
    reviewerUsername: stringField(data.reviewerUsername),
    decision: DECISION,
    reviewNote,
    approvedAt: new Date(data.approvedAt).toISOString(),
    artifacts,
  };

  const normalized = {};
  for (const key of PAYLOAD_KEYS) {
    normalized[key] = payload[key];
  }

  return JSON.stringify(normalized);
}

/**
 * Sign a canonical payload with the server private key (ECDSA P-256).
 * @param {string} payload - the exact canonical string to sign.
 * @returns {string} base64-encoded signature.
 */
function signApprovalPayload(payload) {
  if (typeof payload !== "string" || payload.length === 0) {
    throw new Error("signApprovalPayload requires a non-empty canonical payload string");
  }
  const signer = crypto.createSign("sha256");
  signer.update(payload, "utf8");
  signer.end();
  return signer.sign(getPrivateKey()).toString("base64");
}

/**
 * Verify a signature over a canonical payload using the public key.
 * Falls back to false (never throws) for malformed input or bad keys.
 * @param {string} payload - the stored canonical payload string.
 * @param {string} signature - base64-encoded signature.
 * @param {object} [publicKey] - optional explicit public KeyObject/PEM
 *   (used by tests to prove a wrong key fails). Defaults to the
 *   configured approval signing public key.
 * @returns {boolean}
 */
function verifyApprovalSignature(payload, signature, publicKey) {
  if (typeof payload !== "string" || typeof signature !== "string" || signature === "") {
    return false;
  }
  try {
    const key = publicKey || getPublicKey();
    const verifier = crypto.createVerify("sha256");
    verifier.update(payload, "utf8");
    verifier.end();
    return verifier.verify(key, Buffer.from(signature, "base64"));
  } catch (err) {
    return false;
  }
}

/**
 * Safe metadata only: algorithm + key id (never any key material).
 * @returns {{ algorithm: string, keyId: string }}
 */
function getApprovalSigningMetadata() {
  return getConfiguredApprovalMetadata();
}

module.exports = {
  canonicalizeApprovalPayload,
  signApprovalPayload,
  verifyApprovalSignature,
  getApprovalSigningMetadata,
  ALGORITHM,
  SCHEMA_VERSION,
  ACTION,
  DECISION,
  PAYLOAD_KEYS,
};