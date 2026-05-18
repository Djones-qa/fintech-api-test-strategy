# fintech-api-test-strategy

A Node.js loan application and payment processing API that demonstrates a
complete, production-grade test strategy in the PCI-DSS domain. Every gap
from a typical "happy-path only" test suite is addressed here.

## What this repo demonstrates

| Gap | Solution |
|-----|----------|
| No authentication layer | JWT + RBAC (`src/middleware/auth.js`) |
| No real database | PostgreSQL via Docker, migration-based schema |
| No contract testing | Pact consumer + provider tests |
| No mutation testing | Stryker targeting financial logic and encryption |
| No CI performance gate | k6 smoke test — fails build if p95 > 500ms |
| HIPAA risk mapping | Replaced with PCI-DSS v4.0 mapping (`docs/pci-dss-risk-mapping.md`) |

The methodology is identical to a healthcare/HIPAA repo — only the domain
and compliance framework change. That's the point.

---

## Architecture

```
src/
  app.js                  Express app (security middleware, routes)
  server.js               HTTP server + graceful shutdown
  config/
    database.js           pg Pool — switches to TEST_DATABASE_URL in test env
    logger.js             Winston structured logger (silent in tests)
  middleware/
    auth.js               JWT verification + RBAC authorize()
    auditLog.js           Append-only audit_log writer (PCI-DSS 10.2)
    errorHandler.js       Centralised error handler (no stack leaks in prod)
  routes/
    auth.js               POST /auth/register, POST /auth/login
    loans.js              CRUD + submit + decide (underwriter decision engine)
    payments.js           Create, retrieve, status webhook
  utils/
    encryption.js         AES-256-GCM field-level encryption (SSN, PCI-DSS 3.4)
    loanDecision.js       Pure decision engine — primary mutation test target

migrations/               node-pg-migrate SQL migrations
tests/
  unit/                   Pure logic — no DB, no HTTP
  integration/            Real PostgreSQL, full HTTP via supertest
  contract/
    consumer/             Pact — defines what we expect from payment processor
    provider/             Pact — verifies processor honours the contract
  performance/
    smoke.js              k6 CI gate (3 VUs, 30s, p95 < 500ms)
    load.js               k6 load test (50 VUs, 5 min ramp)
```

---

## Quick start

### Prerequisites
- Node.js 20+
- Docker + Docker Compose
- k6 (for performance tests — [install guide](https://k6.io/docs/get-started/installation/))

### 1. Start the database

```bash
docker-compose up -d postgres
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — at minimum set JWT_SECRET and ENCRYPTION_KEY
```

### 3. Install dependencies and run migrations

```bash
npm install
npm run db:migrate
npm run db:seed   # Creates demo users for each role
```

### 4. Start the API

```bash
npm run dev
```

The API is now at `http://localhost:3000`.

---

## Running the test suite

### Unit tests (no DB required)
```bash
npm run test:unit
```

### Integration tests (requires Docker postgres)
```bash
# Ensure TEST_DATABASE_URL points at fintech_test_db
npm run test:integration
```

### All tests with coverage
```bash
npm run coverage
```

### Mutation tests (Stryker)
```bash
npm run test:mutation
# Report: reports/mutation/mutation-report.html
```
Stryker mutates `loanDecision.js` and `encryption.js` and re-runs the unit
tests. A mutation score below 75% fails the run. This proves your tests
actually catch bugs — not just that they pass.

### Contract tests (Pact)
```bash
# Consumer side — generates pacts/ directory
npm run test:contract:consumer

# Provider side — requires PAYMENT_PROCESSOR_URL env var
PAYMENT_PROCESSOR_URL=http://sandbox.processor.example.com npm run test:contract:provider

# Publish to Pact Broker (requires PACT_BROKER_URL)
npm run test:contract:publish
```

### Performance smoke gate
```bash
# Start the API first, then:
npm run test:perf
# Fails if p95 latency > 500ms or error rate > 1%
```

### Full load test
```bash
npm run test:perf:load
```

---

## RBAC roles

| Role | Can do |
|------|--------|
| `applicant` | Create and submit their own loan applications |
| `loan_officer` | View all loans, create payments |
| `underwriter` | View all loans, run the decision engine |
| `admin` | All of the above + update payment status |

---

## PCI-DSS compliance notes

See [`docs/pci-dss-risk-mapping.md`](docs/pci-dss-risk-mapping.md) for the
full requirement-to-test traceability matrix.

Key design decisions:
- **No full PANs stored** — only `card_last_four` (4 digits) + processor token
- **SSN encrypted** at rest with AES-256-GCM before DB write
- **Passwords hashed** with bcrypt cost factor 12
- **Account lockout** after 6 failed attempts (30-minute window)
- **Immutable audit log** — append-only, no update/delete routes
- **Rate limiting** on all endpoints (configurable via env vars)
- **Helmet** security headers on every response

---

## CI pipeline

```
lint → unit-tests + mutation → integration-tests → contract-tests
                                                 ↓
                                         performance-gate (k6 smoke)
                                                 ↓
                                         security-audit (npm audit)
```

The performance gate runs after integration tests pass. It starts the real
API against the test DB and runs the k6 smoke script. Any threshold breach
fails the build before the PR can merge.

---

## Seed users (after `npm run db:seed`)

| Email | Role | Password |
|-------|------|----------|
| applicant@example.com | applicant | Str0ng!Password#99 |
| officer@example.com | loan_officer | Str0ng!Password#99 |
| underwriter@example.com | underwriter | Str0ng!Password#99 |
| admin@example.com | admin | Str0ng!Password#99 |
