# Changelog

All notable product, security, and production-readiness changes to TaxBot are tracked here.

## Unreleased

### Security
- Added Meta WhatsApp webhook signature verification using `X-Hub-Signature-256`.
- Removed full inbound webhook payload logging in favor of redacted event summaries.
- Added HttpOnly cookie-based CA sessions with CSRF protection for CA write routes.
- Restricted production CORS through configured application origins.
- Re-enabled Helmet Content Security Policy with required frontend/CDN allowlists.
- Escaped high-risk CA dashboard render paths for API-derived client and transaction fields.
- Required signed tokens for public customer payment pages instead of exposing details by raw transaction id.
- Changed CA audit chat so the server fetches authorized ledger context instead of trusting browser-supplied transactions.
- Added lightweight request validation for CA auth, client creation, report periods/types, UUID params, phone numbers, and GSTINs.
- Removed raw toast HTML rendering for backend/user-visible error text in the CA console.
- Escaped consolidated GST report fields rendered from API responses.
- Updated the local Tally sync connector to use JWT login/token auth instead of legacy `x-ca-id`.
- Added shared-secret verification and redacted logging for inbound email PDF webhooks.
- Disabled simulated CA AI Auditor answers in production when Anthropic is missing or unavailable.
- Validated and client-scoped manual CA audit log writes.
- Added database-level integrity checks for CA audit log action format, description length, and client ownership.
- Validated WhatsApp interactive category/export replies and removed hardcoded production hosts from WhatsApp link generation.
- Added production proxy trust and graceful HTTP shutdown handling.
- Hardened public export token validation with strict shape checks and constant-time comparison.
- Redacted WhatsApp/webhook/provider operational logs to avoid raw phone numbers and full upstream payloads.

### Production Readiness
- Added `META_APP_SECRET`, `APP_ORIGIN`, and `ALLOWED_ORIGINS` to the environment contract.
- Added focused tests for webhook signature verification, cookie session auth, CSRF, and security config.
- Added this changelog to track product and production-readiness changes.
- Added ordered Supabase migration files and documented migration workflow to avoid rerunning the schema snapshot.
- Added request IDs, structured access logs, `/ready` dependency checks, and readiness smoke coverage.
- Added inbound WhatsApp message tracking and idempotency migration to prevent duplicate processing of Meta retries.
- Added timeout and retry handling for WhatsApp send/media API calls.
- Replaced the misleading GitHub Pages workflow with backend CI and Docker build validation.
- Added a `lint` quality gate and slimmed the Docker image to runtime files only.
- Added shared GST state-code tax split logic and stronger duplicate transaction candidate matching.
- Added transaction status, confidence, review reason, and source provenance to CSV/PDF reporting surfaces.
- Added stricter public export/payment route validation for UUIDs, periods, and formats.
- Added a frontend safety check to block JWT localStorage and bearer-token regressions.
- Added keyboard and ARIA support for client workspace tabs.
- Strengthened the mojibake quality gate and cleaned Tally connector console output.
- Added `EMAIL_WEBHOOK_SECRET` to startup, readiness, and environment validation.
- Documented the CA AI Auditor's Anthropic dependency and added tests for production fallback behavior.
- Added tests for manual audit-log payload validation.
- Refreshed the consolidated Supabase schema snapshot and added migration consistency tests.
- Added tests for WhatsApp interactive reply validation and public origin selection.
- Added tests for server lifecycle and reverse-proxy behavior.
- Added tests for malformed and mismatched export download tokens.
- Added tests for privacy-safe log summarization.
- Changed failed duplicate transaction checks to force `needs_review` instead of allowing silent confirmed ledger entries.
- Added partial-failure provenance to consolidated CA GST reports and surfaced review-needed client calculations in the dashboards.
- Escaped browser-side Tally XML/CSV export content and expanded frontend safety checks for XML interpolation regressions.
- Neutralized spreadsheet formula-leading values in server and browser CSV exports.
- Added `PRODUCTION_READINESS_TRACKER.md` to track readiness targets, completed remediation, and the remaining severity queue.
- Added bounded pagination metadata to CA transaction list APIs and row ceilings for reconciliation, PDF, AI audit context, and signed exports.
- Added an operations runbook for deployment, migrations, smoke testing, rollback, and incident triage.
- Split Express app construction from server startup and added E2E-style smoke coverage for public shell, CA login, protected APIs, paginated ledger reads, signed exports, and unsigned payment denial.
- Added provider/category error summaries for Gemini, Anthropic, Meta WhatsApp, Sandbox GSTIN, and Supabase operations without logging response bodies or secrets.
- Redacted development diagnostic script output by default, fixed signed-export smoke-test expectations, and added a CI script-safety gate.
- Added a public non-secret `/version` endpoint and production smoke coverage for deployed commit/build metadata.
- Added query-performance migration indexes for Tally sync, aggregated ledgers, and CA audit-log reads.
- Extracted CA audit log and AI audit chat endpoints into a dedicated route module while preserving the existing `/api/ca/audit/*` API paths.
- Extracted shared CA console browser utilities for HTML/XML escaping, CSV neutralization, safe export filenames, and audit markdown rendering.
- Extracted CA reconciliation, consolidated GST report, and PDF report endpoints into a dedicated route module while preserving existing `/api/ca/*` API paths.
- Extracted CA client and ledger listing endpoints into a dedicated route module while preserving existing `/api/ca/clients*` and `/api/ca/transactions` API paths.
- Extracted CA console Chart.js rendering and chart data shaping into a dedicated browser script loaded before the main console controller.
- Extracted CA console notification tray state/rendering into a dedicated browser script and escaped notification text during render.
- Added a version-controlled Render Blueprint plus CI deployment-config validation for production build/start settings.
- Added a CI-ready public asset integrity check for local HTML asset references and CA console browser script ordering.
- Added a compiled `dist/index.js` smoke test that verifies production artifact `/health`, `/version`, and `/ready` endpoints before deployment.
- Added non-secret deployment fingerprint metadata to `/health` as well as `/version` for stale-deploy diagnosis.
- Split production environment validation between HTTPS URL checks and long-random-secret checks, with focused test coverage.
- Aligned `npm run check:env` with production URL and secret validation rules, including tests for HTTPS production origins.
- Split CA console authenticated session/PDF helpers into `public/js/console-api.js` and added it to the public asset load-order check.
- Replaced encoding-sensitive password placeholder glyphs in the CA console with plain text placeholders.
- Split CA console login, registration, and logout handlers into `public/js/console-auth.js`.
- Added explicit hook timeout headroom to the Express smoke E2E suite to reduce CI flakiness during dynamic app setup.
