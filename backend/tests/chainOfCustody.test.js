/**
 * Secure DMS — Document Chain of Custody Test Suite
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
 * Usage:  node tests/chainOfCustody.test.js   (from backend/)
 */

const {
  initDatabase,
  resetData,
  closePool,
  resolveDatabaseNames,
} = require("./testDb");
const {
  buildChainOfCustody,
  deriveVersionIntegrity,
} = require("../src/models/chainOfCustodyModel");

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
    docId: 0,
    reviewerId: 0,
  };

  try {
    // ---- TEST 1: reset + unknown document ----
    console.log("\n=== TEST 1: reset + unknown document ===");
    await resetData(pool, testDbName);
    const missing = await buildChainOfCustody(999999, pool);
    check("missing document returns null", missing === null);

    // ---- TEST 2: seed case/document/versions/reviews/audit events ----
    console.log("\n=== TEST 2: seed custody trail ===");

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

    const [caseRes] = await pool.query(
      "INSERT INTO cases (case_number, title, status, priority, created_by) " +
        "VALUES (?, ?, 'in_progress', 'high', ?)",
      ["CASE-COC-2026-001", "Chain of Custody Test Case", db.userId]
    );
    seeded.caseId = caseRes.insertId;

    const [docRes] = await pool.query(
      "INSERT INTO documents (case_id, title, description, document_type, status, current_version, uploaded_by) " +
        "VALUES (?, ?, ?, 'evidence', 'active', 2, ?)",
      [seeded.caseId, "Custody Test Document", "Seeded for chain tests", db.userId]
    );
    seeded.docId = docRes.insertId;

    const checksumV1 = "a".repeat(64);
    const checksumV2 = "b".repeat(64);
    await pool.query(
      "INSERT INTO document_versions " +
        "(document_id, version_number, file_path, original_file_name, " +
        " stored_file_name, mime_type, file_size, checksum, uploaded_by) " +
        "VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)",
      [
        seeded.docId,
        "secure_dms_test/priv/coc_v1.pdf",
        "coc_v1.pdf",
        "coc_v1.pdf",
        "application/pdf",
        1024,
        checksumV1,
        db.userId,
      ]
    );
    await pool.query(
      "INSERT INTO document_versions " +
        "(document_id, version_number, file_path, original_file_name, " +
        " stored_file_name, mime_type, file_size, checksum, uploaded_by) " +
        "VALUES (?, 2, ?, ?, ?, ?, ?, ?, ?)",
      [
        seeded.docId,
        "secure_dms_test/priv/coc_v2.pdf",
        "coc_v2.pdf",
        "coc_v2.pdf",
        "application/pdf",
        2048,
        checksumV2,
        db.userId,
      ]
    );

    await pool.query(
      "INSERT INTO document_reviews " +
        "(document_id, reviewer_id, action, review_note, created_at) " +
        "VALUES (?, ?, 'approved', 'First review note', '2026-01-05 09:00:00')",
      [seeded.docId, seeded.reviewerId]
    );
    await pool.query(
      "INSERT INTO document_reviews " +
        "(document_id, reviewer_id, action, review_note, created_at) " +
        "VALUES (?, ?, 'returned', 'Needs revision note', '2026-01-05 10:30:00')",
      [seeded.docId, seeded.reviewerId]
    );

    const auditEvents = [
      {
        action: "DOCUMENT_UPLOADED",
        details: { versionNumber: 1, fileName: "coc_v1.pdf" },
        createdAt: "2026-01-05 08:00:00",
      },
      {
        action: "VERSION_INTEGRITY_VERIFIED",
        details: { versionNumber: 1, integrityValid: true },
        createdAt: "2026-01-05 08:10:00",
      },
      {
        action: "DOCUMENT_UPDATED",
        details: { versionNumber: 2, fileName: "coc_v2.pdf" },
        createdAt: "2026-01-05 09:00:00",
      },
      {
        action: "VERSION_INTEGRITY_VERIFIED",
        details: { versionNumber: 2, integrityValid: true },
        createdAt: "2026-01-05 09:20:00",
      },
      {
        action: "VERSION_INTEGRITY_VERIFIED",
        details: { versionNumber: 2, integrityValid: false },
        createdAt: "2026-01-05 09:25:00",
      },
      {
        action: "DOCUMENT_CHAIN_VIEWED",
        details: {},
        createdAt: "2026-01-05 11:00:00",
      },
    ];
    for (const event of auditEvents) {
      await pool.query(
        "INSERT INTO audit_logs " +
          "(user_id, action, resource_type, resource_id, ip_address, user_agent, details, created_at) " +
          "VALUES (?, ?, 'document', ?, ?, ?, ?, ?)",
        [
          db.userId,
          event.action,
          seeded.docId,
          "127.0.0.1",
          "chain-test-agent",
          JSON.stringify(event.details),
          event.createdAt,
        ]
      );
    }

    const chain = await buildChainOfCustody(seeded.docId, pool);
    check("chain built for existing document", chain !== null);

    // ---- TEST 3: summary + integrity derivation ----
    console.log("\n=== TEST 3: summary + integrity derivation ===");
    check("summary.totalVersions = 2", chain.summary.totalVersions === 2);
    check("summary.currentVersion = 2", chain.summary.currentVersion === 2);
    check("summary.totalReviews = 2", chain.summary.totalReviews === 2);
    check("summary.totalAuditEvents = 6", chain.summary.totalAuditEvents === 6);
    check(
      "integirty counts verified=1 failed=1 notVerified=0",
      chain.summary.integrity.verified === 1 &&
        chain.summary.integrity.failed === 1 &&
        chain.summary.integrity.notVerified === 0,
      JSON.stringify(chain.summary.integrity)
    );

    check("versions chronological [1,2]", chain.versions[0].versionNumber === 1 && chain.versions[1].versionNumber === 2);
    check("v1 integrity = verified", chain.versions[0].integrity.status === "verified", chain.versions[0].integrity.status);
    check("v2 integrity = integrity_failure (last check wins)", chain.versions[1].integrity.status === "integrity_failure", chain.versions[1].integrity.status);

    // ---- TEST 4: no secret/path columns leak ----
    console.log("\n=== TEST 4: no secret/path columns leak ===");
    const leakedKeys = ["file_path", "stored_file_name", "password_hash"];
    const versionKeys = leakedKeys.filter((k) => k in chain.versions[0]);
    check("version rows exclude file_path/stored_file_name", versionKeys.length === 0, versionKeys.join(","));
    const docLeak = leakedKeys.filter((k) => k in chain.document);
    check("document excludes secret/path columns", docLeak.length === 0, docLeak.join(","));
    const raw = JSON.stringify(chain);
    check("payload string has no file paths", !raw.includes("coc_v1.pdf") || !raw.includes("priv/"));
    check("payload string has no secret path", !raw.includes("password_hash"));

    // ---- TEST 5: audit events sanitized shape + ordering ----
    console.log("\n=== TEST 5: audit events shape + ordering ===");
    const auditKeys = chain.auditEvents.map((e) => e.action);
    check(
      "audit events in chronological order",
      auditKeys.join(",") ===
        "DOCUMENT_UPLOADED,VERSION_INTEGRITY_VERIFIED,DOCUMENT_UPDATED,VERSION_INTEGRITY_VERIFIED,VERSION_INTEGRITY_VERIFIED,DOCUMENT_CHAIN_VIEWED",
      auditKeys.join(",")
    );
    const eventLeak = ["ip_address", "user_agent"].filter((k) => k in chain.auditEvents[0]);
    check("audit events exclude ip_address/user_agent", eventLeak.length === 0, eventLeak.join(","));
    check("audit details kept raw", chain.auditEvents[1].details.versionNumber === 1);
    check("audit user joined", chain.auditEvents[0].userUsername === "__dms_test_admin__");

    // ---- TEST 6: reviews joined + ordered ----
    console.log("\n=== TEST 6: reviews joined + ordered ===");
    check(
      "reviews chronological",
      chain.reviews[0].action === "approved" && chain.reviews[1].action === "returned",
      chain.reviews.map((r) => r.action).join(",")
    );
    check("review reviewer joined", chain.reviews[0].reviewerUsername === "__dms_test_reviewer__");
    check("review notes preserved", chain.reviews[1].reviewNote === "Needs revision note");

    // ---- TEST 7: case projection + document fields ----
    console.log("\n=== TEST 7: case + document projection ===");
    check("case projection limited", chain.case !== null && Object.keys(chain.case).sort().join(",") === "caseNumber,id");
    check("case number correct", chain.case.caseNumber === "CASE-COC-2026-001");
    check("document title", chain.document.title === "Custody Test Document");
    check("document uploader joined", chain.document.uploaderUsername === "__dms_test_admin__");
    check("document case_id kept", chain.document.caseId === seeded.caseId);

    // ---- TEST 8: deriveVersionIntegrity unit cases ----
    console.log("\n=== TEST 8: deriveVersionIntegrity unit cases ===");
    const eventsFixture = [
      { action: "VERSION_INTEGRITY_VERIFIED", details: { versionNumber: 3, integrityValid: true }, created_at: "2026-01-05 08:00:00" },
      { action: "VERSION_INTEGRITY_VERIFIED", details: { versionNumber: 4, integrityValid: false }, created_at: "2026-01-05 08:10:00" },
      { action: "DOCUMENT_VIEWED", details: {}, created_at: "2026-01-05 09:00:00" },
    ];
    check("untested version reported not_verified", deriveVersionIntegrity(eventsFixture, 5).status === "not_verified");
    check("verified event maps to verified", deriveVersionIntegrity(eventsFixture, 3).status === "verified");
    check("invalid event maps to integrity_failure", deriveVersionIntegrity(eventsFixture, 4).status === "integrity_failure");
    check("other actions ignored", deriveVersionIntegrity(eventsFixture, 5).checkedAt === null);

    // ---- TEST 9: case-level review + audit events merged into trail ----
    console.log("\n=== TEST 9: case-level events in custody trail ===");

    await pool.query(
      "INSERT INTO case_reviews " +
        "(case_id, reviewer_id, action, review_note, created_at) " +
        "VALUES (?, ?, 'approved', 'Case approved for custody test', '2026-01-05 12:00:00')",
      [seeded.caseId, seeded.reviewerId]
    );

    const caseAuditEvents = [
      {
        action: "CASE_SUBMITTED_FOR_REVIEW",
        details: {
          caseNumber: "CASE-COC-2026-001",
          previousStatus: "in_progress",
          newStatus: "under_review",
        },
        createdAt: "2026-01-05 11:30:00",
        userId: db.userId,
      },
      {
        action: "CASE_REVIEW_APPROVED",
        details: {
          caseNumber: "CASE-COC-2026-001",
          previousStatus: "under_review",
          newStatus: "closed",
          reviewNote: "Case approved for custody test",
        },
        createdAt: "2026-01-05 12:00:00",
        userId: seeded.reviewerId,
      },
    ];
    for (const event of caseAuditEvents) {
      await pool.query(
        "INSERT INTO audit_logs " +
          "(user_id, action, resource_type, resource_id, ip_address, user_agent, details, created_at) " +
          "VALUES (?, ?, 'case', ?, ?, ?, ?, ?)",
        [
          event.userId,
          event.action,
          seeded.caseId,
          "127.0.0.1",
          "chain-test-agent",
          JSON.stringify(event.details),
          event.createdAt,
        ]
      );
    }

    const withCase = await buildChainOfCustody(seeded.docId, pool);

    const caseReviewActions = (withCase.caseReviews || []).map((r) => r.action);
    check(
      "caseReviews contains the case review decision",
      withCase.caseReviews.length === 1 && caseReviewActions[0] === "approved",
      withCase.caseReviews.map((r) => r.action).join(",")
    );
    check(
      "caseReviews scoped to case + reviewer joined",
      withCase.caseReviews[0].scope === "case" &&
        withCase.caseReviews[0].reviewerUsername === "__dms_test_reviewer__",
      JSON.stringify(withCase.caseReviews[0])
    );
    check(
      "caseReviews note preserved",
      withCase.caseReviews[0].reviewNote === "Case approved for custody test"
    );
    check(
      "document reviews unaffected (scope document)",
      withCase.reviews.length === 2 &&
        withCase.reviews.every((r) => r.scope === "document"),
      withCase.reviews.map((r) => r.scope).join(",")
    );
    check(
      "summary.totalCaseReviews = 1",
      withCase.summary.totalCaseReviews === 1
    );
    check(
      "summary.totalAuditEvents includes case events (8)",
      withCase.summary.totalAuditEvents === 8,
      String(withCase.summary.totalAuditEvents)
    );

    const mergedActions = withCase.auditEvents.map((e) => e.action);
    check(
      "case audit events merged into auditEvents",
      mergedActions.filter((a) => a.startsWith("CASE_")).length === 2,
      mergedActions.join(",")
    );
    check(
      "case events scoped as 'case'",
      withCase.auditEvents
        .filter((e) => e.action.startsWith("CASE_"))
        .every((e) => e.scope === "case")
    );
    check(
      "document events scoped as 'document'",
      withCase.auditEvents
        .filter((e) => !e.action.startsWith("CASE_"))
        .every((e) => e.scope === "document")
    );
    check(
      "merged audit events chronologically sorted",
      withCase.auditEvents.every(
        (event, idx) =>
          idx === 0 ||
          new Date(withCase.auditEvents[idx - 1].createdAt) <=
            new Date(event.createdAt)
      ),
      withCase.auditEvents.map((e) => `${e.action}@${e.createdAt}`).join(" | ")
    );
    const caseEventUser = withCase.auditEvents.find(
      (e) => e.action === "CASE_REVIEW_APPROVED"
    );
    check(
      "case review actor joined",
      caseEventUser && caseEventUser.userUsername === "__dms_test_reviewer__"
    );
    const submittedEvent = withCase.auditEvents.find(
      (e) => e.action === "CASE_SUBMITTED_FOR_REVIEW"
    );
    check(
      "submitted-for-review carried by officer + details preserved",
      submittedEvent &&
        submittedEvent.userUsername === "__dms_test_admin__" &&
        submittedEvent.details.newStatus === "under_review"
    );

    // Case-independent document: must not break or inject case events.
    const [noCaseRes] = await pool.query(
      "INSERT INTO documents (title, description, document_type, status, current_version, uploaded_by) " +
        "VALUES ('Standalone Doc', 'No case attached', 'report', 'active', 1, ?)",
      [db.userId]
    );
    const noCaseDocId = noCaseRes.insertId;
    await pool.query(
      "INSERT INTO document_versions " +
        "(document_id, version_number, file_path, original_file_name, " +
        " stored_file_name, mime_type, file_size, checksum, uploaded_by) " +
        "VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)",
      [
        noCaseDocId,
        "secure_dms_test/priv/standalone.pdf",
        "standalone.pdf",
        "standalone.pdf",
        "application/pdf",
        512,
        "c".repeat(64),
        db.userId,
      ]
    );
    const noCase = await buildChainOfCustody(noCaseDocId, pool);
    check(
      "case-less document: caseReviews empty + data preserved",
      noCase !== null &&
        noCase.case === null &&
        noCase.caseReviews.length === 0 &&
        noCase.versions.length === 1 &&
        noCase.auditEvents.every((e) => e.scope === "document")
    );
    await pool.query("DELETE FROM documents WHERE id = ?", [noCaseDocId]);
  } finally {
    console.log("\n=== Cleanup ===");
    try {
      const [[row]] = await pool.query("SELECT DATABASE() AS db");
      if (row.db === testDbName && seeded.docId > 0) {
        await pool.query("DELETE FROM document_reviews WHERE document_id = ?", [seeded.docId]);
        await pool.query("DELETE FROM document_versions WHERE document_id = ?", [seeded.docId]);
        await pool.query("DELETE FROM documents WHERE id = ?", [seeded.docId]);
      }
      if (row.db === testDbName && seeded.caseId > 0) {
        await pool.query("DELETE FROM cases WHERE id = ?", [seeded.caseId]);
      }
      if (row.db === testDbName && seeded.reviewerId > 0) {
        await pool.query("DELETE FROM users WHERE id = ?", [seeded.reviewerId]);
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