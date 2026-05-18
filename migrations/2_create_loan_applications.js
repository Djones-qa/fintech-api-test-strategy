/**
 * Migration: create loan_applications table
 * PCI-DSS 3.4 — sensitive financial data stored with field-level encryption markers
 */
exports.up = (pgm) => {
  pgm.createType('loan_status', [
    'draft',
    'submitted',
    'under_review',
    'approved',
    'rejected',
    'disbursed',
    'closed',
  ]);

  pgm.createType('loan_purpose', [
    'personal',
    'auto',
    'home_improvement',
    'debt_consolidation',
    'business',
    'education',
  ]);

  pgm.createTable('loan_applications', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    applicant_id: {
      type: 'uuid',
      notNull: true,
      references: '"users"',
      onDelete: 'RESTRICT',
    },
    assigned_officer_id: {
      type: 'uuid',
      references: '"users"',
      default: null,
    },
    status: {
      type: 'loan_status',
      notNull: true,
      default: 'draft',
    },
    purpose: {
      type: 'loan_purpose',
      notNull: true,
    },
    amount_requested: {
      type: 'numeric(12,2)',
      notNull: true,
    },
    amount_approved: {
      type: 'numeric(12,2)',
      default: null,
    },
    interest_rate: {
      type: 'numeric(5,4)',
      default: null,
    },
    term_months: {
      type: 'integer',
      notNull: true,
    },
    annual_income: {
      type: 'numeric(12,2)',
      notNull: true,
    },
    credit_score: {
      type: 'integer',
      default: null,
    },
    // PCI-DSS: SSN stored encrypted (application-level AES-256)
    ssn_encrypted: {
      type: 'text',
      default: null,
    },
    rejection_reason: {
      type: 'text',
      default: null,
    },
    submitted_at: {
      type: 'timestamptz',
      default: null,
    },
    decided_at: {
      type: 'timestamptz',
      default: null,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('loan_applications', 'applicant_id');
  pgm.createIndex('loan_applications', 'status');
  pgm.createIndex('loan_applications', 'assigned_officer_id');
};

exports.down = (pgm) => {
  pgm.dropTable('loan_applications');
  pgm.dropType('loan_status');
  pgm.dropType('loan_purpose');
};
