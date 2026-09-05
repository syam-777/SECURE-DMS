const fs = require("fs");
const { PDFParse } = require("pdf-parse");
const mammoth = require("mammoth");
const ExcelJS = require("exceljs");

const {
  safeDocumentPath,
  findDocumentById,
  findDocumentVersion,
} = require("../models/documentModel");

// Maximum number of text characters ever sent to Gemini. Longer
// documents are truncated safely and reported via `truncated`.
const MAX_EXTRACTED_TEXT_CHARS = 100000;

// MIME types accepted for summarization. Everything else that the
// upload pipeline accepts (legacy .doc/.xls, images) is deliberately
// rejected here with 415.
const SUMMARY_MIME_TYPES = new Set([
  "text/plain",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.expose = true;
  return err;
}

function normalizeWhitespace(text) {
  return String(text)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPdfText(filePath) {
  const data = await fs.promises.readFile(filePath);
  const parser = new PDFParse({ data });
  const result = await parser.getText();
  const raw = result && result.text ? result.text : "";

  // pdf.js injects a page-count footer like "-- 1 of 1 --" when a page has
  // no text. Strip such artifacts so textless/scanned PDFs fail closed (422).
  const withoutPageCounters = String(raw)
    .split("\n")
    .filter((line) => !/^\s*-+\s*\d+\s+of\s+\d+\s*-*\s*$/.test(line))
    .join("\n");

  return normalizeWhitespace(withoutPageCounters);
}

async function extractDocxText(filePath) {
  const buffer = await fs.promises.readFile(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return normalizeWhitespace(result && result.value ? result.value : "");
}

function cellToText(cell) {
  if (cell == null) return "";
  if (typeof cell.text === "string") {
    return cell.text.trim();
  }
  const value = cell.value;
  if (value != null && typeof value === "object") {
    if (value.richText) {
      return value.richText.map((r) => r.text || "").join("").trim();
    }
    if (value.text) return String(value.text).trim();
  }
  return value != null ? String(value).trim() : "";
}

async function extractXlsxText(filePath) {
  const buffer = await fs.promises.readFile(filePath);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const lines = [];
  workbook.eachSheet((worksheet) => {
    if (worksheet.name) {
      lines.push(`[Sheet: ${worksheet.name}]`);
    }
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      const values = row.values || [];
      const cells = values
        .slice(1)
        .map(cellToText)
        .filter((v) => v.length > 0)
        .join(" | ");
      if (cells) {
        lines.push(cells);
      }
    });
  });

  return normalizeWhitespace(lines.join("\n"));
}

/**
 * Extract the printable text from the correct version of a document.
 * The document ID and version are resolved entirely server-side from the
 * database; the caller provides only an integer document ID (and
 * optionally an integer version number, defaulting to current_version).
 * The file path is always produced by safeDocumentPath() from the stored
 * file name — never from client input.
 *
 * Throws httpError:
 *   400 invalid file path or version
 *   404 document/version missing, deleted, or physical file missing
 *   415 unsupported / unextractable MIME type
 *   422 file exists but produced no extractable text
 *
 * @param {number|string} documentId
 * @param {number|string} [versionNumber]
 * @returns {Promise<{documentId:number,title:string,documentType:string|null,
 *   mimeType:string|null,versionNumber:number,text:string,truncated:boolean}>}
 */
async function readDocumentText(documentId, versionNumber) {
  const document = await findDocumentById(documentId);
  if (!document) {
    throw httpError(404, "Document not found");
  }
  if (document.status === "deleted") {
    throw httpError(404, "Document not found");
  }

  const versionToUse =
    versionNumber != null ? Number(versionNumber) : document.current_version;
  if (!Number.isInteger(versionToUse) || versionToUse < 1) {
    throw httpError(400, "version must be a positive integer");
  }

  const version = await findDocumentVersion(documentId, versionToUse);
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

  const mimeType = version.mime_type;
  if (!mimeType || !SUMMARY_MIME_TYPES.has(mimeType)) {
    throw httpError(
      415,
      "Unsupported or unextractable file type. Only TXT, PDF, DOCX, and XLSX are supported."
    );
  }

  let extracted;
  try {
    if (mimeType === "text/plain") {
      const raw = await fs.promises.readFile(filePath, "utf8");
      extracted = normalizeWhitespace(raw);
    } else if (mimeType === "application/pdf") {
      extracted = await extractPdfText(filePath);
    } else if (
      mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      extracted = await extractDocxText(filePath);
    } else {
      extracted = await extractXlsxText(filePath);
    }
  } catch (parseErr) {
    // Malformed/corrupt files must fail closed with a safe, generic error.
    // Never surface parser internals, stack traces, or file contents.
    throw httpError(422, "Document file could not be parsed");
  }

  if (!extracted || extracted.length === 0) {
    throw httpError(422, "File contains no extractable text");
  }

  let text = extracted;
  let truncated = false;
  if (text.length > MAX_EXTRACTED_TEXT_CHARS) {
    text = text.slice(0, MAX_EXTRACTED_TEXT_CHARS);
    truncated = true;
  }

  return {
    documentId: Number(documentId),
    title: document.title,
    documentType: document.document_type || null,
    mimeType,
    versionNumber: Number(version.version_number),
    text,
    truncated,
  };
}

module.exports = {
  MAX_EXTRACTED_TEXT_CHARS,
  readDocumentText,
};