const { findCaseById } = require("../models/caseModel");
const { getUserWithRoleAndPermissions } = require("../models/userModel");
const { logAuditEvent } = require("../models/auditLogModel");
const {
  assertCaseViewAccess,
} = require("./caseController");
const {
  findCaseEvidenceGraph,
} = require("../models/caseEvidenceGraphModel");

/**
 * Case Evidence / Entity Relationship Graph controller.
 *
 * Read-only "evidence map" for a single case: Case → Documents →
 * (current) Versions → Extracted Entities. Same assignment-first
 * visibility as GET /api/cases/:id and /intelligence: ADMIN and REVIEWER
 * rely on the cases:read route guard, while OFFICER and USER are checked
 * against the case scoping rules before any graph data is assembled.
 *
 * Only the structured graph shape ({ success, case, nodes, edges }) is
 * returned — never file/storage/credential metadata or contents.
 */

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.expose = true;
  return err;
}

const GRAPH_VIEWED_ACTION = "GRAPH_VIEWED";

async function getCaseEvidenceGraph(req, res, next) {
  try {
    const caseId = req.params.id;

    const caseRow = await findCaseById(caseId);
    if (!caseRow) {
      throw httpError(404, "Case not found");
    }

    // Same assignment-first visibility as GET /api/cases/:id, enforced
    // from the DB role. Defaults (ADMIN / REVIEWER) are handled by the
    // cases:read route guard.
    const actor = await getUserWithRoleAndPermissions(req.user.id);
    if (actor && (actor.role === "OFFICER" || actor.role === "USER")) {
      await assertCaseViewAccess(caseRow, actor, req.user.id);
    }

    const graph = await findCaseEvidenceGraph(caseId);
    if (!graph) {
      throw httpError(404, "Case not found");
    }

    // Fire-and-forget audit of the graph access. logAuditEvent swallows
    // audit-write failures outside a transaction, so an audit problem can
    // never break the read-only graph request. Only safe counts are
    // recorded — never values or metadata.
    await logAuditEvent({
      userId: req.user.id,
      action: GRAPH_VIEWED_ACTION,
      resourceType: "case",
      resourceId: Number(caseId),
      details: {
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        documentCount: graph.nodes.filter((n) => n.type === "document").length,
        entityCount: graph.nodes.filter((n) => n.type === "entity").length,
      },
    });

    return res.json({ success: true, ...graph });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getCaseEvidenceGraph,
  GRAPH_VIEWED_ACTION,
};