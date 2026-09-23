const crypto = require("crypto");
require("dotenv").config();

/**
 * Approval signing key configuration (SIH Digital Approval Signature).
 *
 * Holds the ECDSA P-256 key pair used to sign and verify case approval
 * records. The PRIVATE key lives ONLY in the environment (base64-encoded
 * PEM). It is never stored in the database, audit logs, or returned by
 * any API. Only safe metadata (algorithm + key id) is exposed.
 */

const ALGORITHM = "ECDSA-P256-SHA256";

function configError(message) {
  const err = new Error(message);
  err.name = "ApprovalKeyConfigurationError";
  err.statusCode = 500;
  err.expose = false;
  return err;
}

function isUnsetOrPlaceholder(value) {
  return !value || String(value).includes("replace-with");
}

function decodePem(b64) {
  return Buffer.from(b64, "base64").toString("utf8");
}

function getKeyId() {
  const keyId = process.env.APPROVAL_SIGNING_KEY_ID;
  if (isUnsetOrPlaceholder(keyId)) {
    throw configError(
      "APPROVAL_SIGNING_KEY_ID is not configured. Set it in the backend .env file."
    );
  }
  return keyId;
}

function getPrivateKey() {
  const b64 = process.env.APPROVAL_SIGNING_PRIVATE_KEY_B64;
  if (isUnsetOrPlaceholder(b64)) {
    throw configError(
      "APPROVAL_SIGNING_PRIVATE_KEY_B64 is not configured. Set it in the backend .env file."
    );
  }
  try {
    return crypto.createPrivateKey(decodePem(b64));
  } catch (err) {
    throw configError(
      "APPROVAL_SIGNING_PRIVATE_KEY_B64 is invalid. Provide a base64-encoded PKCS8 PEM P-256 private key."
    );
  }
}

function getPublicKey() {
  const b64 = process.env.APPROVAL_SIGNING_PUBLIC_KEY_B64;
  if (isUnsetOrPlaceholder(b64)) {
    throw configError(
      "APPROVAL_SIGNING_PUBLIC_KEY_B64 is not configured. Set it in the backend .env file."
    );
  }
  try {
    return crypto.createPublicKey(decodePem(b64));
  } catch (err) {
    throw configError(
      "APPROVAL_SIGNING_PUBLIC_KEY_B64 is invalid. Provide a base64-encoded SPKI PEM P-256 public key."
    );
  }
}

/**
 * Safe metadata only — never the keys themselves.
 * @returns {{ algorithm: string, keyId: string }}
 */
function getApprovalSigningMetadata() {
  return { algorithm: ALGORITHM, keyId: getKeyId() };
}

module.exports = {
  getKeyId,
  getPrivateKey,
  getPublicKey,
  getApprovalSigningMetadata,
  ALGORITHM,
};