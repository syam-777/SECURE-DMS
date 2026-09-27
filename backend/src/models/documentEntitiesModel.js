const { pool } = require("../config/database");

const ENTITIES_SELECT_COLUMNS =
  "id, document_id, version_number, entities, model, extracted_at, created_at";

/**
 * Retrieve the stored AI-extracted entities for an exact document version.
 * Extraction is explicitly tied to (document_id, version_number) so a
 * version can never be confused with the document's current version.
 * The stored JSON column is parsed back to an object ([] when empty).
 *
 * @param {number|string} documentId
 * @param {number|string} versionNumber
 * @returns {Promise<object|null>}
 */
async function findDocumentEntities(documentId, versionNumber) {
  const [rows] = await pool.query(
    "SELECT " +
      ENTITIES_SELECT_COLUMNS +
      " FROM document_entities " +
      "WHERE document_id = ? AND version_number = ? LIMIT 1",
    [documentId, versionNumber]
  );
  const row = rows[0] || null;
  if (!row) {
    return null;
  }
  let entities = {};
  try {
    const parsed =
      typeof row.entities === "string" ? JSON.parse(row.entities) : row.entities;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      entities = parsed;
    }
  } catch {
    entities = {};
  }
  return { ...row, entities };
}

/**
 * Insert or update an AI entity-extraction result for an exact document
 * version. Uses INSERT ... ON DUPLICATE KEY UPDATE so re-extracting the
 * same version is idempotent (UNIQUE(document_id, version_number)); the
 * original created_at is preserved while extracted_at is refreshed to the
 * latest extraction event.
 *
 * @param {{
 *   documentId: number,
 *   versionNumber: number,
 *   entities: object,
 *   model: string
 * }} data
 * @returns {Promise<void>}
 */
async function upsertDocumentEntities({
  documentId,
  versionNumber,
  entities,
  model,
}) {
  await pool.query(
    "INSERT INTO document_entities " +
      "(document_id, version_number, entities, model, extracted_at) " +
      "VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) " +
      "ON DUPLICATE KEY UPDATE " +
      "entities = VALUES(entities), " +
      "model = VALUES(model), " +
      "extracted_at = CURRENT_TIMESTAMP",
    [documentId, versionNumber, JSON.stringify(entities), model]
  );
}

/**
 * Map a Gemini entity-extraction result onto an exact (documentId,
 * versionNumber) so the persisted row can never drift to another version.
 * Pure and never throws. Values are defensively defaulted, but the caller
 * is expected to have already whitelisted/bounded the entities.
 *
 * @param {number|string} documentId
 * @param {number|string} versionNumber
 * @param {{entities?:object, model?:string}|null} result
 * @returns {{
 *   documentId:number,
 *   versionNumber:number|null,
 *   entities:object,
 *   model:string
 * }}
 */
function mapEntitiesToVersion(documentId, versionNumber, result) {
  const version = Number(versionNumber);
  const entities =
    result &&
    result.entities &&
    typeof result.entities === "object" &&
    !Array.isArray(result.entities)
      ? result.entities
      : {};
  return {
    documentId: Number(documentId),
    versionNumber: Number.isInteger(version) && version >= 1 ? version : null,
    entities,
    model: result && typeof result.model === "string" ? result.model : "",
  };
}

module.exports = {
  findDocumentEntities,
  upsertDocumentEntities,
  mapEntitiesToVersion,
};