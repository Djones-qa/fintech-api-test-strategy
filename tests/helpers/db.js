/**
 * Test database helpers.
 * Wraps each test in a transaction that is rolled back after the test,
 * keeping the DB clean without truncating tables between every test.
 */
const { getClient, pool } = require('../../src/config/database');

let client;

/**
 * Call in beforeAll — runs migrations against the test DB.
 * Assumes `npm run db:migrate` has already been run (done in CI setup step).
 */
const setupTestDb = async () => {
  // Verify connectivity
  await pool.query('SELECT 1');
};

/**
 * Call in afterAll — close the pool so Jest can exit cleanly.
 */
const teardownTestDb = async () => {
  await pool.end();
};

/**
 * Begin a transaction before each test.
 * The db module's `query` function is monkey-patched to use this client,
 * so all queries in the handler under test participate in the same transaction.
 */
const beginTransaction = async () => {
  client = await getClient();
  await client.query('BEGIN');
  return client;
};

/**
 * Roll back the transaction after each test.
 */
const rollbackTransaction = async () => {
  if (client) {
    await client.query('ROLLBACK');
    client.release();
    client = null;
  }
};

/**
 * Insert a test user and return the row.
 */
const createTestUser = async (dbClient, overrides = {}) => {
  const defaults = {
    email: `test-${Date.now()}@example.com`,
    password_hash: '$2a$12$testhashtesthashhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh',
    role: 'applicant',
  };
  const data = { ...defaults, ...overrides };

  const result = await dbClient.query(
    `INSERT INTO users (email, password_hash, role)
     VALUES ($1, $2, $3)
     RETURNING id, email, role, is_active`,
    [data.email, data.password_hash, data.role]
  );
  return result.rows[0];
};

/**
 * Insert a test loan application and return the row.
 */
const createTestLoan = async (dbClient, applicantId, overrides = {}) => {
  const defaults = {
    purpose: 'personal',
    amount_requested: 10000,
    term_months: 36,
    annual_income: 60000,
    status: 'draft',
  };
  const data = { ...defaults, ...overrides };

  const result = await dbClient.query(
    `INSERT INTO loan_applications
       (applicant_id, purpose, amount_requested, term_months, annual_income, status)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [applicantId, data.purpose, data.amount_requested, data.term_months, data.annual_income, data.status]
  );
  return result.rows[0];
};

module.exports = {
  setupTestDb,
  teardownTestDb,
  beginTransaction,
  rollbackTransaction,
  createTestUser,
  createTestLoan,
};
