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
