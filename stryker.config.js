/**
 * Stryker v9 mutation testing configuration.
 *
 * Targets the pure-logic modules — the decision engine and encryption utils —
 * because these are the highest-value mutation targets:
 *   - loanDecision.js: financial logic, boundary conditions, rate tiers
 *   - encryption.js: security-critical, every branch must be verified
 *
 * A mutation score < 75% means tests are not actually catching bugs.
 * PCI-DSS 6.3.2 — security-critical code must be rigorously tested.
 *
 * Run: npm run test:mutation
 */

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
module.exports = {
  packageManager: 'npm',
  reporters: ['html', 'clear-text', 'progress'],
  testRunner: 'jest',

  // Stryker v9 jest runner config
  jest: {
    projectType: 'custom',
    configFile: 'package.json',
    enableFindRelatedTests: true,
    // Only run unit tests — fast, no DB required
    testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
  },

  // Only mutate the pure-logic files
  mutate: [
    'src/utils/loanDecision.js',
    'src/utils/encryption.js',
  ],

  // Thresholds — CI fails if mutation score drops below break value
  thresholds: {
    high: 90,
    low: 75,
    break: 70,
  },

  // Concurrency
  concurrency: 2,

  // Timeout
  timeoutMS: 10000,
  timeoutFactor: 2,
};
