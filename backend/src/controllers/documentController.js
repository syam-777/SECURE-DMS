const fs = require("fs");
const { logAuditEvent } = require("../models/auditLogModel");
const { findCaseNumberById } = require("../models/caseModel");
const {
  safeDocumentPath,
  findDocumentById,
  findDocumentVersion,
  findAllDocuments,
  createDocument,
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

    const data = await findAllDocuments({
      page,
      limit,
      search,
      status,
      documentType,
      caseId,
      sort,
      order,
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
      resolvedCaseId = caseIdNum;
    }

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
        storedFileName: req.file.filename,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
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

module.exports = {
  listDocuments,
  getDocumentById,
  uploadDocument,
  downloadDocument,
  deleteDocument,
};
