/**
 * Secure DMS — Admin Analytics / System Dashboard Test Suite
 *
 * SAFETY: This suite runs ONLY against an isolated test database
 * (default: `<DB_NAME>_test`), never the application database. Every
 * model call receives the bound test pool as its explicit executor, and
 * resetData() re-asserts the active database name before any destructive
 * SQL. Aggregate assertions use before/after deltas so leftover rows from
 * any earlier run can never cause a false failure.
 *
 * Covers:
 *   1  empty-database shape / zero-fill (audit-derived metrics are zero)
 *   2  user role aggregation (reuses Security Center user aggregation)
 *   3  case aggregation (total + byStatus + byPriority + byType)
 *   4  case status aggregation (canonical zero-fill + exact deltas)
 *   5  case priority aggregation (canonical zero-fill + exact deltas)
 *   6  case type aggregation (only types that actually exist)
 *   7  document / version aggregation + byType
 *   8  review aggregation (approved/rejected/returned)
 *   9  integrity aggregation (reuses last-check-wins derivation)
 *  10  AI audit aggregation (real audit actions only)
 *  11  recent activity ordering (newest first) + limit
 *  12  sensitive-field exclusion (safe projection + no-secrets scan)
 *  13  controller response shape (success: true + full overview)
 *  14  route wiring (GET /, authenticate ordering, [authorize, controller])
 *  15  ADMIN authorization (audit:read allow)
 *  16  non-admin rejection (403) + missing user (401)
 *  17  database/query failure handling (model + controller boundary)
 *
 * No external services (Gemini etc.) are required.
 *
 * Usage:  node tests/adminAnalytics.test.js   (from backend/)
 */

const {
  initDatabase,
  resetData,
  closePool,
} = require("./testDb");
const {
  AI_ACTIONS,
  RECENT_ACTIVITY_LIMIT,
  getAdminAnalyticsOverview,
  aggregateCases,
  aggregateDocuments,
  aggregateUsers,
  aggregateReviews,
  aggregateIntegrity,
  aggregateAi,
  getRecentActivity,
} = require("../src/models/adminAnalyticsModel");
const { CASE_STATUSES, CASE_PRIORITIES } = require("../src/models/caseModel");
const { REVIEW_ACTIONS } = require("../src/models/reviewModel");
const { toSafeActivityEvent } = require("../src/controllers/adminAnalyticsController");

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

const EXPECTED_TOP_LEVEL_KEYS = [
  "activity",
  "ai",
  "cases",
  "documents",
  "integrity",
  "reviews",
  "users",
];

function invokeMiddleware(mw, req, onDone) {
  return new Promise((resolve) => {
    mw(req, {}, (err) => {
      onDone(err);
      resolve();
    });
  });
}

function keyedCounts(rows, keyName) {
  const map = {};
  for (const entry of rows) {
    map[entry[keyName]] = entry.count;
  }
  return map;
}

const statusCounts = (rows) => keyedCounts(rows, "status");
const priorityCounts = (rows) => keyedCounts(rows, "priority");
const typeCounts = (rows) => keyedCounts(rows, "type");
const roleCounts = (rows) => keyedCounts(rows, "role");
const decisionCounts = (rows) => keyedCounts(rows, "decision");

const RUN_SUFFIX = "aa" + Date.now();

async function main() {
  const db = await initDatabase();
  const { pool, testDbName } = db;

  console.log("\n=== TEST 1: empty-database shape + zero-fill ===");
  await resetData(pool, testDbName);

  const empty = await getAdminAnalyticsOverview(pool);
  check(
    "top-level key set is stable",
    deepEqual(deepKeys(empty), EXPECTED_TOP_LEVEL_KEYS)
  );
  check(
    "audit-derived AI counts are zero on an empty audit log",
    empty.ai.questions === 0 &&
      empty.ai.summaries === 0 &&
      empty.ai.classifications === 0 &&
      empty.ai.entityExtractions === 0,
    JSON.stringify(empty.ai)
  );
  check(
    "recent activity is an empty array",
    Array.isArray(empty.activity) && empty.activity.length === 0
  );
  check(
    "cases aggregate exposes total + three breakdown arrays",
    Number.isInteger(empty.cases.total) &&
      Array.isArray(empty.cases.byStatus) &&
      Array.isArray(empty.cases.byPriority) &&
      Array.isArray(empty.cases.byType)
  );
  check(
    "status breakdown is canonical and zero-filled",
    deepEqual(
      empty.cases.byStatus.map((r) => r.status),
      CASE_STATUSES
    ) &&
      empty.cases.byStatus.every(
        (r) => Number.isInteger(r.count) && r.count >= 0
      )
  );
  check(
    "priority breakdown is canonical and zero-filled",
    deepEqual(
      empty.cases.byPriority.map((r) => r.priority),
      CASE_PRIORITIES
    ) &&
      empty.cases.byPriority.every(
        (r) => Number.isInteger(r.count) && r.count >= 0
      )
  );
  check(
    "status + priority buckets sum back to total cases",
    empty.cases.byStatus.reduce((s, r) => s + r.count, 0) ===
      empty.cases.total &&
      empty.cases.byPriority.reduce((s, r) => s + r.count, 0) ===
        empty.cases.total
  );
  check(
    "documents aggregate exposes numeric total/versions + byType array",
    Number.isInteger(empty.documents.total) &&
      Number.isInteger(empty.documents.versions) &&
      Array.isArray(empty.documents.byType)
  );
  check(
    "users aggregate exposes total + byRole array",
    Number.isInteger(empty.users.total) && Array.isArray(empty.users.byRole)
  );
  check(
    "review decisions are canonical with stable {decision, count} items",
    deepEqual(
      empty.reviews.byDecision.map((r) => r.decision),
      REVIEW_ACTIONS
    ) &&
      empty.reviews.byDecision.every(
        (r) => typeof r.decision === "string" && Number.isInteger(r.count) && r.count >= 0
      ),
    JSON.stringify(empty.reviews.byDecision)
  );
  check(
    "integrity exposes the three buckets",
    deepEqual(deepKeys(empty.integrity), ["failed", "notVerified", "verified"])
  );
  check(
    "no secrets/paths leak from the empty response",
    !/password|file_path|stored_file_name|checksum|secret|BEGIN|api[_-]?key/i.test(
      JSON.stringify(empty)
    )
  );

  const baselineCases = empty.cases.total;
  const baselineDocs = { total: empty.documents.total, versions: empty.documents.versions };
  const baselineUsers = empty.users;
  const baselineReviews = empty.reviews;
  const baselineIntegrity = empty.integrity;
  const baselineStatus = statusCounts(empty.cases.byStatus);
  const baselinePriority = priorityCounts(empty.cases.byPriority);

  console.log("\n=== TEST 2: user role aggregation ===");
  async function insertUser(username, fullName, roleName) {
    const [roleRows] = await pool.query(
      "SELECT id FROM roles WHERE name = ? LIMIT 1",
      [roleName]
    );
    const roleId = roleRows[0] ? roleRows[0].id : null;
    const [res] = await pool.query(
      "INSERT INTO users (username, email, password_hash, full_name, is_active, role_id) " +
        "VALUES (?, ?, '__test_placeholder_hash____do_not_use__', ?, 1, ?)",
      [username, username + "@example.local", fullName, roleId]
    );
    return res.insertId;
  }

  const officerA = await insertUser(
    "__dms_aa_officer_a_" + RUN_SUFFIX + "__",
    "AA Officer A",
    "OFFICER"
  );
  const reviewerB = await insertUser(
    "__dms_aa_reviewer_b_" + RUN_SUFFIX + "__",
    "AA Reviewer B",
    "REVIEWER"
  );
  const userC = await insertUser(
    "__dms_aa_user_c_" + RUN_SUFFIX + "__",
    "AA User C",
    "USER"
  );

  const usersAgg = await aggregateUsers(pool);
  check(
    "user total gained exactly 3",
    usersAgg.total - baselineUsers.total === 3,
    "delta=" + (usersAgg.total - baselineUsers.total)
  );
  const rolesAfter = roleCounts(usersAgg.byRole);
  const rolesBefore = roleCounts(baselineUsers.byRole);
  check(
    "OFFICER +1, REVIEWER +1, USER +1",
    (rolesAfter.OFFICER || 0) - (rolesBefore.OFFICER || 0) === 1 &&
      (rolesAfter.REVIEWER || 0) - (rolesBefore.REVIEWER || 0) === 1 &&
      (rolesAfter.USER || 0) - (rolesBefore.USER || 0) === 1,
    JSON.stringify(rolesAfter)
  );
  check(
    "byRole entries are stable {role, count} items",
    usersAgg.byRole.every(
      (e) => typeof e.role === "string" && Number.isInteger(e.count)
    )
  );

  console.log("\n=== TEST 3: case aggregation (total + status + priority + type) ===");
  async function insertCase(caseNumber, caseType, status, priority) {
    const [res] = await pool.query(
      "INSERT INTO cases (case_number, title, case_type, status, priority, created_by, assigned_to) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
      [caseNumber, "AA Case " + caseNumber, caseType, status, priority, officerA, officerA]
    );
    return res.insertId;
  }

  const case1 = await insertCase("AA-" + RUN_SUFFIX + "-001", "Financial Crime", "open", "low");
  const case2 = await insertCase("AA-" + RUN_SUFFIX + "-002", "Financial Crime", "under_review", "critical");
  const case3 = await insertCase("AA-" + RUN_SUFFIX + "-003", "Fraud", "closed", "high");
  await insertCase("AA-" + RUN_SUFFIX + "-004", null, "in_progress", "medium");

  const casesAgg = await aggregateCases(pool);
  check(
    "case total gained exactly 4",
    casesAgg.total - baselineCases === 4,
    "delta=" + (casesAgg.total - baselineCases)
  );
  check(
    "status breakdown is canonical order with stable {status, count} items",
    deepEqual(
      casesAgg.byStatus.map((r) => r.status),
      CASE_STATUSES
    ) &&
      casesAgg.byStatus.every(
        (r) => typeof r.status === "string" && Number.isInteger(r.count)
      )
  );
  check(
    "priority breakdown is canonical order with stable {priority, count} items",
    deepEqual(
      casesAgg.byPriority.map((r) => r.priority),
      CASE_PRIORITIES
    ) &&
      casesAgg.byPriority.every(
        (r) => typeof r.priority === "string" && Number.isInteger(r.count)
      )
  );
  const statusNow = statusCounts(casesAgg.byStatus);
  const priorityNow = priorityCounts(casesAgg.byPriority);
  const baselineTypes = typeCounts(empty.cases.byType);
  check(
    "case type deltas are exact (Financial Crime +2, Fraud +1; null omitted)",
    (typeCounts(casesAgg.byType)["Financial Crime"] || 0) - (baselineTypes["Financial Crime"] || 0) ===
      2 &&
      (typeCounts(casesAgg.byType).Fraud || 0) - (baselineTypes.Fraud || 0) === 1 &&
      !Object.keys(typeCounts(casesAgg.byType)).includes("null") &&
      casesAgg.byType.every(
        (e) => typeof e.type === "string" && Number.isInteger(e.count)
      ),
    JSON.stringify(casesAgg.byType)
  );
  check(
    "byType is sorted by count descending",
    casesAgg.byType.length === 2 &&
      casesAgg.byType[0].type === "Financial Crime" &&
      casesAgg.byType[0].count >= casesAgg.byType[1].count
  );
  check(
    "status + priority buckets sum back to total cases",
    casesAgg.byStatus.reduce((s, r) => s + r.count, 0) === casesAgg.total &&
      casesAgg.byPriority.reduce((s, r) => s + r.count, 0) === casesAgg.total
  );

  console.log("\n=== TEST 4: case status aggregation (exact deltas) ===");
  check(
    "open/in_progress/under_review/closed each +1; archived/returned unchanged",
    statusNow.open - baselineStatus.open === 1 &&
      statusNow.in_progress - baselineStatus.in_progress === 1 &&
      statusNow.under_review - baselineStatus.under_review === 1 &&
      statusNow.closed - baselineStatus.closed === 1 &&
      statusNow.archived - baselineStatus.archived === 0 &&
      statusNow.returned - baselineStatus.returned === 0,
    JSON.stringify(statusNow)
  );

  console.log("\n=== TEST 5: case priority aggregation (exact deltas) ===");
  check(
    "low/medium/high/critical each +1",
    priorityNow.low - baselinePriority.low === 1 &&
      priorityNow.medium - baselinePriority.medium === 1 &&
      priorityNow.high - baselinePriority.high === 1 &&
      priorityNow.critical - baselinePriority.critical === 1,
    JSON.stringify(priorityNow)
  );

  console.log("\n=== TEST 6: document/version aggregation ===");
  async function insertDocument(title, docType) {
    const [res] = await pool.query(
      "INSERT INTO documents (case_id, title, description, document_type, status, current_version, uploaded_by) " +
        "VALUES (?, ?, 'AA seeded document', ?, 'active', 1, ?)",
      [case1, title, docType, officerA]
    );
    return res.insertId;
  }
  async function insertVersion(docId, versionNumber) {
    await pool.query(
      "INSERT INTO document_versions " +
        "(document_id, version_number, file_path, original_file_name, stored_file_name, mime_type, file_size, uploaded_by) " +
        "VALUES (?, ?, ?, ?, ?, 'application/pdf', 1000, ?)",
      [
        docId,
        versionNumber,
        "aa_test/relative_path_" + RUN_SUFFIX + ".pdf",
        "aa-evidence.pdf",
        "aa-stored-" + RUN_SUFFIX + ".pdf",
        officerA,
      ]
    );
  }

  const doc1 = await insertDocument("AA Evidence A", "evidence");
  await insertVersion(doc1, 1);
  await insertVersion(doc1, 2);
  const doc2 = await insertDocument("AA Report A", "report");
  await insertVersion(doc2, 1);

  const docsAgg = await aggregateDocuments(pool);
  check(
    "document + version deltas are accurate",
    docsAgg.total - baselineDocs.total === 2 &&
      docsAgg.versions - baselineDocs.versions === 3,
    JSON.stringify(docsAgg)
  );
  const baselineDocTypes = typeCounts(empty.documents.byType);
  const docTypes = typeCounts(docsAgg.byType);
  check(
    "byType document-type deltas are exact (evidence +1, report +1)",
    (docTypes.evidence || 0) - (baselineDocTypes.evidence || 0) === 1 &&
      (docTypes.report || 0) - (baselineDocTypes.report || 0) === 1,
    JSON.stringify(docsAgg.byType)
  );
  check(
    "byType entries are stable {type, count} items",
    docsAgg.byType.every(
      (e) => typeof e.type === "string" && Number.isInteger(e.count)
    )
  );

  console.log("\n=== TEST 7: review aggregation ===");
  for (const action of ["approved", "rejected", "returned"]) {
    await pool.query(
      "INSERT INTO case_reviews (case_id, reviewer_id, action, review_note) VALUES (?, ?, ?, ?)",
      [case1, reviewerB, action, action + " by AA test"]
    );
  }
  const reviewsAgg = await aggregateReviews(pool);
  const decisionsAfter = decisionCounts(reviewsAgg.byDecision);
  const decisionsBefore = decisionCounts(baselineReviews.byDecision);
  check(
    "review total gained exactly 3",
    reviewsAgg.total - baselineReviews.total === 3,
    "delta=" + (reviewsAgg.total - baselineReviews.total)
  );
  check(
    "approved/rejected/returned each +1",
    (decisionsAfter.approved || 0) - (decisionsBefore.approved || 0) === 1 &&
      (decisionsAfter.rejected || 0) - (decisionsBefore.rejected || 0) === 1 &&
      (decisionsAfter.returned || 0) - (decisionsBefore.returned || 0) === 1,
    JSON.stringify(reviewsAgg.byDecision)
  );
  check(
    "byDecision entries are canonical {decision, count} items",
    deepEqual(
      reviewsAgg.byDecision.map((r) => r.decision),
      REVIEW_ACTIONS
    ) &&
      reviewsAgg.byDecision.every(
        (r) => typeof r.decision === "string" && Number.isInteger(r.count)
      )
  );

  console.log("\n=== TEST 8: integrity aggregation (last-check-wins) ===");
  async function auditRow(action, resourceType, resourceId, details, created_at, userId) {
    await pool.query(
      "INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, created_at) " +
        "VALUES (?, ?, ?, ?, ?, ?)",
      [
        userId != null ? userId : userC,
        action,
        resourceType,
        resourceId,
        details ? JSON.stringify(details) : null,
        created_at || new Date(),
      ]
    );
  }
  // doc1: v1 verified true; v2 verified true then false (last wins = false)
  await auditRow(
    "VERSION_INTEGRITY_VERIFIED",
    "document",
    doc1,
    { versionNumber: 1, integrityValid: true },
    new Date(Date.now() - 3000)
  );
  await auditRow(
    "VERSION_INTEGRITY_VERIFIED",
    "document",
    doc1,
    { versionNumber: 2, integrityValid: true },
    new Date(Date.now() - 2000)
  );
  await auditRow(
    "VERSION_INTEGRITY_VERIFIED",
    "document",
    doc1,
    { versionNumber: 2, integrityValid: false },
    new Date(Date.now() - 1000)
  );
  // doc2: v1 verified true
  await auditRow(
    "VERSION_INTEGRITY_VERIFIED",
    "document",
    doc2,
    { versionNumber: 1, integrityValid: true }
  );

  const integrityAgg = await aggregateIntegrity(pool);
  check(
    "verified/failed derive from last check per version",
    integrityAgg.verified - baselineIntegrity.verified === 2 &&
      integrityAgg.failed - baselineIntegrity.failed === 1,
    JSON.stringify(integrityAgg)
  );
  check(
    "integrity buckets sum back to total versions",
    integrityAgg.verified +
      integrityAgg.failed +
      integrityAgg.notVerified ===
      docsAgg.versions
  );
  check(
    "integrity never exposes checksums",
    !/[0-9a-f]{64}/i.test(JSON.stringify(integrityAgg))
  );

  console.log("\n=== TEST 9: AI audit aggregation ===");
  await auditRow(AI_ACTIONS.questions, "case", case1, { question: "What is this?" });
  await auditRow(AI_ACTIONS.summaries, "case", case2, { model: "gemini" });
  await auditRow(AI_ACTIONS.classifications, "document", doc1, { category: "Evidence" });
  await auditRow(AI_ACTIONS.entityExtractions, "document", doc2, { groups: ["Person"] });

  const aiAgg = await aggregateAi(pool);
  check(
    "each real AI action is counted exactly once",
    aiAgg.questions === 1 &&
      aiAgg.summaries === 1 &&
      aiAgg.classifications === 1 &&
      aiAgg.entityExtractions === 1,
    JSON.stringify(aiAgg)
  );
  check(
    "AI constants match the real controller audit actions",
    AI_ACTIONS.questions === "AI_CASE_QUESTION_ASKED" &&
      AI_ACTIONS.summaries === "AI_CASE_SUMMARY_GENERATED" &&
      AI_ACTIONS.classifications === "DOCUMENT_CLASSIFIED" &&
      AI_ACTIONS.entityExtractions === "DOCUMENT_ENTITIES_EXTRACTED"
  );

  console.log("\n=== TEST 10: recent activity ordering + limit ===");
  for (let i = 1; i <= 3; i++) {
    await auditRow("AA_OP_" + i, "case", case1, { seq: i }, new Date(Date.now() + i * 1000));
  }

  const recentAll = await getRecentActivity(pool);
  check(
    "newest first by created_at desc (id desc tiebreak)",
    recentAll.length > 0 &&
      recentAll[0].action === "AA_OP_3" &&
      recentAll[1].action === "AA_OP_2" &&
      recentAll[2].action === "AA_OP_1",
    "top=" + (recentAll[0] ? recentAll[0].action : "none") +
      " len=" + recentAll.length
  );
  check(
    "default limit respects the configured RECENT_ACTIVITY_LIMIT",
    recentAll.length <= RECENT_ACTIVITY_LIMIT
  );
  const limited = await getRecentActivity(pool, 2);
  check(
    "limited query returns the exact newest rows",
    limited.length === 2 &&
      limited[0].action === "AA_OP_3" &&
      limited[1].action === "AA_OP_2"
  );
  check(
    "raw rows carry the joined actor info",
    recentAll.some((r) => r.username != null || r.user_id != null)
  );

  console.log("\n=== TEST 11: controller response shape ===");
  const modelPath = require.resolve("../src/models/adminAnalyticsModel");
  const model = require("../src/models/adminAnalyticsModel");
  const savedOverviewFn = model.getAdminAnalyticsOverview;

  const cannedOverview = {
    cases: {
      total: 1,
      byStatus: [{ status: "open", count: 1 }],
      byPriority: [{ priority: "low", count: 1 }],
      byType: [{ type: "Fraud", count: 1 }],
    },
    documents: { total: 1, versions: 1, byType: [] },
    users: { total: 1, byRole: [{ role: "ADMIN", count: 1 }] },
    reviews: { total: 1, byDecision: [{ decision: "approved", count: 1 }] },
    integrity: { verified: 1, failed: 0, notVerified: 0 },
    ai: { questions: 0, summaries: 0, classifications: 0, entityExtractions: 0 },
    activity: [
      {
        id: 1,
        user_id: 5,
        action: "CASE_CREATED",
        resource_type: "case",
        resource_id: 9,
        ip_address: "127.0.0.1",
        user_agent: "analytics-controller-test",
        username: "canned_admin",
        full_name: "Canned Admin",
        created_at: new Date("2026-01-01T12:00:00.000Z"),
        details: { versionNumber: 1 },
      },
    ],
  };
  model.getAdminAnalyticsOverview = async () => cannedOverview;
  const controllerPath = require.resolve(
    "../src/controllers/adminAnalyticsController"
  );
  delete require.cache[controllerPath];
  const controller = require(controllerPath);

  let controllerBody = null;
  let controllerErr = null;
  await controller.getAnalytics(
    {},
    { json: (body) => { controllerBody = body; } },
    (err) => { controllerErr = err; }
  );
  check(
    "controller responds success:true with every aggregate section",
    controllerErr == null &&
      controllerBody &&
      controllerBody.success === true &&
      deepEqual(controllerBody.cases, cannedOverview.cases) &&
      deepEqual(controllerBody.reviews, cannedOverview.reviews) &&
      deepEqual(controllerBody.ai, cannedOverview.ai)
  );
  check(
    "activity is projected to the safe event shape",
    controllerErr == null &&
      controllerBody.activity &&
      controllerBody.activity.length === 1 &&
      deepEqual(
        deepKeys(controllerBody.activity[0]),
        ["action", "actor", "createdAt", "details", "id", "resourceId", "resourceType"]
      ) &&
      controllerBody.activity[0].actor === "canned_admin" &&
      controllerBody.activity[0].details.versionNumber === 1
  );
  delete require.cache[controllerPath];
  model.getAdminAnalyticsOverview = savedOverviewFn;
  check(
    "model export restored after controller test",
    model.getAdminAnalyticsOverview === savedOverviewFn
  );

  console.log("\n=== TEST 12: sensitive-field exclusion ===");
  const rawRow = {
    id: 777,
    user_id: 42,
    action: "DOCUMENT_DOWNLOADED",
    resource_type: "document_version",
    resource_id: 88,
    ip_address: "127.0.0.1",
    user_agent: "sensitive-agent-test",
    username: "sensitive_user",
    full_name: "Sensitive User",
    created_at: new Date("2026-02-01T00:00:00.000Z"),
    details: {
      versionNumber: 2,
      file_path: "/secret/storage/evidence.pdf",
      stored_file_name: "stored-name-x.pdf",
      checksum: "a".repeat(64),
      password_hash: "should-not-leak",
      api_key: "sk-super-secret",
      jwt: "eyJhbGciOiIxIj9.eyJzaWduZXIiOiJ4In0.signature123",
      approved: true,
    },
  };
  const safeEvent = toSafeActivityEvent(rawRow);
  check(
    "safe event has exactly the allowed keys",
    deepEqual(
      deepKeys(safeEvent),
      ["action", "actor", "createdAt", "details", "id", "resourceId", "resourceType"]
    )
  );
  check(
    "safe event drops ip/user agent/user id/storage metadata",
    safeEvent.ipAddress === undefined &&
      safeEvent.userAgent === undefined &&
      safeEvent.userId === undefined
  );
  check(
    "details strip sensitive keys and redact JWT-like values",
    safeEvent.details.versionNumber === 2 &&
      safeEvent.details.approved === true &&
      safeEvent.details.file_path === undefined &&
      safeEvent.details.stored_file_name === undefined &&
      safeEvent.details.checksum === undefined &&
      safeEvent.details.password_hash === undefined &&
      safeEvent.details.api_key === undefined &&
      safeEvent.details.jwt === "[REDACTED]",
    JSON.stringify(safeEvent.details)
  );
  check(
    "actor is the acting username",
    safeEvent.actor === "sensitive_user"
  );
  const serializedSafe = JSON.stringify(safeEvent);
  check(
    "safe event text contains no sensitive markers",
    !/127\.0\.0\.1|stored-file|secret|sk-super|eyJhbGciO|secret\/storage/.test(serializedSafe)
  );
  check(
    "no 64-char hex checksums escape",
    !/[0-9a-f]{64}/i.test(serializedSafe)
  );

  // End-to-end controller response with sensitive activity rows: JSON must be clean.
  const sensitiveCanned = {
    cases: { total: 0, byStatus: [], byPriority: [], byType: [] },
    documents: { total: 0, versions: 0, byType: [] },
    users: { total: 0, byRole: [] },
    reviews: { total: 0, byDecision: [] },
    integrity: { verified: 0, failed: 0, notVerified: 0 },
    ai: { questions: 0, summaries: 0, classifications: 0, entityExtractions: 0 },
    activity: [rawRow],
  };
  model.getAdminAnalyticsOverview = async () => sensitiveCanned;
  delete require.cache[controllerPath];
  const controller2 = require(controllerPath);
  let body2 = null;
  await controller2.getAnalytics(
    {},
    { json: (b) => { body2 = b; } },
    () => {}
  );
  delete require.cache[controllerPath];
  model.getAdminAnalyticsOverview = savedOverviewFn;
  const serializedBody2 = JSON.stringify(body2 || {});
  check(
    "controller response leaks no ip/user-agent/storage/secrets",
    body2 != null &&
      !serializedBody2.includes("127.0.0.1") &&
      !serializedBody2.includes("sensitive-agent-test") &&
      !serializedBody2.includes("stored-file") &&
      !serializedBody2.includes("sk-super-secret") &&
      !serializedBody2.includes("should-not-leak") &&
      !serializedBody2.includes('"password_hash"')
  );

  console.log("\n=== TEST 13: route wiring — GET /api/admin/analytics ===");
  const adminAnalyticsRoutes = require("../src/routes/adminAnalyticsRoutes");
  const analyticsLayer = adminAnalyticsRoutes.stack.find(
    (l) => l.route && l.route.path === "/"
  );
  check(
    "GET route is registered at the router root",
    Boolean(analyticsLayer) && analyticsLayer.route.methods.get === true
  );
  check(
    "router applies authenticate before the route layer",
    adminAnalyticsRoutes.stack.some(
      (l) => l.name === "authenticate"
    ) &&
      adminAnalyticsRoutes.stack.indexOf(
        adminAnalyticsRoutes.stack.find((l) => l.name === "authenticate")
      ) < adminAnalyticsRoutes.stack.indexOf(analyticsLayer)
  );
  check(
    "route layer order is [authorize, controller]",
    analyticsLayer &&
      analyticsLayer.route.stack.length === 2 &&
      analyticsLayer.route.stack[0].handle.name === "authorizeMiddleware" &&
      analyticsLayer.route.stack[1].handle.name === "getAnalytics"
  );

  console.log("\n=== TEST 14: authorization (audit:read) ===");
  const userModelPath = require.resolve("../src/models/userModel");
  const authMiddlewarePath = require.resolve(
    "../src/middleware/authMiddleware"
  );
  const userModel = require("../src/models/userModel");
  const originalUserPermissionsFn = userModel.getUserWithRoleAndPermissions;

  userModel.getUserWithRoleAndPermissions = async () => ({
    roleName: "ADMIN",
    permissions: ["audit:read"],
  });
  delete require.cache[authMiddlewarePath];
  const authAllow = require(authMiddlewarePath);
  let allowResult = "NOT_CALLED";
  await invokeMiddleware(
    authAllow.authorize("audit:read"),
    { user: { id: 999 } },
    (err) => { allowResult = err; }
  );
  check(
    "admin with audit:read passes the authorize middleware",
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
    authDeny.authorize("audit:read"),
    { user: { id: 999 } },
    (err) => { denyResult = err; }
  );
  check(
    "non-admin without audit:read is denied with a 403",
    denyResult && denyResult.statusCode === 403 && denyResult.expose === true
  );

  delete require.cache[authMiddlewarePath];
  const authNoUser = require(authMiddlewarePath);
  let noUserResult = "NOT_CALLED";
  await invokeMiddleware(
    authNoUser.authorize("audit:read"),
    {},
    (err) => { noUserResult = err; }
  );
  check(
    "missing user is rejected with a 401",
    noUserResult && noUserResult.statusCode === 401
  );

  userModel.getUserWithRoleAndPermissions = originalUserPermissionsFn;
  delete require.cache[userModelPath];
  delete require.cache[authMiddlewarePath];

  console.log("\n=== TEST 15: non-admin rejection + ADMIN-only seed grant ===");
  const fs = require("fs");
  const path = require("path");
  const seedSql = fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "src",
      "database",
      "seeds",
      "001_roles_and_permissions.sql"
    ),
    "utf8"
  );
  check(
    "audit:read is granted to ADMIN (cross-join) and exists in seeds",
    seedSql.includes("audit:read") &&
      /CROSS JOIN permissions/.test(seedSql) &&
      /WHERE r\.name = 'ADMIN'/.test(seedSql)
  );

  console.log("\n=== TEST 16: database/query failure handling ===");
  const simulatedError = new Error("simulated query failure");
  const brokenExecutor = { query: async () => { throw simulatedError; } };
  let modelRejected = null;
  try {
    await getAdminAnalyticsOverview(brokenExecutor);
  } catch (err) {
    modelRejected = err;
  }
  check(
    "overview rejects when a query fails",
    modelRejected === simulatedError,
    String(modelRejected)
  );
  let aggregateRejected = null;
  try {
    await aggregateCases(brokenExecutor);
  } catch (err) {
    aggregateRejected = err;
  }
  check(
    "individual aggregates propagate query failures",
    aggregateRejected === simulatedError
  );

  model.getAdminAnalyticsOverview = async () => {
    throw simulatedError;
  };
  delete require.cache[controllerPath];
  const controller3 = require(controllerPath);
  let controllerErr3 = "NOT_CALLED";
  let jsonCalled = false;
  await controller3.getAnalytics(
    {},
    { json: () => { jsonCalled = true; } },
    (err) => { controllerErr3 = err; }
  );
  check(
    "controller forwards model failures to next()",
    controllerErr3 === simulatedError && !jsonCalled
  );
  delete require.cache[controllerPath];
  model.getAdminAnalyticsOverview = savedOverviewFn;

  await closePool(pool);

  console.log("\n========== RESULTS ==========");
  console.log("TEST DATABASE: " + testDbName);
  console.log("PASSED: " + pass);
  console.log("FAILED: " + fail);
  console.log("=============================");
  if (fail > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});