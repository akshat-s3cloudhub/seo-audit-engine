const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function getDbPromise() {
  try {
    console.log("🔌 Connecting to DB...");
    const client = await pool.connect();
    console.log("✅ Connected to Supabase");
    return client;
  } catch (err) {
    console.error("❌ DB ERROR:", err.message);
    throw err;
  }
}

// TEMP simple functions (so API works)
async function getAllSessions() {
  return [];
}

async function getLatestSession() {
  return null;
}

async function getSession() {
  return null;
}

async function getSessionStats() {
  return {};
}

async function getIssueSummary() {
  return {};
}

async function getPagesBySession() {
  return [];
}

async function getPageById() {
  return null;
}

module.exports = {
  getDbPromise,
  getAllSessions,
  getLatestSession,
  getSession,
  getSessionStats,
  getIssueSummary,
  getPagesBySession,
  getPageById
};