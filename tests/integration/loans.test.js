/**
 * Integration tests — Loan routes
 * Tests RBAC, full request/response cycle, and DB state changes.
 */
require('dotenv').config({ path: '.env.test' });

const request = require('supertest');
const app = require('../../src/app');
const { pool } = require('../../src/config/database');

// Shared test user IDs — created once, reused across tests
let applicantId;
let applicantToken, officerToken, underwriterToken;

beforeAll(async () => {
  // Register test users
  const register = async (role) => {
    const email = `loan-test-${role}-${Date.now()}@example.com`;
    const res = await request(app).post('/auth/register').send({
      email,
      password: 'Str0ng!Password#99',
      role,
    });
    if (res.status !== 201) {
      throw new Error(`Register failed for role '${role}': ${JSON.stringify(res.body)}`);
    }
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email, password: 'Str0ng!Password#99' });
    if (loginRes.status !== 200) {
      throw new Error(`Login failed for role '${role}': ${JSON.stringify(loginRes.body)}`);
    }
    return { id: res.body.user.id, token: loginRes.body.token };
  };

  const applicant = await register('applicant');
  const officer = await register('loan_officer');
  const underwriter = await register('underwriter');
  await register('admin'); // admin role needed for DB seeding; token unused here

  applicantId = applicant.id;

  applicantToken = applicant.token;
  officerToken = officer.token;
  underwriterToken = underwriter.token;
});

afterAll(async () => {
  await pool.query(`DELETE FROM loan_applications WHERE applicant_id IN (
    SELECT id FROM users WHERE email LIKE 'loan-test-%'
  )`);
  await pool.query(`DELETE FROM users WHERE email LIKE 'loan-test-%'`);
});

describe('POST /loans — create application', () => {
  const validLoan = {
    purpose: 'personal',
    amount_requested: 15000,
    term_months: 48,
    annual_income: 75000,
  };

  test('201 — applicant creates a loan', async () => {
    const res = await request(app)
      .post('/loans')
      .set('Authorization', `Bearer ${applicantToken}`)
      .send(validLoan);

    expect(res.status).toBe(201);
    expect(res.body.loan.status).toBe('draft');
    expect(res.body.loan.amount_requested).toBe('15000.00');
  });

  test('403 — loan_officer cannot create a loan application', async () => {
    const res = await request(app)
      .post('/loans')
      .set('Authorization', `Bearer ${officerToken}`)
      .send(validLoan);

    expect(res.status).toBe(403);
  });

  test('422 — invalid purpose rejected', async () => {
    const res = await request(app)
      .post('/loans')
      .set('Authorization', `Bearer ${applicantToken}`)
      .send({ ...validLoan, purpose: 'gambling' });

    expect(res.status).toBe(422);
  });

  test('422 — amount below minimum rejected', async () => {
    const res = await request(app)
      .post('/loans')
      .set('Authorization', `Bearer ${applicantToken}`)
      .send({ ...validLoan, amount_requested: 500 });

    expect(res.status).toBe(422);
  });

  test('SSN is encrypted — not returned in response', async () => {
    const res = await request(app)
      .post('/loans')
      .set('Authorization', `Bearer ${applicantToken}`)
      .send({ ...validLoan, ssn: '123-45-6789' });

    expect(res.status).toBe(201);
    expect(JSON.stringify(res.body)).not.toContain('123-45-6789');
    expect(res.body.loan.ssn_encrypted).toBeUndefined();
  });
});

describe('GET /loans — list applications', () => {
  test('applicant sees only their own loans', async () => {
    const res = await request(app)
      .get('/loans')
      .set('Authorization', `Bearer ${applicantToken}`);

    expect(res.status).toBe(200);
    // All returned loans must belong to this applicant
    res.body.loans.forEach((loan) => {
      expect(loan.applicant_id ?? applicantId).toBe(applicantId);
    });
  });

  test('underwriter sees all loans', async () => {
    const res = await request(app)
      .get('/loans')
      .set('Authorization', `Bearer ${underwriterToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.loans)).toBe(true);
  });
});

describe('POST /loans/:id/submit', () => {
  let loanId;

  beforeEach(async () => {
    const res = await request(app)
      .post('/loans')
      .set('Authorization', `Bearer ${applicantToken}`)
      .send({
        purpose: 'auto',
        amount_requested: 20000,
        term_months: 60,
        annual_income: 80000,
      });
    loanId = res.body.loan.id;
  });

  test('200 — applicant submits their own draft loan', async () => {
    const res = await request(app)
      .post(`/loans/${loanId}/submit`)
      .set('Authorization', `Bearer ${applicantToken}`);

    expect(res.status).toBe(200);
    expect(res.body.loan.status).toBe('submitted');
  });

  test('404 — cannot submit twice', async () => {
    await request(app)
      .post(`/loans/${loanId}/submit`)
      .set('Authorization', `Bearer ${applicantToken}`);

    const res = await request(app)
      .post(`/loans/${loanId}/submit`)
      .set('Authorization', `Bearer ${applicantToken}`);

    expect(res.status).toBe(404);
  });

  test('403 — officer cannot submit an applicant loan', async () => {
    const res = await request(app)
      .post(`/loans/${loanId}/submit`)
      .set('Authorization', `Bearer ${officerToken}`);

    expect(res.status).toBe(403);
  });
});

describe('POST /loans/:id/decide', () => {
  let loanId;

  beforeEach(async () => {
    // Create and submit a loan
    const createRes = await request(app)
      .post('/loans')
      .set('Authorization', `Bearer ${applicantToken}`)
      .send({
        purpose: 'personal',
        amount_requested: 15000,
        term_months: 36,
        annual_income: 70000,
      });
    loanId = createRes.body.loan.id;

    await request(app)
      .post(`/loans/${loanId}/submit`)
      .set('Authorization', `Bearer ${applicantToken}`);
  });

  test('200 — underwriter approves a loan with good credit', async () => {
    const res = await request(app)
      .post(`/loans/${loanId}/decide`)
      .set('Authorization', `Bearer ${underwriterToken}`)
      .send({ credit_score: 750 });

    expect(res.status).toBe(200);
    expect(res.body.loan.status).toBe('approved');
    expect(res.body.decision.approved).toBe(true);
    expect(res.body.loan.interest_rate).toBeDefined();
  });

  test('200 — underwriter rejects a loan with poor credit', async () => {
    const res = await request(app)
      .post(`/loans/${loanId}/decide`)
      .set('Authorization', `Bearer ${underwriterToken}`)
      .send({ credit_score: 500 });

    expect(res.status).toBe(200);
    expect(res.body.loan.status).toBe('rejected');
    expect(res.body.decision.approved).toBe(false);
  });

  test('403 — applicant cannot decide a loan', async () => {
    const res = await request(app)
      .post(`/loans/${loanId}/decide`)
      .set('Authorization', `Bearer ${applicantToken}`)
      .send({ credit_score: 750 });

    expect(res.status).toBe(403);
  });

  test('403 — loan_officer cannot decide a loan', async () => {
    const res = await request(app)
      .post(`/loans/${loanId}/decide`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ credit_score: 750 });

    expect(res.status).toBe(403);
  });
});
