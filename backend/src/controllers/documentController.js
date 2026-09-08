const { logAuditEvent } = require("../models/auditLogModel");
const { getUserWithRoleAndPermissions } = require("../models/userModel");
const {
  findCaseNumberById,
  findCaseById,
  hasOfficerAssignment,
} = require("../models/caseModel");
const { readDocumentText } = require("../services/documentContentService");
const { extractContentForFile } = require("../services/documentContentService");
const { summarizeText } = require("../services/aiService");
const {
  upsertDocumentContent,
} = require("../models/documentContentModel");
const {
  generateStorageKey,
  sha256Buffer,
  sha256Stream,
  findDocumentById,
  findDocumentVersion,
  findVersionsByDocument,
  findAllDocuments,
  createDocument,
  createVersion,
  softDeleteDocument,
} = require("../models/documentModel");
const {
  uploadObject,
  getObject,
  deleteObject,
  isNotFoundError,
} = require("../services/fileService");

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.expose = true;
  return err;
}

/**
 * Extract content for a document version and persist it to the
 * document_contents table. This is a best-effort background task:
 * failures are logged and NEVER cause a successful document upload or
 * version creation to fail.
 *
 * @param {number} documentId
 * @param {number} versionNumber
 * @param {Buffer} buffer the file bytes (e.g. req.file.buffer)
 * @param {string} mimeType
 * @returns {Promise<void>}
 */
async function indexDocumentContent(documentId, versionNumber, buffer, mimeType) {
  try {
    const { text, extractionMethod, isOcr } = await extractContentForFile(
      buffer,
      mimeType
    );
    await upsertDocumentContent({
      documentId,
      versionNumber,
      extractedText: text,
      extractionMethod,
      isOcr,
    });
  } catch (err) {
    console.error("Content indexing failed for document", documentId, "version", versionNumber);
  }
}

function safeVersion(version) {
  if (!version) return null;
  const { file_path, stored_file_name, ...rest } = version;
  return rest;
}

function contentDispositionHeader(fileName, mode = "attachment") {
  const name = String(fileName || "document");
  const ascii = name.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  return `${mode}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * Stream a private B2 object to an authenticated caller. The object is
 * never exposed to the frontend; the client only receives file bytes
 * with safe HTTP headers.
 */
function respondWithObject(res, stream, { originalFileName, mimeType, fileSize }) {
  res.status(200);
  res.setHeader("Content-Type", mimeType || "application/octet-stream");
  if (Number.isFinite(Number(fileSize)) && Number(fileSize) > 0) {
    res.setHeader("Content-Length", String(fileSize));
  }
  res.setHeader(
    "Content-Disposition",
    contentDispositionHeader(originalFileName)
  );
  stream.once("error", () => {
    if (!res.headersSent) {
      if (!res.destroyed) res.status(500).end();
    } else if (!res.destroyed) {
      res.destroy();
    }
  });
  return stream.pipe(res);
}

/**
 * Resolve the actor's DB role and, for OFFICER, USER and REVIEWER roles,
 * whether the actor may access the given document. ADMIN is always allowed.
 *
 * OFFICER: allowed only for documents of cases they are assigned to, or
 * documents they uploaded themselves.
 * USER: allowed only for documents they uploaded, or documents attached to
 * cases they created.
 * REVIEWER: allowed only for documents belonging to a case whose status is
 * `under_review`. Ownership and assignment are not considered.
 *
 * @param {object} document document row (must include case_id, uploaded_by)
 * @param {number|string} actorId
 * @returns {Promise<object>} the DB actor row
 */
async function assertDocumentAccess(document, actorId) {
  const actor = await getUserWithRoleAndPermissions(actorId);
  if (!actor) {
    throw httpError(401, "Authenticated user no longer exists");
  }
  if (actor.role === "ADMIN") {
    return actor;
  }

  const uid = Number(actorId);

  if (actor.role === "REVIEWER") {
    // A reviewer may access a document only when the case it belongs to is
    // currently under review. A document with no case is never reviewable.
    // Ownership/assignment/uploader are intentionally NOT considered here:
    // review access is scoped purely by the case's `under_review` status.
    if (document.case_id == null) {
      throw httpError(403, "You do not have access to this document");
    }
    const caseRow = await findCaseById(document.case_id);
    if (!caseRow || caseRow.status !== "under_review") {
      throw httpError(403, "You do not have access to this document");
    }
    return actor;
  }

  if (actor.role === "OFFICER") {
    if (document.case_id != null) {
      const caseRow = await findCaseById(document.case_id);
      const assigned =
        caseRow &&
        ((caseRow.assigned_to != null &&
          Number(caseRow.assigned_to) === uid) ||
          (await hasOfficerAssignment(caseRow.id, actorId)));
      if (assigned) {
        return actor;
      }
    }
    if (document.uploaded_by != null && Number(document.uploaded_by) === uid) {
      return actor;
    }
    throw httpError(
      403,
      "You do not have access to this document"
    );
  }

  if (actor.role === "USER") {
    if (document.uploaded_by != null && Number(document.uploaded_by) === uid) {
      return actor;
    }
    if (document.case_id != null) {
      const caseRow = await findCaseById(document.case_id);
      if (caseRow && Number(caseRow.created_by) === uid) {
        return actor;
      }
    }
    throw httpError(
      403,
      "You do not have access to this document"
    );
  }

  return actor;
}

/**
 * Compute the list/search scoping filters appropriate for the actor's DB role.
 * @param {number|string} actorId
 * @returns {Promise<{ officerId: number|null, ownerUserId: number|null }>}
 */
async function resolveDocumentListScope(actorId) {
  const actor = await getUserWithRoleAndPermissions(actorId);
  if (!actor) {
    throw httpError(401, "Authenticated user no longer exists");
  }
  if (actor.role === "OFFICER") {
    return { officerId: Number(actorId), ownerUserId: null };
  }
  if (actor.role === "USER") {
    return { officerId: null, ownerUserId: Number(actorId) };
  }
  return { officerId: null, ownerUserId: null };
}

// ─── GET /api/documents ──────────────────────────────────────
async function listDocuments(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const search = (req.query.search || "").trim();
    const status = (req.query.status || "").trim().toLowerCase();
    const documentType = (req.query.documentType || "").trim();
    const caseId = req.query.caseId || "";
    const sort = (req.query.sort || "id").trim();
    const order = (req.query.order || "asc").trim().toLowerCase();

    // Scoping from the DB role so officers/users only see what they may access.
    const scope = await resolveDocumentListScope(req.user.id);

    const data = await findAllDocuments({
      page,
      limit,
      search,
      status,
      documentType,
      caseId,
      sort,
      order,
      officerId: scope.officerId,
      ownerUserId: scope.ownerUserId,
    });

    return res.json({ success: true, ...data });
  } catch (err) {
    return next(err);
  }
}

// ─── GET /api/documents/:id ──────────────────────────────────
async function getDocumentById(req, res, next) {
  try {
    const docId = req.params.id;
    const document = await findDocumentById(docId);
    if (!document) {
      throw httpError(404, "Document not found");
    }

    await assertDocumentAccess(document, req.user.id);

    const currentVersion = await findDocumentVersion(
      docId,
      document.current_version
    );

    return res.json({ success: true, document, currentVersion });
  } catch (err) {
    return next(err);
  }
}

// ─── POST /api/documents ─────────────────────────────────────
async function uploadDocument(req, res, next) {
  try {
    if (!req.file) {
      throw httpError(400, "No file uploaded. Please provide a file.");
    }

    const { title, description, documentType, caseId } = req.body;
    const uploadedById = req.user.id;

    let resolvedCaseId = null;
    if (caseId != null && String(caseId).trim() !== "") {
      const caseIdNum = Number(caseId);
      if (!Number.isInteger(caseIdNum) || caseIdNum < 1) {
        throw httpError(400, "Invalid caseId");
      }
      const caseExists = await findCaseNumberById(caseIdNum);
      if (!caseExists) {
        throw httpError(404, "Case not found");
      }

      // Assignment-first document upload: an OFFICER may only attach
      // investigation documents to a case they are assigned to.
      const actor = await getUserWithRoleAndPermissions(uploadedById);
      if (actor && actor.role === "OFFICER") {
        const caseRow = await findCaseById(caseIdNum);
        const assigned =
          caseRow &&
          ((caseRow.assigned_to != null &&
            Number(caseRow.assigned_to) === Number(uploadedById)) ||
            (await hasOfficerAssignment(caseRow.id, uploadedById)));
        if (!assigned) {
          throw httpError(
            403,
            "You are not assigned to this case and cannot upload investigation documents to it"
          );
        }
      }

      resolvedCaseId = caseIdNum;
    }

    // Store the file bytes in the private B2 bucket before writing the
    // metadata row; the object key is the same value stored in
    // stored_file_name / file_path (no schema change).
    const storageKey = generateStorageKey(req.file.mimetype);
    const checksum = sha256Buffer(req.file.buffer);
    await uploadObject({
      key: storageKey,
      body: req.file.buffer,
      contentType: req.file.mimetype,
    });

    let result;
    try {
      result = await createDocument({
        caseId: resolvedCaseId,
        title: title.trim(),
        description:
          description != null ? String(description).trim() : null,
        documentType:
          documentType != null ? String(documentType).trim() : null,
        uploadedBy: uploadedById,
        originalFileName: req.file.originalname,
        storedFileName: storageKey,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        checksum,
      });
    } catch (dbErr) {
      // Best-effort rollback of the B2 object if metadata cannot be
      // persisted. Never throw from a cleanup path.
      await deleteObject(storageKey).catch(() => {});
      throw dbErr;
    }

    await logAuditEvent({
      userId: uploadedById,
      action: "DOCUMENT_CREATED",
      resourceType: "document",
      resourceId: result.documentId,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      details: {
        title: title.trim(),
        originalFileName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        caseId: resolvedCaseId,
      },
    });

    const document = await findDocumentById(result.documentId);
    const currentVersion = await findDocumentVersion(result.documentId, 1);

    indexDocumentContent(
      result.documentId,
      1,
      req.file.buffer,
      req.file.mimetype
    ).catch(() => {});

    return res
      .status(201)
      .json({ success: true, document, currentVersion });
  } catch (err) {
    return next(err);
  }
}

// ─── GET /api/documents/:id/download ─────────────────────────
async function downloadDocument(req, res, next) {
  try {
    const docId = req.params.id;
    const document = await findDocumentById(docId);
    if (!document) {
      throw httpError(404, "Document not found");
    }

    if (document.status === "deleted") {
      throw httpError(404, "Document not found");
    }

    await assertDocumentAccess(document, req.user.id);

    const currentVersion = await findDocumentVersion(
      docId,
      document.current_version
    );
    if (!currentVersion) {
      throw httpError(404, "Document version not found");
    }

    let file;
    try {
      file = await getObject(currentVersion.stored_file_name);
    } catch (objErr) {
      if (isNotFoundError(objErr)) {
        throw httpError(404, "Physical file not found on server");
      }
      throw objErr;
    }

    await logAuditEvent({
      userId: req.user.id,
      action: "DOCUMENT_DOWNLOADED",
      resourceType: "document",
      resourceId: Number(docId),
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      details: {
        originalFileName: currentVersion.original_file_name,
      },
    });

    return respondWithObject(res, file.stream, {
      originalFileName: currentVersion.original_file_name,
      mimeType: currentVersion.mime_type,
      fileSize: currentVersion.file_size,
    });
  } catch (err) {
    return next(err);
  }
}

// ─── DELETE /api/documents/:id ───────────────────────────────
async function deleteDocument(req, res, next) {
  try {
    const docId = req.params.id;
    const document = await findDocumentById(docId);
    if (!document) {
      throw httpError(404, "Document not found");
    }

    if (document.status === "deleted") {
      return res.json({
        success: true,
        message: "Document is already deleted",
        document,
      });
    }

    await softDeleteDocument(docId);

    await logAuditEvent({
      userId: req.user.id,
      action: "DOCUMENT_DELETED",
      resourceType: "document",
      resourceId: Number(docId),
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      details: {
        title: document.title,
      },
    });

    return res.json({ success: true, message: "Document deleted" });
  } catch (err) {
    return next(err);
  }
}

// ─── POST /api/documents/:id/versions ─────────────────────────
async function createNewVersion(req, res, next) {
  try {
    if (!req.file) {
      throw httpError(400, "No file uploaded. Please provide a file.");
    }

    const docId = req.params.id;
    const document = await findDocumentById(docId);
    if (!document) {
      throw httpError(404, "Document not found");
    }
    if (document.status === "deleted") {
      throw httpError(400, "Cannot add versions to a deleted document");
    }

    await assertDocumentAccess(document, req.user.id);

    // Upload the new version bytes to B2 first; each version gets its own
    // object key and its own SHA-256 checksum. Previous versions are left
    // untouched.
    const storageKey = generateStorageKey(req.file.mimetype);
    const checksum = sha256Buffer(req.file.buffer);
    await uploadObject({
      key: storageKey,
      body: req.file.buffer,
      contentType: req.file.mimetype,
    });

    let result;
    try {
      result = await createVersion({
        documentId: Number(docId),
        originalFileName: req.file.originalname,
        storedFileName: storageKey,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        checksum,
        uploadedBy: req.user.id,
      });
    } catch (dbErr) {
      // Best-effort rollback of the B2 object if the version row cannot
      // be persisted. Never throw from a cleanup path.
      await deleteObject(storageKey).catch(() => {});
      throw dbErr;
    }

    await logAuditEvent({
      userId: req.user.id,
      action: "VERSION_CREATED",
      resourceType: "document",
      resourceId: Number(docId),
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      details: {
        versionNumber: result.versionNumber,
        originalFileName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
      },
    });

    const version = await findDocumentVersion(docId, result.versionNumber);

    indexDocumentContent(
      Number(docId),
      result.versionNumber,
      req.file.buffer,
      req.file.mimetype
    ).catch(() => {});

    return res.status(201).json({
      success: true,
      message: "New document version created",
      version: safeVersion(version),
    });
  } catch (err) {
    return next(err);
  }
}

// ─── GET /api/documents/:id/versions ──────────────────────────
async function listVersions(req, res, next) {
  try {
    const docId = req.params.id;
    const document = await findDocumentById(docId);
    if (!document) {
      throw httpError(404, "Document not found");
    }

    await assertDocumentAccess(document, req.user.id);

    const versions = await findVersionsByDocument(docId);

    return res.json({
      success: true,
      documentId: Number(docId),
      versions,
    });
  } catch (err) {
    return next(err);
  }
}

// ─── GET /api/documents/:id/versions/:versionNumber ───────────
async function getVersion(req, res, next) {
  try {
    const docId = req.params.id;
    const versionNumber = req.params.versionNumber;

    const document = await findDocumentById(docId);
    if (!document) {
      throw httpError(404, "Document not found");
    }

    await assertDocumentAccess(document, req.user.id);

    const version = await findDocumentVersion(docId, versionNumber);
    if (!version) {
      throw httpError(404, "Document version not found");
    }

    return res.json({
      success: true,
      documentId: Number(docId),
      version: safeVersion(version),
    });
  } catch (err) {
    return next(err);
  }
}

// ─── GET /api/documents/:id/versions/:versionNumber/download ──
async function downloadVersion(req, res, next) {
  try {
    const docId = req.params.id;
    const versionNumber = req.params.versionNumber;

    const document = await findDocumentById(docId);
    if (!document) {
      throw httpError(404, "Document not found");
    }
    if (document.status === "deleted") {
      throw httpError(404, "Document not found");
    }

    await assertDocumentAccess(document, req.user.id);

    const version = await findDocumentVersion(docId, versionNumber);
    if (!version) {
      throw httpError(404, "Document version not found");
    }

    let file;
    try {
      file = await getObject(version.stored_file_name);
    } catch (objErr) {
      if (isNotFoundError(objErr)) {
        throw httpError(404, "Physical file not found on server");
      }
      throw objErr;
    }

    await logAuditEvent({
      userId: req.user.id,
      action: "VERSION_DOWNLOADED",
      resourceType: "document",
      resourceId: Number(docId),
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      details: {
        versionNumber: Number(versionNumber),
        originalFileName: version.original_file_name,
      },
    });

    return respondWithObject(res, file.stream, {
      originalFileName: version.original_file_name,
      mimeType: version.mime_type,
      fileSize: version.file_size,
    });
  } catch (err) {
    return next(err);
  }
}

// ─── GET /api/documents/:id/versions/:versionNumber/verify ────
async function verifyVersionIntegrity(req, res, next) {
  try {
    const docId = req.params.id;
    const versionNumber = req.params.versionNumber;

    const document = await findDocumentById(docId);
    if (!document) {
      throw httpError(404, "Document not found");
    }

    await assertDocumentAccess(document, req.user.id);

    const version = await findDocumentVersion(docId, versionNumber);
    if (!version) {
      throw httpError(404, "Document version not found");
    }

    // Stream the object from B2 and hash the bytes ourselves. The B2 ETag
    // is never trusted as the SHA-256 checksum.
    let file;
    try {
      file = await getObject(version.stored_file_name);
    } catch (objErr) {
      if (isNotFoundError(objErr)) {
        throw httpError(404, "Physical file not found on server");
      }
      throw objErr;
    }

    const calculatedChecksum = await sha256Stream(file.stream);
    const storedChecksum = version.checksum || null;
    const integrityValid =
      storedChecksum != null && calculatedChecksum === storedChecksum;

    await logAuditEvent({
      userId: req.user.id,
      action: "VERSION_INTEGRITY_VERIFIED",
      resourceType: "document",
      resourceId: Number(docId),
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      details: {
        versionNumber: Number(versionNumber),
        integrityValid,
      },
    });

    return res.json({
      success: true,
      documentId: Number(docId),
      versionNumber: Number(versionNumber),
      storedChecksum,
      calculatedChecksum,
      integrityValid,
    });
  } catch (err) {
    return next(err);
  }
}

// ─── POST /api/documents/:id/summarize ────────────────────────
// Protected (JWT + documents:read + documents:download, enforced in the
// route). The document/version is resolved entirely server-side, the
// content is never sent to Gemini before authorization, and neither the
// document text, the prompt, the summary, nor any secret is logged.
async function summarizeDocument(req, res, next) {
  try {
    const docId = req.params.id;
    const version = req.body.version != null ? Number(req.body.version) : null;

    // 1. Authorization has already succeeded (route middleware).
    // 1a. Enforce case/ownership access for the document (officer/user scoping).
    const docMeta = await findDocumentById(docId);
    if (!docMeta) {
      throw httpError(404, "Document not found");
    }
    await assertDocumentAccess(docMeta, req.user.id);

    // 2. Resolve the document and extract its text server-side.
    const content = await readDocumentText(docId, version);

    // 3. Generate the summary with the server-constructed prompt.
    const summary = await summarizeText({
      text: content.text,
      title: content.title,
      documentType: content.documentType,
      truncated: content.truncated,
    });

    // 4. Audit metadata only — never document text, prompt, or summary.
    await logAuditEvent({
      userId: req.user.id,
      action: "DOCUMENT_SUMMARIZED",
      resourceType: "document",
      resourceId: Number(docId),
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      details: {
        versionNumber: content.versionNumber,
        mimeType: content.mimeType,
        truncated: content.truncated,
      },
    });

    return res.json({
      success: true,
      documentId: Number(docId),
      title: content.title,
      versionNumber: content.versionNumber,
      summary,
      truncated: content.truncated,
    });
  } catch (err) {
    if (err.code === "GEMINI_NOT_CONFIGURED") {
      return next(httpError(500, "AI service is not configured"));
    }
    if (err.code === "GEMINI_EMPTY_INPUT") {
      return next(httpError(422, "File contains no extractable text"));
    }

    // Typed 4xx errors (400/404/415/422) from content extraction or audit
    // failures should pass through unchanged and never hit Gemini retries.
    if (err.statusCode && err.expose) {
      return next(err);
    }

    // Never leak SDK internals, the API key, document content, or stack
    // traces. Log only a fixed, safe diagnostic line.
    console.error("Document summarization failed");
    return next(httpError(502, "AI service is temporarily unavailable"));
  }
}

module.exports = {
  listDocuments,
  getDocumentById,
  uploadDocument,
  downloadDocument,
  deleteDocument,
  createNewVersion,
  listVersions,
  getVersion,
  downloadVersion,
  verifyVersionIntegrity,
  summarizeDocument,
};
