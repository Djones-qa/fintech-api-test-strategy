const jwt = require('jsonwebtoken');

/**
 * Generate a signed JWT for use in integration tests.
 * Avoids hitting the DB for every authenticated request.
 */
const generateToken = (overrides = {}) => {
  const payload = {
    sub: overrides.id ?? 'test-user-id',
    email: overrides.email ?? 'test@example.com',
    role: overrides.role ?? 'applicant',
  };

  return jwt.sign(payload, process.env.JWT_SECRET ?? 'test-secret', {
    expiresIn: '1h',
  });
};

/**
 * Returns an Authorization header value for supertest requests.
 */
const authHeader = (overrides = {}) => `Bearer ${generateToken(overrides)}`;

module.exports = { generateToken, authHeader };
