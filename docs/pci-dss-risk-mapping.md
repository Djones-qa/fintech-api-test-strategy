# PCI-DSS Risk Mapping

This document maps each PCI-DSS v4.0 requirement to the specific test or
implementation in this repository. It demonstrates the same methodology used
in the HIPAA-mapped healthcare repo, applied to the payment card industry domain.

---

## Requirement 3 — Protect Stored Account Data

| Sub-req | Requirement | Implementation | Test |
|---------|-------------|----------------|------|
| 3.3.1 | SAD not retained after authorisation | Full PANs never accepted by the API | `tests/integration/payments.test.js` — "no full PAN" assertion |
| 3.3.2 | SAD not stored electronically | `card_last_four` (4 digits) only; processor token stored, not PAN | DB schema: `payments.card_last_four CHAR(4)` |
| 3.4.1 | PAN unreadable anywhere stored | SSN encrypted with AES-256-GCM before DB write | `src/utils/encryption.js`, `tests/unit/encryption.test.js` |
| 3.5.1 | Cryptographic key management | Key loaded from env var, never hardcoded | `src/utils/encryption.js` — `getKey()` validates key length |

---

## Requirement 6 — Develop and Maintain Secure Systems

| Sub-req | Requirement | Implementation | Test |
|---------|-------------|----------------|------|
| 6.2.4 | Prevent common vulnerabilities | Input validation on all endpoints | `express-validator` rules in every route |
| 6.3.2 | Inventory of bespoke software | All dependencies pinned in `package.json` | `npm audit` in CI (`security-audit` job) |
| 6.3.3 | All components protected from known vulns | `npm audit --audit-level=high` | CI: `security-audit` job |
| 6.5 | Security addressed in SDLC | k6 smoke gate in CI | `.github/workflows/ci.yml` — `performance-gate` job |
| 6.5.4 | HTTP body size limited | `express.json({ limit: '10kb' })` | `src/app.js` |

---

## Requirement 7 — Restrict Access to System Components

| Sub-req | Requirement | Implementation | Test |
|---------|-------------|----------------|------|
| 7.1 | Least privilege | RBAC via `authorize()` middleware | `tests/integration/loans.test.js` — 403 assertions per role |
| 7.2 | Access control system | JWT + role claim verified on every request | `src/middleware/auth.js` |
| 7.3 | All access controlled | No unauthenticated routes except `/health` and `/auth/*` | `tests/integration/auth.test.js` — 401 without token |

---

## Requirement 8 — Identify Users and Authenticate Access

| Sub-req | Requirement | Implementation | Test |
|---------|-------------|----------------|------|
| 8.2.1 | Unique user IDs | UUID primary key, unique email constraint | Migration `1_create_users.js` |
| 8.2.2 | No shared credentials | Each user has individual password hash | `src/routes/auth.js` — bcrypt hash per user |
| 8.3.6 | Password complexity | 12+ chars, uppercase, number, special char | `registerRules` in `src/routes/auth.js` |
| 8.3.9 | Passwords hashed | bcrypt cost factor 12 | `src/routes/auth.js` — `bcrypt.hash(password, 12)` |
| 8.3.10 | Passwords not sent in clear text | HTTPS enforced in production; passwords never logged | `src/config/logger.js` — no password fields |
| 8.6.1 | Account lockout | 6 failed attempts → 30-minute lockout | `src/routes/auth.js` — lockout logic; `tests/integration/auth.test.js` |

---

## Requirement 10 — Log and Monitor All Access

| Sub-req | Requirement | Implementation | Test |
|---------|-------------|----------------|------|
| 10.2.1 | Audit log for all access | `audit_log` table, written on every sensitive operation | `src/middleware/auditLog.js` |
| 10.2.2 | Log all authentication events | `auth.login.success`, `auth.login.failed`, `auth.login.locked` | `src/routes/auth.js` |
| 10.2.4 | Log invalid access attempts | Failed logins and 401/403 responses logged | `src/routes/auth.js` |
| 10.3.2 | Audit log protected from modification | `audit_log` has no UPDATE/DELETE routes; append-only | No DELETE route exists for audit_log |
| 10.3.3 | Audit log backed up | Handled at infrastructure level (not in scope for this demo) | — |

---

## Requirement 11 — Test Security of Systems and Networks

| Sub-req | Requirement | Implementation | Test |
|---------|-------------|----------------|------|
| 11.3.1 | Internal vulnerability scans | `npm audit` in CI | CI: `security-audit` job |
| 11.6.1 | Change detection | Contract tests catch breaking API changes | Pact consumer/provider tests |

---

## Test Strategy → PCI-DSS Traceability

```
Unit tests (Jest)
  └─ loanDecision.js    → Req 6.2.4 (business logic correctness)
  └─ encryption.js      → Req 3.4.1 (cryptographic correctness)

Mutation tests (Stryker)
  └─ loanDecision.js    → Proves tests actually catch financial logic bugs
  └─ encryption.js      → Proves encryption tests catch security regressions

Integration tests (Jest + PostgreSQL)
  └─ auth.test.js       → Req 8.x (authentication, lockout, JWT)
  └─ loans.test.js      → Req 7.x (RBAC, data isolation)
  └─ payments.test.js   → Req 3.x (PAN handling, access control)

Contract tests (Pact)
  └─ consumer           → Defines expected payment processor API shape
  └─ provider           → Verifies processor honours the contract

Performance gate (k6)
  └─ smoke.js           → Req 6.5 (security in SDLC, catch regressions in CI)
  └─ load.js            → Pre-release capacity validation
```
