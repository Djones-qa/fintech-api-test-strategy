const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { writeAuditLog } = require('../middleware/auditLog');
const logger = require('../config/logger');

const router = express.Router();

// ─── Validation rules ────────────────────────────────────────────────────────

const registerRules = [
  body('email').isEmail().normalizeEmail(),
  body('password')
    .isLength({ min: 12 })
    .withMessage('Password must be at least 12 characters')
    .matches(/[A-Z]/)
    .withMessage('Password must contain an uppercase letter')
    .matches(/[0-9]/)
    .withMessage('Password must contain a number')
    .matches(/[^A-Za-z0-9]/)
    .withMessage('Password must contain a special character'),
  body('role')
    .optional()
    .isIn(['applicant', 'loan_officer', 'underwriter', 'admin'])
    .withMessage('Invalid role'),
];

const loginRules = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
];

// ─── POST /auth/register ──────────────────────────────────────────────────────

router.post('/register', registerRules, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ error: 'Validation failed', details: errors.array() });
  }

  const { email, password, role = 'applicant' } = req.body;

  try {
    // PCI-DSS 8.2.1 — passwords hashed with bcrypt (cost factor 12)
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, $3)
       RETURNING id, email, role, created_at`,
      [email, passwordHash, role]
    );

    const user = result.rows[0];

    await writeAuditLog({
      actorId: user.id,
      actorRole: user.role,
      action: 'auth.register',
      resourceType: 'user',
      resourceId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json({ user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    next(err);
  }
});

// ─── POST /auth/login ─────────────────────────────────────────────────────────

router.post('/login', loginRules, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ error: 'Validation failed', details: errors.array() });
  }

  const { email, password } = req.body;

  try {
    const result = await query(
      `SELECT id, email, role, password_hash, is_active, failed_login_attempts, locked_until
       FROM users WHERE email = $1`,
      [email]
    );

    const user = result.rows[0];

    // PCI-DSS 8.1.6 — account lockout after 6 failed attempts
    if (user && user.locked_until && new Date(user.locked_until) > new Date()) {
      await writeAuditLog({
        actorId: user.id,
        actorRole: user.role,
        action: 'auth.login.locked',
        resourceType: 'user',
        resourceId: user.id,
        ipAddress: req.ip,
        success: false,
        errorMessage: 'Account locked',
      });
      return res.status(423).json({ error: 'Locked', message: 'Account temporarily locked' });
    }

    // Constant-time comparison even when user doesn't exist (prevents timing attacks)
    const dummyHash = '$2a$12$invalidhashfortimingprotection000000000000000000000000';
    const passwordMatch = await bcrypt.compare(password, user?.password_hash ?? dummyHash);

    if (!user || !passwordMatch || !user.is_active) {
      if (user) {
        const attempts = user.failed_login_attempts + 1;
        const lockUntil = attempts >= 6 ? new Date(Date.now() + 30 * 60 * 1000) : null;

        await query(
          `UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3`,
          [attempts, lockUntil, user.id]
        );

        await writeAuditLog({
          actorId: user.id,
          actorRole: user.role,
          action: 'auth.login.failed',
          resourceType: 'user',
          resourceId: user.id,
          ipAddress: req.ip,
          success: false,
          errorMessage: 'Invalid credentials',
        });
      }

      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials' });
    }

    // Reset failed attempts on success
    await query(
      `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW()
       WHERE id = $1`,
      [user.id]
    );

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
    );

    await writeAuditLog({
      actorId: user.id,
      actorRole: user.role,
      action: 'auth.login.success',
      resourceType: 'user',
      resourceId: user.id,
      ipAddress: req.ip,
    });

    logger.info('User logged in', { userId: user.id, role: user.role });

    res.json({
      token,
      user: { id: user.id, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
