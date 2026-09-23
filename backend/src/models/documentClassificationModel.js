const { pool } = require("../config/database");

const CLASSIFICATION_SELECT_COLUMNS =
  "id, document_id, version_number, category, confidence, reason, model, " +
  "classified_at, created_at";

/**
 * Retrieve the stored AI classification for an exact document version.
 * Classification is explicitly tied to (document_id, version_number) so a
 * version can never be confused with the document's current version.
 *
 * @param {number|string} documentId
 * @param {number|string} versionNumber
 * @returns {Promise<object|null>}
 */
async function findDocumentClassification(documentId, versionNumber) {
  const [rows] = await pool.query(
    "SELECT " +
      CLASSIFICATION_SELECT_COLUMNS +
      " FROM document_classifications " +
      "WHERE document_id = ? AND version_number = ? LIMIT 1",
    [documentId, versionNumber]
  );
  return rows[0] || null;
}

/**
 * Insert or update an AI classification for an exact document version.
 * Uses INSERT ... ON DUPLICATE KEY UPDATE so re-running classification on the
 * same version is idempotent (UNIQUE(document_id, version_number)); the
 * original created_at is preserved while classified_at is refreshed to the
 * latest classification event.
 *
 * @param {{
 *   documentId: number,
 *   versionNumber: number,
 *   category: string,
 *   confidence: number,
 *   reason: string,
 *   model: string
 * }} data
 * @returns {Promise<void>}
 */
async function upsertDocumentClassification({
  documentId,
  versionNumber,
  category,
  confidence,
  reason,
  model,
}) {
  await pool.query(
    "INSERT INTO document_classifications " +
      "(document_id, version_number, category, confidence, reason, model, classified_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) " +
      "ON DUPLICATE KEY UPDATE " +
      "category = VALUES(category), " +
      "confidence = VALUES(confidence), " +
      "reason = VALUES(reason), " +
      "model = VALUES(model), " +
      "classified_at = CURRENT_TIMESTAMP",
    [documentId, versionNumber, category, confidence, reason, model]
  );
}

/**
 * Map a Gemini classification result onto an exact (documentId, versionNumber)
 * so the persisted row can never drift to another version. Pure and never
 * throws. Values are defensively defaulted, but the caller is expected to have
 * already whitelisted/normalized the category and confidence.
 *
 * @param {number|string} documentId
 * @param {number|string} versionNumber
 * @param {{category?:string, confidence?:number, reason?:string, model?:string}|null} classification
 * @returns {{
 *   documentId:number,
 *   versionNumber:number|null,
 *   category:string,
 *   confidence:number,
 *   reason:string,
 *   model:string
 * }}
 */
function mapClassificationToVersion(documentId, versionNumber, classification) {
  const version = Number(versionNumber);
  const confidence = Number(classification && classification.confidence);
  return {
    documentId: Number(documentId),
    versionNumber: Number.isInteger(version) && version >= 1 ? version : null,
    category:
      classification &&
      typeof classification.category === "string" &&
      classification.category.trim() !== ""
        ? classification.category
        : "Other",
    confidence:
      Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
    reason:
      classification && typeof classification.reason === "string"
        ? classification.reason
        : "",
    model:
      classification && typeof classification.model === "string"
        ? classification.model
        : "",
  };
}

module.exports = {
  findDocumentClassification,
  upsertDocumentClassification,
  mapClassificationToVersion,
};