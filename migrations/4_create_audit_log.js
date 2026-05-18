/**
 * Migration: create audit_log table
 * PCI-DSS 10.2 — immutable audit trail for all sensitive operations
 */
exports.up = (pgm) => {
  pgm.createTable('audit_log', {
    id: {
      type: 'bigserial',
      primaryKey: true,
    },
    actor_id: {
      type: 'uuid',
      default: null, // null = system action
    },
    actor_role: {
      type: 'varchar(50)',
      default: null,
    },
    action: {
      type: 'varchar(100)',
      notNull: true,
    },
    resource_type: {
      type: 'varchar(100)',
      notNull: true,
    },
    resource_id: {
      type: 'uuid',
      default: null,
    },
    // JSON diff of changed fields (sensitive values redacted)
    changes: {
      type: 'jsonb',
      default: null,
    },
    ip_address: {
      type: 'inet',
      default: null,
    },
    user_agent: {
      type: 'text',
      default: null,
    },
    success: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    error_message: {
      type: 'text',
      default: null,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('NOW()'),
    },
  });

  pgm.createIndex('audit_log', 'actor_id');
  pgm.createIndex('audit_log', 'resource_type');
  pgm.createIndex('audit_log', 'resource_id');
  pgm.createIndex('audit_log', 'created_at');
  pgm.createIndex('audit_log', 'action');
};

exports.down = (pgm) => {
  pgm.dropTable('audit_log');
};
