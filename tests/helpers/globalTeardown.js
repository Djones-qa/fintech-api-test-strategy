/**
 * Jest global teardown — runs once after ALL test suites complete.
 * Closes the shared pg pool so Jest can exit cleanly without --forceExit.
 *
 * Registered via jest.globalTeardown in package.json.
 */
module.exports = async () => {
  const { pool } = require('../../src/config/database');
  await pool.end();
};
