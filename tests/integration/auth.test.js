/**
 * Integration tests — Auth routes
 * Hits a real PostgreSQL test database (TEST_DATABASE_URL).
 * Each test suite wraps in a transaction that is rolled back.
 */
require('dotenv').config({ path: '.env.test' });

const request = require('supertest');
const app = require('../../src/app');
const { pool } = require('../../src/config/database');

// Clean up after all tests in this file
afterAll(async () => {
  // Remove test users created during registration tests
  await pool.query(`DELETE FROM users WHERE email LIKE 'inttest-%'`);
});

describe('POST /auth/register', () => {
  const validPayload = {
    email: `inttest-${Date.now()}@example.com`,
    password: 'Str0ng!Password#99',
    role: 'applicant',
  };

  test('201 — creates a new user', async () => {
    const res = await request(app).post('/auth/register').send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      email: validPayload.email,
      role: 'applicant',
    });
    expect(res.body.user.id).toBeDefined();
    // Password must never be returned
    expect(res.body.user.password_hash).toBeUndefined();
    expect(res.body.user.password).toBeUndefined();
  });

  test('409 — duplicate email', async () => {
    const email = `inttest-dup-${Date.now()}@example.com`;
    await request(app)
      .post('/auth/register')
      .send({ ...validPayload, email });

    const res = await request(app)
      .post('/auth/register')
      .send({ ...validPayload, email });

    expect(res.status).toBe(409);
  });

  test('422 — weak password rejected', async () => {
    const res = await request(app).post('/auth/register').send({
      email: `inttest-weak-${Date.now()}@example.com`,
      password: 'weak',
    });

    expect(res.status).toBe(422);
    expect(res.body.details).toBeDefined();
  });

  test('422 — invalid email rejected', async () => {
    const res = await request(app).post('/auth/register').send({
      email: 'not-an-email',
      password: 'Str0ng!Password#99',
    });

    expect(res.status).toBe(422);
  });
});

describe('POST /auth/login', () => {
  const email = `inttest-login-${Date.now()}@example.com`;
  const password = 'Str0ng!Password#99';

  beforeAll(async () => {
    await request(app).post('/auth/register').send({ email, password });
  });

  test('200 — returns JWT on valid credentials', async () => {
    const res = await request(app).post('/auth/login').send({ email, password });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(email);
  });

  test('401 — wrong password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email, password: 'WrongPassword!99' });

    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  test('401 — non-existent user', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'Whatever!99' });

    expect(res.status).toBe(401);
  });

  test('JWT contains expected claims', async () => {
    const res = await request(app).post('/auth/login').send({ email, password });
    const jwt = require('jsonwebtoken');
    const decoded = jwt.decode(res.body.token);

    expect(decoded.sub).toBeDefined();
    expect(decoded.role).toBe('applicant');
    expect(decoded.exp).toBeGreaterThan(Date.now() / 1000);
  });
});

describe('Authentication middleware', () => {
  test('401 — missing Authorization header', async () => {
    const res = await request(app).get('/loans');
    expect(res.status).toBe(401);
  });

  test('401 — malformed token', async () => {
    const res = await request(app)
      .get('/loans')
      .set('Authorization', 'Bearer not.a.valid.token');
    expect(res.status).toBe(401);
  });

  test('401 — expired token', async () => {
    const jwt = require('jsonwebtoken');
    const expiredToken = jwt.sign(
      { sub: 'fake-id', role: 'applicant' },
      process.env.JWT_SECRET ?? 'test-secret',
      { expiresIn: -1 }
    );

    const res = await request(app)
      .get('/loans')
      .set('Authorization', `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/expired/i);
  });
});
