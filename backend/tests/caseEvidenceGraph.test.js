/**
 * Secure DMS — Case Evidence / Entity Relationship Graph Test Suite (V1)
 *
 * SAFETY: This suite runs ONLY against an isolated test database
 * (default: `<DB_NAME>_test`), never the application database. Every
 * model call receives the bound test pool as its explicit executor, and
 * the model functions used here never modify data. Controller tests stub
 * the model/user/permission/audit boundaries so no request-path code ever
 * touches the application database.
 *
 * Covers:
 *   1  unknown case (model returns null) + empty-graph safety
 *   2  case node shape + case with no documents (zero edges)
 *   3  case→document edges (CASE_TO_DOCUMENT)
 *   4  document→current version only (multi-version documents)
 *   5  version→entity edges + document with no extraction
 *   6  entity categories (all five groups) + within-group dedup
 *   7  entity dedup across documents + mentionCount + per-document refs
 *   8  multiple versions / old-version-only entities (current-only policy)
 *   9  sensitive-field exclusion (safe projection scan)
 *  10  no entity→entity edges (allowed edge types only)
 *  11  model database/query failure handling
 *  12  route wiring (GET /:id/evidence-graph, authenticate + [authorize, controller])
 *  13  authorization (cases:read allow/deny) + unauthenticated (missing token)
 *  14  controller response shape ({success, case, nodes, edges})
 *  15  controller 404 for unknown case
 *  16  controller 403 for a case the actor may not view (USER, not owner)
 *  17  controller forwards model failures to next()
 *
 * Usage:  node tests/caseEvidenceGraph.test.js   (from backend/)
 */

const {
  initDatabase,
  resetData,
  closePool,
} = require("./testDb");
const {
  ENTITY_GROUPS,
  ALLOWED_EDGE_TYPES,
  findCaseEvidenceGraph,
} = require("../src/models/caseEvidenceGraphModel");

let pass = 0;
let fail = 0;

function check(name, cond, detail) {
  if (cond) {
    console.log("  PASS " + name);
    pass++;
  } else {
    console.error("  FAIL " + name + (detail ? " -> " + detail : ""));
    fail++;
  }
}

function deepEqual(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function deepKeys(obj) {
  return Object.keys(obj).sort();
}

function invokeMiddleware(mw, req, onDone) {
  return new Promise((resolve) => {
    mw(req, {}, (err) => {
      onDone(err);
      resolve();
    });
  });
}

// Rows created by this suite are removed at the end so the shared isolated
// test database is left exactly as it was found (other suites aggregate
// counts/orderings over leftover rows and must not be skewed by us).
const createdCaseIds = [];
const createdDocumentIds = [];

const RUN_SUFFIX = "ceg" + Date.now();

async function main() {
  const db = await initDatabase();
  const { pool, testDbName } = db;
  const testUserId = db.userId;

  console.log("\n=== TEST 1: unknown case + empty-graph safety ===");
  const missing = await findCaseEvidenceGraph(99999999, pool);
  check("unknown case id resolves to null", missing === null);

  console.log("\n=== TEST 2: case node shape + case with no documents ===");
  async function insertCase({
    title,
    caseType = "Fraud",
    status = "open",
    priority = "medium",
    createdBy = testUserId,
    assignedTo = null,
  }) {
    const [res] = await pool.query(
      "INSERT INTO cases (case_number, title, case_type, status, priority, created_by, assigned_to) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        "CEG-" + RUN_SUFFIX + "-" + title + caseType + status + priority + Math.random().toString(16).slice(2, 6),
        title || "Graph Case",
        caseType,
        status,
        priority,
        createdBy,
        assignedTo,
      ]
    );
    createdCaseIds.push(res.insertId);
    return res.insertId;
  }
  async function insertDocument({
    caseId,
    title,
    docType = "evidence",
    status = "active",
    currentVersion = 1,
    uploadedBy = testUserId,
  }) {
    const [res] = await pool.query(
      "INSERT INTO documents " +
        "(case_id, title, description, document_type, status, current_version, uploaded_by) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
      [
        caseId,
        title,
        "seeded graph document",
        docType,
        status,
        currentVersion,
        uploadedBy,
      ]
    );
    createdDocumentIds.push(res.insertId);
    return res.insertId;
  }
  async function insertVersion({
    documentId,
    versionNumber,
    checksum = null,
    storedFileName = "ceg-stored-" + RUN_SUFFIX + ".pdf",
  }) {
    const [res] = await pool.query(
      "INSERT INTO document_versions " +
        "(document_id, version_number, file_path, original_file_name, stored_file_name, " +
        "mime_type, file_size, checksum, uploaded_by) " +
        "VALUES (?, ?, ?, ?, ?, 'application/pdf', 1000, ?, ?)",
      [
        documentId,
        versionNumber,
        "ceg_test/relative_" + RUN_SUFFIX + ".pdf",
        "ceg-evidence.pdf",
        storedFileName,
        checksum,
        testUserId,
      ]
    );
    return res.insertId;
  }
  async function insertEntities({ documentId, versionNumber, entities, model = "gemini-ceg-test" }) {
    await pool.query(
      "INSERT INTO document_entities (document_id, version_number, entities, model) " +
        "VALUES (?, ?, ?, ?)",
      [documentId, versionNumber, JSON.stringify(entities), model]
    );
  }

  const emptyCase = await insertCase({ title: "Empty" });
  const emptyGraph = await findCaseEvidenceGraph(emptyCase, pool);
  check(
    "empty case returns exactly one node (the case) and zero edges",
    emptyGraph &&
      emptyGraph.nodes.length === 1 &&
      emptyGraph.edges.length === 0 &&
      emptyGraph.nodes[0].id === "case:" + emptyCase &&
      emptyGraph.nodes[0].type === "case"
  );
  check(
    "case summary is the safe camel-cased projection",
    deepEqual(deepKeys(emptyGraph.case), ["caseNumber", "caseType", "id", "priority", "status", "title"]) &&
      emptyGraph.case.id === emptyCase &&
      emptyGraph.case.caseType === "Fraud" &&
      emptyGraph.case.status === "open" &&
      emptyGraph.case.priority === "medium"
  );
  check(
    "case node label is the case number and metadata is complete",
    emptyGraph.nodes[0].label === emptyGraph.case.caseNumber &&
      deepEqual(deepKeys(emptyGraph.nodes[0].metadata), ["caseId", "caseType", "priority", "status", "title"]) &&
      emptyGraph.nodes[0].metadata.caseId === emptyCase
  );
  check(
    "ENTITY_GROUPS matches the extractor's five groups",
    deepEqual(ENTITY_GROUPS, ["people", "organizations", "locations", "dates", "caseReferenceNumbers"])
  );

  console.log("\n=== TEST 3: case→document edges (CASE_TO_DOCUMENT) ===");
  const caseWithDocs = await insertCase({ title: "Docs" });
  const docA = await insertDocument({ caseId: caseWithDocs, title: "Witness Statement A", docType: "Witness Statement" });
  const docB = await insertDocument({ caseId: caseWithDocs, title: "Forensic Report B", docType: "Forensic Report" });
  await insertVersion({ documentId: docA, versionNumber: 1 });
  await insertVersion({ documentId: docB, versionNumber: 1 });
  const docsGraph = await findCaseEvidenceGraph(caseWithDocs, pool);
  const caseToDocEdges = docsGraph.edges.filter((e) => e.type === "CASE_TO_DOCUMENT");
  check(
    "one CASE_TO_DOCUMENT edge per document, sourced from the case node",
    caseToDocEdges.length === 2 &&
      caseToDocEdges.every((e) => e.source === "case:" + caseWithDocs) &&
      deepEqual(caseToDocEdges.map((e) => e.target).sort(), ["document:" + docA, "document:" + docB].sort())
  );
  const docANode = docsGraph.nodes.find((n) => n.id === "document:" + docA);
  check(
    "document node carries safe metadata only",
    docANode &&
      docANode.type === "document" &&
      deepEqual(deepKeys(docANode.metadata), ["currentVersion", "documentId", "documentType", "status"]) &&
      docANode.metadata.documentId === docA &&
      docANode.metadata.documentType === "Witness Statement" &&
      docANode.metadata.status === "active" &&
      docANode.metadata.currentVersion === 1,
    JSON.stringify(docANode)
  );

  console.log("\n=== TEST 4: document→current version only ===");
  const multiCase = await insertCase({ title: "Multi" });
  const multiDoc = await insertDocument({ caseId: multiCase, title: "Multi Version Doc", currentVersion: 3 });
  await insertVersion({ documentId: multiDoc, versionNumber: 1 });
  await insertVersion({ documentId: multiDoc, versionNumber: 2 });
  await insertVersion({ documentId: multiDoc, versionNumber: 3 });
  const onlyV1Doc = await insertDocument({ caseId: multiCase, title: "Only V1 Current", currentVersion: 1 });
  await insertVersion({ documentId: onlyV1Doc, versionNumber: 1 });
  await insertVersion({ documentId: onlyV1Doc, versionNumber: 2 });
  const multiGraph = await findCaseEvidenceGraph(multiCase, pool);
  const docToVer = multiGraph.edges.filter((e) => e.type === "DOCUMENT_TO_VERSION");
  check(
    "exactly one DOCUMENT_TO_VERSION edge per document, targeting the current version",
    docToVer.length === 2 &&
      docToVer.some((e) => e.source === "document:" + multiDoc && e.target === "version:" + multiDoc + ":3") &&
      docToVer.some((e) => e.source === "document:" + onlyV1Doc && e.target === "version:" + onlyV1Doc + ":1")
  );
  check(
    "non-current versions 1,2 of multiDoc and version 2 of onlyV1Doc are not rendered",
    !multiGraph.nodes.some((n) => n.id === "version:" + multiDoc + ":1") &&
      !multiGraph.nodes.some((n) => n.id === "version:" + multiDoc + ":2") &&
      !multiGraph.nodes.some((n) => n.id === "version:" + onlyV1Doc + ":2")
  );
  check(
    "version node metadata is {documentId, versionNumber} only",
    (() => {
      const v = multiGraph.nodes.find((n) => n.id === "version:" + multiDoc + ":3");
      return v && v.type === "version" && deepEqual(deepKeys(v.metadata), ["documentId", "versionNumber"]) &&
        v.metadata.documentId === multiDoc && v.metadata.versionNumber === 3;
    })()
  );

  console.log("\n=== TEST 5: version→entity edges + document with no extraction ===");
  const entityCase = await insertCase({ title: "Entities" });
  const withPeople = await insertDocument({ caseId: entityCase, title: "Extracted Doc" });
  await insertVersion({ documentId: withPeople, versionNumber: 1 });
  await insertEntities({
    documentId: withPeople,
    versionNumber: 1,
    entities: { people: ["Ravi Kumar"], organizations: [] },
  });
  const noExtraction = await insertDocument({ caseId: entityCase, title: "No Extraction Yet" });
  await insertVersion({ documentId: noExtraction, versionNumber: 1 });
  const entityGraph = await findCaseEvidenceGraph(entityCase, pool);
  check(
    "VERSION_TO_ENTITY edge connects version node to the extracted entity",
    entityGraph.edges.some(
      (e) => e.type === "VERSION_TO_ENTITY" &&
        e.source === "version:" + withPeople + ":1" &&
        e.target === "entity:people:Ravi Kumar"
    )
  );
  check(
    "document with no extraction still renders document + version with zero entity children",
    entityGraph.nodes.some((n) => n.id === "version:" + noExtraction + ":1") &&
      !entityGraph.edges.some((e) => e.source === "version:" + noExtraction + ":1")
  );
  check(
    "entity node shape + metadata (group, mentionCount) are correct",
    (() => {
      const n = entityGraph.nodes.find((x) => x.id === "entity:people:Ravi Kumar");
      return n && n.type === "entity" && n.label === "Ravi Kumar" &&
        n.metadata.group === "people" && n.metadata.mentionCount === 1 &&
        deepEqual(deepKeys(n.metadata), ["documents", "group", "mentionCount"]);
    })(),
    JSON.stringify(entityGraph.nodes)
  );

  console.log("\n=== TEST 6: entity categories + within-group dedup ===");
  const catCase = await insertCase({ title: "Cats" });
  const catDoc = await insertDocument({ caseId: catCase, title: "All Group Doc", docType: "report" });
  await insertVersion({ documentId: catDoc, versionNumber: 1 });
  await insertEntities({
    documentId: catDoc,
    versionNumber: 1,
    entities: {
      people: ["Dr. Rao", "Dr. Rao"],
      organizations: ["CyberCell Unit"],
      locations: ["Hyderabad"],
      dates: ["2025-01-15"],
      caseReferenceNumbers: ["FIR-2025-088"],
    },
  });
  const catGraph = await findCaseEvidenceGraph(catCase, pool);
  const catEntities = catGraph.nodes.filter((n) => n.type === "entity");
  check(
    "all five entity groups render as entity nodes",
    catEntities.length === 5 &&
      deepEqual(
        catEntities.map((n) => n.metadata.group).sort(),
        ["caseReferenceNumbers", "dates", "locations", "organizations", "people"].sort()
      )
  );
  check(
    "duplicate values within one version collapse into a single entity node",
    catEntities.filter((n) => n.id === "entity:people:Dr. Rao").length === 1 &&
      catEntities.filter((n) => n.id === "entity:people:Dr. Rao")[0].metadata.mentionCount === 1
  );
  check(
    "entity ids are group:value stable keys",
    catGraph.nodes.some((n) => n.id === "entity:people:Dr. Rao") &&
      catGraph.nodes.some((n) => n.id === "entity:organizations:CyberCell Unit") &&
      catGraph.nodes.some((n) => n.id === "entity:caseReferenceNumbers:FIR-2025-088")
  );
  check(
    "each entity node receives a VERSION_TO_ENTITY edge",
    catEntities.every(
      (n) => catGraph.edges.some((e) => e.type === "VERSION_TO_ENTITY" && e.target === n.id)
    )
  );

  console.log("\n=== TEST 7: entity dedup across documents + mentionCount + doc refs ===");
  const sharedCase = await insertCase({ title: "Shared" });
  const shareDoc1 = await insertDocument({ caseId: sharedCase, title: "Statement One" });
  await insertVersion({ documentId: shareDoc1, versionNumber: 1 });
  await insertEntities({ documentId: shareDoc1, versionNumber: 1, entities: { people: ["Ravi Kumar"] } });
  const shareDoc2 = await insertDocument({ caseId: sharedCase, title: "Statement Two" });
  await insertVersion({ documentId: shareDoc2, versionNumber: 1 });
  await insertEntities({ documentId: shareDoc2, versionNumber: 1, entities: { people: ["Ravi Kumar"] } });
  const sharedGraph = await findCaseEvidenceGraph(sharedCase, pool);
  const sharedEntityNode = sharedGraph.nodes.filter((n) => n.id === "entity:people:Ravi Kumar");
  check(
    "the same normalized entity across two documents is ONE node",
    sharedEntityNode.length === 1
  );
  check(
    "mentionCount counts distinct (document, version) memberships (=2)",
    sharedEntityNode[0].metadata.mentionCount === 2
  );
  check(
    "both documents link to the shared entity via VERSION_TO_ENTITY",
    sharedGraph.edges.filter(
      (e) => e.type === "VERSION_TO_ENTITY" && e.target === "entity:people:Ravi Kumar"
    ).length === 2
  );
  check(
    "entity node lists both documents with titles and versions",
    (() => {
      const docs = sharedEntityNode[0].metadata.documents;
      return docs.length === 2 &&
        docs.some((d) => d.documentId === shareDoc1 && d.documentTitle === "Statement One" && deepEqual(d.versions, [1])) &&
        docs.some((d) => d.documentId === shareDoc2 && d.documentTitle === "Statement Two" && deepEqual(d.versions, [1]));
    })(),
    JSON.stringify(sharedEntityNode[0].metadata.documents)
  );

  console.log("\n=== TEST 8: multiple versions + old-version-only entities ===");
  const verCase = await insertCase({ title: "Vers" });
  const curDoc = await insertDocument({ caseId: verCase, title: "Current Entity Doc", currentVersion: 2 });
  await insertVersion({ documentId: curDoc, versionNumber: 1 });
  await insertEntities({ documentId: curDoc, versionNumber: 1, entities: { people: ["Old-Session Person"] } });
  await insertVersion({ documentId: curDoc, versionNumber: 2 });
  await insertEntities({
    documentId: curDoc,
    versionNumber: 2,
    entities: { people: ["Old-Session Person", "Current Person"] },
  });
  const verGraph = await findCaseEvidenceGraph(verCase, pool);
  check(
    "only the current version (2) is rendered; version 1 is hidden",
    verGraph.nodes.some((n) => n.id === "version:" + curDoc + ":2") &&
      !verGraph.nodes.some((n) => n.id === "version:" + curDoc + ":1")
  );
  check(
    "entity existing in the current version appears exactly once with mentionCount 1",
    verGraph.nodes.filter((n) => n.id === "entity:people:Old-Session Person").length === 1 &&
      verGraph.nodes.filter((n) => n.id === "entity:people:Old-Session Person")[0].metadata.mentionCount === 1
  );
  check(
    "the entity is listed for the current version membership only",
    deepEqual(
      verGraph.nodes
        .filter((n) => n.id === "entity:people:Old-Session Person")[0]
        .metadata.documents[0].versions,
      [2]
    )
  );

  console.log("\n=== TEST 9: sensitive-field exclusion (safe projection scan) ===");
  const secretChecksum = "a".repeat(64);
  const secretPath = "ceg_secret/storage/" + RUN_SUFFIX + ".pdf";
  const secretStoredName = "ceg-stored-secret-" + RUN_SUFFIX + ".pdf";
  const secretOriginal = "ceg-original-secret.pdf";
  const safeCase = await insertCase({ title: "Safe" });
  const safeDoc = await insertDocument({ caseId: safeCase, title: "Safe Doc" });
  await insertVersion({
    documentId: safeDoc,
    versionNumber: 1,
    checksum: secretChecksum,
    storedFileName: secretStoredName,
  });
  await insertEntities({ documentId: safeDoc, versionNumber: 1, entities: { locations: ["Mumbai"] } });
  const safeGraph = await findCaseEvidenceGraph(safeCase, pool);
  const serialized = JSON.stringify(safeGraph);
  check(
    "checksum / file paths / stored names never appear in the graph",
    !serialized.includes(secretChecksum) &&
      !serialized.includes(secretPath) &&
      !serialized.includes(secretStoredName) &&
      !serialized.includes(secretOriginal)
  );
  check(
    "no sensitive key names leak (file_path, stored_file_name, checksum, mime_type)",
    !/"file_path"|"stored_file_name"|"checksum"|"mime_type"|"file_size"|"original_file_name"/.test(serialized)
  );
  check(
    "case/document/version summaries carry exact safe key sets",
    deepEqual(deepKeys(safeGraph.case), ["caseNumber", "caseType", "id", "priority", "status", "title"]) &&
      (() => {
        const dn = safeGraph.nodes.find((n) => n.type === "document");
        const vn = safeGraph.nodes.find((n) => n.type === "version");
        return dn && vn &&
          deepEqual(deepKeys(dn.metadata), ["currentVersion", "documentId", "documentType", "status"]) &&
          deepEqual(deepKeys(vn.metadata), ["documentId", "versionNumber"]);
      })(),
    serialized.slice(0, 400)
  );

  console.log("\n=== TEST 10: no entity→entity edges (allowed edge types only) ===");
  const combined = await findCaseEvidenceGraph(sharedCase, pool);
  check(
    "every edge type is in the allowed set",
    combined.edges.every((e) => ALLOWED_EDGE_TYPES.includes(e.type))
  );
  check(
    "no edge ever sources from an entity node",
    combined.edges.every((e) => e.source.indexOf("entity:") !== 0)
  );
  check(
    "document→version and version→entity edge directionality is correct",
    combined.edges.every((e) => {
      if (e.type === "DOCUMENT_TO_VERSION") {
        return e.source.indexOf("document:") === 0 && e.target.indexOf("version:") === 0;
      }
      if (e.type === "VERSION_TO_ENTITY") {
        return e.source.indexOf("version:") === 0 && e.target.indexOf("entity:") === 0;
      }
      return true;
    })
  );
  check(
    "no co-occurrence / semantic entity→case reference edges are invented",
    !combined.edges.some((e) => e.type.indexOf("ENTITY") === 0 || e.type.indexOf("REFERENCE") >= 0)
  );

  console.log("\n=== TEST 11: model database/query failure handling ===");
  const simulatedError = new Error("simulated graph query failure");
  const brokenExecutor = { query: async () => { throw simulatedError; } };
  let modelRejected = null;
  try {
    await findCaseEvidenceGraph(444, brokenExecutor);
  } catch (err) {
    modelRejected = err;
  }
  check(
    "findCaseEvidenceGraph propagates query failures",
    modelRejected === simulatedError,
    String(modelRejected)
  );

  console.log("\n=== TEST 12: route wiring — GET /api/cases/:id/evidence-graph ===");
  const graphRoutes = require("../src/routes/caseEvidenceGraphRoutes");
  const routeLayer = graphRoutes.stack.find(
    (l) => l.route && l.route.path === "/:id/evidence-graph"
  );
  check(
    "GET route is registered with the /:id/evidence-graph path",
    Boolean(routeLayer) && routeLayer.route.methods.get === true
  );
  check(
    "router applies authenticate before the route layer",
    graphRoutes.stack.some((l) => l.name === "authenticate") &&
      graphRoutes.stack.indexOf(graphRoutes.stack.find((l) => l.name === "authenticate")) <
        graphRoutes.stack.indexOf(routeLayer)
  );
  check(
    "route layer order is [authorize, controller]",
    routeLayer &&
      routeLayer.route.stack.length === 2 &&
      routeLayer.route.stack[0].handle.name === "authorizeMiddleware" &&
      routeLayer.route.stack[1].handle.name === "getCaseEvidenceGraph"
  );
  const appSrc = require("fs").readFileSync(require("path").join(__dirname, "..", "src", "app.js"), "utf8");
  check(
    "evidence-graph router is mounted under /api/cases in app.js",
    /caseEvidenceGraphRoutes/.test(appSrc) && /app\.use\("\/api\/cases", caseEvidenceGraphRoutes\)/.test(appSrc)
  );

  console.log("\n=== TEST 13: authorization (cases:read) + unauthenticated ===");
  const userModelPath = require.resolve("../src/models/userModel");
  const authMiddlewarePath = require.resolve("../src/middleware/authMiddleware");
  const userModel = require("../src/models/userModel");
  const originalUserPermissionsFn = userModel.getUserWithRoleAndPermissions;

  userModel.getUserWithRoleAndPermissions = async () => ({
    roleName: "ADMIN",
    permissions: ["cases:read"],
  });
  delete require.cache[authMiddlewarePath];
  const authAllow = require(authMiddlewarePath);
  let allowResult = "NOT_CALLED";
  await invokeMiddleware(
    authAllow.authorize("cases:read"),
    { user: { id: 999 } },
    (err) => { allowResult = err; }
  );
  check(
    "admin with cases:read passes the authorize middleware",
    allowResult == null
  );

  userModel.getUserWithRoleAndPermissions = async () => ({
    roleName: "USER",
    permissions: [],
  });
  delete require.cache[authMiddlewarePath];
  const authDeny = require(authMiddlewarePath);
  let denyResult = "NOT_CALLED";
  await invokeMiddleware(
    authDeny.authorize("cases:read"),
    { user: { id: 999 } },
    (err) => { denyResult = err; }
  );
  check(
    "role without cases:read is denied with a 403",
    denyResult && denyResult.statusCode === 403 && denyResult.expose === true
  );

  delete require.cache[authMiddlewarePath];
  const authNoUser = require(authMiddlewarePath);
  let noUserResult = "NOT_CALLED";
  await invokeMiddleware(
    authNoUser.authorize("cases:read"),
    {},
    (err) => { noUserResult = err; }
  );
  check(
    "missing user is rejected with a 401",
    noUserResult && noUserResult.statusCode === 401
  );

  let authRes = "NOT_CALLED";
  await invokeMiddleware(
    authNoUser.authenticate,
    { headers: {} },
    (err) => { authRes = err; }
  );
  check(
    "authenticate rejects requests with no Bearer token (401)",
    authRes && authRes.statusCode === 401
  );

  userModel.getUserWithRoleAndPermissions = originalUserPermissionsFn;
  delete require.cache[authMiddlewarePath];

  console.log("\n=== TEST 14: controller response shape ===");
  const gModelPath = require.resolve("../src/models/caseEvidenceGraphModel");
  const caseModelPath = require.resolve("../src/models/caseModel");
  const auditModelPath = require.resolve("../src/models/auditLogModel");
  const ctrlPath = require.resolve("../src/controllers/caseEvidenceGraphController");
  const gModel = require("../src/models/caseEvidenceGraphModel");
  const caseModel = require("../src/models/caseModel");
  const auditModel = require("../src/models/auditLogModel");
  const savedGraphFn = gModel.findCaseEvidenceGraph;
  const savedCaseFn = caseModel.findCaseById;
  const savedUserFn = userModel.getUserWithRoleAndPermissions;
  const savedAuditFn = auditModel.logAuditEvent;

  const cannedCaseRow = {
    id: 7,
    case_number: "CEG-CANNED-7",
    title: "Canned Evidence Case",
    case_type: "Fraud",
    status: "open",
    priority: "high",
    created_by: 1,
    assigned_to: null,
  };
  const cannedGraph = {
    case: { id: 7, caseNumber: "CEG-CANNED-7", title: "Canned Evidence Case", caseType: "Fraud", status: "open", priority: "high" },
    nodes: [{ id: "case:7", type: "case", label: "CEG-CANNED-7", metadata: {} }],
    edges: [],
  };

  let auditCalls = 0;
  caseModel.findCaseById = async () => cannedCaseRow;
  userModel.getUserWithRoleAndPermissions = async () => ({
    roleName: "ADMIN",
    role: "ADMIN",
    permissions: ["cases:read"],
  });
  gModel.findCaseEvidenceGraph = async () => cannedGraph;
  auditModel.logAuditEvent = async () => { auditCalls++; return null; };
  delete require.cache[ctrlPath];
  const controller = require(ctrlPath);

  let controllerBody = null;
  let controllerErr = null;
  await controller.getCaseEvidenceGraph(
    { params: { id: "7" }, user: { id: 1 } },
    { json: (body) => { controllerBody = body; } },
    (err) => { controllerErr = err; }
  );
  check(
    "controller responds success:true with { case, nodes, edges }",
    controllerErr == null &&
      controllerBody &&
      controllerBody.success === true &&
      deepEqual(deepKeys(controllerBody), ["case", "edges", "nodes", "success"]) &&
      controllerBody.case.id === 7 &&
      controllerBody.nodes.length === 1 &&
      controllerBody.edges.length === 0
  );
  check(
    "controller recorded the GRAPH_VIEWED audit event",
    auditCalls === 1
  );

  console.log("\n=== TEST 15: controller 404 for unknown case ===");
  caseModel.findCaseById = async () => null;
  delete require.cache[ctrlPath];
  const controller404 = require(ctrlPath);
  let body404 = null;
  let err404 = "NOT_CALLED";
  await controller404.getCaseEvidenceGraph(
    { params: { id: "abc" }, user: { id: 1 } },
    { json: (b) => { body404 = b; } },
    (err) => { err404 = err; }
  );
  check(
    "unknown case forwards a 404 to next()",
    err404 && err404.statusCode === 404 && err404.expose === true && body404 === null,
    String(err404)
  );

  console.log("\n=== TEST 16: controller 403 for a case the actor may not view ===");
  caseModel.findCaseById = async () => ({ id: 55, created_by: 998, assigned_to: null });
  userModel.getUserWithRoleAndPermissions = async () => ({
    roleName: "USER",
    role: "USER",
    permissions: ["cases:read"],
  });
  delete require.cache[ctrlPath];
  const controller403 = require(ctrlPath);
  let body403 = null;
  let err403 = "NOT_CALLED";
  await controller403.getCaseEvidenceGraph(
    { params: { id: "55" }, user: { id: 1 } },
    { json: (b) => { body403 = b; } },
    (err) => { err403 = err; }
  );
  check(
    "USER viewing a case they did not create is denied with 403",
    err403 && err403.statusCode === 403 && err403.expose === true && body403 === null,
    String(err403)
  );

  console.log("\n=== TEST 17: controller forwards model failures to next() ===");
  caseModel.findCaseById = async () => cannedCaseRow;
  userModel.getUserWithRoleAndPermissions = async () => ({
    roleName: "ADMIN",
    role: "ADMIN",
    permissions: ["cases:read"],
  });
  gModel.findCaseEvidenceGraph = async () => { throw simulatedError; };
  auditModel.logAuditEvent = async () => null;
  delete require.cache[ctrlPath];
  const controller3 = require(ctrlPath);
  let controllerErr3 = "NOT_CALLED";
  let jsonCalled = false;
  await controller3.getCaseEvidenceGraph(
    { params: { id: "7" }, user: { id: 1 } },
    { json: () => { jsonCalled = true; } },
    (err) => { controllerErr3 = err; }
  );
  check(
    "controller forwards model failures to next() without responding",
    controllerErr3 === simulatedError && !jsonCalled
  );

  gModel.findCaseEvidenceGraph = savedGraphFn;
  caseModel.findCaseById = savedCaseFn;
  userModel.getUserWithRoleAndPermissions = savedUserFn;
  auditModel.logAuditEvent = savedAuditFn;
  delete require.cache[gModelPath];
  delete require.cache[caseModelPath];
  delete require.cache[userModelPath];
  delete require.cache[auditModelPath];
  delete require.cache[ctrlPath];

  console.log("\n=== cleanup: remove suite rows so other suites stay unskewed ===");
  if (createdDocumentIds.length) {
    const inClause = createdDocumentIds.map(() => "?").join(",");
    await pool.query(
      "DELETE FROM document_entities WHERE document_id IN (" + inClause + ")",
      createdDocumentIds
    );
    await pool.query(
      "DELETE FROM document_versions WHERE document_id IN (" + inClause + ")",
      createdDocumentIds
    );
    await pool.query(
      "DELETE FROM documents WHERE id IN (" + inClause + ")",
      createdDocumentIds
    );
  }
  if (createdCaseIds.length) {
    const inClause = createdCaseIds.map(() => "?").join(",");
    await pool.query("DELETE FROM cases WHERE id IN (" + inClause + ")", createdCaseIds);
  }
  console.log("removed " + createdCaseIds.length + " cases / " + createdDocumentIds.length + " documents");

  console.log("\n=== cleanup: test database row audit remains intact ===");
  await resetData(pool, testDbName);
  await closePool(pool);

  console.log("\n========== RESULTS ==========");
  console.log("TEST DATABASE: " + testDbName);
  console.log("PASSED: " + pass);
  console.log("FAILED: " + fail);
  console.log("=============================");
  // Controller/route tests transitively load caseController, which pulls
  // in the application DB pool; exit explicitly so the runner terminates.
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});