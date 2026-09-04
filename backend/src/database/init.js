const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config();

/**
 * Secure DMS — Database Initializer
 *
 * Creates the database (if it does not exist), then runs every
 * .sql file in src/database/migrations/ and src/database/seeds/
 * in alphabetical order.
 *
 * Usage:  npm run db:init   (from backend/)
 * Safe:   Uses CREATE TABLE IF NOT EXISTS and idempotent seeds.
 *         Will never drop existing data.
 */

async function initializeDatabase() {
  let connection;

  try {
    // ------------------------------------------------------------------
    // 1. Connect to MySQL server (without selecting a database)
    // ------------------------------------------------------------------
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
      multipleStatements: true,
    });
    console.log("✅ Connected to MySQL server");

    // ------------------------------------------------------------------
    // 2. Create the database if it does not exist
    // ------------------------------------------------------------------
    const dbName = process.env.DB_NAME;
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    console.log(`✅ Database '${dbName}' is ready`);

    await connection.query(`USE \`${dbName}\``);

    // ------------------------------------------------------------------
    // 3. Run migration files (migrations/)
    // ------------------------------------------------------------------
    const migrationsDir = path.join(__dirname, "migrations");
    if (fs.existsSync(migrationsDir)) {
      const files = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();

      for (const file of files) {
        const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
        console.log(`📄 Running migration: ${file}`);
        await connection.query(sql);
        console.log(`   ✔ Migration complete: ${file}`);
      }
    } else {
      console.log("ℹ  No migrations directory found — skipping.");
    }

    // ------------------------------------------------------------------
    // 4. Run seed files (seeds/) — populates roles & permissions, which
    //    are needed by the users-table reconciliation that follows.
    // ------------------------------------------------------------------
    const seedsDir = path.join(__dirname, "seeds");
    if (fs.existsSync(seedsDir)) {
      const files = fs
        .readdirSync(seedsDir)
        .filter((f) => f.endsWith(".sql"))
        .sort();

      for (const file of files) {
        const sql = fs.readFileSync(path.join(seedsDir, file), "utf8");
        console.log(`🌱 Running seed: ${file}`);
        await connection.query(sql);
        console.log(`   ✔ Seed complete: ${file}`);
      }
    } else {
      console.log("ℹ  No seeds directory found — skipping.");
    }

    // ------------------------------------------------------------------
    // 5. Reconcile an existing (legacy) users table with RBAC.
    //    This is idempotent: it only adds the role_id column + FK when
    //    the column is missing, and backfills a role for any rows that
    //    do not have one yet. On a fresh install the column already
    //    exists (created by the DDL), so this is a no-op.
    // ------------------------------------------------------------------
    console.log("🛠  Verifying users table RBAC compatibility...");
    const usersCols = await connection.query(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS " +
        "WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'",
      [dbName]
    );
    const userColumnNames = usersCols[0].map((r) => r.COLUMN_NAME);

    if (!userColumnNames.includes("role_id")) {
      console.log("   ➕ Adding role_id column to existing users table");
      await connection.query(
        "ALTER TABLE users ADD COLUMN role_id INT UNSIGNED NULL AFTER full_name"
      );
    }

    try {
      await connection.query(
        "ALTER TABLE users ADD CONSTRAINT fk_users_role " +
          "FOREIGN KEY (role_id) REFERENCES roles(id) " +
          "ON DELETE RESTRICT ON UPDATE CASCADE"
      );
      console.log("   ✔ Added fk_users_role foreign key");
    } catch (err) {
      // On a fresh install the FK was already created by the DDL, so this
      // re-add is idempotent and ignored.
      const alreadyExists =
        err.code === "ER_DUP_KEYNAME" ||
        err.code === "ER_FK_DUP_NAME" ||
        /Duplicate foreign key/.test(err.message) ||
        /already exists/.test(err.message);
      if (!alreadyExists) {
        throw err;
      }
      console.log("   ℹ  users.role_id FK already present — skipping");
    }

    // Backfill role_id for any users that have a legacy role ENUM value
    // but no role_id yet.
    const [[unlinked]] = await connection.query(
      "SELECT COUNT(*) AS cnt FROM users WHERE role_id IS NULL"
    );
    if (unlinked.cnt > 0) {
      console.log(`   🔗 Backfilling role_id for ${unlinked.cnt} legacy user(s)`);
      await connection.query(
        "UPDATE users u " +
          "LEFT JOIN roles r ON r.name = UPPER(u.role) " +
          "SET u.role_id = r.id " +
          "WHERE u.role_id IS NULL AND r.id IS NOT NULL"
      );
      // For any remaining unlinked users (unrecognized role), assign USER role.
      await connection.query(
        "UPDATE users u " +
          "LEFT JOIN roles r ON r.name = 'USER' " +
          "SET u.role_id = r.id " +
          "WHERE u.role_id IS NULL AND r.id IS NOT NULL"
      );
    }

    // ------------------------------------------------------------------
    // 6. Verify — list all tables in the database
    // ------------------------------------------------------------------
    const [rows] = await connection.query("SHOW TABLES");
    const tableNames = rows.map((r) => Object.values(r)[0]);

    console.log("\n========== Verification ==========");
    console.log(`Tables in '${dbName}':`);
    for (const name of tableNames) {
      console.log(`   • ${name}`);
    }

    const expected = [
      "roles",
      "permissions",
      "role_permissions",
      "users",
      "cases",
      "case_assignments",
      "documents",
      "document_versions",
      "audit_logs",
    ];
    const missing = expected.filter((t) => !tableNames.includes(t));
    if (missing.length > 0) {
      console.error(`\n❌ Missing tables: ${missing.join(", ")}`);
      process.exit(1);
    }

    // ------------------------------------------------------------------
    // 7. Count seeded data
    // ------------------------------------------------------------------
    const [[roleCount]] = await connection.query(
      "SELECT COUNT(*) AS cnt FROM roles"
    );
    const [[permCount]] = await connection.query(
      "SELECT COUNT(*) AS cnt FROM permissions"
    );
    const [[rpCount]] = await connection.query(
      "SELECT COUNT(*) AS cnt FROM role_permissions"
    );

    console.log(`\nRoles:          ${roleCount.cnt}`);
    console.log(`Permissions:    ${permCount.cnt}`);
    console.log(`Role-Perm Map:  ${rpCount.cnt}`);
    console.log("===================================\n");

    console.log("🎉 Database initialization complete!");
  } catch (error) {
    console.error("\n❌ Database initialization failed:", error.message);
    if (error.code) {
      console.error(`   Error code: ${error.code}`);
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

initializeDatabase();
