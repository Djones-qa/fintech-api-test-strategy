/**
 * Migration: create payments table
 * PCI-DSS 3.2 — PANs never stored; only last-4 + masked token reference
 */
exports.up = (pgm) => {
  pgm.createType('payment_status', [
    'pending',
    'processing',
    'completed',
    'failed',
    'refunded',
    'chargeback',
  ]);

  pgm.createType('payment_method', ['ach', 'wire', 'card', 'check']);

  pgm.createTable('payments', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    loan_application_id: {
      type: 'uuid',
      notNull: true,
      references: '"loan_applications"',
      onDelete: 'RESTRICT',
    },
    amount: {
      type: 'numeric(12,2)',
      notNull: true,
    },
    currency: {
      type: 'char(3)',
      notNull: true,
      default: pgm.func("'USD'"),
    },
    status: {
      type: 'payment_status',
      notNull: true,
      default: 'pending',
    },
    method: {
      type: 'payment_method',
      notNull: true,
    },
    // PCI-DSS 3.3: only last 4 digits stored, never full PAN
    card_last_four: {
      type: 'char(4)',
      default: null,
    },
    // Token from payment processor (e.g. Stripe payment method ID)
    processor_token: {
      type: 'varchar(255)',
      default: null,
    },
    processor_transaction_id: {
      type: 'varchar(255)',
      default: null,
    },
    failure_reason: {
      type: 'text',
      default: null,
    },
    processed_at: {
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

  pgm.createIndex('payments', 'loan_application_id');
  pgm.createIndex('payments', 'status');
  pgm.createIndex('payments', 'processor_transaction_id');
};

exports.down = (pgm) => {
  pgm.dropTable('payments');
  pgm.dropType('payment_status');
  pgm.dropType('payment_method');
};
