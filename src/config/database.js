const { Pool } = require('pg');

/**
 * PostgreSQL connection pool.
 * Uses TEST_DATABASE_URL in test environment to keep test data isolated.
 */
const connectionString =
  process.env.NODE_ENV === 'test'
    ? process.env.TEST_DATABASE_URL
    : process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  max: process.env.NODE_ENV === 'test' ? 5 : 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  // Log but don't crash — the pool will reconnect
  console.error('Unexpected PostgreSQL pool error', err.message);
});

/**
 * Execute a parameterised query.
 * @param {string} text   SQL with $1, $2 … placeholders
 * @param {Array}  params Bound parameter values
 */
const query = (text, params) => pool.query(text, params);

/**
 * Acquire a client for multi-statement transactions.
 * Caller MUST call client.release() in a finally block.
 */
const getClient = () => pool.connect();

module.exports = { query, getClient, pool };
