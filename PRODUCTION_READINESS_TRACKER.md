# TaxBot Production Readiness Tracker

Last updated: 2026-07-19

Target: raise each production-readiness area to about 8/10 before declaring the app ready for broad production use.

## Current Gate Status

| Area | Target | Status | Notes |
| --- | --- | --- | --- |
| Architecture | 8/10 | In progress | App construction is separated from server startup; CA client/audit/report routes plus console utilities/API/auth/charts/notifications are extracted; remaining work is dashboard feature decomposition. |
| Code Quality | 8/10 | In progress | TypeScript gate is clean; CA route responsibilities and shared browser utilities/API/auth/charts/notifications are split out; remaining work is dashboard feature cleanup. |
| Security | 8/10 | In progress | JWT/Argon2, CSRF, webhook signatures, export tokens, runtime/script env validation, log redaction, XML/CSV escaping are complete. |
| Database | 8/10 | In progress | Ordered migrations, audit integrity, and production query indexes are complete; production migration execution must be verified per environment. |
| GST Correctness | 8/10 | In progress | Regular-GST v1 scope, tax split, provenance, duplicate review, and partial-report visibility are implemented. |
| AI Reliability | 8/10 | In progress | Extraction normalization, production audit fallback behavior, and provider-category logging are implemented. |
| Performance | 8/10 | In progress | Basic limits/retries, paginated ledger APIs, row ceilings, and targeted ledger/audit indexes exist. |
| Reliability | 8/10 | In progress | Readiness checks, idempotency, retry, graceful shutdown, Render config checks, and health/version deploy fingerprints are complete; production smoke still needs live verification. |
| Testing | 8/10 | In progress | Unit, integration-style, Express source smoke, compiled dist smoke, and public asset integrity checks cover critical paths; deployed smoke evidence remains open. |
| Documentation | 8/10 | In progress | README, migrations, env contract, changelog, tracker, and operations runbook are updated. |

## Completed Remediation

- Critical auth hardening: JWT sessions, Argon2 password storage, legacy SHA-256 migration, CSRF protection.
- Production config hardening: runtime and `npm run check:env` require long non-placeholder secrets, while public origins and Supabase URLs are validated as real HTTPS URLs.
- Public link hardening: signed export/payment tokens and strict token validation.
- HTTP hardening: Helmet, CORS controls, request limits, and route rate limits.
- Webhook hardening: Meta signature verification, inbound email shared secret, idempotent WhatsApp message processing.
- Data integrity: transaction review statuses, low-confidence review routing, duplicate candidate detection, failed duplicate checks routed to review.
- Auditability: Supabase audit-log schema, audit constraints, client ownership checks, request IDs, readiness endpoint, operational log redaction.
- GST v1 scope: regular GST only, intra/inter-state split where GSTIN state codes exist, provenance in reports.
- Export safety: server/browser Tally XML escaping, payment HTML escaping, CSV formula neutralization, frontend regression checks.
- Performance bounds: paginated CA ledger APIs plus row ceilings for reconciliation, PDFs, AI audit context, and signed exports.
- Operations: deployment, migration, smoke-test, rollback, and incident triage runbook.
- Testability: app factory separated from server startup, with E2E-style Express smoke tests for login, protected APIs, exports, payment denial, and compiled `dist/index.js` operational endpoints.
- Observability: categorized provider error summaries for Gemini, Anthropic, Meta WhatsApp, Sandbox GSTIN, and Supabase operations.
- Observability: non-secret deployment fingerprint metadata is exposed on `/health` and `/version` to diagnose stale Render builds.
- Database performance: query indexes for Tally sync, aggregated ledger reads, and CA audit-log reads.
- CI readiness: lint, build, tests, mojibake check, frontend safety check, public asset check, diagnostic script safety check, npm audit, Docker build workflow.
- Deployment readiness: Render build/start settings are version controlled in `render.yaml` and checked by `npm run check:render-config`.
- Maintainability: CA audit log and AI audit chat endpoints are split into `src/routes/caAudit.ts` with existing `/api/ca/audit/*` paths preserved.
- Maintainability: shared CA console browser utilities are split into `public/js/console-utils.js` and loaded before `public/js/console.js`.
- Maintainability: CA console authenticated session and protected-PDF helpers are split into `public/js/console-api.js` and covered by public asset load-order checks.
- Maintainability: CA console login, registration, and logout handlers are split into `public/js/console-auth.js` and covered by public asset load-order checks.
- Maintainability: CA reconciliation, consolidated GST, and PDF report endpoints are split into `src/routes/caReports.ts` with existing `/api/ca/*` paths preserved.
- Maintainability: CA client management and ledger listing endpoints are split into `src/routes/caClients.ts` with existing `/api/ca/clients*` and `/api/ca/transactions` paths preserved.
- Maintainability: CA console chart state, data shaping, and rendering are split into `public/js/console-charts.js` and loaded before `public/js/console.js`.
- Maintainability: CA console notification state and rendering are split into `public/js/console-notifications.js` and loaded before `public/js/console.js`.

## Remaining Queue

1. High: verify deployed production smoke after Render redeploy and Supabase migrations, then capture the evidence in this tracker.
2. Medium: continue splitting remaining large CA route areas and dashboard scripts into smaller modules after behavior is stable.
3. Low: keep the operations runbook updated after live production smoke tests and incidents.

## Production Smoke Evidence

- 2026-07-19: Public Render check against `https://taxbot-u2vh.onrender.com` returned `200` for `/health` and `/`, but `/ready` returned `404 Cannot GET /ready`. This indicates the live deployment is reachable but not running the current `main` build that includes `/ready`; redeploy from latest `main` is required before full smoke can pass.
- 2026-07-19: Rechecked after pushing commit `5b5f543`; `/health` returned `200`, while `/ready` and `/version` still returned `404`. Render is still not serving the latest `main` build.
- 2026-07-19: Rechecked after pushing commit `61cd72b`; `/health` returned `200`, while `/ready` and `/version` still returned `404`. Production smoke remains blocked on Render deploying latest `main`.
- 2026-07-19: Rechecked after pushing commit `75b6929` and adding `render.yaml`; `/health` returned `200`, while `/ready` and `/version` still returned `404`. The next required action is to confirm the existing Render service is connected to this repo/branch and using the repository build/start settings.
- 2026-07-19: Rechecked after pushing commit `4a1cb37`; `/health` still returned the legacy body without deployment metadata, while `/ready` and `/version` returned `404`. GitHub is current, but the live Render service is still not running the latest `main` build.

## Verification Command

```powershell
npm run lint
npm run build
npm run smoke:dist
npm test
npm run check:mojibake
npm run check:frontend-safety
npm run check:public-assets
npm run check:script-safety
npm run check:render-config
npm audit --audit-level=moderate
```
