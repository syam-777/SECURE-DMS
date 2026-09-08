/**
 * Secure DMS — Blockchain Audit Ledger Test Suite
 *
 * SAFETY: This suite runs ONLY against an isolated test database
 * (default: `<DB_NAME>_test`, e.g. `secure_dms_test`), never against the
 * application database `secure_dms`.
 *
 *   - It obtains a pool from ./testDb that is BOUND to the test database.
 *   - Every model call receives that test pool as the explicit executor,
 *     so the application `pool` (bound to `secure_dms`) is never used.
 *   - resetData() re-asserts the active database name before any DELETE.
 *   - On exit it verifies (read-only) that the application database's
 *     audit_logs count is unchanged, proving secure_dms was not modified.
 *
 * Usage:  npm run test:blockchain   (from backend/)
 */

const crypto = require("crypto");
const {
  initDatabase,
  resetData,
  closePool,
  resolveDatabaseNames,
} = require("./testDb");
const {
  appendAuditBlock,
  verifyAuditBlockchain,
  listLedgerBlocks,
  computeDataHash,
  computeBlockHash,
  GENESIS_PREVIOUS_HASH,
} = require("../src/models/blockchainAuditModel");
const { logAuditEvent } = require("../src/models/auditLogModel");

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

let mainPoolForCount = null;

/**
 * Best-effort read-only capture/compare of the APPLICATION database's
 * audit_logs count. This is a SELECT-only check used to prove that the
 * test suite never modifies secure_dms. If the app DB is unreachable we
 * log a warning rather than fail (isolation is already guaranteed by the
 * test pool binding).
 * @param {string} label - "start" or "end"
 * @returns {Promise<number|null>}
 */
async function captureAppAuditCount() {
  try {
    if (!mainPoolForCount) {
      const mysql = require("mysql2/promise");
      require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
      mainPoolForCount = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: Number(process.env.DB_PORT),
        ssl:
          process.env.DB_SSL === "true" ? { minVersion: "TLSv1.2" } : undefined,
        connectionLimit: 1,
      });
    }
    const [rows] = await mainPoolForCount.query(
      "SELECT COUNT(*) AS cnt FROM audit_logs"
    );
    return rows[0].cnt;
  } catch (err) {
    console.log(
      "  (warning) could not check app DB count (" +
        err.message +
        "); isolation is still enforced by pool binding"
    );
    return null;
  }
}

async function assertAppDatabaseUntouched(startCount) {
  if (startCount == null) {
    return;
  }
  const endCount = await captureAppAuditCount();
  check(
    "application DB (secure_dms) audit_logs count unchanged",
    endCount === startCount,
    "start=" + startCount + " end=" + endCount
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

  const startCount = await captureAppAuditCount();

  const db = await initDatabase();
  const pool = db.pool;

  try {
    // ---- TEST 1: Verify empty ledger (after reset) ----
    console.log("\n=== TEST 1: Verify empty ledger ===");
    await resetData(pool, testDbName);
    const empty = await verifyAuditBlockchain(pool);
    check("empty ledger is valid", empty.valid === true);
    check("empty ledger blocks = 0", empty.blocks === 0);

    // ---- TEST 2: Create 3 audit events + blocks ----
    console.log("\n=== TEST 2: Create 3 audit events + blocks ===");
    const events = [];
    for (let i = 0; i < 3; i++) {
      const [result] = await pool.query(
        "INSERT INTO audit_logs " +
          "(user_id, action, resource_type, resource_id, ip_address, user_agent, details) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          db.userId,
          "TEST_EVENT_" + (i + 1),
          "test_resource",
          100 + i,
          "127.0.0.1",
          "test-agent",
          JSON.stringify({ testIndex: i }),
        ]
      );
      events.push(result.insertId);
    }

    for (let i = 0; i < events.length; i++) {
      await appendAuditBlock(
        {
          auditLogId: events[i],
          userId: db.userId,
          action: "TEST_EVENT_" + (i + 1),
          resourceType: "test_resource",
          resourceId: 100 + i,
          ipAddress: "127.0.0.1",
        },
        pool
      );
    }

    const v2 = await verifyAuditBlockchain(pool);
    check(
      "ledger valid after 3 blocks",
      v2.valid === true,
      v2.valid ? "" : JSON.stringify(v2.failures)
    );
    check("ledger has 3 blocks", v2.blocks === 3);
    check("last block index is 3", v2.lastBlockIndex === 3);

    // ---- TEST 3: Verify 1-based contiguous indexes ----
    console.log("\n=== TEST 3: Verify 1-based contiguous indexes ===");
    const blocks = await listLedgerBlocks(10, pool);
    check("block[0] index = 1", blocks[0].blockIndex === 1, "got=" + blocks[0].blockIndex);
    check("block[1] index = 2", blocks[1].blockIndex === 2, "got=" + blocks[1].blockIndex);
    check("block[2] index = 3", blocks[2].blockIndex === 3, "got=" + blocks[2].blockIndex);

    // ---- TEST 4: Verify previous_hash linkage ----
    console.log("\n=== TEST 4: Verify previous_hash linkage ===");
    check("block[0] previous_hash = genesis", blocks[0].previousHash === GENESIS_PREVIOUS_HASH);
    check("block[1] prev = block[0] hash", blocks[1].previousHash === blocks[0].blockHash);
    check("block[2] prev = block[1] hash", blocks[2].previousHash === blocks[1].blockHash);

    // ---- TEST 5: Verify data_hash deterministic ----
    console.log("\n=== TEST 5: Verify data_hash deterministic ===");
    for (let i = 0; i < blocks.length; i++) {
      const recomputed = computeDataHash({
        auditLogId: events[i],
        userId: db.userId,
        action: "TEST_EVENT_" + (i + 1),
        resourceType: "test_resource",
        resourceId: 100 + i,
        ipAddress: "127.0.0.1",
      });
      check(
        "block[" + i + "] data_hash matches",
        recomputed === blocks[i].dataHash,
        "recomputed=" + recomputed + " stored=" + blocks[i].dataHash
      );
    }

    // ---- TEST 6: Verify block_hash deterministic ----
    console.log("\n=== TEST 6: Verify block_hash deterministic ===");
    let prevH = GENESIS_PREVIOUS_HASH;
    for (let i = 0; i < blocks.length; i++) {
      const createdIso = new Date(blocks[i].createdAt).toISOString();
      const recomputed = computeBlockHash({
        previousHash: prevH,
        blockIndex: blocks[i].blockIndex,
        dataHash: blocks[i].dataHash,
        createdAtIso: createdIso,
      });
      check(
        "block[" + i + "] block_hash matches",
        recomputed === blocks[i].blockHash,
        "recomputed=" + recomputed + " stored=" + blocks[i].blockHash
      );
      prevH = blocks[i].blockHash;
    }

    // ---- TEST 7: Tamper test ----
    console.log("\n=== TEST 7: Tamper test ===");
    const origHash = blocks[0].dataHash;
    const tamperedHash = crypto.createHash("sha256").update("TAMPERED").digest("hex");
    await pool.query(
      "UPDATE blockchain_audit_ledger SET data_hash = ? WHERE block_index = 1",
      [tamperedHash]
    );
    const tampered = await verifyAuditBlockchain(pool);
    check("tampered ledger is INVALID", tampered.valid === false);
    check(
      "failure at block 1",
      tampered.failures.length > 0 && tampered.failures[0].blockIndex === 1
    );

    // ---- TEST 8: Restore ----
    console.log("\n=== TEST 8: Restore test ===");
    await pool.query(
      "UPDATE blockchain_audit_ledger SET data_hash = ? WHERE block_index = 1",
      [origHash]
    );
    const restored = await verifyAuditBlockchain(pool);
    check("restored ledger valid", restored.valid === true);
    check("restored has 3 blocks", restored.blocks === 3);

    // ---- TEST 9: Existing audit_logs read still works ----
    console.log("\n=== TEST 9: Existing audit_logs read ===");
    const [auditRows] = await pool.query("SELECT COUNT(*) AS cnt FROM audit_logs");
    check("test audit_logs has rows", auditRows[0].cnt >= 3);
    const [ledgerRows] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM blockchain_audit_ledger"
    );
    check("test ledger has 3 blocks", ledgerRows[0].cnt === 3);

    // ---- TEST 10: logAuditEvent creates block atomically ----
    console.log("\n=== TEST 10: logAuditEvent creates block ===");
    const [beforeAuditRes] = await pool.query("SELECT COUNT(*) AS cnt FROM audit_logs");
    const [beforeLedgerRes] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM blockchain_audit_ledger"
    );
    const beforeAudit = beforeAuditRes[0].cnt;
    const beforeLedger = beforeLedgerRes[0].cnt;

    const newId = await logAuditEvent(
      {
        userId: db.userId,
        action: "INTEGRATION_TEST",
        resourceType: "test",
        resourceId: 999,
        ipAddress: "127.0.0.1",
        userAgent: "mocha",
        details: { integration: true },
      },
      pool
    );

    const [afterAuditRes] = await pool.query("SELECT COUNT(*) AS cnt FROM audit_logs");
    const [afterLedgerRes] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM blockchain_audit_ledger"
    );
    const afterAudit = afterAuditRes[0].cnt;
    const afterLedger = afterLedgerRes[0].cnt;

    check("test audit_logs count increased by 1", afterAudit === beforeAudit + 1);
    check("test ledger count increased by 1", afterLedger === beforeLedger + 1);
    check("new audit row returned an ID", newId != null && Number(newId) > 0, "id=" + newId);

    const postVerify = await verifyAuditBlockchain(pool);
    check(
      "ledger still valid after logAuditEvent",
      postVerify.valid === true,
      postVerify.valid ? "" : JSON.stringify(postVerify.failures)
    );

    // ---- TEST 11: 1-based index continuity after logAuditEvent ----
    console.log("\n=== TEST 11: Index continuity after logAuditEvent ===");
    const blocksAfter = await listLedgerBlocks(10, pool);
    check("4 blocks total", blocksAfter.length === 4);
    for (let i = 0; i < blocksAfter.length; i++) {
      check("block[" + i + "] index = " + (i + 1), blocksAfter[i].blockIndex === i + 1);
    }

    // ---- TEST 12: Full chain linkage end-to-end ----
    console.log("\n=== TEST 12: Full chain linkage ===");
    let chainOk = true;
    let prevHash2 = GENESIS_PREVIOUS_HASH;
    for (let i = 0; i < blocksAfter.length; i++) {
      if (blocksAfter[i].previousHash !== prevHash2) {
        chainOk = false;
        break;
      }
      prevHash2 = blocksAfter[i].blockHash;
    }
    check("full chain previous_hash linkage", chainOk);

    // ---- TEST 13: Rollback safety for transactional logAuditEvent ----
    console.log("\n=== TEST 13: Transactional rollback leaves no orphan audit row ===");
    const [preTxnAudit] = await pool.query("SELECT COUNT(*) AS cnt FROM audit_logs");
    const [preTxnLedger] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM blockchain_audit_ledger"
    );

    const txnConn = await pool.getConnection();
    let txnFailedAsExpected = false;
    try {
      await txnConn.beginTransaction();

      // Fail the ledger INSERT specifically (#3) while allowing the audit
      // INSERT (#1) and the "last block" read (#2) to hit the real test DB
      // connection. This deterministically simulates a blockchain append
      // failing mid-transaction AFTER the audit row was inserted.
      let callCount = 0;
      const failingWrapper = {
        async query(sql, params) {
          callCount++;
          if (callCount === 3) {
            throw new Error("simulated blockchain block append failure");
          }
          return txnConn.query(sql, params);
        },
      };

      await logAuditEvent(
        {
          userId: db.userId,
          action: "TXN_ROLLBACK_TEST",
          resourceType: "test",
          resourceId: 0,
          ipAddress: "127.0.0.1",
        },
        failingWrapper
      );
      await txnConn.commit();
      console.log(
        "  (FAIL) expected logAuditEvent to throw; did not throw"
      );
    } catch (err) {
      // Expected: block append failure rethrown so caller can roll back.
      txnFailedAsExpected =
        err &&
        err.message === "simulated blockchain block append failure";
    } finally {
      try {
        await txnConn.rollback();
      } catch (_) {
        // already rolled back / disconnected
      }
      txnConn.release();
    }

    check(
      "logAuditEvent threw when block append failed inside transaction",
      txnFailedAsExpected
    );

    const [postFailedAudit] = await pool.query("SELECT COUNT(*) AS cnt FROM audit_logs");
    const [postFailedLedger] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM blockchain_audit_ledger"
    );
    check(
      "no orphan audit row after failed transactional append (rolled back)",
      postFailedAudit[0].cnt === preTxnAudit[0].cnt,
      "before=" + preTxnAudit[0].cnt + " after=" + postFailedAudit[0].cnt
    );
    check(
      "no orphan ledger block after failed transactional append (rolled back)",
      postFailedLedger[0].cnt === preTxnLedger[0].cnt,
      "before=" + preTxnLedger[0].cnt + " after=" + postFailedLedger[0].cnt
    );

    // ---- Final cleanup + app-DB-untouched assertion ----
    console.log("\n=== Cleanup + isolation assertion ===");
    await resetData(pool, testDbName);
    await assertAppDatabaseUntouched(startCount);
  } finally {
    await closePool(pool);
    if (mainPoolForCount) {
      await mainPoolForCount.end();
    }
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