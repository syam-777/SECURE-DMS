const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const { validationResult } = require("express-validator");
const router = express.Router();

const {
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
} = require("../controllers/documentController");
const { authenticate, authorize } = require("../middleware/authMiddleware");
const {
  documentIdParamValidator,
  documentVersionParamValidator,
  documentListValidators,
  uploadDocumentValidators,
  validateRequest,
} = require("../middleware/validate");
const {
  UPLOAD_DIR,
  MAX_FILE_SIZE,
  isAllowedMimeType,
  getExtensionForMime,
  findDocumentById,
} = require("../models/documentModel");

const fs = require("fs");

// ─── Multer configuration ─────────────────────────────────────
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const ext = getExtensionForMime(file.mimetype) || ".bin";
    cb(null, crypto.randomUUID() + ext);
  },
});

function fileFilter(req, file, cb) {
  if (file.mimetype && isAllowedMimeType(file.mimetype)) {
    cb(null, true);
  } else {
    req._fileRejected = true;
    cb(null, false);
  }
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

function cleanupFile(filePath) {
  if (filePath) {
    fs.unlink(filePath, () => {});
  }
}

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.expose = true;
  return err;
}

// ─── Combined upload handler ──────────────────────────────────
// Runs multer, then validation, then the controller in a single
// flow so that the physical file is cleaned up if validation fails.
async function handleDocumentUpload(req, res, next) {
  try {
    // Step 1: Run multer
    await new Promise((resolve, reject) => {
      upload.single("file")(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    }).catch((multerErr) => {
      const msg =
        multerErr.code === "LIMIT_FILE_SIZE"
          ? "File too large. Maximum size is 10 MB."
          : multerErr.code === "LIMIT_UNEXPECTED_FILE"
            ? "Unexpected file field"
            : multerErr.message || "File upload error";
      throw httpError(400, msg);
    });

    // Step 2: Handle rejected file type
    if (!req.file && req._fileRejected) {
      throw httpError(
        400,
        "Unsupported file type. Accepted formats: PDF, DOC, DOCX, XLS, XLSX, TXT, JPG, PNG"
      );
    }

    // Step 3: Handle missing file
    if (!req.file) {
      throw httpError(400, "No file uploaded. Please provide a file.");
    }

    // Step 4: Run express-validator chains
    for (const chain of uploadDocumentValidators) {
      await chain.run(req);
    }
    const valErrors = validationResult(req);
    if (!valErrors.isEmpty()) {
      cleanupFile(req.file.path);
      const messages = valErrors.array().map((e) => e.msg);
      throw httpError(400, messages.join("; "));
    }

    // Step 5: All good — call the controller
    return uploadDocument(req, res, next);
  } catch (err) {
    return next(err);
  }
}

// ─── Combined version-upload handler ──────────────────────────
// Verifies the document BEFORE multer stores the file (so we never
// leave an orphaned upload), then runs multer and the controller.
async function handleVersionUpload(req, res, next) {
  try {
    // Step 1: Verify the document exists and is not deleted
    const document = await findDocumentById(req.params.id);
    if (!document) {
      throw httpError(404, "Document not found");
    }
    if (document.status === "deleted") {
      throw httpError(400, "Cannot add versions to a deleted document");
    }

    // Step 2: Run multer
    await new Promise((resolve, reject) => {
      upload.single("file")(req, res, (err) => {
        if (err) reject(err);
        else resolve();
      });
    }).catch((multerErr) => {
      const msg =
        multerErr.code === "LIMIT_FILE_SIZE"
          ? "File too large. Maximum size is 10 MB."
          : multerErr.code === "LIMIT_UNEXPECTED_FILE"
            ? "Unexpected file field"
            : multerErr.message || "File upload error";
      throw httpError(400, msg);
    });

    // Step 3: Handle rejected file type
    if (!req.file && req._fileRejected) {
      throw httpError(
        400,
        "Unsupported file type. Accepted formats: PDF, DOC, DOCX, XLS, XLSX, TXT, JPG, PNG"
      );
    }

    // Step 4: Handle missing file
    if (!req.file) {
      throw httpError(400, "No file uploaded. Please provide a file.");
    }

    // Step 5: All good — call the controller
    return createNewVersion(req, res, next);
  } catch (err) {
    return next(err);
  }
}

// All document routes require authentication.
router.use(authenticate);

// GET /api/documents — list documents (paginated, filtered)
router.get(
  "/",
  authorize("documents:read"),
  documentListValidators,
  validateRequest,
  listDocuments
);

// POST /api/documents — upload a document (multer + validation + controller combined)
router.post(
  "/",
  authorize("documents:write"),
  handleDocumentUpload
);

// GET /api/documents/:id — get a single document's metadata
router.get(
  "/:id",
  authorize("documents:read"),
  documentIdParamValidator,
  validateRequest,
  getDocumentById
);

// GET /api/documents/:id/download — download a document file
router.get(
  "/:id/download",
  authorize("documents:download"),
  documentIdParamValidator,
  validateRequest,
  downloadDocument
);

// DELETE /api/documents/:id — soft-delete a document
router.delete(
  "/:id",
  authorize("documents:delete"),
  documentIdParamValidator,
  validateRequest,
  deleteDocument
);

// POST /api/documents/:id/versions — upload a new document version
router.post(
  "/:id/versions",
  authorize("documents:write", "versions:create"),
  documentIdParamValidator,
  validateRequest,
  handleVersionUpload
);

// GET /api/documents/:id/versions — list all versions (newest first)
router.get(
  "/:id/versions",
  authorize("documents:read", "versions:read"),
  documentIdParamValidator,
  validateRequest,
  listVersions
);

// GET /api/documents/:id/versions/:versionNumber — get one version's metadata
router.get(
  "/:id/versions/:versionNumber",
  authorize("documents:read", "versions:read"),
  documentVersionParamValidator,
  validateRequest,
  getVersion
);

// GET /api/documents/:id/versions/:versionNumber/download — download a version file
router.get(
  "/:id/versions/:versionNumber/download",
  authorize("documents:download", "versions:read"),
  documentVersionParamValidator,
  validateRequest,
  downloadVersion
);

// GET /api/documents/:id/versions/:versionNumber/verify — verify SHA-256 integrity
router.get(
  "/:id/versions/:versionNumber/verify",
  authorize("documents:read", "versions:read"),
  documentVersionParamValidator,
  validateRequest,
  verifyVersionIntegrity
);

module.exports = router;
