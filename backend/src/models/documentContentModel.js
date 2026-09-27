const { pool } = require("../config/database");

/**
 * Upsert extracted content for a specific document version.
 * Uses INSERT ... ON DUPLICATE KEY UPDATE so repeated indexing
 * is idempotent.
 *
 * @param {{
 *   documentId: number,
 *   versionNumber: number,
 *   extractedText: string|null,
 *   extractionMethod: string|null,
 *   isOcr: boolean
 * }} data
 * @returns {Promise<void>}
 */
async function upsertDocumentContent({
  documentId,
  versionNumber,
  extractedText,
  extractionMethod,
  isOcr,
}) {
  await pool.query(
    "INSERT INTO document_contents " +
      "(document_id, version_number, extracted_text, extraction_method, is_ocr) " +
      "VALUES (?, ?, ?, ?, ?) " +
      "ON DUPLICATE KEY UPDATE " +
      "extracted_text = VALUES(extracted_text), " +
      "extraction_method = VALUES(extraction_method), " +
      "is_ocr = VALUES(is_ocr), " +
      "updated_at = CURRENT_TIMESTAMP",
    [
      documentId,
      versionNumber,
      extractedText != null ? extractedText : null,
      extractionMethod != null ? extractionMethod : null,
      isOcr ? 1 : 0,
    ]
  );
}

/**
 * Retrieve stored extracted content for a document version.
 *
 * @param {number} documentId
 * @param {number} versionNumber
 * @returns {Promise<object|null>}
 */
async function findDocumentContentByDocAndVersion(documentId, versionNumber) {
  const [rows] = await pool.query(
    "SELECT id, document_id, version_number, extracted_text, " +
      "extraction_method, is_ocr, created_at, updated_at " +
      "FROM document_contents " +
      "WHERE document_id = ? AND version_number = ? LIMIT 1",
    [documentId, versionNumber]
  );
  return rows[0] || null;
}

module.exports = {
  upsertDocumentContent,
  findDocumentContentByDocAndVersion,
};
