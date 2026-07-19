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

### Production Readiness
- Added `META_APP_SECRET`, `APP_ORIGIN`, and `ALLOWED_ORIGINS` to the environment contract.
- Added focused tests for webhook signature verification, cookie session auth, CSRF, and security config.
- Added this changelog to track product and production-readiness changes.
