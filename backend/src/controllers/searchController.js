const { searchCases } = require("../models/caseModel");
const { searchDocuments } = require("../models/documentModel");

// ─── GET /api/search/cases ────────────────────────────────────
async function searchCasesHandler(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const q = (req.query.q || "").trim();
    const status = (req.query.status || "").trim().toLowerCase();
    const priority = (req.query.priority || "").trim().toLowerCase();
    const caseType = (req.query.caseType || "").trim();
    const sort = (req.query.sort || "id").trim();
    const order = (req.query.order || "asc").trim().toLowerCase();

    const data = await searchCases({
      page,
      limit,
      q,
      status,
      priority,
      caseType,
      sort,
      order,
    });

    return res.json({ success: true, ...data });
  } catch (err) {
    return next(err);
  }
}

// ─── GET /api/search/documents ────────────────────────────────
async function searchDocumentsHandler(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const q = (req.query.q || "").trim();
    const status = (req.query.status || "").trim().toLowerCase();
    const documentType = (req.query.documentType || "").trim();
    const caseId = req.query.caseId || "";
    const sort = (req.query.sort || "id").trim();
    const order = (req.query.order || "asc").trim().toLowerCase();

    const data = await searchDocuments({
      page,
      limit,
      q,
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

module.exports = {
  searchCasesHandler,
  searchDocumentsHandler,
};