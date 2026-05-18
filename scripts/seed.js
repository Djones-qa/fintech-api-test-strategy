/**
 * Development seed script.
 * Creates representative users for each role so you can test the API manually.
 * Never run against production.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query, pool } = require('../src/config/database');

const SEED_PASSWORD = 'Str0ng!Password#99';

const users = [
  { email: 'applicant@example.com', role: 'applicant' },
  { email: 'officer@example.com', role: 'loan_officer' },
  { email: 'underwriter@example.com', role: 'underwriter' },
  { email: 'admin@example.com', role: 'admin' },
];

async function seed() {
  console.log('Seeding database...');
  const hash = await bcrypt.hash(SEED_PASSWORD, 12);

  for (const user of users) {
    await query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING`,
      [user.email, hash, user.role]
    );
    console.log(`  ✓ ${user.role}: ${user.email}`);
  }

  console.log(`\nAll users use password: ${SEED_PASSWORD}`);
  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
