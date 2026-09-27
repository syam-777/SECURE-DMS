/**
 * Secure DMS — Security Center Overview Test Suite
 *
 * SAFETY: This suite runs ONLY against an isolated test database
 * (default: `<DB_NAME>_test`), never the application database. Every
 * model call receives the bound test pool as its explicit executor, and
 * resetData() re-asserts the active database name before any destructive
 * SQL. Aggregate assertions use before/after deltas so the shared test
 * database's leftover rows from any earlier run can never cause a false
 * failure — but the suite still verifies the exact contribution its own
 * seeded rows must produce.
 *
 * Covers:
 *   - exact response shape (zero-filled, deterministic) on an empty DB
 *   - users: total / active / inactive / byRole aggregation
 *   - officer verifications pending/approved/rejected
 *   - documents + versions + integrity derivation (last-check-wins via
 *     real VERSION_INTEGRITY_VERIFIED audit events)
 *   - audit totalEvents + zero-filled securityEvents counts
 *   - approval signatures: signed / valid / invalid / unsigned
 *   - ledger verdict reuse (valid/blocks/lastBlockIndex/message)
 *   - notifications byType
 *   - route registration (GET /api/security/overview, authN + authZ)
 *   - authorization: admin allowed, non-admin denied (403), no user (401)
 *   - controller wraps the overview with success: true
 *   - zero-secrets projection across the entire serialized response
 *
 * A fresh ECDSA P-256 key pair for the digital-approval-signature metric
 * is generated INSIDE this test process and injected via the approvalKeys
 * environment contract; no private key is ever written to the repository.
 *
 * Usage:  node tests/securityCenter.test.js   (from backend/)
 */

const crypto = require("crypto");
const {
  initDatabase,
  resetData,
  closePool,
  resolveDatabaseNames,
} = require("./testDb");
const {
  SECURITY_ACTIONS,
  getSecurityOverview,
  aggregateUsers,
  aggregateOfficerVerifications,
  aggregateDocuments,
  aggregateSignatures,
  aggregateAudit,
  aggregateLedger,
  aggregateNotifications,
} = require("../src/models/securityCenterModel");
const auditLogModel = require("../src/models/auditLogModel");
const {
  insertApprovalSignature,
} = require("../src/models/approvalSignatureModel");
const {
  canonicalizeApprovalPayload,
  signApprovalPayload,
  ALGORITHM,
} = require("../src/services/approvalSignatureService");

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
  "audit",
  "documents",
  "ledger",
  "notifications",
  "officerVerifications",
  "signatures",
  "users",
];

function byTypeMap(notificationAgg) {
  const map = {};
  for (const entry of notificationAgg.byType) {
    map[entry.type] = entry.count;
  }
  return map;
}

function roleCounts(usersAgg) {
  const map = {};
  for (const entry of usersAgg.byRole) {
    map[entry.role] = entry.count;
  }
  return map;
}

function invokeMiddleware(mw, req, onDone) {
  return new Promise((resolve) => {
    mw(req, {}, (err) => {
      onDone(err);
      resolve();
    });
  });
}

// ------------------------------------------------------------------
// Test-only approval-signing key material (never persisted). Saved and
// restored so the app's real configured keys are untouched.
// ------------------------------------------------------------------
const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", {
  namedCurve: "P-256",
});
const privateB64 = Buffer.from(
  privateKey.export({ type: "pkcs8", format: "pem" }),
  "utf8"
).toString("base64");
const publicB64 = Buffer.from(
  publicKey.export({ type: "spki", format: "pem" }),
  "utf8"
).toString("base64");

const SAVED_ENV = {
  key: process.env.APPROVAL_SIGNING_KEY_ID,
  priv: process.env.APPROVAL_SIGNING_PRIVATE_KEY_B64,
  pub: process.env.APPROVAL_SIGNING_PUBLIC_KEY_B64,
};

process.env.APPROVAL_SIGNING_KEY_ID = "sec-center-test-key-001";
process.env.APPROVAL_SIGNING_PRIVATE_KEY_B64 = privateB64;
process.env.APPROVAL_SIGNING_PUBLIC_KEY_B64 = publicB64;

// Minimum security-relevant actions the spec requires to be surfaced.
const MINIMUM_SECURITY_ACTIONS = [
  "LOGIN",
  "LOGIN_FAILED",
  "VERSION_INTEGRITY_VERIFIED",
  "CASE_REVIEW_REJECTED",
  "DOCUMENT_REVIEW_REJECTED",
  "USER_DEACTIVATED", // genuine action for admin deactivation
  "USER_ROLE_CHANGED",
  "OFFICER_VERIFICATION_REJECTED",
];

async function main() {
  const { mainDbName, testDbName } = resolveDatabaseNames();
  console.log(
    "\nTargeting isolated test database: '" +
      testDbName +
      "' (app database '" +
      mainDbName +
      "' is READ-ONLY for tests)"
  );

  const db = await initDatabase();
  const pool = db.pool;

  const RUN_SUFFIX = "s" + Date.now();
  const caseNumber = "SC-CASE-" + RUN_SUFFIX.toUpperCase() + "-001";

  const seeded = {
    officerA: 0,
    officerD: 0,
    userB: 0,
    reviewerC: 0,
    caseId: 0,
    docId: 0,
    notificationIds: [],
    reviewIds: [],
  };

  async function cleanup() {
    await resetData(pool, testDbName);
    try {
      if (seeded.notificationIds.length) {
        await pool.query(
          "DELETE FROM notifications WHERE id IN (" +
            seeded.notificationIds.map(() => "?").join(",") +
            ")",
          seeded.notificationIds
        );
      }
    } catch (_) {}
    try {
      if (seeded.caseId) {
        await pool.query(
          "DELETE FROM approval_signatures WHERE case_id = ?",
          [seeded.caseId]
        );
      }
    } catch (_) {}
    try {
      if (seeded.caseId) {
        await pool.query("DELETE FROM case_reviews WHERE case_id = ?", [
          seeded.caseId,
        ]);
      }
    } catch (_) {}
    try {
      if (seeded.caseId) {
        await pool.query("DELETE FROM case_assignments WHERE case_id = ?", [
          seeded.caseId,
        ]);
      }
    } catch (_) {}
    try {
      if (seeded.docId) {
        await pool.query(
          "DELETE FROM document_versions WHERE document_id = ?",
          [seeded.docId]
        );
        await pool.query("DELETE FROM documents WHERE id = ?", [seeded.docId]);
      }
    } catch (_) {}
    try {
      if (seeded.caseId) {
        await pool.query("DELETE FROM cases WHERE id = ?", [seeded.caseId]);
      }
    } catch (_) {}
    const userIds = [
      seeded.officerA,
      seeded.officerD,
      seeded.userB,
      seeded.reviewerC,
    ].filter((id) => id > 0);
    try {
      if (userIds.length) {
        await pool.query(
          "DELETE FROM officer_verifications WHERE user_id IN (" +
            userIds.map(() => "?").join(",") +
            ")",
          userIds
        );
      }
    } catch (_) {}
    try {
      if (userIds.length) {
        await pool.query(
          "DELETE FROM users WHERE id IN (" +
            userIds.map(() => "?").join(",") +
            ")",
          userIds
        );
      }
    } catch (_) {}
  }

  // ── TEST 1: empty-database shape + zero-fill + no-secrets ────────
  console.log("\n=== TEST 1: empty-database overview shape ===");
  await resetData(pool, testDbName);

  const empty = await getSecurityOverview(pool);
  check(
    "top-level keys are exactly the 7 aggregate groups",
    deepEqual(deepKeys(empty), EXPECTED_TOP_LEVEL_KEYS)
  );
  check(
    "users shape is stable and zero-safe",
    deepEqual(deepKeys(empty.users), ["active", "byRole", "inactive", "total"]) &&
      empty.users.total >= 1 &&
      empty.users.active >= 1 &&
      empty.users.inactive >= 0 &&
      Array.isArray(empty.users.byRole)
  );
  check(
    "officerVerifications buckets are non-negative integers",
    Number.isInteger(empty.officerVerifications.pending) &&
      Number.isInteger(empty.officerVerifications.approved) &&
      Number.isInteger(empty.officerVerifications.rejected) &&
      empty.officerVerifications.pending >= 0
  );
  check(
    "documents shape + integrity buckets present and consistent",
    Number.isInteger(empty.documents.total) &&
      Number.isInteger(empty.documents.versions) &&
      empty.documents.versions ===
        empty.documents.integrity.verified +
          empty.documents.integrity.failed +
          empty.documents.integrity.notVerified
  );
  check(
    "signatures buckets are non-negative integers",
    Number.isInteger(empty.signatures.signed) &&
      Number.isInteger(empty.signatures.valid) &&
      Number.isInteger(empty.signatures.invalid) &&
      Number.isInteger(empty.signatures.unsigned) &&
      empty.signatures.signed ===
        empty.signatures.valid + empty.signatures.invalid
  );
  check(
    "audit zero events + zero-filled securityEvents",
    empty.audit.totalEvents === 0 &&
      Array.isArray(empty.audit.securityEvents) &&
      empty.audit.securityEvents.length === SECURITY_ACTIONS.length &&
      empty.audit.securityEvents.every(
        (se) => typeof se.action === "string" && se.count === 0
      )
  );
  check(
    "securityEvents list is deterministic",
    deepEqual(
      empty.audit.securityEvents.map((se) => se.action),
      SECURITY_ACTIONS
    )
  );
  check(
    "minimum security actions are all present even when zero",
    MINIMUM_SECURITY_ACTIONS.every((a) =>
      empty.audit.securityEvents.some((se) => se.action === a)
    )
  );
  check(
    "empty ledger verdict is valid with zero blocks",
    empty.ledger.valid === true &&
      empty.ledger.blocks === 0 &&
      empty.ledger.lastBlockIndex === null &&
      typeof empty.ledger.message === "string"
  );
  check(
    "empty notifications byType is an array of {type,count}",
    Array.isArray(empty.notifications.byType) &&
      empty.notifications.byType.every(
        (e) => typeof e.type === "string" && Number.isInteger(e.count)
      )
  );

  const emptySerialized = JSON.stringify(empty);
  check(
    "empty overview leaks nothing sensitive",
    !/password|api[_-]?key|secret|token|checksum|stored_file_name|file_path|ip_address|user_agent|BEGIN/i.test(
      emptySerialized
    )
  );

  // ── TEST 2: controller wraps overview with success: true ─────────
  console.log("\n=== TEST 2: controller wraps overview ===");
  const controllerModel = require("../src/models/securityCenterModel");
  const savedOverviewFn = controllerModel.getSecurityOverview;
  const cannedOverview = {
    users: { total: 3, active: 2, inactive: 1, byRole: [] },
    officerVerifications: { pending: 0, approved: 0, rejected: 0 },
    documents: {
      total: 0,
      versions: 0,
      integrity: { verified: 0, failed: 0, notVerified: 0 },
    },
    signatures: { signed: 0, valid: 0, invalid: 0, unsigned: 0 },
    audit: { totalEvents: 0, securityEvents: [] },
    ledger: { valid: true, blocks: 0, lastBlockIndex: null, message: "ok" },
    notifications: { byType: [] },
  };
  controllerModel.getSecurityOverview = async () => cannedOverview;

  const controllerPath = require.resolve(
    "../src/controllers/securityCenterController"
  );
  delete require.cache[controllerPath];
  const controller = require(controllerPath);

  let controllerBody = null;
  let controllerErr = null;
  await controller.getOverview(
    { user: { id: 1 } },
    { json: (body) => { controllerBody = body; } },
    (err) => { controllerErr = err; }
  );
  check(
    "controller responds success:true with the overview",
    controllerErr == null &&
      controllerBody &&
      controllerBody.success === true &&
      deepEqual(controllerBody.users, cannedOverview.users)
  );

  delete require.cache[controllerPath];
  controllerModel.getSecurityOverview = savedOverviewFn;
  check(
    "model export restored after controller test",
    controllerModel.getSecurityOverview === savedOverviewFn
  );

  // ── TEST 3: route wiring — GET /api/security/overview ─────────────
  console.log("\n=== TEST 3: route registration ===");
  const securityRoutes = require("../src/routes/securityRoutes");
  const overviewLayer = securityRoutes.stack.find(
    (l) => l.route && l.route.path === "/overview"
  );
  check(
    "GET /overview route is registered",
    Boolean(overviewLayer) && overviewLayer.route.methods.get === true
  );
  check(
    "router applies authenticate before the route layer",
    securityRoutes.stack.some(
      (l) => l.name === "authenticate"
    ) &&
      securityRoutes.stack.indexOf(
        securityRoutes.stack.find((l) => l.name === "authenticate")
      ) < securityRoutes.stack.indexOf(overviewLayer)
  );
  check(
    "route layer order is [authorize, controller]",
    overviewLayer &&
      overviewLayer.route.stack.length === 2 &&
      overviewLayer.route.stack[0].handle.name === "authorizeMiddleware" &&
      overviewLayer.route.stack[1].handle.name === "getOverview"
  );

  // ── TEST 4: authorization middleware allow/deny ──────────────────
  console.log("\n=== TEST 4: authorization (audit:read) ===");
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

  // ── DB-BOUND AGGREGATION TESTS (baseline-delta) ──────────────────
  console.log("\n=== TEST 5: reset + baseline + seed actors ===");
  await resetData(pool, testDbName);

  const baselineUsers = await aggregateUsers(pool);
  const baselineOv = await aggregateOfficerVerifications(pool);
  const baselineDocs = await aggregateDocuments(pool);
  const baselineSigs = await aggregateSignatures(pool);
  const baselineNotifs = byTypeMap(await aggregateNotifications(pool));

  async function insertUser(username, fullName, isActive, roleName) {
    const [roleRows] = await pool.query(
      "SELECT id FROM roles WHERE name = ? LIMIT 1",
      [roleName]
    );
    const roleId = roleRows[0] ? roleRows[0].id : null;
    const [res] = await pool.query(
      "INSERT INTO users (username, email, password_hash, full_name, is_active, role_id) " +
        "VALUES (?, ?, '__test_placeholder_hash____do_not_use__', ?, ?, ?)",
      [username, username + "@example.local", fullName, isActive ? 1 : 0, roleId]
    );
    return res.insertId;
  }

  seeded.officerA = await insertUser(
    "__dms_sc_officer_a_" + RUN_SUFFIX + "__",
    "SC Officer A",
    1,
    "OFFICER"
  );
  seeded.userB = await insertUser(
    "__dms_sc_user_b_" + RUN_SUFFIX + "__",
    "SC User B",
    1,
    "USER"
  );
  seeded.reviewerC = await insertUser(
    "__dms_sc_reviewer_c_" + RUN_SUFFIX + "__",
    "SC Reviewer C",
    1,
    "REVIEWER"
  );
  seeded.officerD = await insertUser(
    "__dms_sc_officer_d_" + RUN_SUFFIX + "__",
    "SC Officer D",
    0,
    "OFFICER"
  );

  const usersAgg = await aggregateUsers(pool);
  check(
    "seeding adds exactly 4 users",
    usersAgg.total - baselineUsers.total === 4,
    "delta=" + (usersAgg.total - baselineUsers.total)
  );
  check(
    "active delta is 3, inactive delta is 1",
    usersAgg.active - baselineUsers.active === 3 &&
      usersAgg.inactive - baselineUsers.inactive === 1,
    JSON.stringify(usersAgg)
  );
  const rolesAfter = roleCounts(usersAgg);
  const rolesBefore = roleCounts(baselineUsers);
  check(
    "OFFICER delta is 2, REVIEWER delta is 1, USER delta is 1",
    (rolesAfter.OFFICER || 0) - (rolesBefore.OFFICER || 0) === 2 &&
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

  console.log("\n=== TEST 6: officer verification counts ===");
  await pool.query(
    "INSERT INTO officer_verifications " +
      "(user_id, full_name, official_id_type, official_id_hash, official_id_last4, status, reviewed_by, review_note) " +
      "VALUES (?, ?, 'TEST_ID', ?, '1234', 'pending', NULL, NULL)",
    [seeded.officerA, "SC Officer A", "a".repeat(64)]
  );
  await pool.query(
    "INSERT INTO officer_verifications " +
      "(user_id, full_name, official_id_type, official_id_hash, official_id_last4, status, reviewed_by, review_note) " +
      "VALUES (?, ?, 'TEST_ID', ?, '5678', 'approved', ?, 'Approved by test')",
    [seeded.officerD, "SC Officer D", "b".repeat(64), db.userId]
  );
  await pool.query(
    "INSERT INTO officer_verifications " +
      "(user_id, full_name, official_id_type, official_id_hash, official_id_last4, status, reviewed_by, review_note) " +
      "VALUES (?, ?, 'TEST_ID', ?, '9abc', 'rejected', ?, 'Rejected by test')",
    [seeded.userB, "SC User B", "c".repeat(64), db.userId]
  );

  const ovAgg = await aggregateOfficerVerifications(pool);
  check(
    "pending/approved/rejected each gain exactly 1",
    ovAgg.pending - baselineOv.pending === 1 &&
      ovAgg.approved - baselineOv.approved === 1 &&
      ovAgg.rejected - baselineOv.rejected === 1,
    JSON.stringify(ovAgg)
  );

  console.log("\n=== TEST 7: case + document + versions seed ===");
  const [caseRes] = await pool.query(
    "INSERT INTO cases (case_number, title, case_type, status, priority, created_by, assigned_to) " +
      "VALUES (?, ?, 'Financial Crime', 'under_review', 'high', ?, ?)",
    [caseNumber, "Security Center Target Case", seeded.officerA, seeded.officerA]
  );
  seeded.caseId = caseRes.insertId;

  const [docRes] = await pool.query(
    "INSERT INTO documents (case_id, title, description, document_type, status, current_version, uploaded_by) " +
      "VALUES (?, ?, 'Seeded for security center tests', 'evidence', 'active', 3, ?)",
    [seeded.caseId, "Security Center Evidence", seeded.officerA]
  );
  seeded.docId = docRes.insertId;

  for (const versionNumber of [1, 2, 3]) {
    await pool.query(
      "INSERT INTO document_versions " +
        "(document_id, version_number, file_path, original_file_name, stored_file_name, mime_type, file_size, uploaded_by) " +
        "VALUES (?, ?, ?, ?, ?, 'application/pdf', 1000, ?)",
      [
        seeded.docId,
        versionNumber,
        "sc_test/relative_path_" + RUN_SUFFIX + ".pdf",
        "evidence.pdf",
        "stored-name-" + RUN_SUFFIX + ".pdf",
        seeded.officerA,
      ]
    );
  }

  console.log("\n=== TEST 8: security + integrity audit events ===");
  const integrityEvents = [
    { versionNumber: 1, integrityValid: true },
    { versionNumber: 2, integrityValid: true },
    { versionNumber: 2, integrityValid: false },
  ];
  for (const evt of integrityEvents) {
    await auditLogModel.logAuditEvent(
      {
        userId: seeded.officerA,
        action: "VERSION_INTEGRITY_VERIFIED",
        resourceType: "document",
        resourceId: seeded.docId,
        ipAddress: "127.0.0.1",
        userAgent: "security-center-test",
        details: {
          versionNumber: evt.versionNumber,
          integrityValid: evt.integrityValid,
        },
      },
      pool
    );
  }

  const securitySeeds = [
    { action: "LOGIN", userId: seeded.officerA },
    { action: "LOGIN", userId: seeded.officerA },
    { action: "LOGIN_FAILED", userId: null },
    { action: "REGISTER", userId: seeded.userB },
    {
      action: "USER_DEACTIVATED",
      userId: db.userId,
      resourceType: "user",
      resourceId: seeded.officerD,
    },
    {
      action: "USER_ROLE_CHANGED",
      userId: db.userId,
      resourceType: "user",
      resourceId: seeded.userB,
    },
    {
      action: "CASE_REVIEW_REJECTED",
      userId: seeded.reviewerC,
      resourceType: "case",
      resourceId: seeded.caseId,
    },
    {
      action: "DOCUMENT_REVIEW_REJECTED",
      userId: seeded.reviewerC,
      resourceType: "document",
      resourceId: seeded.docId,
    },
    {
      action: "OFFICER_VERIFICATION_REJECTED",
      userId: db.userId,
      resourceType: "user",
      resourceId: seeded.userB,
    },
    // Non-curated real action: present in the DB but NOT in securityEvents.
    {
      action: "CASE_CREATED",
      userId: seeded.officerA,
      resourceType: "case",
      resourceId: seeded.caseId,
    },
  ];
  for (const event of securitySeeds) {
    await auditLogModel.logAuditEvent(
      {
        userId: event.userId,
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
      },
      pool
    );
  }
  const EXPECTED_TOTAL_EVENTS = integrityEvents.length + securitySeeds.length;

  const auditAgg = await aggregateAudit(pool);
  check(
    "audit totalEvents counts every event (curated + non-curated)",
    auditAgg.totalEvents === EXPECTED_TOTAL_EVENTS,
    "got=" + auditAgg.totalEvents + " expected=" + EXPECTED_TOTAL_EVENTS
  );
  const byAction = (action) =>
    (auditAgg.securityEvents.find((se) => se.action === action) || {}).count;

  check(
    "LOGIN count is 2",
    byAction("LOGIN") === 2,
    "LOGIN=" + byAction("LOGIN")
  );
  check("LOGIN_FAILED count is 1", byAction("LOGIN_FAILED") === 1);
  check("USER_DEACTIVATED count is 1", byAction("USER_DEACTIVATED") === 1);
  check("USER_ROLE_CHANGED count is 1", byAction("USER_ROLE_CHANGED") === 1);
  check("CASE_REVIEW_REJECTED count is 1", byAction("CASE_REVIEW_REJECTED") === 1);
  check("DOCUMENT_REVIEW_REJECTED count is 1", byAction("DOCUMENT_REVIEW_REJECTED") === 1);
  check(
    "OFFICER_VERIFICATION_REJECTED count is 1",
    byAction("OFFICER_VERIFICATION_REJECTED") === 1
  );
  check(
    "VERSION_INTEGRITY_VERIFIED count is 3",
    byAction("VERSION_INTEGRITY_VERIFIED") === 3,
    "VERIFIED=" + byAction("VERSION_INTEGRITY_VERIFIED")
  );
  check(
    "non-curated CASE_CREATED is not forced into securityEvents",
    auditAgg.securityEvents.find((se) => se.action === "CASE_CREATED") ===
      undefined
  );

  console.log("\n=== TEST 9: document integrity derivation ===");
  const docsAgg = await aggregateDocuments(pool);
  check(
    "document + version deltas are accurate",
    docsAgg.total - baselineDocs.total === 1 &&
      docsAgg.versions - baselineDocs.versions === 3,
    JSON.stringify(docsAgg)
  );
  check(
    "integrity classification per version (last check wins)",
    docsAgg.integrity.verified - baselineDocs.integrity.verified === 1 &&
      docsAgg.integrity.failed - baselineDocs.integrity.failed === 1 &&
      docsAgg.integrity.notVerified - baselineDocs.integrity.notVerified === 1,
    JSON.stringify(docsAgg.integrity)
  );
  check(
    "integrity buckets sum back to total versions",
    docsAgg.integrity.verified +
      docsAgg.integrity.failed +
      docsAgg.integrity.notVerified ===
      docsAgg.versions
  );

  console.log("\n=== TEST 10: signatures ===");
  const reviewerUsername = "__dms_sc_reviewer_c_" + RUN_SUFFIX + "__";

  async function seedCaseReview(action) {
    const [res] = await pool.query(
      "INSERT INTO case_reviews (case_id, reviewer_id, action, review_note) VALUES (?, ?, ?, ?)",
      [seeded.caseId, seeded.reviewerC, action, action + " by test"]
    );
    seeded.reviewIds.push(res.insertId);
    return res.insertId;
  }

  const approvedReviewId = await seedCaseReview("approved");
  const unsignedReviewId = await seedCaseReview("approved");
  const tamperedReviewId = await seedCaseReview("approved");
  const rejectedReviewId = await seedCaseReview("rejected");

  const validPayload = canonicalizeApprovalPayload({
    reviewId: approvedReviewId,
    caseId: seeded.caseId,
    caseNumber: caseNumber,
    reviewerId: seeded.reviewerC,
    reviewerUsername: reviewerUsername,
    reviewNote: "approved by test",
    approvedAt: new Date().toISOString(),
    artifacts: [],
  });
  const validSignature = signApprovalPayload(validPayload);
  const tamperedSignature =
    (validSignature[0] === "A" ? "B" : "A") + validSignature.slice(1);

  await insertApprovalSignature(
    {
      reviewId: approvedReviewId,
      caseId: seeded.caseId,
      payload: validPayload,
      signature: validSignature,
      algorithm: ALGORITHM,
      keyId: process.env.APPROVAL_SIGNING_KEY_ID,
    },
    pool
  );

  await insertApprovalSignature(
    {
      reviewId: tamperedReviewId,
      caseId: seeded.caseId,
      payload: validPayload,
      signature: tamperedSignature,
      algorithm: ALGORITHM,
      keyId: process.env.APPROVAL_SIGNING_KEY_ID,
    },
    pool
  );
  void unsignedReviewId;
  void rejectedReviewId;

  const sigAgg = await aggregateSignatures(pool);
  check(
    "signed delta is 2 (two stored signature rows)",
    sigAgg.signed - baselineSigs.signed === 2,
    JSON.stringify(sigAgg)
  );
  check(
    "valid delta is 1 (cryptographically verified server-side)",
    sigAgg.valid - baselineSigs.valid === 1
  );
  check(
    "tampered signature is counted as invalid (+1)",
    sigAgg.invalid - baselineSigs.invalid === 1
  );
  check(
    "unsigned delta is 1 (approved review with no signature)",
    sigAgg.unsigned - baselineSigs.unsigned === 1,
    "unsigned=" + sigAgg.unsigned
  );

  console.log("\n=== TEST 11: ledger verdict ===");
  const ledgerAgg = await aggregateLedger(pool);
  check(
    "ledger is valid after appending blocks for every audit event",
    ledgerAgg.valid === true,
    JSON.stringify(ledgerAgg)
  );
  check(
    "block count matches total audit events since reset",
    ledgerAgg.blocks === EXPECTED_TOTAL_EVENTS,
    "blocks=" + ledgerAgg.blocks + " expected=" + EXPECTED_TOTAL_EVENTS
  );
  check(
    "last block index equals block count (1-based)",
    ledgerAgg.lastBlockIndex === EXPECTED_TOTAL_EVENTS,
    "lastBlockIndex=" + ledgerAgg.lastBlockIndex
  );
  check(
    "ledger message is non-empty text",
    typeof ledgerAgg.message === "string" && ledgerAgg.message.length > 0
  );

  console.log("\n=== TEST 12: notifications byType ===");
  for (const type of ["DOCUMENT_UPLOADED", "DOCUMENT_UPLOADED", "INTEGRITY_CHECK_FAILED"]) {
    const [notifRes] = await pool.query(
      "INSERT INTO notifications (user_id, type, title, message, case_id, document_id) " +
        "VALUES (?, ?, ?, ?, ?, ?)",
      [
        seeded.officerA,
        type,
        type,
        "State low-level notice",
        seeded.caseId,
        seeded.docId,
      ]
    );
    seeded.notificationIds.push(notifRes.insertId);
  }
  const notifAgg = await aggregateNotifications(pool);
  const notifMap = byTypeMap(notifAgg);
  check(
    "DOCUMENT_UPLOADED delta is 2",
    notifMap.DOCUMENT_UPLOADED - (baselineNotifs.DOCUMENT_UPLOADED || 0) === 2,
    JSON.stringify(notifMap)
  );
  check(
    "INTEGRITY_CHECK_FAILED delta is 1",
    notifMap.INTEGRITY_CHECK_FAILED -
      (baselineNotifs.INTEGRITY_CHECK_FAILED || 0) === 1
  );
  check(
    "byType entries are stable {type, count} items",
    notifAgg.byType.every(
      (e) => typeof e.type === "string" && Number.isInteger(e.count)
    )
  );

  // ── TEST 13: full-overview no-secrets projection ─────────────────
  console.log("\n=== TEST 13: full overview leaks no secrets ===");
  const full = await getSecurityOverview(pool);
  const serialized = JSON.stringify(full);

  check(
    "full overview key set is stable",
    deepEqual(deepKeys(full), EXPECTED_TOP_LEVEL_KEYS)
  );
  check(
    "aggregated values are consistent end-to-end",
    full.users.total === usersAgg.total &&
      full.officerVerifications.pending === ovAgg.pending &&
      full.documents.versions === docsAgg.versions &&
      full.documents.integrity.verified === docsAgg.integrity.verified &&
      full.signatures.signed === sigAgg.signed &&
      full.audit.totalEvents === auditAgg.totalEvents &&
      full.ledger.blocks === ledgerAgg.blocks
  );
  check(
    "no signing key material is exposed",
    !serialized.includes(privateB64) && !serialized.includes(publicB64)
  );
  check(
    "no raw signature value is exposed",
    !serialized.includes(validSignature) &&
      !serialized.includes(tamperedSignature)
  );
  check("no payload object is embedded", !serialized.includes('"payload"'));
  check(
    "no private storage metadata is exposed",
    !/stored_file_name|"file_path"|stored-name-/i.test(serialized)
  );
  check(
    "no ip addresses / user agents / secrets leak",
    !/127\.0\.0\.1|security-center-test|\/b2|A2[A-Za-z0-9]{20,}|password|api[_-]?key/i.test(
      serialized
    )
  );
  check("no checksums or hashes leak", !/[0-9a-f]{64}/i.test(serialized));
  check(
    "no personally identifiable identity strings leak",
    !serialized.includes(reviewerUsername) &&
      !serialized.includes("SC Officer A") &&
      !serialized.includes("Security Center Evidence") &&
      !serialized.includes(caseNumber) &&
      !serialized.includes("example.local")
  );

  // ── TEST 14: audit:read is ADMIN-only per seeds ──────────────────
  console.log("\n=== TEST 14: audit:read grant is ADMIN-only ===");
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
  const officerBlock = seedSql
    .split("REVIEWER — read-heavy")[0]
    .split("ADMIN gets every permission")[1] || "";
  const reviewerBlock = seedSql
    .split("USER — minimal read access")[0]
    .split("REVIEWER — read-heavy")[1] || "";
  const userBlock = seedSql.split("USER — minimal read access")[1] || "";
  check(
    "audit:read exists in the role/permission seeds",
    seedSql.includes("audit:read")
  );
  check(
    "ADMIN is granted via a cross-join over every permission",
    /CROSS JOIN permissions/ .test(seedSql) &&
      /WHERE r\.name = 'ADMIN'/ .test(seedSql)
  );
  check(
    "OFFICER/REVIEWER/USER permission lists exclude audit:read",
    !officerBlock.includes("audit:read") &&
      !reviewerBlock.includes("audit:read") &&
      !userBlock.includes("audit:read")
  );

  await cleanup();
  await closePool(pool);

  // Restore the original signing-key environment.
  process.env.APPROVAL_SIGNING_KEY_ID = SAVED_ENV.key;
  process.env.APPROVAL_SIGNING_PRIVATE_KEY_B64 = SAVED_ENV.priv;
  process.env.APPROVAL_SIGNING_PUBLIC_KEY_B64 = SAVED_ENV.pub;

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