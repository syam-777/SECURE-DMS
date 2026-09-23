const { pool } = require("../config/database");
const {
  findDocumentById,
  findVersionsByDocument,
} = require("./documentModel");
const {
  verifyApprovalSignature,
} = require("../services/approvalSignatureService");

/**
 * Chain of Custody model — assembles the complete, chronological custody
 * trail for a document by reusing the existing document-version, review
 * and audit-log tables. No new tables are required: a document's history
 * is already represented by:
 *
 *   document_versions  -> who/when/checksum for each immutable version
 *   document_reviews   -> reviewer actions on the document
 *   case_reviews       -> reviewer decisions on the document's case
 *   audit_logs         -> security-relevant events (incl. ledger blocks),
 *                         both document-scoped and case-scoped
 *
 * For a document attached to a case, the case-level audit/review events
 * are merged into the same payload and sorted chronologically so the
 * custody trail also reflects the case workflow (submitted for review,
 * approved / rejected / returned, status changes, assignments).
 *
 * All queries are read-only and parameterized. Nothing here returns
 * file_path, stored_file_name, password hashes, tokens, or secrets.
 */

/**
 * Returns the reviews recorded for a document, oldest first.
 * @param {number|string} documentId
 * @param {object} [exec] - pool or a transactional connection (tests).
 * @returns {Promise<object[]>}
 */
async function findDocumentReviews(documentId, exec) {
  const executor = exec || pool;
  const [rows] = await executor.query(
    "SELECT dr.id, dr.document_id, dr.reviewer_id, " +
      "dr.action, dr.review_note, dr.created_at, " +
      "u.username AS reviewer_username, u.full_name AS reviewer_name " +
      "FROM document_reviews dr " +
      "LEFT JOIN users u ON u.id = dr.reviewer_id " +
      "WHERE dr.document_id = ? " +
      "ORDER BY dr.created_at ASC, dr.id ASC",
    [documentId]
  );
  return rows;
}

/**
 * Returns the audit events recorded against a document, oldest first.
 * The `details` JSON is returned raw here; callers must sanitize it
 * before exposing it (see safeAuditDetails in auditController).
 * @param {number|string} documentId
 * @param {object} [exec] - pool or a transactional connection (tests).
 * @returns {Promise<object[]>}
 */
async function findAuditEventsForDocument(documentId, exec) {
  const executor = exec || pool;
  const [rows] = await executor.query(
    "SELECT a.id, a.user_id, a.action, a.resource_type, a.resource_id, " +
      "a.details, a.created_at, " +
      "u.username AS user_username, u.full_name AS user_name " +
      "FROM audit_logs a " +
      "LEFT JOIN users u ON u.id = a.user_id " +
      "WHERE a.resource_type = 'document' AND a.resource_id = ? " +
      "ORDER BY a.created_at ASC, a.id ASC",
    [documentId]
  );
  return rows;
}

/**
 * Returns the reviews recorded against a case (case_reviews), oldest
 * first, joined with the reviewer's username/full name. Used to surface a
 * document's case-level review decisions (approved/rejected/returned) in
 * its custody trail.
 * @param {number|string} caseId
 * @param {object} [exec] - pool or a transactional connection (tests).
 * @returns {Promise<object[]>}
 */
async function findCaseReviews(caseId, exec) {
  const executor = exec || pool;
  const [rows] = await executor.query(
    "SELECT cr.id, cr.case_id, cr.reviewer_id, " +
      "cr.action, cr.review_note, cr.created_at, " +
      "u.username AS reviewer_username, u.full_name AS reviewer_name, " +
      "asr.algorithm AS sig_algorithm, asr.key_id AS sig_key_id, " +
      "asr.signed_at AS sig_signed_at, asr.payload AS sig_payload, " +
      "asr.signature AS sig_signature " +
      "FROM case_reviews cr " +
      "LEFT JOIN users u ON u.id = cr.reviewer_id " +
      "LEFT JOIN approval_signatures asr ON asr.review_id = cr.id " +
      "WHERE cr.case_id = ? " +
      "ORDER BY cr.created_at ASC, cr.id ASC",
    [caseId]
  );
  return rows;
}

/**
 * Returns the audit events recorded against a case, oldest first. Uses the
 * same sanitized projection as findAuditEventsForDocument (no ip_address /
 * user_agent, no storage paths); `details` is left raw for the controller.
 * @param {number|string} caseId
 * @param {object} [exec] - pool or a transactional connection (tests).
 * @returns {Promise<object[]>}
 */
async function findAuditEventsForCase(caseId, exec) {
  const executor = exec || pool;
  const [rows] = await executor.query(
    "SELECT a.id, a.user_id, a.action, a.resource_type, a.resource_id, " +
      "a.details, a.created_at, " +
      "u.username AS user_username, u.full_name AS user_name " +
      "FROM audit_logs a " +
      "LEFT JOIN users u ON u.id = a.user_id " +
      "WHERE a.resource_type = 'case' AND a.resource_id = ? " +
      "ORDER BY a.created_at ASC, a.id ASC",
    [caseId]
  );
  return rows;
}

/**
 * Derives the last recorded integrity-check result for a version from the
 * stored VERSION_INTEGRITY_VERIFIED audit events. This NEVER claims a file
 * is tamper-proof: it only reports the outcome of the last real check that
 * ran through the existing verify endpoint.
 *
 * @param {object[]} auditEvents all document audit events (oldest first)
 * @param {number} versionNumber
 * @returns {{ status: string, checkedAt: string|null }}
 *   status is one of "verified", "integrity_failure", or "not_verified".
 *   A "verification_error" is only knowable live (the verify endpoint
 *   returns an error when the physical file cannot be read).
 */
function deriveVersionIntegrity(auditEvents, versionNumber) {
  let lastCheck = null;
  for (const event of auditEvents) {
    if (event.action !== "VERSION_INTEGRITY_VERIFIED") {
      continue;
    }
    const details = event.details || {};
    if (Number(details.versionNumber) !== Number(versionNumber)) {
      continue;
    }
    lastCheck = {
      integrityValid: details.integrityValid === true,
      checkedAt: event.created_at,
    };
  }

  if (!lastCheck) {
    return { status: "not_verified", checkedAt: null };
  }
  return {
    status: lastCheck.integrityValid ? "verified" : "integrity_failure",
    checkedAt: lastCheck.checkedAt,
  };
}

/**
 * Assembles the full chain-of-custody payload for a document. Read-only.
 *
 * @param {number|string} documentId
 * @param {object} [exec] - pool or a transactional connection (tests).
 * @returns {Promise<{
 *   document: object|null,
 *   case: object|null,
 *   versions: object[],
 *   reviews: object[],
 *   auditEvents: object[],
 *   summary: object
 * }>}
 */
async function buildChainOfCustody(documentId, exec) {
  const executor = exec || pool;

  const document = await findDocumentById(documentId, executor);
  if (!document) {
    return null;
  }

  let caseRow = null;
  if (document.case_id != null) {
    const [caseRows] = await executor.query(
      "SELECT id, case_number FROM cases WHERE id = ? LIMIT 1",
      [document.case_id]
    );
    caseRow = caseRows[0] || null;
  }

  // Newest-first from the shared helper; reverse into chronological order.
  const versions = (await findVersionsByDocument(documentId, executor)).reverse();

  // When the document belongs to a case, also pull that case's review
  // decisions (case_reviews) and its audit trail (audit_logs scoped to the
  // case). Documents without a case resolve to empty arrays.
  const [reviews, auditEvents, caseReviews, caseAuditEvents] =
    await Promise.all([
      findDocumentReviews(documentId, executor),
      findAuditEventsForDocument(documentId, executor),
      document.case_id != null
        ? findCaseReviews(document.case_id, executor)
        : Promise.resolve([]),
      document.case_id != null
        ? findAuditEventsForCase(document.case_id, executor)
        : Promise.resolve([]),
    ]);

  const versionHistory = versions.map((version) => ({
    id: version.id,
    versionNumber: Number(version.version_number),
    originalFileName: version.original_file_name,
    mimeType: version.mime_type,
    fileSize: version.file_size != null ? Number(version.file_size) : null,
    checksum: version.checksum || null,
    uploadedBy: version.uploaded_by,
    uploaderUsername: version.uploader_username || null,
    uploaderName: version.uploader_name || null,
    createdAt: version.created_at,
    integrity: deriveVersionIntegrity(auditEvents, version.version_number),
  }));

  const reviewHistory = reviews.map((review) => ({
    id: review.id,
    scope: "document",
    reviewerId: review.reviewer_id,
    reviewerUsername: review.reviewer_username || null,
    reviewerName: review.reviewer_name || null,
    action: review.action,
    reviewNote: review.review_note || null,
    createdAt: review.created_at,
  }));

  const caseReviewHistory = caseReviews.map((review) => ({
    id: review.id,
    scope: "case",
    reviewerId: review.reviewer_id,
    reviewerUsername: review.reviewer_username || null,
    reviewerName: review.reviewer_name || null,
    action: review.action,
    reviewNote: review.review_note || null,
    createdAt: review.created_at,
    signature:
      review.sig_signature != null && review.sig_payload != null
        ? {
            exists: true,
            valid: verifyApprovalSignature(
              review.sig_payload,
              review.sig_signature
            ),
            algorithm: review.sig_algorithm || null,
            keyId: review.sig_key_id || null,
            signedAt: review.sig_signed_at
              ? new Date(review.sig_signed_at).toISOString()
              : null,
          }
        : {
            exists: false,
            valid: null,
            algorithm: null,
            keyId: null,
            signedAt: null,
          },
  }));

  const auditHistory = auditEvents.map((event) => ({
    id: event.id,
    scope: "document",
    userId: event.user_id,
    userUsername: event.user_username || null,
    userName: event.user_name || null,
    action: event.action,
    resourceType: event.resource_type,
    resourceId: event.resource_id,
    createdAt: event.created_at,
    details: event.details,
  }));

  const caseAuditHistory = caseAuditEvents.map((event) => ({
    id: event.id,
    scope: "case",
    userId: event.user_id,
    userUsername: event.user_username || null,
    userName: event.user_name || null,
    action: event.action,
    resourceType: event.resource_type,
    resourceId: event.resource_id,
    createdAt: event.created_at,
    details: event.details,
  }));

  // Merge the document and case audit events into one chronological stream.
  const mergedAuditHistory = [...auditHistory, ...caseAuditHistory].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at) || a.id - b.id
  );

  const integrityCounts = versionHistory.reduce(
    (acc, version) => {
      if (version.integrity.status === "verified") {
        acc.verified += 1;
      } else if (version.integrity.status === "integrity_failure") {
        acc.failed += 1;
      } else {
        acc.notVerified += 1;
      }
      return acc;
    },
    { verified: 0, failed: 0, notVerified: 0 }
  );

  return {
    document: {
      id: document.id,
      caseId: document.case_id,
      title: document.title,
      description: document.description,
      documentType: document.document_type,
      status: document.status,
      currentVersion: Number(document.current_version),
      uploadedBy: document.uploaded_by,
      uploaderUsername: document.uploader_username || null,
      uploaderName: document.uploader_name || null,
      createdAt: document.created_at,
      updatedAt: document.updated_at,
    },
    case: caseRow
      ? { id: caseRow.id, caseNumber: caseRow.case_number }
      : null,
    versions: versionHistory,
    reviews: reviewHistory,
    caseReviews: caseReviewHistory,
    auditEvents: mergedAuditHistory,
    summary: {
      totalVersions: versionHistory.length,
      currentVersion: Number(document.current_version),
      totalReviews: reviewHistory.length,
      totalCaseReviews: caseReviewHistory.length,
      totalAuditEvents: mergedAuditHistory.length,
      integrity: integrityCounts,
    },
  };
}

module.exports = {
  findDocumentReviews,
  findAuditEventsForDocument,
  findCaseReviews,
  findAuditEventsForCase,
  deriveVersionIntegrity,
  buildChainOfCustody,
};