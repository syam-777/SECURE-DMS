const {
  findCaseById,
  findAssignmentsByCase,
} = require("./caseModel");
const {
  findAllDocuments,
  findVersionsByDocument,
} = require("./documentModel");
const {
  findCaseReviews,
  findAuditEventsForCase,
  findAuditEventsForDocument,
  deriveVersionIntegrity,
} = require("./chainOfCustodyModel");

/**
 * Case Intelligence model — assembles a consolidated, read-only view of a
 * single case by composing the existing case, document, review and audit
 * queries. No new tables are required: everything a "case intelligence"
 * dashboard needs is already represented by:
 *
 *   cases              -> case profile + status + priority
 *   case_assignments   -> officers assigned to the case
 *   documents          -> evidence attached to the case
 *   document_versions  -> immutable versions + checksums per document
 *   case_reviews       -> reviewer decisions on the case
 *   audit_logs         -> security-relevant events (incl. ledger blocks),
 *                         both case-scoped and document-scoped
 *
 * This is deliberately NOT a duplicate chain-of-custody payload: per-
 * document custody trails stay on the existing document chain-of-custody
 * endpoint. This model only summarises them (version count + integrity
 * status) so the case-level dashboard stays lightweight.
 *
 * All queries are read-only and parameterized. Nothing here returns
 * file_path, stored_file_name, password hashes, tokens, or secrets.
 * Audit `details` are returned raw; the controller sanitizes them with
 * safeAuditDetails before exposing them.
 */

const MAX_ACTIVITY_EVENTS = 100;
const MAX_REVIEW_HISTORY = 20;

/**
 * Build the intelligence payload for a single case.
 * @param {number|string} caseId
 * @param {object} [exec] - pool or a transactional connection (tests).
 * @returns {Promise<object|null>} null when the case does not exist
 */
async function buildCaseIntelligence(caseId, exec) {
  const caseRow = await findCaseById(caseId, exec);
  if (!caseRow) {
    return null;
  }

  const [assignments, documentsData, caseReviews] = await Promise.all([
    findAssignmentsByCase(caseId, exec),
    findAllDocuments(
      { caseId, page: 1, limit: 100, sort: "created_at", order: "desc" },
      exec
    ),
    findCaseReviews(caseId, exec),
  ]);

  const documents = documentsData.documents || [];

  // Per-document versions + audit events (for integrity derivation) run in
  // parallel. A case carries few documents, so per-document queries are fine.
  const documentDetails = await Promise.all(
    documents.map(async (doc) => {
      const [versions, auditEvents] = await Promise.all([
        findVersionsByDocument(doc.id, exec),
        findAuditEventsForDocument(doc.id, exec),
      ]);
      return { doc, versions, auditEvents };
    })
  );

  const docEntries = documentDetails.map(({ doc, versions, auditEvents }) => {
    // findVersionsByDocument returns newest-first; reverse into chronological.
    const chronological = versions.slice().reverse();

    const versionHistory = chronological.map((version) => {
      const integrity = deriveVersionIntegrity(auditEvents, version.version_number);
      return {
        versionNumber: Number(version.version_number),
        originalFileName: version.original_file_name,
        mimeType: version.mime_type,
        fileSize: version.file_size != null ? Number(version.file_size) : null,
        checksum: version.checksum || null,
        uploadedBy: version.uploaded_by,
        uploaderUsername: version.uploader_username || null,
        uploaderName: version.uploader_name || null,
        createdAt: version.created_at,
        integrity,
      };
    });

    const integrity = versionHistory.reduce(
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
        id: doc.id,
        caseId: doc.case_id,
        title: doc.title,
        description: doc.description,
        documentType: doc.document_type,
        status: doc.status,
        currentVersion: Number(doc.current_version),
        uploadedBy: doc.uploaded_by,
        uploaderUsername: doc.uploader_username || null,
        uploaderName: doc.uploader_name || null,
        createdAt: doc.created_at,
        updatedAt: doc.updated_at,
        versionsCount: versionHistory.length,
      },
      versions: versionHistory,
      integrity,
    };
  });

  // Review summary: newest decision first.
  const reviewHistory = caseReviews
    .slice()
    .reverse()
    .slice(0, MAX_REVIEW_HISTORY)
    .map((review) => ({
      action: review.action,
      reviewerId: review.reviewer_id,
      reviewerUsername: review.reviewer_username || null,
      reviewerName: review.reviewer_name || null,
      reviewNote: review.review_note || null,
      createdAt: review.created_at,
    }));

  // Activity timeline: case-scoped events merged with each document's
  // events, newest first. Review decisions are already mirrored as
  // CASE_REVIEW_* audit events, so no extra duplication here.
  const caseAuditEvents = await findAuditEventsForCase(caseId, exec);

  const mergedEvents = [];
  for (const event of caseAuditEvents) {
    mergedEvents.push({ ...event, scope: "case" });
  }
  for (const { doc, auditEvents } of documentDetails) {
    for (const event of auditEvents) {
      mergedEvents.push({
        ...event,
        scope: "document",
        documentId: doc.id,
        documentTitle: doc.title,
      });
    }
  }
  mergedEvents.sort(
    (a, b) =>
      new Date(b.created_at) - new Date(a.created_at) || b.id - a.id
  );

  const activity = mergedEvents.slice(0, MAX_ACTIVITY_EVENTS).map((event) => ({
    id: event.id,
    scope: event.scope,
    userId: event.user_id,
    userUsername: event.user_username || null,
    userName: event.user_name || null,
    action: event.action,
    resourceType: event.resource_type,
    resourceId: event.resource_id,
    documentId: event.documentId != null ? event.documentId : null,
    documentTitle: event.documentTitle != null ? event.documentTitle : null,
    details: event.details,
    createdAt: event.created_at,
  }));

  const integrityTotals = docEntries.reduce(
    (acc, entry) => {
      acc.totalDocuments += 1;
      acc.versions += entry.versions.length;
      acc.verified += entry.integrity.verified;
      acc.failed += entry.integrity.failed;
      acc.notVerified += entry.integrity.notVerified;
      return acc;
    },
    { totalDocuments: 0, versions: 0, verified: 0, failed: 0, notVerified: 0 }
  );

  return {
    case: caseRow,
    assignments,
    documents: docEntries,
    review: {
      status: caseRow.status,
      totalReviews: caseReviews.length,
      lastReview: reviewHistory[0] || null,
      history: reviewHistory,
    },
    activity,
    activityCount: mergedEvents.length,
    integrity: {
      ...integrityTotals,
      checked: integrityTotals.verified + integrityTotals.failed,
    },
  };
}

module.exports = {
  buildCaseIntelligence,
  MAX_ACTIVITY_EVENTS,
  MAX_REVIEW_HISTORY,
};