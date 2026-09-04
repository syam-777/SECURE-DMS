const mysql = require("mysql2/promise");
require("dotenv").config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function testDatabaseConnection() {
  let connection;
  try {
    connection = await pool.getConnection();
    console.log("✅ MySQL database connected successfully");
  } catch (error) {
    const message = "MySQL database connection failed";
    console.error(`❌ ${message}`);
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
