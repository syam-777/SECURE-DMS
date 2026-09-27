/**
 * Secure DMS — Investigation Timeline Test Suite
 *
 * SAFETY: This suite runs ONLY against an isolated test database
 * (default: `<DB_NAME>_test`), never against the application database.
 * Every model call receives the bound test pool as the explicit executor,
 * and resetData() re-asserts the active database name before any DELETE.
 *
 * Covers buildCaseTimeline(): payload shape, chronological ordering,
 * case/document/version/integrity/review events, digital approval
 * signature representation (re-verified with an in-process key pair),
 * cross-case isolation (access control at the model layer), empty-case
 * safety, and no-case safety.
 *
 * Usage:  node tests/investigationTimeline.test.js   (from backend/)
 */

const crypto = require("crypto");
const {
  initDatabase,
  resetData,
  closePool,
  resolveDatabaseNames,
} = require("./testDb");
const {
  buildCaseTimeline,
} = require("../src/models/investigationTimelineModel");
const {
  canonicalizeApprovalPayload,
  signApprovalPayload,
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

  // In-process signing keys, injected over the real env ONLY for this run.
  const SAVED_ENV = {
    privateKey: process.env.APPROVAL_SIGNING_PRIVATE_KEY_B64,
    publicKey: process.env.APPROVAL_SIGNING_PUBLIC_KEY_B64,
    keyId: process.env.APPROVAL_SIGNING_KEY_ID,
  };

  const seeded = {
    caseAId: 0,
    caseBId: 0,
    caseCId: 0,
    doc1Id: 0,
    doc2Id: 0,
    docBId: 0,
    reviewerId: 0,
    officerId: 0,
    approvedReviewId: 0,
    rawSignature: "",
  };

  async function restoreEnv() {
    process.env.APPROVAL_SIGNING_PRIVATE_KEY_B64 = SAVED_ENV.privateKey;
    process.env.APPROVAL_SIGNING_PUBLIC_KEY_B64 = SAVED_ENV.publicKey;
    process.env.APPROVAL_SIGNING_KEY_ID = SAVED_ENV.keyId;
  }

  async function cleanup() {
    const caseIds = [seeded.caseAId, seeded.caseBId, seeded.caseCId];
    const docIds = [seeded.doc1Id, seeded.doc2Id, seeded.docBId];
    try {
      await pool.query(
        "DELETE FROM approval_signatures WHERE case_id IN (?, ?, ?)",
        caseIds
      );
    } catch (_) {}
    try {
      await pool.query(
        "DELETE FROM case_reviews WHERE case_id IN (?, ?, ?)",
        caseIds
      );
    } catch (_) {}
    try {
      await pool.query(
        "DELETE FROM case_assignments WHERE case_id IN (?, ?, ?)",
        caseIds
      );
    } catch (_) {}
    try {
      await pool.query(
        "DELETE FROM audit_logs WHERE resource_type = 'case' AND resource_id IN (?, ?, ?)",
        caseIds
      );
    } catch (_) {}
    try {
      await pool.query(
        "DELETE FROM audit_logs WHERE resource_type = 'document' AND resource_id IN (?, ?, ?)",
        docIds
      );
    } catch (_) {}
    try {
      await pool.query(
        "DELETE FROM document_versions WHERE document_id IN (?, ?, ?)",
        docIds
      );
    } catch (_) {}
    try {
      await pool.query("DELETE FROM documents WHERE id IN (?, ?, ?)", docIds);
    } catch (_) {}
    try {
      await pool.query("DELETE FROM cases WHERE id IN (?, ?, ?)", caseIds);
    } catch (_) {}
    try {
      await pool.query(
        "DELETE FROM users WHERE id IN (?, ?)",
        [seeded.reviewerId, seeded.officerId]
      );
    } catch (_) {}
    await restoreEnv();
  }

  try {
    // ---- TEST 1: reset + unknown case ----
    console.log("\n=== TEST 1: reset + no-case safety ===");
    await resetData(pool, testDbName);
    const missing = await buildCaseTimeline(999999, pool);
    check("unknown case returns null", missing === null);

    // ---- TEST 2: seed users, cases, documents, reviews, signature ----
    console.log("\n=== TEST 2: seed timeline data ===");

    const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
    });
    process.env.APPROVAL_SIGNING_PRIVATE_KEY_B64 = Buffer.from(
      privateKey.export({ type: "pkcs8", format: "pem" }),
      "utf8"
    ).toString("base64");
    process.env.APPROVAL_SIGNING_PUBLIC_KEY_B64 = Buffer.from(
      publicKey.export({ type: "spki", format: "pem" }),
      "utf8"
    ).toString("base64");
    process.env.APPROVAL_SIGNING_KEY_ID = "test-tl-key-001";

    const [reviewerRes] = await pool.query(
      "INSERT INTO users (username, email, password_hash, full_name, is_active) " +
        "VALUES (?, ?, ?, ?, 1)",
      [
        "__dms_test_tl_reviewer__",
        "__dms_test_tl_reviewer__@example.local",
        "__test_placeholder_hash____do_not_use__",
        "DMS Timeline Reviewer",
      ]
    );
    seeded.reviewerId = reviewerRes.insertId;

    const [officerRes] = await pool.query(
      "INSERT INTO users (username, email, password_hash, full_name, is_active) " +
        "VALUES (?, ?, ?, ?, 1)",
      [
        "__dms_test_tl_officer__",
        "__dms_test_tl_officer__@example.local",
        "__test_placeholder_hash____do_not_use__",
        "DMS Timeline Officer",
      ]
    );
    seeded.officerId = officerRes.insertId;

    const [caseARes] = await pool.query(
      "INSERT INTO cases (case_number, title, case_type, description, status, priority, created_by, assigned_to) " +
        "VALUES (?, ?, ?, ?, 'under_review', 'high', ?, ?)",
      [
        "CASE-TL-2026-001",
        "Timeline Target Case",
        "Financial Crime",
        "Seeded for timeline tests",
        db.userId,
        seeded.officerId,
      ]
    );
    seeded.caseAId = caseARes.insertId;

    const [caseBRes] = await pool.query(
      "INSERT INTO cases (case_number, title, case_type, description, status, priority, created_by, assigned_to) " +
        "VALUES (?, ?, ?, ?, 'open', 'low', ?, ?)",
      [
        "CASE-TL-2026-002",
        "Unrelated Timeline Case",
        "Theft",
        "Must never leak into case A",
        db.userId,
        seeded.officerId,
      ]
    );
    seeded.caseBId = caseBRes.insertId;

    const [caseCRes] = await pool.query(
      "INSERT INTO cases (case_number, title, status, priority, created_by) " +
        "VALUES (?, ?, 'open', 'medium', ?)",
      ["CASE-TL-2026-003", "Bare Timeline Case", db.userId]
    );
    seeded.caseCId = caseCRes.insertId;

    async function insertCaseAssignment(caseId) {
      await pool.query(
        "INSERT INTO case_assignments (case_id, user_id, assignment_role, assigned_by) " +
          "VALUES (?, ?, 'officer', ?)",
        [caseId, seeded.officerId, db.userId]
      );
    }
    await insertCaseAssignment(seeded.caseAId);
    await insertCaseAssignment(seeded.caseBId);

    async function insertDocument(caseId, title, currentVersion, fileName) {
      const [res] = await pool.query(
        "INSERT INTO documents (case_id, title, description, document_type, status, current_version, uploaded_by) " +
          "VALUES (?, ?, ?, 'evidence', 'active', ?, ?)",
        [caseId, title, "Timeline evidence", currentVersion, db.userId]
      );
      const docId = res.insertId;
      await pool.query(
        "INSERT INTO document_versions " +
          "(document_id, version_number, file_path, original_file_name, " +
          " stored_file_name, mime_type, file_size, checksum, uploaded_by) " +
          "VALUES (?, 1, ?, ?, ?, 'application/pdf', 1024, ?, ?)",
        [
          docId,
          "secure_dms_test/priv/" + fileName,
          fileName,
          fileName,
          "a".repeat(64),
          db.userId,
        ]
      );
      return docId;
    }

    seeded.doc1Id = await insertDocument(
      seeded.caseAId,
      "Statement Recording",
      2,
      "tl_statement_v1.pdf"
    );
    await pool.query(
      "INSERT INTO document_versions " +
        "(document_id, version_number, file_path, original_file_name, " +
        " stored_file_name, mime_type, file_size, checksum, uploaded_by) " +
        "VALUES (?, 2, ?, ?, ?, 'application/pdf', 2048, ?, ?)",
      [
        seeded.doc1Id,
        "secure_dms_test/priv/tl_statement_v2.pdf",
        "tl_statement_v2.pdf",
        "tl_statement_v2.pdf",
        "b".repeat(64),
        db.userId,
      ]
    );
    seeded.doc2Id = await insertDocument(
      seeded.caseAId,
      "Forensic Report",
      1,
      "tl_report_v1.pdf"
    );
    seeded.docBId = await insertDocument(
      seeded.caseBId,
      "Foreign Evidence",
      1,
      "tl_foreign_v1.pdf"
    );

    const [rejectRes] = await pool.query(
      "INSERT INTO case_reviews (case_id, reviewer_id, action, review_note, created_at) " +
        "VALUES (?, ?, 'rejected', 'Missing financial statement', '2026-02-07 10:00:00')",
      [seeded.caseAId, seeded.reviewerId]
    );
    const [approveRes] = await pool.query(
      "INSERT INTO case_reviews (case_id, reviewer_id, action, review_note, created_at) " +
        "VALUES (?, ?, 'approved', 'All evidence in order', '2026-02-08 10:00:00')",
      [seeded.caseAId, seeded.reviewerId]
    );
    seeded.approvedReviewId = approveRes.insertId;

    const payload = canonicalizeApprovalPayload({
      reviewId: approveRes.insertId,
      caseId: Number(seeded.caseAId),
      caseNumber: "CASE-TL-2026-001",
      reviewerId: seeded.reviewerId,
      reviewerUsername: "__dms_test_tl_reviewer__",
      reviewNote: "All evidence in order",
      approvedAt: "2026-02-08T10:00:00.000Z",
      artifacts: [
        {
          documentId: seeded.doc1Id,
          documentTitle: "Statement Recording",
          versionNumber: 2,
          checksum: "b".repeat(64),
        },
        {
          documentId: seeded.doc2Id,
          documentTitle: "Forensic Report",
          versionNumber: 1,
          checksum: "a".repeat(64),
        },
      ],
    });
    seeded.rawSignature = signApprovalPayload(payload);
    await pool.query(
      "INSERT INTO approval_signatures " +
        "(review_id, case_id, payload, signature, algorithm, key_id, signed_at) " +
        "VALUES (?, ?, ?, ?, 'ECDSA-P256-SHA256', 'test-tl-key-001', '2026-02-08 10:05:00')",
      [approveRes.insertId, seeded.caseAId, payload, seeded.rawSignature]
    );

    async function insertAudit(userId, action, resourceType, resourceId, details, createdAt) {
      await pool.query(
        "INSERT INTO audit_logs " +
          "(user_id, action, resource_type, resource_id, ip_address, user_agent, details, created_at) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          userId,
          action,
          resourceType,
          resourceId,
          "127.0.0.1",
          "timeline-test-agent",
          JSON.stringify(details),
          createdAt,
        ]
      );
    }

    // Case A — case-scoped milestones.
    await insertAudit(
      db.userId,
      "CASE_CREATED",
      "case",
      seeded.caseAId,
      { caseNumber: "CASE-TL-2026-001", title: "Timeline Target Case" },
      "2026-02-01 09:00:00"
    );
    await insertAudit(
      db.userId,
      "CASE_ASSIGNED",
      "case",
      seeded.caseAId,
      { caseNumber: "CASE-TL-2026-001", targetUserName: "DMS Timeline Officer" },
      "2026-02-02 10:00:00"
    );
    await insertAudit(
      seeded.officerId,
      "CASE_SUBMITTED_FOR_REVIEW",
      "case",
      seeded.caseAId,
      {
        caseNumber: "CASE-TL-2026-001",
        previousStatus: "in_progress",
        newStatus: "under_review",
      },
      "2026-02-06 12:00:00"
    );

    // Case A — document 1 events.
    await insertAudit(
      db.userId,
      "DOCUMENT_CREATED",
      "document",
      seeded.doc1Id,
      { title: "Statement Recording", caseId: seeded.caseAId },
      "2026-02-03 10:00:00"
    );
    await insertAudit(
      db.userId,
      "VERSION_CREATED",
      "document",
      seeded.doc1Id,
      { versionNumber: 2, originalFileName: "tl_statement_v2.pdf" },
      "2026-02-04 11:00:00"
    );
    await insertAudit(
      db.userId,
      "VERSION_INTEGRITY_VERIFIED",
      "document",
      seeded.doc1Id,
      { versionNumber: 1, integrityValid: true },
      "2026-02-04 09:00:00"
    );

    // Case A — document 2 events.
    await insertAudit(
      db.userId,
      "DOCUMENT_CREATED",
      "document",
      seeded.doc2Id,
      { title: "Forensic Report", caseId: seeded.caseAId },
      "2026-02-05 10:00:00"
    );
    await insertAudit(
      db.userId,
      "VERSION_INTEGRITY_VERIFIED",
      "document",
      seeded.doc2Id,
      { versionNumber: 1, integrityValid: false },
      "2026-02-05 11:00:00"
    );

    // Case B — MUST NOT appear in case A's timeline.
    await insertAudit(
      db.userId,
      "CASE_CREATED",
      "case",
      seeded.caseBId,
      { caseNumber: "CASE-TL-2026-002", title: "Unrelated Timeline Case" },
      "2026-01-15 09:00:00"
    );
    await insertAudit(
      db.userId,
      "DOCUMENT_CREATED",
      "document",
      seeded.docBId,
      { title: "Foreign Evidence", caseId: seeded.caseBId },
      "2026-01-16 09:00:00"
    );
    await insertAudit(
      db.userId,
      "VERSION_INTEGRITY_VERIFIED",
      "document",
      seeded.docBId,
      { versionNumber: 1, integrityValid: true },
      "2026-01-16 10:00:00"
    );

    check("signature row seeded", typeof seeded.rawSignature === "string" && seeded.rawSignature.length > 20);

    // ---- TEST 3: timeline payload shape ----
    console.log("\n=== TEST 3: payload shape ===");
    const data = await buildCaseTimeline(seeded.caseAId, pool);
    check("payload built for existing case", data !== null);
    check(
      "case metadata present",
      data.case &&
        data.case.id === Number(seeded.caseAId) &&
        data.case.caseNumber === "CASE-TL-2026-001" &&
        data.case.title === "Timeline Target Case",
      JSON.stringify(data && data.case)
    );
    check("events is an array", Array.isArray(data.events));
    check("total matches event count", data.total === data.events.length);
    check("total = 10 events", data.total === 10, String(data.total));

    // ---- TEST 4: chronological order (newest -> oldest) ----
    console.log("\n=== TEST 4: chronological order ===");
    const expectedTypes = [
      "CASE_REVIEW_APPROVED",
      "CASE_REVIEW_REJECTED",
      "CASE_SUBMITTED_FOR_REVIEW",
      "VERSION_INTEGRITY_VERIFIED",
      "DOCUMENT_CREATED",
      "VERSION_CREATED",
      "VERSION_INTEGRITY_VERIFIED",
      "DOCUMENT_CREATED",
      "CASE_ASSIGNED",
      "CASE_CREATED",
    ];
    const actualTypes = data.events.map((e) => e.type);
    check(
      "exact type sequence matches expectation",
      JSON.stringify(actualTypes) === JSON.stringify(expectedTypes),
      JSON.stringify(actualTypes)
    );
    let chronological = true;
    for (let i = 1; i < data.events.length; i++) {
      if (new Date(data.events[i - 1].timestamp) < new Date(data.events[i].timestamp)) {
        chronological = false;
      }
    }
    check("events sorted newest -> oldest", chronological);

    // Every event exposes the normalized contract fields.
    const contractOk = data.events.every(
      (e) =>
        "id" in e &&
        "timestamp" in e &&
        "type" in e &&
        "title" in e &&
        "description" in e &&
        "actor" in e &&
        "scope" in e &&
        "resource" in e &&
        "metadata" in e &&
        typeof e.title === "string" &&
        typeof e.type === "string"
    );
    check("every event has the normalized contract fields", contractOk);

    // ---- TEST 5: case-level events ----
    console.log("\n=== TEST 5: case-level events ===");
    const created = data.events.find((e) => e.type === "CASE_CREATED");
    check(
      "case created event",
      created.title === "Case created" &&
        created.scope === "case" &&
        created.resource === null &&
        created.metadata.caseNumber === "CASE-TL-2026-001",
      JSON.stringify(created)
    );
    check(
      "case created actor",
      created.actor === "__dms_test_admin__",
      String(created.actor)
    );
    const assigned = data.events.find((e) => e.type === "CASE_ASSIGNED");
    check(
      "officer assigned event",
      assigned.title === "Officer assigned" &&
        assigned.scope === "case" &&
        assigned.metadata.officer === "DMS Timeline Officer",
      JSON.stringify(assigned)
    );
    const submitted = data.events.find((e) => e.type === "CASE_SUBMITTED_FOR_REVIEW");
    check(
      "case submitted for review event",
      submitted.title === "Case submitted for review" &&
        submitted.actor === "__dms_test_tl_officer__",
      JSON.stringify(submitted)
    );

    // ---- TEST 6: document + version events ----
    console.log("\n=== TEST 6: document/version events ===");
    const docCreated = data.events.find(
      (e) => e.type === "DOCUMENT_CREATED" && e.resource.documentId === Number(seeded.doc1Id)
    );
    check(
      "document uploaded event",
      docCreated.title === "Document uploaded" &&
        docCreated.scope === "document" &&
        docCreated.resource.documentTitle === "Statement Recording",
      JSON.stringify(docCreated)
    );
    const versionCreated = data.events.find((e) => e.type === "VERSION_CREATED");
    check(
      "version created event",
      versionCreated.title === "Document version created" &&
        versionCreated.resource.documentId === Number(seeded.doc1Id) &&
        versionCreated.resource.versionNumber === 2,
      JSON.stringify(versionCreated)
    );

    // ---- TEST 7: integrity events ----
    console.log("\n=== TEST 7: integrity events ===");
    const verified = data.events.find(
      (e) =>
        e.type === "VERSION_INTEGRITY_VERIFIED" &&
        e.resource.documentId === Number(seeded.doc1Id)
    );
    check(
      "integrity verified event",
      verified.title === "Document integrity verified" &&
        verified.metadata.integrityValid === true &&
        verified.resource.versionNumber === 1,
      JSON.stringify(verified)
    );
    const failed = data.events.find(
      (e) =>
        e.type === "VERSION_INTEGRITY_VERIFIED" &&
        e.resource.documentId === Number(seeded.doc2Id)
    );
    check(
      "integrity failed event",
      failed.title === "Document integrity verification failed" &&
        failed.metadata.integrityValid === false,
      JSON.stringify(failed)
    );

    // ---- TEST 8: review + digital approval signature ----
    console.log("\n=== TEST 8: review + signature events ===");
    const rejected = data.events.find((e) => e.type === "CASE_REVIEW_REJECTED");
    check(
      "rejected review event",
      rejected.title === "Case review rejected" &&
        rejected.metadata.decision === "rejected" &&
        rejected.metadata.reviewNote === "Missing financial statement" &&
        rejected.actor === "__dms_test_tl_reviewer__",
      JSON.stringify(rejected)
    );
    check(
      "rejected review has no signature",
      rejected.metadata.signature.exists === false,
      JSON.stringify(rejected.metadata.signature)
    );

    const approved = data.events.find((e) => e.type === "CASE_REVIEW_APPROVED");
    const sig = approved && approved.metadata.signature;
    check(
      "approved review event",
      approved.title === "Case review approved" &&
        approved.metadata.decision === "approved" &&
        approved.metadata.reviewNote === "All evidence in order",
      JSON.stringify(approved)
    );
    check(
      "approval signature exists",
      sig && sig.exists === true,
      JSON.stringify(sig)
    );
    check(
      "approval signature verifies with configured key",
      sig && sig.valid === true,
      JSON.stringify(sig)
    );
    check(
      "algorithm metadata exposed",
      sig && sig.algorithm === "ECDSA-P256-SHA256",
      sig && sig.algorithm
    );
    check(
      "key id metadata exposed",
      sig && sig.keyId === "test-tl-key-001",
      sig && sig.keyId
    );
    check(
      "signedAt is a valid ISO timestamp",
      sig &&
        typeof sig.signedAt === "string" &&
        !isNaN(new Date(sig.signedAt).getTime()),
      sig && sig.signedAt
    );

    // ---- TEST 9: secret/path/raw-signature safety ----
    console.log("\n=== TEST 9: safety (no secrets, keys, paths) ===");
    const serialized = JSON.stringify(data.events);
    check(
      "no PEM/private-key markers in events",
      !/BEGIN [A-Z ]*PRIVATE KEY/.test(serialized) &&
        !/BEGIN PUBLIC KEY/.test(serialized),
      ""
    );
    check(
      "raw cryptographic signature never exposed",
      serialized.indexOf(seeded.rawSignature) === -1
    );
    check(
      "canonical payload never exposed",
      serialized.indexOf("schemaVersion") === -1 &&
        serialized.indexOf("CASE_REVIEW_APPROVED\",\"reviewId") === -1
    );
    check(
      "no storage file paths in events",
      serialized.indexOf("secure_dms_test/priv/") === -1
    );

    // ---- TEST 10: access control (cross-case isolation) ----
    console.log("\n=== TEST 10: cross-case isolation ===");
    const leaked = data.events.some(
      (e) => e.resource && Number(e.resource.documentId) === Number(seeded.docBId)
    );
    check("case A timeline contains no case B documents", !leaked);
    check(
      "case A timeline contains no case B case events",
      !data.events.some(
        (e) => e.type === "CASE_CREATED" && e.metadata.caseNumber === "CASE-TL-2026-002"
      )
    );

    const dataB = await buildCaseTimeline(seeded.caseBId, pool);
    const foreignDoc = (dataB.events || []).some(
      (e) => e.resource && Number(e.resource.documentId) === Number(seeded.docBId)
    );
    check(
      "case B timeline has its own document events (positive control)",
      foreignDoc && dataB.total === 3,
      JSON.stringify((dataB.events || []).map((e) => e.type))
    );
    check(
      "case B timeline excludes case A events",
      !(dataB.events || []).some(
        (e) =>
          (e.resource &&
            Number(e.resource.documentId) === Number(seeded.doc1Id)) ||
          (e.type === "CASE_REVIEW_APPROVED")
      )
    );

    // ---- TEST 11: empty timeline safety ----
    console.log("\n=== TEST 11: empty case is safe ===");
    const bare = await buildCaseTimeline(seeded.caseCId, pool);
    check("bare case still resolves", bare && bare.case.id === Number(seeded.caseCId));
    check(
      "bare case yields only the CASE_CREATED fallback",
      Array.isArray(bare.events) &&
        bare.events.length === 1 &&
        bare.events[0].type === "CASE_CREATED" &&
        bare.events[0].title === "Case created" &&
        bare.events[0].actor === "__dms_test_admin__",
      JSON.stringify(bare && bare.events)
    );
    check("bare case total = 1", bare.total === 1);
  } finally {
    await cleanup();
    await closePool(pool);
  }

  console.log("\n========== RESULTS ==========");
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