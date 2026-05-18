const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { query } = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/auditLog');

const router = express.Router();
router.use(authenticate);
router.use(auditMiddleware);

// ─── Validation ───────────────────────────────────────────────────────────────

const createPaymentRules = [
  body('loan_application_id').isUUID(),
  body('amount').isFloat({ min: 0.01 }),
  body('method').isIn(['ach', 'wire', 'card', 'check']),
  // PCI-DSS: never accept full PAN — only processor token
  body('processor_token').optional().isString().isLength({ max: 255 }),
  body('card_last_four')
    .optional()
    .matches(/^\d{4}$/)
    .withMessage('card_last_four must be exactly 4 digits'),
];

// ─── POST /payments ───────────────────────────────────────────────────────────

router.post(
  '/',
  authorize('loan_officer', 'admin'),
  createPaymentRules,
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ error: 'Validation failed', details: errors.array() });
    }

    const { loan_application_id, amount, method, processor_token, card_last_four } = req.body;

    try {
      // Verify the loan is in approved/disbursed state
      const loanResult = await query(
        `SELECT id, status FROM loan_applications WHERE id = $1`,
        [loan_application_id]
      );

      if (loanResult.rows.length === 0) {
        return res.status(404).json({ error: 'Not Found', message: 'Loan application not found' });
      }

      const loan = loanResult.rows[0];
      if (!['approved', 'disbursed'].includes(loan.status)) {
        return res.status(422).json({
          error: 'Unprocessable Entity',
          message: 'Payments can only be created for approved or disbursed loans',
        });
      }

      const result = await query(
        `INSERT INTO payments
           (loan_application_id, amount, method, processor_token, card_last_four)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING id, loan_application_id, amount, currency, status, method,
                   card_last_four, processor_token, created_at`,
        [loan_application_id, amount, method, processor_token ?? null, card_last_four ?? null]
      );

      const payment = result.rows[0];

      await res.locals.audit({
        action: 'payment.create',
        resourceType: 'payment',
        resourceId: payment.id,
        // PCI-DSS: log method and last-four only, never full PAN or token value
        changes: { amount, method, card_last_four },
      });

      res.status(201).json({ payment });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /payments/:id ────────────────────────────────────────────────────────

router.get('/:id', param('id').isUUID(), async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ error: 'Validation failed', details: errors.array() });
  }

  try {
    const result = await query(
      `SELECT p.id, p.loan_application_id, p.amount, p.currency, p.status,
              p.method, p.card_last_four, p.processor_transaction_id,
              p.failure_reason, p.processed_at, p.created_at
       FROM payments p
       JOIN loan_applications la ON la.id = p.loan_application_id
       WHERE p.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not Found', message: 'Payment not found' });
    }

    const payment = result.rows[0];

    // Applicants can only view payments on their own loans
    if (req.user.role === 'applicant') {
      const loanCheck = await query(
        `SELECT applicant_id FROM loan_applications WHERE id = $1`,
        [payment.loan_application_id]
      );
      if (loanCheck.rows[0]?.applicant_id !== req.user.id) {
        return res.status(403).json({ error: 'Forbidden', message: 'Access denied' });
      }
    }

    res.json({ payment });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /payments/:id/status ───────────────────────────────────────────────
// Simulates a webhook callback from the payment processor

router.patch(
  '/:id/status',
  param('id').isUUID(),
  authorize('admin'),
  [
    body('status').isIn(['processing', 'completed', 'failed', 'refunded', 'chargeback']),
    body('processor_transaction_id').optional().isString(),
    body('failure_reason').optional().isString(),
  ],
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ error: 'Validation failed', details: errors.array() });
    }

    const { status, processor_transaction_id, failure_reason } = req.body;

    try {
      const result = await query(
        `UPDATE payments
         SET status = $1,
             processor_transaction_id = COALESCE($2, processor_transaction_id),
             failure_reason = $3,
             processed_at = CASE WHEN $1 IN ('completed','failed') THEN NOW() ELSE processed_at END,
             updated_at = NOW()
         WHERE id = $4
         RETURNING id, status, processor_transaction_id, failure_reason, processed_at`,
        [status, processor_transaction_id ?? null, failure_reason ?? null, req.params.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Not Found', message: 'Payment not found' });
      }

      await res.locals.audit({
        action: `payment.status.${status}`,
        resourceType: 'payment',
        resourceId: req.params.id,
        changes: { status, processor_transaction_id },
      });

      res.json({ payment: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
