const { searchCases } = require("../models/caseModel");
const { searchDocuments } = require("../models/documentModel");
const { getUserWithRoleAndPermissions } = require("../models/userModel");

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

    // Officers only search cases they are assigned to (assignment-first);
    // users only search cases they created.
    let officerId = null;
    let ownerUserId = null;
    const actor = await getUserWithRoleAndPermissions(req.user.id);
    if (actor) {
      if (actor.role === "OFFICER") {
        officerId = req.user.id;
      } else if (actor.role === "USER") {
        ownerUserId = req.user.id;
      }
    }

    const data = await searchCases({
      page,
      limit,
      q,
      status,
      priority,
      caseType,
      sort,
      order,
      officerId,
      ownerUserId,
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

    // Scope from the DB role so officers/users only search what they may access.
    const actor = await getUserWithRoleAndPermissions(req.user.id);
    const officerId =
      actor && actor.role === "OFFICER" ? req.user.id : null;
    const ownerUserId =
      actor && actor.role === "USER" ? req.user.id : null;

    const data = await searchDocuments({
      page,
      limit,
      q,
      status,
      documentType,
      caseId,
      sort,
      order,
      officerId,
      ownerUserId,
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