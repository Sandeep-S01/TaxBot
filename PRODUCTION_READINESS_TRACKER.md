# TaxBot Production Readiness Tracker

Last updated: 2026-07-19

Target: raise each production-readiness area to about 8/10 before declaring the app ready for broad production use.

## Current Gate Status

| Area | Target | Status | Notes |
| --- | --- | --- | --- |
| Architecture | 8/10 | In progress | App construction is separated from server startup; CA routes and frontend scripts remain large. |
| Code Quality | 8/10 | In progress | TypeScript gate is clean; remaining work is mostly decomposition and shared browser helpers. |
| Security | 8/10 | In progress | JWT/Argon2, CSRF, webhook signatures, export tokens, log redaction, XML/CSV escaping are complete. |
| Database | 8/10 | In progress | Ordered migrations and audit integrity are complete; production migration execution must be verified per environment. |
| GST Correctness | 8/10 | In progress | Regular-GST v1 scope, tax split, provenance, duplicate review, and partial-report visibility are implemented. |
| AI Reliability | 8/10 | In progress | Extraction normalization, production audit fallback behavior, and provider-category logging are implemented. |
| Performance | 8/10 | In progress | Basic limits/retries, paginated ledger APIs, and row ceilings exist; remaining risk is deeper query/index profiling. |
| Reliability | 8/10 | In progress | Readiness checks, idempotency, retry, and graceful shutdown are complete; production smoke still needs live verification. |
| Testing | 8/10 | In progress | Unit, integration-style, and Express smoke tests cover critical paths; deployed smoke evidence remains open. |
| Documentation | 8/10 | In progress | README, migrations, env contract, changelog, tracker, and operations runbook are updated. |

## Completed Remediation

- Critical auth hardening: JWT sessions, Argon2 password storage, legacy SHA-256 migration, CSRF protection.
- Public link hardening: signed export/payment tokens and strict token validation.
- HTTP hardening: Helmet, CORS controls, request limits, and route rate limits.
- Webhook hardening: Meta signature verification, inbound email shared secret, idempotent WhatsApp message processing.
- Data integrity: transaction review statuses, low-confidence review routing, duplicate candidate detection, failed duplicate checks routed to review.
- Auditability: Supabase audit-log schema, audit constraints, client ownership checks, request IDs, readiness endpoint, operational log redaction.
- GST v1 scope: regular GST only, intra/inter-state split where GSTIN state codes exist, provenance in reports.
- Export safety: server/browser Tally XML escaping, payment HTML escaping, CSV formula neutralization, frontend regression checks.
- Performance bounds: paginated CA ledger APIs plus row ceilings for reconciliation, PDFs, AI audit context, and signed exports.
- Operations: deployment, migration, smoke-test, rollback, and incident triage runbook.
- Testability: app factory separated from server startup, with E2E-style Express smoke tests for login, protected APIs, exports, and payment denial.
- Observability: categorized provider error summaries for Gemini, Anthropic, Meta WhatsApp, Sandbox GSTIN, and Supabase operations.
- CI readiness: lint, build, tests, mojibake check, frontend safety check, diagnostic script safety check, npm audit, Docker build workflow.

## Remaining Queue

1. High: verify deployed production smoke after Render redeploy and Supabase migrations, then capture the evidence in this tracker.
2. Medium: split large CA route and dashboard scripts into smaller modules after behavior is stable.
3. Medium: profile Supabase indexes and query plans against larger production-like ledger volumes.
4. Low: keep the operations runbook updated after live production smoke tests and incidents.

## Verification Command

```powershell
npm run lint
npm run build
npm test
npm run check:mojibake
npm run check:frontend-safety
npm run check:script-safety
npm audit --audit-level=moderate
```
