/**
 * Migration: fix currency column default on payments table.
 * The original migration passed "'USD'" as a string literal which node-pg-migrate
 * double-quoted, producing a 5-char value that violates the CHAR(3) constraint.
 * This migration corrects the column default to the raw SQL expression 'USD'.
 */
exports.up = (pgm) => {
  pgm.alterColumn('payments', 'currency', {
    default: pgm.func("'USD'"),
  });
};

exports.down = (pgm) => {
  pgm.alterColumn('payments', 'currency', {
    default: pgm.func("'USD'"),
  });
};
