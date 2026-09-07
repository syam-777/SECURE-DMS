const fs = require("fs");
const { logAuditEvent } = require("../models/auditLogModel");
const { getUserWithRoleAndPermissions } = require("../models/userModel");
const {
  findCaseNumberById,
  findCaseById,
  hasOfficerAssignment,
} = require("../models/caseModel");
const { readDocumentText } = require("../services/documentContentService");
const { summarizeText } = require("../services/aiService");
const {
  safeDocumentPath,
  sha256File,
  findDocumentById,
  findDocumentVersion,
  findVersionsByDocument,
  findAllDocuments,
  createDocument,
  createVersion,
  softDeleteDocument,
} = require("../models/documentModel");

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.expose = true;
  return err;
}

function cleanupFile(filePath) {
  fs.unlink(filePath, () => {});
}

function safeVersion(version) {
  if (!version) return null;
  const { file_path, stored_file_name, ...rest } = version;
  return rest;
}

/**
 * Resolve the actor's DB role and, for OFFICER and USER roles, whether the
 * actor may access the given document. ADMIN and REVIEWER are allowed by the
 * existing RBAC model (ADMIN for oversight, REVIEWER for the review flow).
 *
 * OFFICER: allowed only for documents of cases they are assigned to, or
 * documents they uploaded themselves.
 * USER: allowed only for documents they uploaded, or documents attached to
 * cases they created.
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
  if (actor.role === "ADMIN" || actor.role === "REVIEWER") {
    return actor;
  }

  const uid = Number(actorId);

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
        cleanupFile(req.file.path);
        throw httpError(400, "Invalid caseId");
      }
      const caseExists = await findCaseNumberById(caseIdNum);
      if (!caseExists) {
        cleanupFile(req.file.path);
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
          cleanupFile(req.file.path);
          throw httpError(
            403,
            "You are not assigned to this case and cannot upload investigation documents to it"
          );
        }
      }

      resolvedCaseId = caseIdNum;
    }

    let result;
    try {
      const checksum = await sha256File(req.file.path);
      result = await createDocument({
        caseId: resolvedCaseId,
        title: title.trim(),
        description:
          description != null ? String(description).trim() : null,
        documentType:
          documentType != null ? String(documentType).trim() : null,
        uploadedBy: uploadedById,
        originalFileName: req.file.originalname,
        storedFileName: req.file.filename,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        checksum,
      });
    } catch (dbErr) {
      cleanupFile(req.file.path);
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

    const filePath = safeDocumentPath(currentVersion.stored_file_name);
    if (!filePath) {
      throw httpError(400, "Invalid file path");
    }

    if (!fs.existsSync(filePath)) {
      throw httpError(404, "Physical file not found on server");
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

    return res.download(filePath, currentVersion.original_file_name);
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
      cleanupFile(req.file.path);
      throw httpError(404, "Document not found");
    }
    if (document.status === "deleted") {
      cleanupFile(req.file.path);
      throw httpError(400, "Cannot add versions to a deleted document");
    }

    await assertDocumentAccess(document, req.user.id);

    let result;
    try {
      const checksum = await sha256File(req.file.path);
      result = await createVersion({
        documentId: Number(docId),
        originalFileName: req.file.originalname,
        storedFileName: req.file.filename,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        checksum,
        uploadedBy: req.user.id,
      });
    } catch (dbErr) {
      cleanupFile(req.file.path);
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

    const filePath = safeDocumentPath(version.stored_file_name);
    if (!filePath) {
      throw httpError(400, "Invalid file path");
    }

    if (!fs.existsSync(filePath)) {
      throw httpError(404, "Physical file not found on server");
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

    return res.download(filePath, version.original_file_name);
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

    const filePath = safeDocumentPath(version.stored_file_name);
    if (!filePath) {
      throw httpError(400, "Invalid file path");
    }

    if (!fs.existsSync(filePath)) {
      throw httpError(404, "Physical file not found on server");
    }

    const calculatedChecksum = await sha256File(filePath);
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
