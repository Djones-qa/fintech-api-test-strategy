/**
 * Jest config used exclusively by Stryker mutation testing.
 * Scopes test execution to unit tests only — no DB, no HTTP, fast feedback.
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
  testTimeout: 15000,
};
