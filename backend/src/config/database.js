const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT),

  ssl: process.env.DB_SSL === "true"
    ? {
        minVersion: "TLSv1.2",
      }
    : undefined,

  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,

  connectTimeout: 15000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

async function testDatabaseConnection() {
  let connection;

  try {
    connection = await pool.getConnection();
    console.log("✅ MySQL database connected successfully");
  } catch (error) {
    console.error("❌ MySQL database connection failed");
    console.error("Error code:", error.code);
    console.error("Error message:", error.message);
    console.error("Error errno:", error.errno);

    const message = "MySQL database connection failed";
    const err = new Error(message);
    err.name = "DatabaseConnectionError";
    throw err;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}
module.exports = {
  pool,
  testDatabaseConnection,
};
