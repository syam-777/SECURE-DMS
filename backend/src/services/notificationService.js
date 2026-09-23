const {
  createNotification,
  createNotificationsForUsers,
} = require("../models/notificationModel");

/**
 * Secure DMS — Notification Creation Service
 *
 * Best-effort notification helpers invoked by business controllers AFTER
 * the primary operation has succeeded/committed. Notification creation
 * must NEVER break the main business operation:
 *   - failures are caught and logged with a generic message
 *   - failures are never re-thrown into the caller
 *   - nothing here rolls back an already-successful transaction
 *
 * Every helper accepts an optional trailing `exec` (a database pool or
 * transactional connection). Production controllers omit it, so the
 * application pool is used. Tests pass the isolated test-database pool so
 * nothing ever touches the application database.
 *
 * SAFETY: messages are templated and contain only safe metadata
 * (case numbers, document titles, version numbers). Never passwords,
 * JWTs, API keys, signing keys, B2/S3 info, file paths, checksums, raw
 * document content, sensitive personal data, or raw review free-text.
 */

const NOTIFICATION_TYPES = {
  CASE_ASSIGNED: "CASE_ASSIGNED",
  CASE_SUBMITTED_FOR_REVIEW: "CASE_SUBMITTED_FOR_REVIEW",
  CASE_APPROVED: "CASE_APPROVED",
  CASE_REJECTED: "CASE_REJECTED",
  CASE_RETURNED: "CASE_RETURNED",
  DOCUMENT_UPLOADED: "DOCUMENT_UPLOADED",
  DOCUMENT_VERSION_CREATED: "DOCUMENT_VERSION_CREATED",
  INTEGRITY_CHECK_FAILED: "INTEGRITY_CHECK_FAILED",
  DOCUMENT_REVIEW_APPROVED: "DOCUMENT_REVIEW_APPROVED",
  DOCUMENT_REVIEW_REJECTED: "DOCUMENT_REVIEW_REJECTED",
  DOCUMENT_REVIEW_RETURNED: "DOCUMENT_REVIEW_RETURNED",
};

/**
 * Deduplicate and keep only positive numeric ids. Used before any
 * recipient fan-out so one user never receives duplicate rows for the
 * same event.
 */
function uniquePositiveIds(ids) {
  const seen = new Set();
  const out = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    const num = Number(id);
    if (Number.isInteger(num) && num >= 1 && !seen.has(num)) {
      seen.add(num);
      out.push(num);
    }
  }
  return out;
}

/** Single-notification create that never throws. */
async function safeCreate(notification, exec) {
  try {
    if (!notification || notification.userId == null) {
      return null;
    }
    return await createNotification(notification, exec);
  } catch (err) {
    console.error("Notification create failed (notification omitted)");
    return null;
  }
}

/** Batch-notification create that never throws. */
async function safeCreateMany(notifications, exec) {
  try {
    if (!Array.isArray(notifications) || notifications.length === 0) {
      return { created: 0 };
    }
    return await createNotificationsForUsers(notifications, exec);
  } catch (err) {
    console.error("Notification create failed (notification omitted)");
    return { created: 0 };
  }
}

/**
 * Notify the officer a case was (re)assigned to.
 * @param {{ userId: number, caseId: number, caseNumber: string, caseTitle?: string|null, reassigned?: boolean }} params
 * @param {object} [exec] - pool or a transactional connection (tests).
 */
async function notifyCaseAssigned(
  { userId, caseId, caseNumber, caseTitle = null, reassigned = false },
  exec
) {
  if (userId == null) {
    return null;
  }
  const message = reassigned
    ? `Case ${caseNumber} has been reassigned to you.`
    : `You have been assigned to case ${caseNumber}.`;
  return safeCreate(
    {
      userId,
      type: NOTIFICATION_TYPES.CASE_ASSIGNED,
      title: reassigned ? "Case Reassigned" : "Case Assigned",
      message,
      caseId: caseId != null ? Number(caseId) : null,
    },
    exec
  );
}

/**
 * Notify every active REVIEWER (fan-out: one row per reviewer) that a
 * case was submitted for review. Duplicate reviewer ids are collapsed.
 * @param {{ reviewerIds: number[], caseId: number, caseNumber: string }} params
 * @param {object} [exec] - pool or a transactional connection (tests).
 */
async function notifyCaseSubmittedForReview(
  { reviewerIds = [], caseId, caseNumber },
  exec
) {
  const userIds = uniquePositiveIds(reviewerIds);
  if (userIds.length === 0) {
    return { created: 0 };
  }
  const notifications = userIds.map((userId) => ({
    userId,
    type: NOTIFICATION_TYPES.CASE_SUBMITTED_FOR_REVIEW,
    title: "Case Submitted for Review",
    message: `Case ${caseNumber} was submitted for review.`,
    caseId: caseId != null ? Number(caseId) : null,
  }));
  return safeCreateMany(notifications, exec);
}

/** Notify a case's assigned officer that the case was approved. */
async function notifyCaseApproved({ userId, caseId, caseNumber }, exec) {
  if (userId == null) {
    return null;
  }
  return safeCreate(
    {
      userId,
      type: NOTIFICATION_TYPES.CASE_APPROVED,
      title: "Case Approved",
      message: `Case ${caseNumber} was approved.`,
      caseId: caseId != null ? Number(caseId) : null,
    },
    exec
  );
}

/** Notify a case's assigned officer that the case was rejected. */
async function notifyCaseRejected({ userId, caseId, caseNumber }, exec) {
  if (userId == null) {
    return null;
  }
  return safeCreate(
    {
      userId,
      type: NOTIFICATION_TYPES.CASE_REJECTED,
      title: "Case Rejected",
      message: `Case ${caseNumber} was rejected.`,
      caseId: caseId != null ? Number(caseId) : null,
    },
    exec
  );
}

/** Notify a case's assigned officer that the case was returned. */
async function notifyCaseReturned({ userId, caseId, caseNumber }, exec) {
  if (userId == null) {
    return null;
  }
  return safeCreate(
    {
      userId,
      type: NOTIFICATION_TYPES.CASE_RETURNED,
      title: "Case Returned",
      message: `Case ${caseNumber} was returned for revision.`,
      caseId: caseId != null ? Number(caseId) : null,
    },
    exec
  );
}

/**
 * Notify that a document was uploaded (typically the case's assigned
 * officer, when the uploader is a different user).
 */
async function notifyDocumentUploaded(
  { userId, caseId, caseNumber = null, documentId, documentTitle },
  exec
) {
  if (userId == null) {
    return null;
  }
  const scope = caseNumber ? ` to case ${caseNumber}` : "";
  return safeCreate(
    {
      userId,
      type: NOTIFICATION_TYPES.DOCUMENT_UPLOADED,
      title: "Document Uploaded",
      message: `"${documentTitle}" was uploaded${scope}.`,
      caseId: caseId != null ? Number(caseId) : null,
      documentId: documentId != null ? Number(documentId) : null,
    },
    exec
  );
}

/** Notify that a new version of a document was created. */
async function notifyDocumentVersionCreated(
  { userId, caseId, caseNumber = null, documentId, documentTitle, versionNumber },
  exec
) {
  if (userId == null) {
    return null;
  }
  const scope = caseNumber ? ` in case ${caseNumber}` : "";
  return safeCreate(
    {
      userId,
      type: NOTIFICATION_TYPES.DOCUMENT_VERSION_CREATED,
      title: "New Document Version",
      message: `A new version (v${versionNumber}) was added to "${documentTitle}"${scope}.`,
      caseId: caseId != null ? Number(caseId) : null,
      documentId: documentId != null ? Number(documentId) : null,
    },
    exec
  );
}

/**
 * Notify that an integrity verification FAILED. Never includes the
 * expected/calculated checksum — only the document title + version.
 */
async function notifyIntegrityFailure(
  { userId, caseId, caseNumber = null, documentId, documentTitle, versionNumber },
  exec
) {
  if (userId == null) {
    return null;
  }
  const scope = caseNumber ? ` in case ${caseNumber}` : "";
  return safeCreate(
    {
      userId,
      type: NOTIFICATION_TYPES.INTEGRITY_CHECK_FAILED,
      title: "Integrity Check Failed",
      message: `Integrity verification failed for "${documentTitle}" (version ${versionNumber})${scope}.`,
      caseId: caseId != null ? Number(caseId) : null,
      documentId: documentId != null ? Number(documentId) : null,
    },
    exec
  );
}

/** Notify a document's owner that the document review was approved. */
async function notifyDocumentReviewApproved(
  { userId, caseId, documentId, documentTitle },
  exec
) {
  if (userId == null) {
    return null;
  }
  return safeCreate(
    {
      userId,
      type: NOTIFICATION_TYPES.DOCUMENT_REVIEW_APPROVED,
      title: "Document Approved",
      message: `"${documentTitle}" was approved by review.`,
      caseId: caseId != null ? Number(caseId) : null,
      documentId: documentId != null ? Number(documentId) : null,
    },
    exec
  );
}

/** Notify a document's owner that the document review was rejected. */
async function notifyDocumentReviewRejected(
  { userId, caseId, documentId, documentTitle },
  exec
) {
  if (userId == null) {
    return null;
  }
  return safeCreate(
    {
      userId,
      type: NOTIFICATION_TYPES.DOCUMENT_REVIEW_REJECTED,
      title: "Document Rejected",
      message: `"${documentTitle}" was rejected by review.`,
      caseId: caseId != null ? Number(caseId) : null,
      documentId: documentId != null ? Number(documentId) : null,
    },
    exec
  );
}

/** Notify a document's owner that the document review was returned. */
async function notifyDocumentReviewReturned(
  { userId, caseId, documentId, documentTitle },
  exec
) {
  if (userId == null) {
    return null;
  }
  return safeCreate(
    {
      userId,
      type: NOTIFICATION_TYPES.DOCUMENT_REVIEW_RETURNED,
      title: "Document Returned for Revision",
      message: `"${documentTitle}" was returned for revision.`,
      caseId: caseId != null ? Number(caseId) : null,
      documentId: documentId != null ? Number(documentId) : null,
    },
    exec
  );
}

module.exports = {
  NOTIFICATION_TYPES,
  uniquePositiveIds,
  safeCreate,
  safeCreateMany,
  notifyCaseAssigned,
  notifyCaseSubmittedForReview,
  notifyCaseApproved,
  notifyCaseRejected,
  notifyCaseReturned,
  notifyDocumentUploaded,
  notifyDocumentVersionCreated,
  notifyIntegrityFailure,
  notifyDocumentReviewApproved,
  notifyDocumentReviewRejected,
  notifyDocumentReviewReturned,
};