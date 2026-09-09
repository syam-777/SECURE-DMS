require("dotenv").config();

const app = require("./app");
const { testDatabaseConnection } = require("./config/database");

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await testDatabaseConnection();
  } catch (error) {
    console.error("❌ Unable to start server:", error.message);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}

startServer();
