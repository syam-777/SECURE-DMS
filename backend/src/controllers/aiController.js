const {
  generateText,
  answerCaseQuestion,
  parseCitations,
} = require("../services/aiService");

const { findCaseById } = require("../models/caseModel");
const { findAllDocuments } = require("../models/documentModel");
const { readDocumentText } = require("../services/documentContentService");
const { logAuditEvent } = require("../models/auditLogModel");

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.expose = true;
  return err;
}

/**
 * Redact any secret values that could appear inside an error message or stack
 * before it is written to the server log. The Gemini API key is only ever read
 * from process.env, and its actual value is never intentionally logged.
 */
function redactSecrets(value) {
  if (typeof value !== "string") {
    return value;
  }

  let text = value;
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    text = text.split(apiKey).join("[REDACTED:gemini-api-key]");
  }

  return text.replace(/AIza[a-zA-Z0-9_\-]{20,}/g, "[REDACTED:gemini-api-key]");
}

/**
 * POST /api/ai/test
 * Protected (JWT). Generates a short text response from a user prompt
 * via Gemini. The client may not select the model or supply an API key.
 */
async function aiTest(req, res, next) {
  try {
    const prompt = req.body.prompt.trim();

    const answer = await generateText(prompt);

    return res.json({
      success: true,
      answer,
    });
  } catch (err) {
    if (err.code === "GEMINI_NOT_CONFIGURED") {
      return next(httpError(500, "AI service is not configured"));
    }

    // Never leak SDK internals, the API key, or stack traces to the client.
    // Log only a fixed, safe diagnostic line.
    console.error("AI text generation failed");
    return next(httpError(502, "AI service is temporarily unavailable"));
  }
}
/**
 * POST /api/ai/ask
 * Protected (JWT).
 *
 * Answers a question using only documents belonging to the selected case.
 * Document IDs, file paths, filenames, and document contents are resolved
 * entirely on the server.
 */
async function aiAsk(req, res, next) {
  try {
    const caseId = Number(req.body.caseId);
    const question =
      typeof req.body.question === "string"
        ? req.body.question.trim()
        : "";

    if (!Number.isInteger(caseId) || caseId < 1) {
      return next(httpError(400, "caseId must be a positive integer"));
    }

    if (!question) {
      return next(httpError(400, "question is required"));
    }

    if (question.length > 2000) {
      return next(httpError(400, "question is too long"));
    }

    const caseData = await findCaseById(caseId);

    if (!caseData) {
      return next(httpError(404, "Case not found"));
    }

    const result = await findAllDocuments({
      caseId,
      status: "active",
      page: 1,
      limit: 20,
      sort: "id",
      order: "asc",
    });

    if (!result.documents || result.documents.length === 0) {
      return next(
        httpError(422, "No active documents are available for this case")
      );
    }

    const documents = [];

    for (const document of result.documents) {
      try {
        const content = await readDocumentText(document.id);

        documents.push({
          documentId: content.documentId,
          title: content.title,
          versionNumber: content.versionNumber,
          text: content.text,
          truncated: content.truncated,
        });
      } catch (err) {
        if (
          err.statusCode === 404 ||
          err.statusCode === 415 ||
          err.statusCode === 422
        ) {
          continue;
        }

        throw err;
      }
    }

    if (documents.length === 0) {
      return next(
        httpError(
          422,
          "No extractable text is available in the documents for this case"
        )
      );
    }

    const MAX_TOTAL_DOCUMENT_CHARS = 100000;
    let totalChars = 0;
    const boundedDocuments = [];

    for (const document of documents) {
      if (totalChars >= MAX_TOTAL_DOCUMENT_CHARS) {
        break;
      }

      const remaining = MAX_TOTAL_DOCUMENT_CHARS - totalChars;
      const text = document.text.slice(0, remaining);

      boundedDocuments.push({
        ...document,
        text,
        truncated:
          document.truncated || text.length < document.text.length,
      });

      totalChars += text.length;
    }

    const answer = await answerCaseQuestion({
      caseNumber: caseData.case_number,
      caseTitle: caseData.title,
      question,
      documents: boundedDocuments,
    });

    let citations = [];
    try {
      citations = parseCitations(answer, boundedDocuments);
    } catch {
      // Citation parsing is best-effort: never fail the request because of it.
      citations = [];
    }

    await logAuditEvent({
      userId: req.user.id,
      action: "AI_CASE_QUESTION_ASKED",
      resourceType: "case",
      resourceId: caseId,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      details: {
        caseNumber: caseData.case_number,
        documentsUsed: boundedDocuments.length,
        truncated: boundedDocuments.some((doc) => doc.truncated),
      },
    });

    return res.json({
      success: true,
      case: {
        id: caseData.id,
        caseNumber: caseData.case_number,
        title: caseData.title,
      },
      answer,
      sources: boundedDocuments.map((document) => ({
        documentId: document.documentId,
        title: document.title,
        versionNumber: document.versionNumber,
      })),
      citations,
    });
  } catch (err) {
    if (err.code === "GEMINI_NOT_CONFIGURED") {
      return next(httpError(500, "AI service is not configured"));
    }

    if (err.code === "GEMINI_EMPTY_INPUT") {
      return next(httpError(422, "No usable case document text is available"));
    }

    if (err.code === "GEMINI_NO_CASE_DOCUMENTS") {
      return next(
        httpError(422, "No usable documents are available for this case")
      );
    }

    if (err.statusCode && err.expose) {
      return next(err);
    }

    // Safe diagostic log for local debugging only. The generic 502 response
    // behavior is intentionally preserved. Only whitelisted fields are logged
    // and secret/token values are redacted; the underlying error is never
    // exposed to the client.
    const apiResponseStatus =
      (err.response &&
        (err.response.status || err.response.statusCode)) ||
      (typeof err.statusNumber === "number" ? err.statusNumber : undefined);
    const stackSnippet = err.stack
      ? String(err.stack)
          .split("\n")
          .slice(0, 3)
          .join(" | ")
      : "";
    console.error(
      "[ai] case question failed diagnostics -> " +
        `name=${err.name || "n/a"} ` +
        `message=${JSON.stringify(redactSecrets(err.message) || "n/a")} ` +
        `statusCode=${err.statusCode ?? "n/a"} ` +
        `status=${err.status ?? "n/a"} ` +
        `apiResponseStatus=${apiResponseStatus ?? "n/a"} ` +
        `code=${err.code ?? "n/a"} ` +
        `stack=${stackSnippet || "n/a"}`
    );

    console.error("AI case question failed");
    return next(httpError(502, "AI service is temporarily unavailable"));
  }
}

module.exports = {
  aiTest,
  aiAsk,
};