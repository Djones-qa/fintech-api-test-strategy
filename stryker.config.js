/**
 * Stryker mutation testing configuration.
 *
 * Targets the pure-logic modules — the decision engine and encryption utils —
 * because these are the highest-value mutation targets:
 *   - loanDecision.js: financial logic, boundary conditions, rate tiers
 *   - encryption.js: security-critical, every branch must be verified
 *
 * A mutation score < 80% means tests are not actually catching bugs.
 * PCI-DSS 6.3.2 — security-critical code must be rigorously tested.
 *
 * Run: npm run test:mutation
 */

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
module.exports = {
  packageManager: 'npm',
  reporters: ['html', 'clear-text', 'progress', 'json'],
  testRunner: 'jest',

  jest: {
    projectType: 'custom',
    configFile: 'package.json',
    enableFindRelatedTests: true,
  },

  // Only mutate the pure-logic files — not routes, middleware, or DB code
  mutate: [
    'src/utils/loanDecision.js',
    'src/utils/encryption.js',
  ],

  // Run only the unit tests (fast, no DB required)
  testMatch: [
    'tests/unit/**/*.test.js',
  ],

  // Thresholds — CI fails if mutation score drops below these
  thresholds: {
    high: 90,
    low: 80,
    break: 75, // Hard fail below 75%
  },

  // Ignore trivial mutants that don't affect behaviour
  ignoredMutations: [
    'StringLiteral', // Error message wording changes don't matter
  ],

  // Concurrency — use half available CPUs
  concurrency: 2,

  // Output
  htmlReporter: {
    fileName: 'reports/mutation/mutation-report.html',
  },

  jsonReporter: {
    fileName: 'reports/mutation/mutation-report.json',
  },

  // Timeout multiplier — encryption tests can be slow
  timeoutMS: 10000,
  timeoutFactor: 2,
};
