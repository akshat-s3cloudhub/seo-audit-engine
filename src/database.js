const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle database client', err);
});

async function getDbPromise() {
  try {
    console.log("🔌 Connecting to DB...");
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is perfectly empty or undefined! Please check your Vercel settings or local .env file.");
    }
    const client = await pool.connect();
    console.log("✅ Connected to Supabase PostgreSQL");
    client.release();
    return pool;
  } catch (err) {
    console.error("❌ DB ERROR during connect:", err.message);
    throw err;
  }
}

async function getAllSessions() {
  try {
    // Replace with actual DB query in the future:
    // const { rows } = await pool.query('SELECT * FROM sessions ORDER BY created_at DESC');
    // return rows;
    return [];
  } catch (err) {
    console.error('Error fetching all sessions:', err.message);
    return [];
  }
}

async function getLatestSession() {
  try {
    // const { rows } = await pool.query('SELECT * FROM sessions ORDER BY created_at DESC LIMIT 1');
    // return rows[0] || null;
    return null;
  } catch (err) {
    console.error('Error fetching latest session:', err.message);
    return null;
  }
}

async function getSession(sessionId) {
  try {
    // const { rows } = await pool.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
    // return rows[0] || null;
    return null;
  } catch (err) {
    console.error(`Error fetching session ${sessionId}:`, err.message);
    return null;
  }
}

async function getSessionStats(sessionId) {
  try {
    // const { rows } = await pool.query('SELECT * FROM session_stats WHERE session_id = $1', [sessionId]);
    // return rows[0] || {};
    return {};
  } catch (err) {
    console.error(`Error fetching stats for session ${sessionId}:`, err.message);
    return {};
  }
}

async function getIssueSummary(sessionId) {
  try {
    // const { rows } = await pool.query('SELECT * FROM issues WHERE session_id = $1', [sessionId]);
    // return rows;
    return [];
  } catch (err) {
    console.error(`Error fetching issue summary for session ${sessionId}:`, err.message);
    return [];
  }
}

async function getPagesBySession(sessionId, filters = {}) {
  try {
    // const { rows } = await pool.query('SELECT * FROM pages WHERE session_id = $1', [sessionId]);
    // return rows;
    return [];
  } catch (err) {
    console.error(`Error fetching pages for session ${sessionId}:`, err.message);
    return [];
  }
}

async function getPageById(pageId) {
  try {
    // const { rows } = await pool.query('SELECT * FROM pages WHERE id = $1', [pageId]);
    // return rows[0] || null;
    return null;
  } catch (err) {
    console.error(`Error fetching page ${pageId}:`, err.message);
    return null;
  }
}

module.exports = {
  pool,
  getDbPromise,
  getAllSessions,
  getLatestSession,
  getSession,
  getSessionStats,
  getIssueSummary,
  getPagesBySession,
  getPageById
};