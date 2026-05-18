# fintech-api-test-strategy

[![CI](https://github.com/Djones-qa/fintech-api-test-strategy/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/Djones-qa/fintech-api-test-strategy/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20-green?logo=node.js)](https://nodejs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue?logo=postgresql)](https://www.postgresql.org)
[![Pact](https://img.shields.io/badge/Contract%20Testing-Pact-purple)](https://pact.io)
[![Stryker](https://img.shields.io/badge/Mutation%20Testing-Stryker-red)](https://stryker-mutator.io)
[![k6](https://img.shields.io/badge/Performance-k6-7D64FF?logo=k6)](https://k6.io)
[![PCI-DSS](https://img.shields.io/badge/Compliance-PCI--DSS%20v4.0-orange)](./docs/pci-dss-risk-mapping.md)

A Node.js loan application and payment processing API that demonstrates a
complete, production-grade test strategy in the PCI-DSS domain. Every gap
from a typical "happy-path only" test suite is addressed here — and the
methodology is intentionally transferable to any regulated domain.

---

## What this repo demonstrates

| Gap in most repos | Solution here |
|---|---|
| No authentication layer | JWT + RBAC (`src/middleware/auth.js`) |
| No real database | PostgreSQL via Docker, migration-based schema |
| No contract testing | Pact consumer + provider tests |
| No mutation testing | Stryker targeting financial logic and encryption |
| No CI performance gate | k6 smoke test — fails build if p95 > 500ms |
| HIPAA-only risk mapping | Replaced with PCI-DSS v4.0 traceability matrix |

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

## CI Pipeline

```
lint → unit-tests + mutation → integration-tests → contract-tests
                                                         ↓
                                               performance-gate (k6 smoke)
                                                         ↓
                                               security-audit (npm audit)
```

The performance gate starts the real API against the test DB and runs the k6
smoke script. Any threshold breach fails the build before the PR can merge.

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
# Edit .env — set JWT_SECRET (long random string) and ENCRYPTION_KEY (64 hex chars)
```

### 3. Install, migrate, seed

```bash
npm install
npm run db:migrate
npm run db:seed
```

### 4. Start the API

```bash
npm run dev
# API available at http://localhost:3000
```

---

## Running the test suite

```bash
# Unit tests (no DB required)
npm run test:unit

# Integration tests (requires Docker postgres running)
npm run test:integration

# All tests with coverage report
npm run coverage

# Mutation tests — proves tests actually catch bugs
npm run test:mutation
# Report: reports/mutation/mutation-report.html

# Pact consumer contract tests (generates pacts/ directory)
npm run test:contract:consumer

# k6 smoke performance gate
npm run test:perf
```

---

## RBAC roles

| Role | Permissions |
|---|---|
| `applicant` | Create and submit their own loan applications |
| `loan_officer` | View all loans, create payments |
| `underwriter` | View all loans, run the automated decision engine |
| `admin` | All of the above + update payment status |

---

## Seed users (after `npm run db:seed`)

| Email | Role | Password |
|---|---|---|
| applicant@example.com | applicant | Str0ng!Password#99 |
| officer@example.com | loan_officer | Str0ng!Password#99 |
| underwriter@example.com | underwriter | Str0ng!Password#99 |
| admin@example.com | admin | Str0ng!Password#99 |

---

## PCI-DSS compliance notes

See [`docs/pci-dss-risk-mapping.md`](docs/pci-dss-risk-mapping.md) for the
full requirement-to-test traceability matrix covering Requirements 3, 6, 7, 8, 10, and 11.

Key design decisions:
- **No full PANs stored** — only `card_last_four` (4 digits) + processor token
- **SSN encrypted** at rest with AES-256-GCM before DB write
- **Passwords hashed** with bcrypt cost factor 12
- **Account lockout** after 6 failed attempts (30-minute window)
- **Immutable audit log** — append-only, no update/delete routes
- **Rate limiting** on all endpoints (configurable via env vars)
- **Helmet** security headers on every response

---

## Author

**Darrius Jones**
[![GitHub](https://img.shields.io/badge/GitHub-Djones--qa-181717?logo=github)](https://github.com/Djones-qa)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Darrius%20Jones-0A66C2?logo=linkedin)](https://www.linkedin.com/in/darrius-jones-28226b350/)

---

## License

[MIT](./LICENSE) © 2026 Darrius Jones
