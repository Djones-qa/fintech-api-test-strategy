/**
 * Migration: create users table
 * PCI-DSS 8.2 — unique user IDs, no shared credentials
 */
exports.up = (pgm) => {
  pgm.createExtension('uuid-ossp', { ifNotExists: true });

  pgm.createType('user_role', ['applicant', 'loan_officer', 'underwriter', 'admin']);

  pgm.createTable('users', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('uuid_generate_v4()'),
    },
    email: {
      type: 'varchar(255)',
      notNull: true,
      unique: true,
    },
    password_hash: {
      type: 'varchar(255)',
      notNull: true,
    },
    role: {
      type: 'user_role',
      notNull: true,
      default: 'applicant',
    },
    is_active: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    failed_login_attempts: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    locked_until: {
      type: 'timestamptz',
      default: null,
    },
    last_login_at: {
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

  pgm.createIndex('users', 'email');
  pgm.createIndex('users', 'role');
};

exports.down = (pgm) => {
  pgm.dropTable('users');
  pgm.dropType('user_role');
};
