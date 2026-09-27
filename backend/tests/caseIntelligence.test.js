/**
 * Secure DMS — Case Intelligence Dashboard Test Suite
 *
 * SAFETY: This suite runs ONLY against an isolated test database
 * (default: `<DB_NAME>_test`, e.g. `secure_dms_test`), never against the
 * application database `secure_dms`.
 *
 *   - It obtains a pool from ./testDb that is BOUND to the test database.
 *   - Every model call receives that test pool as the explicit executor,
 *     so the application `pool` (bound to `secure_dms`) is never used.
 *   - resetData() re-asserts the active database name before any DELETE.
 *
 * Covers buildCaseIntelligence(): payload shape, per-document integrity
 * derivation (reusing chainOfCustodyModel helpers), review history,
 * merged case+document activity timeline, and secret/path leakage checks.
 *
 * Usage:  node tests/caseIntelligence.test.js   (from backend/)
 */

const {
  initDatabase,
  resetData,
  closePool,
  resolveDatabaseNames,
} = require("./testDb");
const {
  buildCaseIntelligence,
} = require("../src/models/caseIntelligenceModel");

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

  const seeded = {
    caseId: 0,
    doc1Id: 0,
    doc2Id: 0,
    reviewerId: 0,
    officerId: 0,
  };

  try {
    // ---- TEST 1: reset + unknown case ----
    console.log("\n=== TEST 1: reset + unknown case ===");
    await resetData(pool, testDbName);
    const missing = await buildCaseIntelligence(999999, pool);
    check("unknown case returns null", missing === null);

    // ---- TEST 2: seed case, assignments, documents, reviews, audit ----
    console.log("\n=== TEST 2: seed intelligence data ===");

    const [reviewerRes] = await pool.query(
      "INSERT INTO users (username, email, password_hash, full_name, is_active) " +
        "VALUES (?, ?, ?, ?, 1)",
      [
        "__dms_test_reviewer__",
        "__dms_test_reviewer__@example.local",
        "__test_placeholder_hash____do_not_use__",
        "DMS Test Reviewer",
      ]
    );
    seeded.reviewerId = reviewerRes.insertId;

    const [officerRes] = await pool.query(
      "INSERT INTO users (username, email, password_hash, full_name, is_active) " +
        "VALUES (?, ?, ?, ?, 1)",
      [
        "__dms_test_officer__",
        "__dms_test_officer__@example.local",
        "__test_placeholder_hash____do_not_use__",
        "DMS Test Officer",
      ]
    );
    seeded.officerId = officerRes.insertId;

    const [caseRes] = await pool.query(
      "INSERT INTO cases (case_number, title, case_type, description, status, priority, created_by, assigned_to) " +
        "VALUES (?, ?, ?, ?, 'under_review', 'high', ?, ?)",
      [
        "CASE-INTEL-2026-001",
        "Case Intelligence Test Case",
        "Financial Crime",
        "Seeded for intelligence tests",
        db.userId,
        seeded.officerId,
      ]
    );
    seeded.caseId = caseRes.insertId;

    await pool.query(
      "INSERT INTO case_assignments (case_id, user_id, assignment_role, assigned_by) " +
        "VALUES (?, ?, 'officer', ?)",
      [seeded.caseId, seeded.officerId, db.userId]
    );

    // Document 1: v1 verified, v2 not checked.
    const [doc1Res] = await pool.query(
      "INSERT INTO documents (case_id, title, description, document_type, status, current_version, uploaded_by) " +
        "VALUES (?, ?, ?, 'evidence', 'active', 2, ?)",
      [seeded.caseId, "Statement Recording", "Witness statement", db.userId]
    );
    seeded.doc1Id = doc1Res.insertId;

    // Document 2: v1 verified, v2 failed (last check wins).
    const [doc2Res] = await pool.query(
      "INSERT INTO documents (case_id, title, description, document_type, status, current_version, uploaded_by) " +
        "VALUES (?, ?, ?, 'report', 'active', 2, ?)",
      [seeded.caseId, "Forensic Report", "Lab analysis report", db.userId]
    );
    seeded.doc2Id = doc2Res.insertId;

    async function insertVersion(docId, versionNumber, checksum, fileName) {
      await pool.query(
        "INSERT INTO document_versions " +
          "(document_id, version_number, file_path, original_file_name, " +
          " stored_file_name, mime_type, file_size, checksum, uploaded_by) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          docId,
          versionNumber,
          "secure_dms_test/priv/" + fileName,
          fileName,
          fileName,
          "application/pdf",
          1024 * versionNumber,
          checksum,
          db.userId,
        ]
      );
    }

    await insertVersion(seeded.doc1Id, 1, "a".repeat(64), "statement_v1.pdf");
    await insertVersion(seeded.doc1Id, 2, "b".repeat(64), "statement_v2.pdf");
    await insertVersion(seeded.doc2Id, 1, "c".repeat(64), "report_v1.pdf");
    await insertVersion(seeded.doc2Id, 2, "d".repeat(64), "report_v2.pdf");

    // Two review decisions: rejected first, then approved.
    await pool.query(
      "INSERT INTO case_reviews (case_id, reviewer_id, action, review_note, created_at) " +
        "VALUES (?, ?, 'rejected', 'Missing statement', '2026-01-05 10:00:00')",
      [seeded.caseId, seeded.reviewerId]
    );
    await pool.query(
      "INSERT INTO case_reviews (case_id, reviewer_id, action, review_note, created_at) " +
        "VALUES (?, ?, 'approved', 'All evidence in order', '2026-01-05 12:00:00')",
      [seeded.caseId, seeded.reviewerId]
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
          "intel-test-agent",
          JSON.stringify(details),
          createdAt,
        ]
      );
    }

    // Case-scoped events.
    await insertAudit(
      db.userId,
      "CASE_CREATED",
      "case",
      seeded.caseId,
      { caseNumber: "CASE-INTEL-2026-001", title: "Case Intelligence Test Case" },
      "2026-01-05 08:30:00"
    );
    await insertAudit(
      seeded.officerId,
      "CASE_SUBMITTED_FOR_REVIEW",
      "case",
      seeded.caseId,
      {
        caseNumber: "CASE-INTEL-2026-001",
        previousStatus: "in_progress",
        newStatus: "under_review",
      },
      "2026-01-05 11:00:00"
    );
    await insertAudit(
      seeded.reviewerId,
      "CASE_REVIEW_APPROVED",
      "case",
      seeded.caseId,
      {
        caseNumber: "CASE-INTEL-2026-001",
        previousStatus: "under_review",
        newStatus: "closed",
        reviewNote: "All evidence in order",
      },
      "2026-01-05 12:00:00"
    );

    // Document 1 events.
    await insertAudit(
      db.userId,
      "DOCUMENT_UPLOADED",
      "document",
      seeded.doc1Id,
      { versionNumber: 1, fileName: "statement_v1.pdf" },
      "2026-01-05 08:00:00"
    );
    await insertAudit(
      db.userId,
      "VERSION_INTEGRITY_VERIFIED",
      "document",
      seeded.doc1Id,
      { versionNumber: 1, integrityValid: true },
      "2026-01-05 08:10:00"
    );
    await insertAudit(
      db.userId,
      "VERSION_CREATED",
      "document",
      seeded.doc1Id,
      { versionNumber: 2, fileName: "statement_v2.pdf" },
      "2026-01-05 09:00:00"
    );

    // Document 2 events.
    await insertAudit(
      db.userId,
      "VERSION_INTEGRITY_VERIFIED",
      "document",
      seeded.doc2Id,
      { versionNumber: 1, integrityValid: true },
      "2026-01-05 09:15:00"
    );
    await insertAudit(
      db.userId,
      "VERSION_INTEGRITY_VERIFIED",
      "document",
      seeded.doc2Id,
      { versionNumber: 2, integrityValid: false },
      "2026-01-05 09:20:00"
    );

    const data = await buildCaseIntelligence(seeded.caseId, pool);
    check("payload built for existing case", data !== null);

    // ---- TEST 3: case + assignments projection ----
    console.log("\n=== TEST 3: case + assignments ===");
    check("case number preserved", data.case.case_number === "CASE-INTEL-2026-001");
    check("case status reflects review queue", data.case.status === "under_review");
    check("case creator joined", data.case.creator_username === "__dms_test_admin__");
    check("case assignee joined", data.case.assignee_username === "__dms_test_officer__");
    check("assignments length 1", data.assignments.length === 1);
    check(
      "assignment role officer + actor joined",
      data.assignments[0].assignment_role === "officer" &&
        data.assignments[0].username === "__dms_test_officer__",
      JSON.stringify(data.assignments[0])
    );

    // ---- TEST 4: documents + per-document integrity ----
    console.log("\n=== TEST 4: documents + integrity ===");
    check("documents length 2", data.documents.length === 2);
    const doc1 = data.documents.find(
      (d) => d.document.id === seeded.doc1Id
    );
    const doc2 = data.documents.find(
      (d) => d.document.id === seeded.doc2Id
    );
    check("doc1 metadata kept", doc1.document.title === "Statement Recording");
    check("doc1 currentVersion = 2", doc1.document.currentVersion === 2);
    check("doc1 versionsCount = 2", doc1.document.versionsCount === 2);
    check(
      "doc1 integrity verified=1 failed=0 notVerified=1",
      doc1.integrity.verified === 1 &&
        doc1.integrity.failed === 0 &&
        doc1.integrity.notVerified === 1,
      JSON.stringify(doc1.integrity)
    );
    check(
      "doc1 v1 integrity = verified",
      doc1.versions[0].versionNumber === 1 &&
        doc1.versions[0].integrity.status === "verified",
      JSON.stringify(doc1.versions[0].integrity)
    );
    check(
      "doc1 v2 integrity = not_verified",
      doc1.versions[1].versionNumber === 2 &&
        doc1.versions[1].integrity.status === "not_verified"
    );
    check(
      "doc2 integrity verified=1 failed=1 notVerified=0",
      doc2.integrity.verified === 1 &&
        doc2.integrity.failed === 1 &&
        doc2.integrity.notVerified === 0,
      JSON.stringify(doc2.integrity)
    );
    check(
      "doc2 v2 integrity = integrity_failure (last check wins)",
      doc2.versions[1].integrity.status === "integrity_failure"
    );
    check(
      "version checksum preserved",
      doc1.versions[0].checksum === "a".repeat(64)
    );

    // ---- TEST 5: integrity totals ----
    console.log("\n=== TEST 5: integrity totals ===");
    check(
      "integrity totalDocuments = 2",
      data.integrity.totalDocuments === 2,
      String(data.integrity.totalDocuments)
    );
    check(
      "integrity versions = 4",
      data.integrity.versions === 4,
      String(data.integrity.versions)
    );
    check(
      "integrity verified = 2 failed = 1 notVerified = 1 checked = 3",
      data.integrity.verified === 2 &&
        data.integrity.failed === 1 &&
        data.integrity.notVerified === 1 &&
        data.integrity.checked === 3,
      JSON.stringify(data.integrity)
    );

    // ---- TEST 6: review summary ----
    console.log("\n=== TEST 6: review summary ===");
    check("review.status matches case", data.review.status === "under_review");
    check("review.totalReviews = 2", data.review.totalReviews === 2);
    check("review.lastReview = approved", data.review.lastReview.action === "approved");
    check(
      "review.lastReview reviewer joined + note",
      data.review.lastReview.reviewerUsername === "__dms_test_reviewer__" &&
        data.review.lastReview.reviewNote === "All evidence in order"
    );
    check(
      "review history newest-first",
      data.review.history[0].action === "approved" &&
        data.review.history[1].action === "rejected",
      data.review.history.map((r) => r.action).join(",")
    );

    // ---- TEST 7: merged activity timeline ----
    console.log("\n=== TEST 7: merged activity timeline ===");
    check("activityCount = 8", data.activityCount === 8, String(data.activityCount));
    check("activity capped at list (8)", data.activity.length === 8);
    check(
      "activity newest-first",
      data.activity.every(
        (event, idx) =>
          idx === 0 ||
          new Date(data.activity[idx - 1].createdAt) >= new Date(event.createdAt)
      ),
      data.activity.map((e) => `${e.action}@${e.createdAt}`).join(" | ")
    );
    check(
      "activity[0] = CASE_REVIEW_APPROVED (newest)",
      data.activity[0].action === "CASE_REVIEW_APPROVED",
      data.activity.map((e) => e.action).join(",")
    );
    const caseEvents = data.activity.filter((e) => e.scope === "case");
    const docEvents = data.activity.filter((e) => e.scope === "document");
    check(
      "case events scoped 'case' (3)",
      caseEvents.length === 3 &&
        caseEvents.every(
          (e) => e.resourceType === "case" && e.resourceId === seeded.caseId
        )
    );
    check(
      "document events scoped 'document' (5)",
      docEvents.length === 5,
      String(docEvents.length)
    );
    check(
      "document events carry documentTitle",
      docEvents.every(
        (e) => typeof e.documentTitle === "string" && e.documentTitle.length > 0
      )
    );
    const submitted = data.activity.find(
      (e) => e.action === "CASE_SUBMITTED_FOR_REVIEW"
    );
    check(
      "officer actor joined on submitted event",
      submitted && submitted.userUsername === "__dms_test_officer__"
    );
    check(
      "details kept raw at model layer",
      submitted && submitted.details.newStatus === "under_review"
    );

    // ---- TEST 8: no secret/path columns leak ----
    console.log("\n=== TEST 8: no secret/path columns leak ===");
    const leakedKeys = ["file_path", "stored_file_name", "password_hash"];
    const allVersionKeys = [];
    for (const entry of data.documents) {
      for (const v of entry.versions) {
        allVersionKeys.push(...Object.keys(v));
      }
    }
    const leaks = leakedKeys.filter((k) => allVersionKeys.includes(k));
    check("version rows exclude file_path/stored_file_name", leaks.length === 0, leaks.join(","));
    const payload = JSON.stringify(data);
    check("no storage path in payload", !payload.includes("secure_dms_test/priv"));
    check("no password hash in payload", !payload.includes("password_hash"));
  } finally {
    console.log("\n=== Cleanup ===");
    try {
      const [[row]] = await pool.query("SELECT DATABASE() AS db");
      if (row.db === testDbName) {
        const { caseId, doc1Id, doc2Id, reviewerId, officerId } = seeded;
        await pool.query("DELETE FROM blockchain_audit_ledger");
        await pool.query("DELETE FROM audit_logs");
        if (doc1Id > 0 && doc2Id > 0) {
          await pool.query(
            "DELETE FROM document_versions WHERE document_id IN (?, ?)",
            [doc1Id, doc2Id]
          );
          await pool.query(
            "DELETE FROM documents WHERE id IN (?, ?)",
            [doc1Id, doc2Id]
          );
        }
        if (caseId > 0) {
          await pool.query("DELETE FROM case_reviews WHERE case_id = ?", [caseId]);
          await pool.query("DELETE FROM case_assignments WHERE case_id = ?", [caseId]);
          await pool.query("DELETE FROM cases WHERE id = ?", [caseId]);
        }
        await pool.query(
          "DELETE FROM users WHERE id IN (?, ?)",
          [reviewerId, officerId]
        );
      }
    } catch (err) {
      console.log("  (warning) cleanup failed: " + err.message);
    }
    await resetData(pool, testDbName);
    await closePool(pool);
  }

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
  console.error("TEST SUITE ERROR:", err);
  process.exit(1);
});