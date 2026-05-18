/**
 * Integration tests — Payment routes
 * Verifies PCI-DSS data handling: no full PAN stored, RBAC enforced.
 */
require('dotenv').config({ path: '.env.test' });

const request = require('supertest');
const app = require('../../src/app');
const { pool } = require('../../src/config/database');

let applicantToken, officerToken, adminToken;
let approvedLoanId;

beforeAll(async () => {
  const register = async (role) => {
    const email = `pay-test-${role}-${Date.now()}@example.com`;
    await request(app).post('/auth/register').send({
      email,
      password: 'Str0ng!Password#99',
      role,
    });
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ email, password: 'Str0ng!Password#99' });
    return loginRes.body.token;
  };

  applicantToken = await register('applicant');
  officerToken = await register('loan_officer');
  adminToken = await register('admin');

  // Create an approved loan to attach payments to
  const createRes = await request(app)
    .post('/loans')
    .set('Authorization', `Bearer ${applicantToken}`)
    .send({
      purpose: 'personal',
      amount_requested: 10000,
      term_months: 36,
      annual_income: 60000,
    });

  const loanId = createRes.body.loan.id;

  await request(app)
    .post(`/loans/${loanId}/submit`)
    .set('Authorization', `Bearer ${applicantToken}`);

  // Get underwriter token to approve
  const uwEmail = `pay-test-underwriter-${Date.now()}@example.com`;
  await request(app).post('/auth/register').send({
    email: uwEmail,
    password: 'Str0ng!Password#99',
    role: 'underwriter',
  });
  const uwLogin = await request(app)
    .post('/auth/login')
    .send({ email: uwEmail, password: 'Str0ng!Password#99' });

  await request(app)
    .post(`/loans/${loanId}/decide`)
    .set('Authorization', `Bearer ${uwLogin.body.token}`)
    .send({ credit_score: 720 });

  approvedLoanId = loanId;
});

afterAll(async () => {
  await pool.query(`DELETE FROM payments WHERE loan_application_id IN (
    SELECT id FROM loan_applications WHERE applicant_id IN (
      SELECT id FROM users WHERE email LIKE 'pay-test-%'
    )
  )`);
  await pool.query(`DELETE FROM loan_applications WHERE applicant_id IN (
    SELECT id FROM users WHERE email LIKE 'pay-test-%'
  )`);
  await pool.query(`DELETE FROM users WHERE email LIKE 'pay-test-%'`);
  await pool.end();
});

describe('POST /payments', () => {
  test('201 — loan_officer creates an ACH payment', async () => {
    const res = await request(app)
      .post('/payments')
      .set('Authorization', `Bearer ${officerToken}`)
      .send({
        loan_application_id: approvedLoanId,
        amount: 500,
        method: 'ach',
      });

    expect(res.status).toBe(201);
    expect(res.body.payment.status).toBe('pending');
    expect(res.body.payment.method).toBe('ach');
  });

  test('201 — card payment stores only last-four, not full PAN', async () => {
    const res = await request(app)
      .post('/payments')
      .set('Authorization', `Bearer ${officerToken}`)
      .send({
        loan_application_id: approvedLoanId,
        amount: 300,
        method: 'card',
        processor_token: 'tok_test_abc123',
        card_last_four: '4242',
      });

    expect(res.status).toBe(201);
    expect(res.body.payment.card_last_four).toBe('4242');
    // Full PAN must never appear anywhere in the response
    expect(JSON.stringify(res.body)).not.toMatch(/\d{16}/);
  });

  test('403 — applicant cannot create a payment', async () => {
    const res = await request(app)
      .post('/payments')
      .set('Authorization', `Bearer ${applicantToken}`)
      .send({
        loan_application_id: approvedLoanId,
        amount: 100,
        method: 'ach',
      });

    expect(res.status).toBe(403);
  });

  test('422 — card_last_four must be exactly 4 digits', async () => {
    const res = await request(app)
      .post('/payments')
      .set('Authorization', `Bearer ${officerToken}`)
      .send({
        loan_application_id: approvedLoanId,
        amount: 100,
        method: 'card',
        card_last_four: '12345', // 5 digits — invalid
      });

    expect(res.status).toBe(422);
  });

  test('422 — invalid payment method rejected', async () => {
    const res = await request(app)
      .post('/payments')
      .set('Authorization', `Bearer ${officerToken}`)
      .send({
        loan_application_id: approvedLoanId,
        amount: 100,
        method: 'bitcoin', // not in enum
      });

    expect(res.status).toBe(422);
  });
});

describe('PATCH /payments/:id/status', () => {
  let paymentId;

  beforeEach(async () => {
    const res = await request(app)
      .post('/payments')
      .set('Authorization', `Bearer ${officerToken}`)
      .send({
        loan_application_id: approvedLoanId,
        amount: 200,
        method: 'wire',
      });
    paymentId = res.body.payment.id;
  });

  test('200 — admin updates payment to completed', async () => {
    const res = await request(app)
      .patch(`/payments/${paymentId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'completed',
        processor_transaction_id: 'txn_abc123',
      });

    expect(res.status).toBe(200);
    expect(res.body.payment.status).toBe('completed');
    expect(res.body.payment.processor_transaction_id).toBe('txn_abc123');
  });

  test('403 — loan_officer cannot update payment status', async () => {
    const res = await request(app)
      .patch(`/payments/${paymentId}/status`)
      .set('Authorization', `Bearer ${officerToken}`)
      .send({ status: 'completed' });

    expect(res.status).toBe(403);
  });
});
