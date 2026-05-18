/**
 * k6 Load Test — full loan lifecycle under realistic concurrency
 *
 * Simulates the peak load scenario: 50 concurrent users over 5 minutes,
 * ramping up and down. Used for pre-release validation, not CI.
 *
 * Run: k6 run --env BASE_URL=http://localhost:3000 tests/performance/load.js
 */
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

const errorRate = new Rate('error_rate');
const authLatency = new Trend('auth_latency', true);
const loanLatency = new Trend('loan_latency', true);
const paymentLatency = new Trend('payment_latency', true);
const loansCreated = new Counter('loans_created');

export const options = {
  stages: [
    { duration: '1m', target: 10 },   // Ramp up
    { duration: '3m', target: 50 },   // Sustained load
    { duration: '1m', target: 0 },    // Ramp down
  ],

  thresholds: {
    http_req_duration: ['p(95)<1000', 'p(99)<2000'],
    error_rate: ['rate<0.02'],         // Max 2% errors under load
    auth_latency: ['p(95)<400'],
    loan_latency: ['p(95)<800'],
    payment_latency: ['p(95)<600'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export function setup() {
  // Pre-create an officer and underwriter for the loan lifecycle
  const createUser = (role) => {
    const email = `k6-load-${role}-${Date.now()}@example.com`;
    const password = 'Str0ng!Password#99';
    http.post(
      `${BASE_URL}/auth/register`,
      JSON.stringify({ email, password, role }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    const res = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({ email, password }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    return JSON.parse(res.body).token;
  };

  return {
    officerToken: createUser('loan_officer'),
    underwriterToken: createUser('underwriter'),
    adminToken: createUser('admin'),
  };
}

export default function (data) {
  const email = `k6-vu-${__VU}-${__ITER}@example.com`;
  const password = 'Str0ng!Password#99';

  group('Auth flow', () => {
    // Register
    const regRes = http.post(
      `${BASE_URL}/auth/register`,
      JSON.stringify({ email, password, role: 'applicant' }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    check(regRes, { 'register: 201': (r) => r.status === 201 });
    errorRate.add(regRes.status !== 201);

    // Login
    const start = Date.now();
    const loginRes = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({ email, password }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    authLatency.add(Date.now() - start);

    const loginOk = check(loginRes, { 'login: 200': (r) => r.status === 200 });
    errorRate.add(!loginOk);

    if (!loginOk) return;

    const token = JSON.parse(loginRes.body).token;
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    sleep(0.5);

    group('Loan lifecycle', () => {
      // Create loan
      const loanStart = Date.now();
      const createRes = http.post(
        `${BASE_URL}/loans`,
        JSON.stringify({
          purpose: 'auto',
          amount_requested: 25000,
          term_months: 60,
          annual_income: 90000,
        }),
        { headers }
      );
      loanLatency.add(Date.now() - loanStart);

      const loanOk = check(createRes, { 'create loan: 201': (r) => r.status === 201 });
      errorRate.add(!loanOk);
      if (!loanOk) return;

      loansCreated.add(1);
      const loanId = JSON.parse(createRes.body).loan.id;

      sleep(0.3);

      // Submit loan
      const submitRes = http.post(`${BASE_URL}/loans/${loanId}/submit`, null, { headers });
      check(submitRes, { 'submit loan: 200': (r) => r.status === 200 });
      errorRate.add(submitRes.status !== 200);
    });
  });

  sleep(1);
}
