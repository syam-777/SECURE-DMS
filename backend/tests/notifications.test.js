/**
 * Secure DMS — Notifications Feature Test Suite
 *
 * SAFETY: This suite runs ONLY against an isolated test database
 * (default: `<DB_NAME>_test`), never the application database. Every
 * model/service call receives the bound test pool as its explicit
 * executor, and resetData() re-asserts the active database name before
 * any destructive SQL.
 *
 * Covers:
 *   - required notification type values
 *   - recipient dedupe / invalid-id rejection
 *   - createNotification + safe-field projection (no user_id, no secrets,
 *     no storage paths, no checksums)
 *   - createNotificationsForUsers fan-out (one row per recipient) +
 *     skipping invalid entries without throwing
 *   - findNotificationsForUser: ownership isolation, newest-first,
 *     unreadOnly filter, pagination clamping
 *   - countUnreadNotifications
 *   - markNotificationRead ownership enforcement (cross-user denial) and
 *     success path (isRead + readAt set)
 *   - markAllNotificationsRead idempotence
 *   - null case_id / document_id references
 *   - service message safety (only safe metadata; integrity message
 *     NEVER contains checksums) and never-throw behavior
 *   - service fan-out with duplicate reviewer ids creates one row per
 *     unique recipient
 *
 * Usage:  node tests/notifications.test.js   (from backend/)
 */

const {
  initDatabase,
  resetData,
  closePool,
  resolveDatabaseNames,
} = require("./testDb");
const notificationModel = require("../src/models/notificationModel");
const {
  NOTIFICATION_TYPES,
  uniquePositiveIds,
  notifyCaseAssigned,
  notifyCaseSubmittedForReview,
  notifyCaseApproved,
  notifyCaseRejected,
  notifyCaseReturned,
  notifyDocumentUploaded,
  notifyDocumentVersionCreated,
  notifyIntegrityFailure,
  notifyDocumentReviewApproved,
  notifyDocumentReviewRejected,
  notifyDocumentReviewReturned,
} = require("../src/services/notificationService");

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

const EXPECTED_TYPES = [
  "CASE_ASSIGNED",
  "CASE_SUBMITTED_FOR_REVIEW",
  "CASE_APPROVED",
  "CASE_REJECTED",
  "CASE_RETURNED",
  "DOCUMENT_UPLOADED",
  "DOCUMENT_VERSION_CREATED",
  "INTEGRITY_CHECK_FAILED",
  "DOCUMENT_REVIEW_APPROVED",
  "DOCUMENT_REVIEW_REJECTED",
  "DOCUMENT_REVIEW_RETURNED",
];

function hasSensitiveContent(text) {
  return (
    /password|api[_-]?key|secret|token|checksum|stored_file_name|file_path|\/b2|A2[A-Za-z0-9]{20,}/i.test(
      String(text)
    )
  );
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

  // Run-unique suffix so a crashed prior run can never collide on the
  // UNIQUE username/email/case_number columns.
  const RUN_SUFFIX = "n" + Date.now();
  const caseNumber = "CASE-" + RUN_SUFFIX.toUpperCase() + "-001";

  const seeded = {
    officerAId: 0,
    officerBId: 0,
    reviewerCId: 0,
    caseId: 0,
    docId: 0,
    notifIds: [],
  };

  async function cleanup() {
    await resetData(pool, testDbName);
    try {
      if (seeded.notifIds.length) {
        await pool.query(
          "DELETE FROM notifications WHERE id IN (" +
            seeded.notifIds.map(() => "?").join(",") +
            ")",
          seeded.notifIds
        );
      }
    } catch (_) {}
    try {
      if (seeded.docId) {
        await pool.query(
          "DELETE FROM document_versions WHERE document_id = ?",
          [seeded.docId]
        );
        await pool.query("DELETE FROM documents WHERE id = ?", [
          seeded.docId,
        ]);
      }
    } catch (_) {}
    try {
      if (seeded.caseId) {
        await pool.query("DELETE FROM case_assignments WHERE case_id = ?", [
          seeded.caseId,
        ]);
        await pool.query("DELETE FROM cases WHERE id = ?", [seeded.caseId]);
      }
    } catch (_) {}
    const userIds = [
      seeded.officerAId,
      seeded.officerBId,
      seeded.reviewerCId,
    ].filter((id) => id > 0);
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

  // ── Pure service tests (no DB writes) ─────────────────────────
  console.log("\n=== TEST 1: required notification types ===");
  const keys = Object.keys(NOTIFICATION_TYPES).sort();
  check(
    "service exposes exactly the 11 required types",
    keys.length === EXPECTED_TYPES.length &&
      EXPECTED_TYPES
        .slice()
        .sort()
        .every((t, i) => keys[i] === t),
    keys.join(",")
  );

  console.log("\n=== TEST 2: recipient dedupe + invalid-id rejection ===");
  const deduped = uniquePositiveIds([3, "3", 3.7, 0, -2, 999, "abc"]);
  check(
    "uniquePositiveIds dedupes and keeps only positive integers",
    JSON.stringify(deduped) === JSON.stringify([3, 999]),
    JSON.stringify(deduped)
  );

  // ── DB-bound model + service tests ────────────────────────────
  console.log("\n=== TEST 3: reset + seed actors/case/document ===");
  await resetData(pool, testDbName);

  const placeholders = [
    ["__dms_notif_a_" + RUN_SUFFIX + "__", "__dms_notif_a_" + RUN_SUFFIX + "__@example.local", "Notif Officer A"],
    ["__dms_notif_b_" + RUN_SUFFIX + "__", "__dms_notif_b_" + RUN_SUFFIX + "__@example.local", "Notif Officer B"],
    ["__dms_notif_c_" + RUN_SUFFIX + "__", "__dms_notif_c_" + RUN_SUFFIX + "__@example.local", "Notif Reviewer C"],
  ];
  for (const [username, email, fullName] of placeholders) {
    await pool.query(
      "INSERT INTO users (username, email, password_hash, full_name, is_active) " +
        "VALUES (?, ?, '__test_placeholder_hash____do_not_use__', ?, 1)",
      [username, email, fullName]
    );
  }
  const [[[officerA]], [[officerB]], [[reviewerC]]] = [
    await pool.query("SELECT id FROM users WHERE username = '__dms_notif_a_" + RUN_SUFFIX + "__'"),
    await pool.query("SELECT id FROM users WHERE username = '__dms_notif_b_" + RUN_SUFFIX + "__'"),
    await pool.query("SELECT id FROM users WHERE username = '__dms_notif_c_" + RUN_SUFFIX + "__'"),
  ];
  seeded.officerAId = officerA.id;
  seeded.officerBId = officerB.id;
  seeded.reviewerCId = reviewerC.id;

  const [caseRes] = await pool.query(
    "INSERT INTO cases (case_number, title, case_type, status, priority, created_by, assigned_to) " +
      "VALUES (?, ?, ?, 'open', 'high', ?, ?)",
    [
      caseNumber,
      "Notifications Target Case",
      "Financial Crime",
      seeded.officerAId,
      seeded.officerAId,
    ]
  );
  seeded.caseId = caseRes.insertId;

  const [docRes] = await pool.query(
    "INSERT INTO documents (case_id, title, description, document_type, status, current_version, uploaded_by) " +
      "VALUES (?, ?, ?, 'evidence', 'active', 1, ?)",
    [
      seeded.caseId,
      "Evidence Report Alpha",
      "Seeded for notification tests",
      seeded.officerBId,
    ]
  );
  seeded.docId = docRes.insertId;

  console.log("\n=== TEST 4: createNotification + safe projection ===");
  const created = await notificationModel.createNotification(
    {
      userId: seeded.officerBId,
      type: NOTIFICATION_TYPES.DOCUMENT_UPLOADED,
      title: "Document Uploaded",
      message: '"Evidence Report Alpha" was uploaded.',
      caseId: seeded.caseId,
      documentId: seeded.docId,
    },
    pool
  );
  seeded.notifIds.push(created.id);
  check("createNotification returns a numeric id", Number.isInteger(created.id));

  const list1 = await notificationModel.findNotificationsForUser(
    seeded.officerBId,
    { page: 1, limit: 10 },
    pool
  );
  const proj = list1.notifications.find((n) => n.id === created.id);
  check("created row is listed for its owner", Boolean(proj));
  check(
    "projection exposes exactly the safe fields",
    proj &&
      JSON.stringify(Object.keys(proj).sort()) ===
        JSON.stringify(
          ["id", "type", "title", "message", "caseId", "documentId", "isRead", "readAt", "createdAt"].sort()
        ),
    proj ? JSON.stringify(Object.keys(proj)) : "missing"
  );
  check(
    "projection values match inserted row + links",
    proj &&
      proj.type === "DOCUMENT_UPLOADED" &&
      proj.caseId === Number(seeded.caseId) &&
      proj.documentId === Number(seeded.docId) &&
      proj.isRead === false &&
      proj.readAt === null &&
      proj.createdAt != null
  );
  const serializedProj = JSON.stringify(proj);
  check(
    "projection contains no user_id / storage paths / checksums / secrets",
    !/user_id|stored_file_name|file_path|checksum|secret|password/.test(serializedProj)
  );

  console.log("\n=== TEST 5: ownership isolation (list + count) ===");
  const otherUserList = await notificationModel.findNotificationsForUser(
    seeded.officerAId,
    { page: 1, limit: 10 },
    pool
  );
  check(
    "another user cannot see this user's notifications",
    otherUserList.total === 0 &&
      otherUserList.notifications.every((n) => n.id !== created.id)
  );
  check(
    "countUnreadNotifications is owner-scoped",
    (await notificationModel.countUnreadNotifications(seeded.officerBId, pool)) === 1 &&
      (await notificationModel.countUnreadNotifications(seeded.officerAId, pool)) === 0
  );

  console.log("\n=== TEST 6: markNotificationRead cross-user denial ===");
  const denied = await notificationModel.markNotificationRead(
    created.id,
    seeded.officerAId,
    pool
  );
  check(
    "marking someone else's notification returns null",
    denied === null
  );
  check(
    "the original row stays unread after cross-user attempt",
    (await notificationModel.countUnreadNotifications(seeded.officerBId, pool)) === 1
  );

  console.log("\n=== TEST 7: markNotificationRead own row ===");
  const marked = await notificationModel.markNotificationRead(
    created.id,
    seeded.officerBId,
    pool
  );
  check(
    "marking own notification returns the updated safe row",
    marked &&
      marked.id === created.id &&
      marked.isRead === true &&
      marked.readAt != null
  );

  console.log("\n=== TEST 8: markAllNotificationsRead idempotence ===");
  await pool.query(
    "UPDATE notifications SET is_read = FALSE, read_at = NULL WHERE user_id = ?",
    [seeded.officerBId]
  );
  await notificationModel.markAllNotificationsRead(seeded.officerBId, pool);
  check(
    "mark-all zeroes unread count",
    (await notificationModel.countUnreadNotifications(seeded.officerBId, pool)) === 0
  );
  check(
    "mark-all is idempotent (second call still 0)",
    (await notificationModel.markAllNotificationsRead(seeded.officerBId, pool)) === 0
  );

  console.log("\n=== TEST 9: createNotificationsForUsers fan-out ===");
  const fan = await notificationModel.createNotificationsForUsers(
    [
      {
        userId: seeded.officerAId,
        type: NOTIFICATION_TYPES.CASE_ASSIGNED,
        title: "Case Assigned",
        message: "You have been assigned to case " + caseNumber + ".",
        caseId: seeded.caseId,
      },
      {
        userId: seeded.officerBId,
        type: NOTIFICATION_TYPES.CASE_ASSIGNED,
        title: "Case Assigned",
        message: "You have been assigned to case " + caseNumber + ".",
        caseId: seeded.caseId,
      },
      {
        userId: seeded.reviewerCId,
        type: NOTIFICATION_TYPES.CASE_ASSIGNED,
        title: "Case Assigned",
        message: "You have been assigned to case " + caseNumber + ".",
        caseId: seeded.caseId,
      },
    ],
    pool
  );
  check("fan-out created exactly one row per recipient", fan.created === 3);

  console.log("\n=== TEST 10: fan-out skips invalid entries without throwing ===");
  const invalidResult = await notificationModel.createNotificationsForUsers(
    [{}, { userId: 0, type: "X", title: "t", message: "m" }, { userId: -1, type: "X", title: "t", message: "m" }],
    pool
  );
  check(
    "invalid fan-out entries are skipped silently (created = 0, no throw)",
    invalidResult.created === 0,
    JSON.stringify(invalidResult)
  );

  console.log("\n=== TEST 11: null case/document references ===");
  const nullRef = await notificationModel.createNotification(
    {
      userId: seeded.officerAId,
      type: NOTIFICATION_TYPES.CASE_RETURNED,
      title: "Case Returned",
      message: "A workflow notice.",
    },
    pool
  );
  seeded.notifIds.push(nullRef.id);
  const nullList = await notificationModel.findNotificationsForUser(
    seeded.officerAId,
    { page: 1, limit: 100 },
    pool
  );
  const nullRow = nullList.notifications.find((n) => n.id === nullRef.id);
  check(
    "notification with no refs persists with null case/document ids",
    nullRow && nullRow.caseId === null && nullRow.documentId === null
  );

  console.log("\n=== TEST 12: pagination + unreadOnly + ordering ===");
  const countOfficerA = (
    await notificationModel.findNotificationsForUser(seeded.officerAId, { page: 1, limit: 100 }, pool)
  ).notifications.length;
  const page1 = await notificationModel.findNotificationsForUser(
    seeded.officerAId,
    { page: 1, limit: 1 },
    pool
  );
  check(
    "total reflects full count, page slice respects limit",
    page1.notifications.length === 1 && page1.total === countOfficerA
  );
  check(
    "newest-first ordering (id desc among same timestamps)",
    page1.notifications[0] &&
      page1.notifications[0].id === Math.max(...nullList.notifications.map((n) => n.id))
  );
  const clamped = await notificationModel.findNotificationsForUser(
    seeded.officerBId,
    { page: 1, limit: 50000 },
    pool
  );
  check("limit is clamped to 100", clamped.limit === 100);
  const unreadOnly = await notificationModel.findNotificationsForUser(
    seeded.officerBId,
    { page: 1, limit: 50, unreadOnly: true },
    pool
  );
  check(
    "unreadOnly filter returns only unread rows",
    unreadOnly.notifications.every((n) => n.isRead === false)
  );

  // ── Service-level integration (exec = test pool) ───────────────
  console.log("\n=== TEST 13: service helper writes + safe message content ===");
  await notifyCaseApproved(
    { userId: seeded.officerAId, caseId: seeded.caseId, caseNumber: caseNumber },
    pool
  );
  await notifyCaseRejected(
    { userId: seeded.officerAId, caseId: seeded.caseId, caseNumber: caseNumber },
    pool
  );
  await notifyCaseReturned(
    { userId: seeded.officerAId, caseId: seeded.caseId, caseNumber: caseNumber },
    pool
  );
  await notifyCaseAssigned(
    {
      userId: seeded.officerAId,
      caseId: seeded.caseId,
      caseNumber: caseNumber,
      reassigned: true,
    },
    pool
  );
  await notifyDocumentUploaded(
    {
      userId: seeded.officerAId,
      caseId: seeded.caseId,
      caseNumber: caseNumber,
      documentId: seeded.docId,
      documentTitle: "Evidence Report Alpha",
    },
    pool
  );
  await notifyDocumentVersionCreated(
    {
      userId: seeded.officerBId,
      caseId: seeded.caseId,
      caseNumber: caseNumber,
      documentId: seeded.docId,
      documentTitle: "Evidence Report Alpha",
      versionNumber: 2,
    },
    pool
  );
  await notifyDocumentReviewApproved(
    { userId: seeded.officerBId, caseId: seeded.caseId, documentId: seeded.docId, documentTitle: "Evidence Report Alpha" },
    pool
  );
  await notifyDocumentReviewRejected(
    { userId: seeded.officerBId, caseId: seeded.caseId, documentId: seeded.docId, documentTitle: "Evidence Report Alpha" },
    pool
  );
  await notifyDocumentReviewReturned(
    { userId: seeded.officerBId, caseId: seeded.caseId, documentId: seeded.docId, documentTitle: "Evidence Report Alpha" },
    pool
  );

  const messagesForOwner = await notificationModel.findNotificationsForUser(
    seeded.officerAId,
    { page: 1, limit: 100 },
    pool
  );
  const allText =
    messagesForOwner.notifications.map((n) => n.title + " " + n.message).join(" ") +
    " ";

  check(
    "notifications carry safe metadata (case number + document title)",
    allText.includes(caseNumber) &&
      allText.includes("Evidence Report Alpha")
  );
  check(
    "no message contains secrets/paths/checksums",
    !hasSensitiveContent(allText)
  );
  check(
    "reassignment variant is differentiated in the message",
    allText.includes("reassigned")
  );
  const reassignedRow = messagesForOwner.notifications.find(
    (n) => n.type === NOTIFICATION_TYPES.CASE_ASSIGNED
  );
  check(
    "reassignment uses CASE_ASSIGNED type with reassigned message variant",
    reassignedRow &&
      reassignedRow.title === "Case Reassigned" &&
      /reassigned to you/.test(reassignedRow.message)
  );

  console.log("\n=== TEST 14: integrity-failure message excludes checksums ===");
  await notifyIntegrityFailure(
    {
      userId: seeded.officerBId,
      caseId: seeded.caseId,
      caseNumber: caseNumber,
      documentId: seeded.docId,
      documentTitle: "Evidence Report Alpha",
      versionNumber: 2,
    },
    pool
  );
  const integrityList = await notificationModel.findNotificationsForUser(
    seeded.officerBId,
    { page: 1, limit: 100 },
    pool
  );
  const integrityRow = integrityList.notifications.find(
    (n) => n.type === NOTIFICATION_TYPES.INTEGRITY_CHECK_FAILED
  );
  check(
    "integrity failure row uses INTEGRITY_CHECK_FAILED type",
    Boolean(integrityRow)
  );
  check(
    "integrity failure message never contains checksums or hashes",
    integrityRow &&
      !/checksum|hash|[0-9a-f]{40,}|[0-9a-f]{64}/i.test(
        integrityRow.title + " " + integrityRow.message
      )
  );

  console.log("\n=== TEST 15: service never-throws + dedupe fan-out ===");
  let swallowed = false;
  let integrityFailureSafe = false;
  try {
    const bad = await notifyCaseAssigned(
      { userId: 999999999, caseId: seeded.caseId, caseNumber: caseNumber },
      pool
    );
    swallowed = bad === null;
    await notifyIntegrityFailure(
      { userId: 999999999, caseId: seeded.caseId, documentId: seeded.docId, documentTitle: "x", versionNumber: 1 },
      pool
    );
    integrityFailureSafe = true;
  } catch (err) {
    swallowed = false;
  }
  check(
    "FK-invalid single notification returns null (failure swallowed)",
    swallowed
  );
  check(
    "never-throw helpers do not propagate DB errors",
    integrityFailureSafe
  );

  const dedupeResult = await notifyCaseSubmittedForReview(
    {
      reviewerIds: [
        seeded.reviewerCId,
        seeded.reviewerCId,
        seeded.officerAId,
        seeded.officerAId,
      ],
      caseId: seeded.caseId,
      caseNumber: caseNumber,
    },
    pool
  );
  check(
    "submit-for-review fan-out collapses duplicates: one row per unique reviewer",
    dedupeResult.created === 2,
    JSON.stringify(dedupeResult)
  );

  console.log("\n=== TEST 16: cross-user count isolation after writes ===");
  check(
    "reviewer C has exactly two rows (fan-out + dedupe fan-out, nothing else)",
    (await notificationModel.countUnreadNotifications(seeded.reviewerCId, pool)) === 2,
    String(
      await notificationModel.countUnreadNotifications(seeded.reviewerCId, pool)
    )
  );

  await cleanup();
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