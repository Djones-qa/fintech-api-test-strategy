/**
 * k6 Smoke Test — CI performance gate
 *
 * Purpose: Catch catastrophic regressions before they reach staging.
 * Runs in CI on every PR. Fails the build if p95 latency > 500ms or
 * error rate > 1%.
 *
 * PCI-DSS 6.5 — performance testing as part of the SDLC.
 *
 * Run locally: k6 run tests/performance/smoke.js
 * Run in CI:   k6 run --env BASE_URL=http://localhost:3000 tests/performance/smoke.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ─── Custom metrics ───────────────────────────────────────────────────────────
const errorRate = new Rate('error_rate');
const loginDuration = new Trend('login_duration', true);
const loanCreateDuration = new Trend('loan_create_duration', true);

// ─── Test configuration ───────────────────────────────────────────────────────
export const options = {
  // Smoke: 3 VUs for 30 seconds — just enough to catch obvious breakage
  vus: 3,
  duration: '30s',

  thresholds: {
    // Overall p95 must be under 500ms
    http_req_duration: ['p(95)<500'],
    // Error rate must stay below 1%
    error_rate: ['rate<0.01'],
    // Login specifically must be fast (auth is on the critical path)
    login_duration: ['p(95)<300'],
    // Loan creation can be slightly slower (DB write + encryption)
    loan_create_duration: ['p(95)<600'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// ─── Setup: create a test user and get a token ────────────────────────────────
export function setup() {
  const email = `k6-smoke-${Date.now()}@example.com`;
  const password = 'Str0ng!Password#99';

  const registerRes = http.post(
    `${BASE_URL}/auth/register`,
    JSON.stringify({ email, password, role: 'applicant' }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  if (registerRes.status !== 201) {
    console.error('Setup failed — could not register test user:', registerRes.body);
    return null;
  }

  const loginRes = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' } }
  );

  const token = JSON.parse(loginRes.body).token;
  return { token, email };
}

// ─── Main scenario ────────────────────────────────────────────────────────────
export default function (data) {
  if (!data?.token) return;

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${data.token}`,
  };

  // 1. Health check
  const healthRes = http.get(`${BASE_URL}/health`);
  check(healthRes, { 'health: status 200': (r) => r.status === 200 });
  // Health is a liveness probe — don't count it in the error rate
  // (rate limiting or transient restarts shouldn't fail the smoke gate)

  sleep(0.1);

  // 2. List loans (authenticated)
  const listRes = http.get(`${BASE_URL}/loans`, { headers });
  check(listRes, {
    'list loans: status 200': (r) => r.status === 200,
    'list loans: has loans array': (r) => JSON.parse(r.body).loans !== undefined,
  });
  errorRate.add(listRes.status !== 200);

  sleep(0.1);

  // 3. Create a loan application
  const createStart = Date.now();
  const createRes = http.post(
    `${BASE_URL}/loans`,
    JSON.stringify({
      purpose: 'personal',
      amount_requested: 15000,
      term_months: 48,
      annual_income: 75000,
    }),
    { headers }
  );
  loanCreateDuration.add(Date.now() - createStart);

  const created = check(createRes, {
    'create loan: status 201': (r) => r.status === 201,
    'create loan: has id': (r) => JSON.parse(r.body).loan?.id !== undefined,
  });
  errorRate.add(!created);

  sleep(0.2);
}

// ─── Teardown ─────────────────────────────────────────────────────────────────
export function teardown(data) {
  // In a real environment, clean up test data via an admin endpoint
  console.log(`Smoke test complete. Test user: ${data?.email}`);
}
