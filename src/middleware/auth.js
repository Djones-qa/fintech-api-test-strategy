const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

/**
 * Verifies the Bearer JWT and attaches `req.user` to the request.
 * PCI-DSS 8.3 — all API access requires authentication.
 */
const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or malformed Authorization header',
    });
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Confirm the user still exists and is active (handles revocation via DB)
    const result = await query(
      'SELECT id, email, role, is_active FROM users WHERE id = $1',
      [payload.sub]
    );

    if (result.rows.length === 0 || !result.rows[0].is_active) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User account not found or deactivated',
      });
    }

    req.user = result.rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Unauthorized', message: 'Token expired' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid token' });
    }
    next(err);
  }
};

/**
 * Role-Based Access Control middleware factory.
 * Usage: authorize('loan_officer', 'underwriter', 'admin')
 *
 * PCI-DSS 7.1 — access limited to least privilege required.
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Not authenticated' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Role '${req.user.role}' is not permitted to perform this action`,
      });
    }

    next();
  };
};

module.exports = { authenticate, authorize };
