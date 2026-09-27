/**
 * Secure DMS — Isolated Test Database Utility
 *
 * The automated test suite MUST NEVER run DELETE / UPDATE / TRUNCATE or
 * any other destructive SQL against the application database
 * (`secure_dms`, i.e. process.env.DB_NAME). It must always run against a
 * dedicated, isolated test database named `<DB_NAME>_test`
 * (overridable via DB_NAME_TEST).
 *
 * Safety guarantees enforced here:
 *   1. The resolved test database name MUST differ from the application
 *      database name and MUST end with `_test`. Otherwise initDatabase()
 *      aborts before any SQL is executed.
 *   2. The pool returned here is bound to the test database, so every
 *      query executed through it runs inside the isolated test database.
 *   3. resetData() re-checks `SELECT DATABASE()` at runtime and refuses to
 *      delete/truncate rows if the active database is not the isolated
 *      test database.
 *   4. Migrations and seeds are executed one statement at a time. Multi-
 *      statement SQL is NEVER used, because TiDB Cloud disables it
 *      ("client has multi-statement capability disabled"). This keeps the
 *      setup compatible with TiDB Cloud without enabling the TiDB global
 *      `tidb_multi_statement_mode` setting.
 */

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const MIGRATIONS_DIR = path.join(__dirname, "..", "src", "database", "migrations");
const SEEDS_DIR = path.join(__dirname, "..", "src", "database", "seeds");

/**
 * Resolves the application DB name and the isolated test DB name, and
 * refuses to continue when the test name is not safe.
 * @returns {{ mainDbName: string, testDbName: string }}
 */
function resolveDatabaseNames() {
  const mainDbName = (process.env.DB_NAME || "").trim();
  const configuredTest = (process.env.DB_NAME_TEST || "").trim();
  const testDbName = configuredTest || (mainDbName ? mainDbName + "_test" : "");

  if (!mainDbName) {
    throw new Error(
      "Cannot run tests: DB_NAME is not set. Refusing to guess the application database."
    );
  }
  if (!testDbName) {
    throw new Error(
      "Cannot run tests: unable to determine the test database name. " +
        "Set DB_NAME_TEST or ensure DB_NAME is set."
    );
  }
  if (!/[_]test$/i.test(testDbName)) {
    throw new Error(
      "Refusing to run tests: test database name '" +
        testDbName +
        "' must end with '_test'."
    );
  }
  if (testDbName === mainDbName) {
    throw new Error(
      "Refusing to run tests: DB_NAME_TEST ('" +
        testDbName +
        "') is the same as the application database DB_NAME ('" +
        mainDbName +
        "'). The application database must never be used as the test target."
    );
  }

  return { mainDbName, testDbName };
}

function buildConnectionConfig(database) {
  return {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT),
    database,
    ssl:
      process.env.DB_SSL === "true"
        ? { minVersion: "TLSv1.2" }
        : undefined,
    connectTimeout: 15000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
  };
}

/**
 * Splits a SQL file into its individual top-level statements, executing
 * each one separately. Multi-statement SQL is never sent to the server
 * because TiDB Cloud disables it ("client has multi-statement capability
 * disabled").
 *
 * Handles:
 *   - '-- comment' and '# comment' line comments (stripped)
 *   - '/* comment *&#47;' block comments (stripped)
 *   - '/*! ... *&#47;' MySQL executable comments (kept as live SQL)
 *   - single/double-quoted strings and backtick identifiers, so a ';'
 *     inside a string or identifier never splits a statement
 *   - '' / "" / `` escaped delimiter characters
 *
 * @param {string} sql - raw contents of one migration or seed file
 * @returns {string[]} trimmed, non-empty, single statements
 */
function splitSqlStatements(sql) {
  const statements = [];
  let current = "";
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const ch = sql[i];
    const next = sql[i + 1];

    // '--' line comment (MySQL requires whitespace after '--', or line start)
    if (ch === "-" && next === "-") {
      const after = sql[i + 2] || "";
      const startsLine = /^[ \t\r\n]*$/.test(current);
      if (startsLine || /[ \t\r\n]/.test(after)) {
        while (i < n && sql[i] !== "\n") {
          i++;
        }
        continue;
      }
      current += "--";
      i += 2;
      continue;
    }

    // '#' line comment
    if (ch === "#") {
      while (i < n && sql[i] !== "\n") {
        i++;
      }
      continue;
    }

    // '/* ... */' block comment (kept verbatim when executable: '/*! ... */')
    if (ch === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2);
      if (end === -1) {
        throw new Error("unterminated block comment '" + (current + sql.slice(i)).split("\n")[0] + "'");
      }
      if (sql[i + 2] === "!") {
        current += sql.slice(i, end + 2);
      }
      i = end + 2;
      continue;
    }

    // Single-quoted string, double-quoted string, or backtick identifier.
    // MySQL: quotes are escaped by doubling ('' / "" / ``) and, for ' ",
    // also by a backslash (default NO_BACKSLASH_ESCAPES unset).
    if (ch === "'" || ch === '"' || ch === "`") {
      const quote = ch;
      current += quote;
      i++;
      while (i < n) {
        if (quote !== "`" && sql[i] === "\\") {
          current += sql[i];
          if (i + 1 < n) {
            current += sql[i + 1];
            i++;
          }
          i++;
          continue;
        }
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) {
            current += quote + quote;
            i += 2;
            continue;
          }
          current += quote;
          i++;
          break;
        }
        current += sql[i];
        i++;
      }
      continue;
    }

    // ';' terminates a statement (outside strings/comments/identifiers)
    if (ch === ";") {
      const trimmed = current.trim();
      if (trimmed) {
        statements.push(trimmed);
      }
      current = "";
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  const trailing = current.trim();
  if (trailing) {
    statements.push(trailing);
  }

  return statements;
}

/**
 * Runs every .sql file in a directory, in alphabetical order, against the
 * provided connection. Each top-level statement is executed individually
 * via splitSqlStatements() — never as multi-statement SQL (TiDB Cloud
 * rejects it). The migration/seed files are idempotent (CREATE TABLE IF
 * NOT EXISTS, INSERT IGNORE / ON DUPLICATE KEY UPDATE). Seed
 * 002_officer_verifications_permissions.sql contains a single DELETE that
 * cleans up role_permissions — it runs ONLY against the isolated test
 * database this connection is bound to (never secure_dms).
 */
async function runSqlDirectory(connection, dirPath) {
  if (!fs.existsSync(dirPath)) {
    return;
  }
  const files = fs
    .readdirSync(dirPath)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dirPath, file), "utf8");
    const statements = splitSqlStatements(sql);
    console.log("   running " + file + " (" + statements.length + " statements)");
    for (const statement of statements) {
      await connection.query(statement);
    }
    console.log("   applied " + file);
  }
}

/**
 * Creates the isolated test database if it does not exist (CREATE DATABASE
 * IF NOT EXISTS only — never drops anything), then applies all migrations
 * and seeds to it.
 *
 * @param {string} testDbName
 * @returns {Promise<void>}
 */
async function createAndMigrateTestDatabase(testDbName) {
  const { mainDbName } = resolveDatabaseNames();

  // 1. Connect to the MySQL server WITHOUT selecting a database. Only a
  //    single CREATE DATABASE IF NOT EXISTS is ever sent here.
  const configNoDb = buildConnectionConfig(undefined);
  delete configNoDb.database;
  const manager = await mysql.createConnection(configNoDb);

  try {
    await manager.query(
      "CREATE DATABASE IF NOT EXISTS `" +
        testDbName +
        "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
    );
    console.log("   ensured test database '" + testDbName + "' exists");
  } finally {
    await manager.end();
  }

  // 2. Apply migrations + seeds to the test database via a dedicated
  //    connection. Statements are executed INDIVIDUALLY (multi-statement
  //    SQL is disabled on TiDB Cloud, so it is never used here).
  const migrationConn = await mysql.createConnection(
    buildConnectionConfig(testDbName)
  );
  try {
    console.log("   applying migrations/seeds to '" + testDbName + "'...");
    await runSqlDirectory(migrationConn, MIGRATIONS_DIR);
    await runSqlDirectory(migrationConn, SEEDS_DIR);

    // Seed a single test user so audit_logs.user_id FK resolves.
    await migrationConn.query(
      "INSERT IGNORE INTO users " +
        "(username, email, password_hash, full_name, is_active) " +
        "VALUES ('__dms_test_admin__', '__dms_test_admin__@example.local', " +
        "'__test_placeholder_hash____do_not_use__', 'DMS Test Admin', 1)"
    );
  } finally {
    await migrationConn.end();
  }

  if (mainDbName) {
    console.log(
      "   NOTE: application database '" + mainDbName + "' was NOT modified (read-only)."
    );
  }
}

/**
 * Fetches the id of the well-known test user used by the audit tests.
 * @param {import("mysql2/promise").Pool} pool
 * @returns {Promise<number>}
 */
async function getTestUserId(pool) {
  const [rows] = await pool.query(
    "SELECT id FROM users WHERE username = '__dms_test_admin__' LIMIT 1"
  );
  if (!rows[0]) {
    throw new Error("Test user not found; did migrate seeds run?");
  }
  return rows[0].id;
}

/**
 * Returns a dedicated pool bound to the isolated test database.
 * @returns {Promise<{ pool: import("mysql2/promise").Pool, testDbName: string, mainDbName: string, userId: number }>}
 */
async function initDatabase() {
  const { mainDbName, testDbName } = resolveDatabaseNames();

  await createAndMigrateTestDatabase(testDbName);

  const pool = mysql.createPool({
    ...buildConnectionConfig(testDbName),
    waitForConnections: true,
    connectionLimit: 5,
    queueLimit: 0,
  });

  // Runtime sanity check: confirm the pool actually resolves to the test DB.
  const [[row]] = await pool.query("SELECT DATABASE() AS db");
  if (row.db !== testDbName) {
    throw new Error(
      "Isolation check failed: pool resolved to '" +
        row.db +
        "' but expected '" +
        testDbName +
        "'"
    );
  }

  const userId = await getTestUserId(pool);

  return { pool, testDbName, mainDbName, userId };
}

/**
 * Destructive cleanup for automated tests. ONLY safe because it (a) runs on
 * the dedicated test pool bound to the isolated test database, and (b)
 * re-verifies the active database at runtime and aborts if it is not the
 * test database. Order matters: children (blocks) are deleted before their
 * parents (audit_logs) to satisfy the FK constraint.
 *
 * @param {import("mysql2/promise").Pool} pool
 * @param {string} expectedTestDbName
 */
async function resetData(pool, expectedTestDbName) {
  const [[row]] = await pool.query("SELECT DATABASE() AS db");
  if (row.db !== expectedTestDbName) {
    throw new Error(
      "refusing destructive reset: active database '" +
        row.db +
        "' is not the isolated test database '" +
        expectedTestDbName +
        "'"
    );
  }
  await pool.query("DELETE FROM blockchain_audit_ledger");
  await pool.query("DELETE FROM audit_logs");
}

async function closePool(pool) {
  await pool.end();
}

module.exports = {
  initDatabase,
  resetData,
  closePool,
  resolveDatabaseNames,
  splitSqlStatements,
};