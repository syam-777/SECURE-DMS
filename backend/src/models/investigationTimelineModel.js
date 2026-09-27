const { findCaseById } = require("./caseModel");
const { findAllDocuments } = require("./documentModel");
const {
  findCaseReviews,
  findAuditEventsForCase,
  findAuditEventsForDocument,
} = require("./chainOfCustodyModel");
const {
  verifyApprovalSignature,
} = require("../services/approvalSignatureService");

/**
 * Investigation Timeline model — builds a concise, chronological view of
 * every meaningful milestone in a case by COMPOSING the existing case,
 * document, review, and audit records. No new tables are used:
 *
 *   cases                -> the case profile + creation fallback
 *   case_assignments     -> "officer assigned / reassigned / unassigned"
 *   documents            -> document titles for the evidence timeline
 *   document_versions    -> version numbers for upload/version events
 *   case_reviews         -> review decisions (with approval signatures)
 *   audit_logs           -> case-scoped + document-scoped milestone events
 *   approval_signatures  -> safe digital-signature metadata (read-only)
 *
 * This is deliberately NOT a duplicate of Chain of Custody (the per-
 * document custody trail) or Case Intelligence (the overview). It is the
 * judge-facing case chronology: newest first, one normalized event per
 * milestone, with only safe metadata.
 *
 * Every query is read-only and parameterized. Events never contain
 * password hashes, tokens, credentials, storage paths, checksums,
 * canonical payloads, or any key material. The digital-approval signature
 * is re-verified locally and only its safe metadata is exposed.
 */

/**
 * Curated set of case-scoped audit milestones that belong on the
 * investigation chronology. CASE_REVIEW_* decisions are intentionally NOT
 * here: they are produced from case_reviews (which also carry the approval
 * signature metadata), so the timeline never duplicates them or invents a
 * signature audit event.
 */
const CASE_AUDIT_ACTIONS = new Set([
  "CASE_CREATED",
  "CASE_ASSIGNED",
  "CASE_REASSIGNED",
  "CASE_UNASSIGNED",
  "CASE_STATUS_CHANGED",
  "CASE_SUBMITTED_FOR_REVIEW",
  "CASE_UPDATED",
]);

/**
 * Curated set of document-scoped audit milestones. Downloads, AI analysis
 * (summarize/classify/entities), and custody-view events are deliberately
 * excluded: they are operational noise, not investigation milestones.
 */
const DOCUMENT_AUDIT_ACTIONS = new Set([
  "DOCUMENT_CREATED",
  "VERSION_CREATED",
  "VERSION_INTEGRITY_VERIFIED",
  "DOCUMENT_REVIEW_APPROVED",
  "DOCUMENT_REVIEW_REJECTED",
  "DOCUMENT_REVIEW_RETURNED",
  "DOCUMENT_DELETED",
]);

function iso(value) {
  if (value == null) {
    return null;
  }
  const date = new Date(value);
  return isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function actorOf(event) {
  return event.user_username || event.user_name || null;
}

/**
 * Normalize a case-scoped audit event into a timeline event. Only safe
 * fields from `details` are copied into metadata.
 */
function mapCaseAuditEvent(event) {
  const details = event.details || {};
  const type = event.action;
  let title = type;
  const metadata = {};

  switch (type) {
    case "CASE_CREATED":
      title = "Case created";
      metadata.caseNumber = details.caseNumber || null;
      break;
    case "CASE_ASSIGNED":
      title = "Officer assigned";
      metadata.officer = details.targetUserName || null;
      break;
    case "CASE_REASSIGNED":
      title = "Investigating officer reassigned";
      metadata.officer = details.targetUserName || null;
      break;
    case "CASE_UNASSIGNED":
      title = "Officer unassigned";
      metadata.officer = details.targetUserName || null;
      break;
    case "CASE_STATUS_CHANGED":
      title = "Case status changed";
      metadata.previousStatus = details.previousStatus || null;
      metadata.newStatus = details.newStatus || null;
      break;
    case "CASE_SUBMITTED_FOR_REVIEW":
      title = "Case submitted for review";
      break;
    case "CASE_UPDATED":
      title = "Case updated";
      break;
    default:
      return null;
  }

  let description = null;
  if (type === "CASE_STATUS_CHANGED") {
    description =
      metadata.previousStatus && metadata.newStatus
        ? metadata.previousStatus + " \u2192 " + metadata.newStatus
        : null;
  }

  return {
    id: Number(event.id),
    timestamp: iso(event.created_at),
    type,
    title,
    description,
    actor: actorOf(event),
    scope: "case",
    resource: null,
    metadata,
  };
}

/**
 * Normalize a document-scoped audit event. `doc` provides the document
 * identity (id/title) that this timeline attaches to each evidence event.
 */
function mapDocumentAuditEvent(event, doc) {
  const details = event.details || {};
  const type = event.action;
  const resource = {
    documentId: Number(doc.id),
    documentTitle: doc.title,
  };
  const metadata = {};

  let title = type;
  let description = null;

  switch (type) {
    case "DOCUMENT_CREATED":
      title = "Document uploaded";
      break;
    case "VERSION_CREATED":
      title = "Document version created";
      resource.versionNumber =
        details.versionNumber != null ? Number(details.versionNumber) : null;
      break;
    case "VERSION_INTEGRITY_VERIFIED": {
      const integrityValid = details.integrityValid === true;
      title = integrityValid
        ? "Document integrity verified"
        : "Document integrity verification failed";
      description = integrityValid
        ? "SHA-256 checksum matched"
        : "SHA-256 checksum mismatch detected";
      metadata.integrityValid = integrityValid;
      resource.versionNumber =
        details.versionNumber != null ? Number(details.versionNumber) : null;
      break;
    }
    case "DOCUMENT_REVIEW_APPROVED":
      title = "Document review approved";
      metadata.decision = "approved";
      break;
    case "DOCUMENT_REVIEW_REJECTED":
      title = "Document review rejected";
      metadata.decision = "rejected";
      break;
    case "DOCUMENT_REVIEW_RETURNED":
      title = "Document returned for revision";
      metadata.decision = "returned";
      break;
    case "DOCUMENT_DELETED":
      title = "Document deleted";
      break;
    default:
      return null;
  }

  return {
    id: Number(event.id),
    timestamp: iso(event.created_at),
    type,
    title,
    description,
    actor: actorOf(event),
    scope: "document",
    resource,
    metadata,
  };
}

const REVIEW_ACTION_TYPES = {
  approved: "CASE_REVIEW_APPROVED",
  rejected: "CASE_REVIEW_REJECTED",
  returned: "CASE_REVIEW_RETURNED",
};

const REVIEW_ACTION_TITLES = {
  approved: "Case review approved",
  rejected: "Case review rejected",
  returned: "Case returned for revision",
};

/**
 * Normalize a case_reviews row into a timeline event. Reuses the
 * signature columns already joined by chainOfCustodyModel.findCaseReviews
 * and re-verifies the stored approval signature locally. Only safe
 * verification metadata is exposed — never the payload or raw signature.
 */
function mapReviewEvent(review) {
  const type = REVIEW_ACTION_TYPES[review.action] || null;
  if (!type) {
    return null;
  }

  const metadata = {
    decision: review.action,
    reviewNote: review.review_note || null,
  };

  const hasSignature =
    review.sig_signature != null && review.sig_payload != null;
  metadata.signature = hasSignature
    ? {
        exists: true,
        valid: verifyApprovalSignature(
          review.sig_payload,
          review.sig_signature
        ),
        algorithm: review.sig_algorithm || null,
        keyId: review.sig_key_id || null,
        signedAt: iso(review.sig_signed_at),
      }
    : {
        exists: false,
        valid: null,
        algorithm: null,
        keyId: null,
        signedAt: null,
      };

  return {
    id: Number(review.id),
    timestamp: iso(review.created_at),
    type,
    title: REVIEW_ACTION_TITLES[review.action],
    description: null,
    actor: review.reviewer_username || review.reviewer_name || null,
    scope: "case",
    resource: null,
    metadata,
  };
}

/**
 * Build the normalized investigation timeline for a single case.
 * @param {number|string} caseId
 * @param {object} [exec] - pool or a transactional connection (tests).
 * @returns {Promise<object|null>} null when the case does not exist.
 */
async function buildCaseTimeline(caseId, exec) {
  const caseRow = await findCaseById(caseId, exec);
  if (!caseRow) {
    return null;
  }

  const [documentsData, caseAuditEvents, caseReviews] = await Promise.all([
    findAllDocuments(
      { caseId, page: 1, limit: 100, sort: "created_at", order: "desc" },
      exec
    ),
    findAuditEventsForCase(caseId, exec),
    findCaseReviews(caseId, exec),
  ]);

  const documents = (documentsData.documents || []).slice().sort(
    (a, b) => Number(a.id) - Number(b.id)
  );

  const documentDetails = await Promise.all(
    documents.map(async (doc) => ({
      doc,
      events: await findAuditEventsForDocument(doc.id, exec),
    }))
  );

  const events = [];
  let seq = 0;

  for (const event of caseAuditEvents) {
    const mapped = mapCaseAuditEvent(event);
    if (mapped) {
      mapped._seq = seq++;
      events.push(mapped);
    }
  }

  for (const { doc, events: docEvents } of documentDetails) {
    for (const event of docEvents) {
      const mapped = mapDocumentAuditEvent(event, doc);
      if (mapped) {
        mapped._seq = seq++;
        events.push(mapped);
      }
    }
  }

  for (const review of caseReviews) {
    const mapped = mapReviewEvent(review);
    if (mapped) {
      mapped._seq = seq++;
      events.push(mapped);
    }
  }

  // Guarantee the case origin is always visible, even when audit logging
  // never recorded a CASE_CREATED event (e.g. pre-existing records).
  if (!events.some((e) => e.type === "CASE_CREATED")) {
    events.push({
      id: null,
      timestamp: iso(caseRow.created_at),
      type: "CASE_CREATED",
      title: "Case created",
      description: null,
      actor: caseRow.creator_username || caseRow.creator_name || null,
      scope: "case",
      resource: null,
      metadata: { caseNumber: caseRow.case_number },
      _seq: seq++,
    });
  }

  events.sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp) || b._seq - a._seq
  );

  return {
    case: {
      id: Number(caseRow.id),
      caseNumber: caseRow.case_number,
      title: caseRow.title,
    },
    events: events.map(({ _seq, ...event }) => event),
    total: events.length,
  };
}

module.exports = {
  buildCaseTimeline,
  CASE_AUDIT_ACTIONS,
  DOCUMENT_AUDIT_ACTIONS,
};