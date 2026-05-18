const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/auditLog');
const { encrypt } = require('../utils/encryption');
const { decideLoan } = require('../utils/loanDecision');

const router = express.Router();
router.use(authenticate);
router.use(auditMiddleware);

// ─── Validation ───────────────────────────────────────────────────────────────

const createLoanRules = [
  body('purpose')
    .isIn(['personal', 'auto', 'home_improvement', 'debt_consolidation', 'business', 'education']),
  body('amount_requested').isFloat({ min: 1000, max: 500000 }),
  body('term_months').isInt({ min: 6, max: 360 }),
  body('annual_income').isFloat({ min: 1 }),
  body('ssn').optional().matches(/^\d{3}-\d{2}-\d{4}$/),
];

// ─── GET /loans ───────────────────────────────────────────────────────────────

router.get('/', async (req, res, next) => {
  try {
    let sql;
    let params;

    if (req.user.role === 'applicant') {
      // Applicants see only their own applications
      sql = `SELECT id, status, purpose, amount_requested, amount_approved,
                    interest_rate, term_months, submitted_at, decided_at, created_at
             FROM loan_applications
             WHERE applicant_id = $1
             ORDER BY created_at DESC`;
      params = [req.user.id];
    } else {
      // Officers, underwriters, admins see all
      sql = `SELECT la.id, la.status, la.purpose, la.amount_requested, la.amount_approved,
                    la.interest_rate, la.term_months, la.submitted_at, la.decided_at,
                    la.created_at, u.email AS applicant_email
             FROM loan_applications la
             JOIN users u ON u.id = la.applicant_id
             ORDER BY la.created_at DESC`;
      params = [];
    }

    const result = await query(sql, params);
    res.json({ loans: result.rows });
  } catch (err) {
    next(err);
  }
});

// ─── POST /loans ──────────────────────────────────────────────────────────────

router.post('/', authorize('applicant'), createLoanRules, async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ error: 'Validation failed', details: errors.array() });
  }

  const { purpose, amount_requested, term_months, annual_income, ssn } = req.body;

  try {
    // PCI-DSS 3.4 — encrypt SSN before storage
    const ssnEncrypted = ssn ? encrypt(ssn) : null;

    const result = await query(
      `INSERT INTO loan_applications
         (applicant_id, purpose, amount_requested, term_months, annual_income, ssn_encrypted)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, status, purpose, amount_requested, term_months, annual_income, created_at`,
      [req.user.id, purpose, amount_requested, term_months, annual_income, ssnEncrypted]
    );

    const loan = result.rows[0];

    await res.locals.audit({
      action: 'loan.create',
      resourceType: 'loan_application',
      resourceId: loan.id,
      changes: { purpose, amount_requested, term_months },
    });

    res.status(201).json({ loan });
  } catch (err) {
    next(err);
  }
});

// ─── GET /loans/:id ───────────────────────────────────────────────────────────

router.get('/:id', param('id').isUUID(), async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ error: 'Validation failed', details: errors.array() });
  }

  try {
    const result = await query(
      `SELECT la.*, u.email AS applicant_email
       FROM loan_applications la
       JOIN users u ON u.id = la.applicant_id
       WHERE la.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Loan application not found' });
    }

    const loan = result.rows[0];

    // Applicants can only view their own loans
    if (req.user.role === 'applicant' && loan.applicant_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
    }

    // Never return encrypted SSN in API response
    delete loan.ssn_encrypted;

    res.json({ loan });
  } catch (err) {
    next(err);
  }
});

// ─── POST /loans/:id/submit ───────────────────────────────────────────────────

router.post('/:id/submit', param('id').isUUID(), authorize('applicant'), async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ error: 'Validation failed', details: errors.array() });
  }

  try {
    const result = await query(
      `UPDATE loan_applications
       SET status = 'submitted', submitted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND applicant_id = $2 AND status = 'draft'
       RETURNING id, status, submitted_at`,
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Loan not found, not owned by you, or not in draft status',
      });
    }

    await res.locals.audit({
      action: 'loan.submit',
      resourceType: 'loan_application',
      resourceId: req.params.id,
    });

    res.json({ loan: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ─── POST /loans/:id/decide ───────────────────────────────────────────────────
// Underwriters and admins run the automated decision engine

router.post(
  '/:id/decide',
  param('id').isUUID(),
  authorize('underwriter', 'admin'),
  [body('credit_score').isInt({ min: 300, max: 850 }), body('existing_debt').optional().isFloat({ min: 0 })],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ error: 'Validation failed', details: errors.array() });
    }

    try {
      const loanResult = await query(
        `SELECT * FROM loan_applications WHERE id = $1 AND status = 'submitted'`,
        [req.params.id]
      );

      if (loanResult.rows.length === 0) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Loan not found or not in submitted status',
        });
      }

      const loan = loanResult.rows[0];
      const { credit_score, existing_debt = 0 } = req.body;

      const decision = decideLoan({
        creditScore: credit_score,
        annualIncome: parseFloat(loan.annual_income),
        amountRequested: parseFloat(loan.amount_requested),
        termMonths: loan.term_months,
        existingDebt: existing_debt,
      });

      const newStatus = decision.approved ? 'approved' : 'rejected';

      const updated = await query(
        `UPDATE loan_applications
         SET status = $1,
             credit_score = $2,
             amount_approved = $3,
             interest_rate = $4,
             rejection_reason = $5,
             assigned_officer_id = $6,
             decided_at = NOW(),
             updated_at = NOW()
         WHERE id = $7
         RETURNING id, status, amount_approved, interest_rate, rejection_reason, decided_at`,
        [
          newStatus,
          credit_score,
          decision.approved ? loan.amount_requested : null,
          decision.rate,
          decision.reason,
          req.user.id,
          req.params.id,
        ]
      );

      await res.locals.audit({
        action: `loan.${newStatus}`,
        resourceType: 'loan_application',
        resourceId: req.params.id,
        changes: { newStatus, credit_score, decision },
      });

      res.json({ loan: updated.rows[0], decision });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
