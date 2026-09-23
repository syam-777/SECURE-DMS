/**
 * Secure DMS — AI Case Summary context selection
 *
 * Builds the exact bounded document context that is sent to Gemini for an
 * on-demand case summary. Responsibilities:
 *
 *   - case-scoped: only documents belonging to the requested case
 *   - active-only and deterministically sorted by document ID ascending
 *   - text loaded via the existing readDocumentText() (CURRENT version),
 *     never read from document_contents directly
 *   - combined extracted text capped at MAX_SUMMARY_DOCUMENT_CHARS,
 *     truncating the boundary document and stopping once the cap is hit
 *   - expected extraction failures (404/415/422) are skipped; unexpected
 *     errors propagate
 *   - the returned `documents` array IS the array used for citation
 *     numbering ([Source 1] -> documents[0]), so callers must never
 *     re-sort or re-filter it
 */

const { findCaseById } = require("./caseModel");
const { findAllDocuments } = require("./documentModel");
const { readDocumentText } = require("../services/documentContentService");

// Maximum combined characters of extracted document text ever sent to
// Gemini for one case summary. Matches the AI Q&A combined limit.
const MAX_SUMMARY_DOCUMENT_CHARS = 100000;

// Expected extraction errors that mean "this document cannot contribute
// text" — they are skipped without failing the whole request.
const EXPECTED_TEXT_ERRORS = [404, 415, 422];

/**
 * Load the sanitized text of a single document. Injectable for tests; the
 * production default is readDocumentText(), which resolves the CURRENT
 * version of the document server-side.
 */
function defaultLoadText(documentId) {
  return readDocumentText(documentId);
}

/**
 * @param {number|string} caseId
 * @param {{
 *   exec?: object,
 *   loadText?: (documentId:number|string) => Promise<object>,
 *   maxChars?: number
 * }} [options] - exec/loadText/maxChars are injectable for tests.
 * @returns {Promise<{
 *   case: { id:number, caseNumber:string, title:string },
 *   documents: Array<{documentId:number,title:string,versionNumber:number,text:string,truncated:boolean}>,
 *   truncated: boolean
 * }|null>} null when the case does not exist
 */
async function buildCaseSummaryContext(caseId, options = {}) {
  const exec = options.exec;
  const loadText =
    typeof options.loadText === "function" ? options.loadText : defaultLoadText;
  const maxChars =
    typeof options.maxChars === "number" && options.maxChars > 0
      ? options.maxChars
      : MAX_SUMMARY_DOCUMENT_CHARS;

  const caseRow = await findCaseById(caseId, exec);
  if (!caseRow) {
    return null;
  }

  const result = await findAllDocuments(
    {
      caseId,
      status: "active",
      page: 1,
      limit: 100,
      sort: "id",
      order: "asc",
    },
    exec
  );

  // Defensive determinism: the query already sorts by id ASC; an explicit
  // stable sort keeps the DETERMINISTIC ordering guarantee even if the
  // query contract changes. This order is preserved into `documents`, so
  // citation numbering is stable.
  const caseDocuments = (result.documents || [])
    .slice()
    .sort((a, b) => Number(a.id) - Number(b.id));

  // Phase 1: load readable current-version text for every case document,
  // skipping the expected unreadable error classes.
  const readable = [];
  for (const document of caseDocuments) {
    try {
      const content = await loadText(document.id);
      if (
        !content ||
        typeof content.text !== "string" ||
        content.text.length === 0
      ) {
        continue;
      }
      readable.push({
        documentId: Number(content.documentId),
        title: content.title,
        versionNumber: Number(content.versionNumber),
        text: content.text,
        truncated: !!content.truncated,
      });
    } catch (err) {
      if (err.statusCode && EXPECTED_TEXT_ERRORS.includes(err.statusCode)) {
        continue;
      }
      throw err;
    }
  }

  // Phase 2: bound the combined context. The bounded array is the exact
  // array sent to Gemini, so [Source <n>] maps to documents[n - 1].
  const documents = [];
  let totalChars = 0;
  let limited = false;

  for (const document of readable) {
    if (totalChars >= maxChars) {
      limited = true;
      break;
    }

    const remaining = maxChars - totalChars;
    const text = document.text.slice(0, remaining);

    documents.push({
      ...document,
      text,
      truncated: document.truncated || text.length < document.text.length,
    });

    totalChars += text.length;
  }

  // Truncation is reported when any used document was trimmed OR when the
  // combined cap caused later context to be dropped.
  const truncated = documents.some((doc) => doc.truncated) || limited;

  return {
    case: {
      id: Number(caseRow.id),
      caseNumber: caseRow.case_number,
      title: caseRow.title,
    },
    documents,
    truncated,
  };
}

module.exports = {
  MAX_SUMMARY_DOCUMENT_CHARS,
  buildCaseSummaryContext,
};