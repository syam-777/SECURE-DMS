const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { pool } = require("../config/database");

const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads", "documents");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const DOCUMENT_STATUSES = ["active", "archived", "deleted"];

const DOCUMENT_SORTABLE_COLUMNS = [
  "id",
  "title",
  "document_type",
  "status",
  "current_version",
  "created_at",
  "updated_at",
];

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "image/jpeg",
  "image/png",
]);

const MIME_TO_EXTENSION = {
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.ms-excel": ".xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "text/plain": ".txt",
  "image/jpeg": ".jpg",
  "image/png": ".png",
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function getExtensionForMime(mimeType) {
  return MIME_TO_EXTENSION[mimeType] || "";
}

function isAllowedMimeType(mimeType) {
  return ALLOWED_MIME_TYPES.has(mimeType);
}

function isValidDocumentStatus(status) {
  return DOCUMENT_STATUSES.includes(status);
}

function safeDocumentPath(storedFileName) {
  const base = path.resolve(UPLOAD_DIR);
  const resolved = path.resolve(UPLOAD_DIR, storedFileName);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    return null;
  }
  return resolved;
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function findDocumentById(id) {
  const [rows] = await pool.query(
    "SELECT d.id, d.case_id, d.title, d.description, d.document_type, " +
      "d.status, d.current_version, d.uploaded_by, d.created_at, d.updated_at, " +
      "u.username AS uploader_username, u.full_name AS uploader_name " +
      "FROM documents d " +
      "LEFT JOIN users u ON u.id = d.uploaded_by " +
      "WHERE d.id = ? LIMIT 1",
    [id]
  );
  return rows[0] || null;
}

async function findDocumentVersion(documentId, versionNumber) {
  const [rows] = await pool.query(
    "SELECT dv.id, dv.document_id, dv.version_number, dv.file_path, " +
      "dv.original_file_name, dv.stored_file_name, dv.mime_type, " +
      "dv.file_size, dv.checksum, dv.uploaded_by, dv.created_at, " +
      "u.username AS uploader_username, u.full_name AS uploader_name " +
      "FROM document_versions dv " +
      "LEFT JOIN users u ON u.id = dv.uploaded_by " +
      "WHERE dv.document_id = ? AND dv.version_number = ? LIMIT 1",
    [documentId, versionNumber]
  );
  return rows[0] || null;
}

async function findVersionsByDocument(documentId) {
  const [rows] = await pool.query(
    "SELECT dv.id, dv.document_id, dv.version_number, " +
      "dv.original_file_name, dv.mime_type, dv.file_size, dv.checksum, " +
      "dv.uploaded_by, dv.created_at, " +
      "u.username AS uploader_username, u.full_name AS uploader_name " +
      "FROM document_versions dv " +
      "LEFT JOIN users u ON u.id = dv.uploaded_by " +
      "WHERE dv.document_id = ? " +
      "ORDER BY dv.version_number DESC",
    [documentId]
  );
  return rows;
}

async function findAllDocuments({
  page = 1,
  limit = 20,
  search = "",
  status = "",
  documentType = "",
  caseId = "",
  sort = "id",
  order = "asc",
} = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (safePage - 1) * safeLimit;

  const where = [];
  const params = [];

  if (search && String(search).trim()) {
    where.push(
      "(d.title LIKE ? OR d.description LIKE ? OR d.document_type LIKE ?)"
    );
    const like = `%${String(search).trim()}%`;
    params.push(like, like, like);
  }
  if (status && isValidDocumentStatus(status)) {
    where.push("d.status = ?");
    params.push(status);
  }
  if (documentType && String(documentType).trim()) {
    where.push("d.document_type = ?");
    params.push(String(documentType).trim());
  }
  if (caseId && Number(caseId) > 0) {
    where.push("d.case_id = ?");
    params.push(Number(caseId));
  }

  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

  const sortCol = DOCUMENT_SORTABLE_COLUMNS.includes(sort) ? sort : "id";
  const orderDir = String(order).toLowerCase() === "desc" ? "DESC" : "ASC";

  const [countResult] = await pool.query(
    "SELECT COUNT(*) AS total FROM documents d " + whereSql,
    params
  );
  const total = countResult[0].total;

  const [rows] = await pool.query(
    "SELECT d.id, d.case_id, d.title, d.description, d.document_type, " +
      "d.status, d.current_version, d.uploaded_by, " +
      "d.created_at, d.updated_at, " +
      "u.username AS uploader_username, u.full_name AS uploader_name " +
      "FROM documents d " +
      "LEFT JOIN users u ON u.id = d.uploaded_by " +
      whereSql +
      ` ORDER BY d.${sortCol} ${orderDir}, d.id ASC LIMIT ? OFFSET ?`,
    [...params, safeLimit, offset]
  );

  return {
    documents: rows,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(total / safeLimit),
  };
}

async function createDocument(data) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [docResult] = await connection.query(
      "INSERT INTO documents " +
        "(case_id, title, description, document_type, status, current_version, uploaded_by) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        data.caseId != null ? data.caseId : null,
        data.title,
        data.description != null ? data.description : null,
        data.documentType != null ? data.documentType : null,
        "active",
        1,
        data.uploadedBy,
      ]
    );
    const documentId = docResult.insertId;

    const [versionResult] = await connection.query(
      "INSERT INTO document_versions " +
        "(document_id, version_number, file_path, original_file_name, " +
        "stored_file_name, mime_type, file_size, checksum, uploaded_by) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        documentId,
        1,
        data.storedFileName,
        data.originalFileName,
        data.storedFileName,
        data.mimeType,
        data.fileSize,
        data.checksum != null ? data.checksum : null,
        data.uploadedBy,
      ]
    );

    await connection.commit();
    return { documentId, versionId: versionResult.insertId };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function createVersion(data) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [docRows] = await connection.query(
      "SELECT current_version FROM documents WHERE id = ? FOR UPDATE",
      [data.documentId]
    );
    if (!docRows[0]) {
      await connection.rollback();
      const err = new Error("Document not found");
      err.statusCode = 404;
      err.expose = true;
      throw err;
    }

    const nextVersion = Number(docRows[0].current_version) + 1;

    const [versionResult] = await connection.query(
      "INSERT INTO document_versions " +
        "(document_id, version_number, file_path, original_file_name, " +
        "stored_file_name, mime_type, file_size, checksum, uploaded_by) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [
        data.documentId,
        nextVersion,
        data.storedFileName,
        data.originalFileName,
        data.storedFileName,
        data.mimeType,
        data.fileSize,
        data.checksum != null ? data.checksum : null,
        data.uploadedBy,
      ]
    );

    await connection.query(
      "UPDATE documents SET current_version = ?, updated_at = CURRENT_TIMESTAMP " +
        "WHERE id = ?",
      [nextVersion, data.documentId]
    );

    await connection.commit();
    return { versionId: versionResult.insertId, versionNumber: nextVersion };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function softDeleteDocument(id) {
  const [result] = await pool.query(
    "UPDATE documents SET status = 'deleted' WHERE id = ? AND status != 'deleted'",
    [id]
  );
  return result.affectedRows > 0;
}

module.exports = {
  UPLOAD_DIR,
  MAX_FILE_SIZE,
  DOCUMENT_STATUSES,
  DOCUMENT_SORTABLE_COLUMNS,
  getExtensionForMime,
  isAllowedMimeType,
  isValidDocumentStatus,
  safeDocumentPath,
  sha256File,
  findDocumentById,
  findDocumentVersion,
  findVersionsByDocument,
  findAllDocuments,
  createDocument,
  createVersion,
  softDeleteDocument,
};
