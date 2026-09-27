const { pool } = require("../config/database");
const { findCaseById } = require("./caseModel");
const {
  findAllDocuments,
  findVersionsByDocument,
} = require("./documentModel");

/**
 * Case Evidence / Entity Relationship Graph model — read-only assembly
 * of an "evidence map" for a single case.
 *
 * Layers (no new tables, no semantic inference):
 *
 *   Case
 *     └── Document            (documents.case_id)
 *           └── Version       (document_versions; CURRENT version only —
 *                              the version the extraction reflects)
 *                 └── Entity  (document_entities for that exact version)
 *
 * This is deliberately NOT a knowledge graph: edge types are exactly the
 * ones the stored schema already represents (case→document,
 * document→version, version→entity). It never invents entity→entity
 * relationships, never treats co-occurrence as a relationship, and never
 * fabricates an "entity → case reference" edge.
 *
 * The only relationships derived beyond raw rows are identity-level
 * (already implied by the stored data): the same normalized entity value
 * from different documents/versions is collapsed into ONE entity node
 * within the case graph, and `mentionCount` counts how many
 * (document, version) memberships reference it — never a co-occurrence.
 *
 * All output is safe public metadata only: case number/title/type/status,
 * document id/title/type/status/current version, and extracted, already
 * server-normalized entity values. No file_path, stored_file_name,
 * checksums, hashes, credentials, IPs, user agents, or document contents.
 *
 * Queries are read-only and parameterized. An optional `exec` executor
 * (pool/connection) may be supplied so tests can bind the isolated test
 * database.
 */

// Server-side entity groups the extractor may return. Mirrors
// backend/src/services/aiService.js ENTITY_GROUPS so the graph renders
// every group the AI extraction feature can persist, without importing
// (or altering) the AI service.
const ENTITY_GROUPS = Object.freeze([
  "people",
  "organizations",
  "locations",
  "dates",
  "caseReferenceNumbers",
]);

const GRAPH_MAX_ENTITY_CHARS = 200;

const ALLOWED_EDGE_TYPES = Object.freeze([
  "CASE_TO_DOCUMENT",
  "DOCUMENT_TO_VERSION",
  "VERSION_TO_ENTITY",
]);

/**
 * Normalize a single stored entity value for graph identity. Stored values
 * are already normalized by the extractor; this mirror guarantees a clean
 * cross-version key (trim, collapse whitespace, bound length). Pure and
 * never throws.
 *
 * @param {*} value
 * @returns {string|null}
 */
function normalizeEntityValue(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }
  if (normalized.length > GRAPH_MAX_ENTITY_CHARS) {
    return normalized.slice(0, GRAPH_MAX_ENTITY_CHARS);
  }
  return normalized;
}

/**
 * Read the stored AI-extracted entities for an exact (document, version)
 * pair. Same defensive JSON parsing as documentEntitiesModel so a corrupt
 * row degrades to an empty entity set rather than a failure.
 *
 * @param {number|string} documentId
 * @param {number|string} versionNumber
 * @param {object} [exec]
 * @returns {Promise<{entities: object}|null>}
 */
async function findGraphEntities(documentId, versionNumber, exec) {
  const executor = exec || pool;
  const [rows] = await executor.query(
    "SELECT document_id, version_number, entities " +
      "FROM document_entities " +
      "WHERE document_id = ? AND version_number = ? LIMIT 1",
    [documentId, versionNumber]
  );
  const row = rows[0] || null;
  if (!row) {
    return null;
  }
  let entities = {};
  try {
    const parsed =
      typeof row.entities === "string" ? JSON.parse(row.entities) : row.entities;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      entities = parsed;
    }
  } catch {
    entities = {};
  }
  return { ...row, entities };
}

/**
 * Project a case row to the safe, camel-cased graph summary.
 * @param {object} caseRow full row from findCaseById
 * @returns {object}
 */
function toSafeCase(caseRow) {
  return {
    id: Number(caseRow.id),
    caseNumber: caseRow.case_number || null,
    title: caseRow.title || null,
    caseType: caseRow.case_type || null,
    status: caseRow.status || null,
    priority: caseRow.priority || null,
  };
}

/**
 * Build the evidence/entity relationship graph for a single case.
 *
 * @param {number|string} caseId
 * @param {object} [exec] - pool or a transactional connection (tests).
 * @returns {Promise<{
 *   case: object,
 *   nodes: object[],
 *   edges: object[]
 * }|null>} null when the case does not exist
 */
async function findCaseEvidenceGraph(caseId, exec) {
  const caseRow = await findCaseById(caseId, exec);
  if (!caseRow) {
    return null;
  }

  const nodes = [];
  const edges = [];
  const nodeIds = new Set();
  const entityMap = new Map();

  function addNode(node) {
    if (!nodeIds.has(node.id)) {
      nodeIds.add(node.id);
      nodes.push(node);
    }
  }

  function addEdge(source, target, type) {
    if (!ALLOWED_EDGE_TYPES.includes(type)) {
      return;
    }
    edges.push({ source, target, type });
  }

  const caseNodeId = "case:" + caseRow.id;
  addNode({
    id: caseNodeId,
    type: "case",
    label: caseRow.case_number || "Case " + caseRow.id,
    metadata: {
      caseId: Number(caseRow.id),
      title: caseRow.title || null,
      caseType: caseRow.case_type || null,
      status: caseRow.status || null,
      priority: caseRow.priority || null,
    },
  });

  const documentsData = await findAllDocuments(
    { caseId, page: 1, limit: 100, sort: "created_at", order: "desc" },
    exec
  );
  const documents = (documentsData && documentsData.documents) || [];

  for (const doc of documents) {
    const docId = Number(doc.id);
    const docNodeId = "document:" + docId;
    addNode({
      id: docNodeId,
      type: "document",
      label: doc.title || "Document " + docId,
      metadata: {
        documentId: docId,
        documentType: doc.document_type || null,
        status: doc.status || null,
        currentVersion:
          doc.current_version != null ? Number(doc.current_version) : null,
      },
    });
    addEdge(caseNodeId, docNodeId, "CASE_TO_DOCUMENT");

    // Current-version only: entity extraction reflects the document's
    // current version, so older versions are not rendered in V1.
    const currentVersion =
      doc.current_version != null ? Number(doc.current_version) : null;
    const versions = await findVersionsByDocument(docId, exec);
    const version = currentVersion
      ? versions.find((v) => Number(v.version_number) === currentVersion)
      : versions[0];
    if (!version) {
      continue;
    }

    const versionNodeId = "version:" + docId + ":" + version.version_number;
    addNode({
      id: versionNodeId,
      type: "version",
      label: "v" + version.version_number,
      metadata: {
        documentId: docId,
        versionNumber: Number(version.version_number),
      },
    });
    addEdge(docNodeId, versionNodeId, "DOCUMENT_TO_VERSION");

    const entityRow = await findGraphEntities(
      docId,
      version.version_number,
      exec
    );
    if (!entityRow) {
      continue;
    }

    const entities = (entityRow.entities && entityRow.entities) || {};
    for (const group of ENTITY_GROUPS) {
      const values = Array.isArray(entities[group]) ? entities[group] : [];
      for (const raw of values) {
        const normalized = normalizeEntityValue(raw);
        if (!normalized) {
          continue;
        }

        const entityKey = group + ":" + normalized;
        const memberKey = String(docId) + ":" + version.version_number;

        let entry = entityMap.get(entityKey);
        if (!entry) {
          entry = {
            id: "entity:" + entityKey,
            label: normalized,
            group,
            memberVersions: new Set(),
            documentsMap: new Map(),
          };
          entityMap.set(entityKey, entry);
          addNode({
            id: entry.id,
            type: "entity",
            label: normalized,
            metadata: { group, mentionCount: 0 },
          });
        }

        entry.memberVersions.add(memberKey);

        let docEntry = entry.documentsMap.get(docId);
        if (!docEntry) {
          docEntry = {
            title: doc.title || "Document " + docId,
            versions: new Set(),
          };
          entry.documentsMap.set(docId, docEntry);
        }
        docEntry.versions.add(Number(version.version_number));

        addEdge(versionNodeId, entry.id, "VERSION_TO_ENTITY");
      }
    }
  }

  for (const entry of entityMap.values()) {
    const node = nodes.find((n) => n.id === entry.id);
    if (!node) {
      continue;
    }
    node.metadata.mentionCount = entry.memberVersions.size;
    node.metadata.documents = Array.from(entry.documentsMap.entries()).map(
      ([documentId, docEntry]) => ({
        documentId,
        documentTitle: docEntry.title,
        versions: Array.from(docEntry.versions).sort((a, b) => a - b),
      })
    );
  }

  return {
    case: toSafeCase(caseRow),
    nodes,
    edges,
  };
}

module.exports = {
  ENTITY_GROUPS,
  ALLOWED_EDGE_TYPES,
  normalizeEntityValue,
  findGraphEntities,
  toSafeCase,
  findCaseEvidenceGraph,
};