# TaxBot Operations Runbook

This runbook is for production operators deploying TaxBot to Render with Supabase and Meta WhatsApp Cloud API.

## Pre-Deploy Gate

1. Confirm the branch is clean and current:
   ```powershell
   git status --short --branch
   git log -3 --oneline
   ```
2. Run the local quality gate:
   ```powershell
   npm run lint
   npm run build
   npm test
   npm run check:mojibake
   npm run check:frontend-safety
   npm run check:script-safety
   npm audit --audit-level=moderate
   ```
3. Confirm GitHub Actions is green for the commit being deployed.

## Required Production Environment

Render must have real, non-placeholder values for:

- `NODE_ENV=production`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`
- `EXPORT_TOKEN_SECRET`
- `META_APP_SECRET`
- `EMAIL_WEBHOOK_SECRET`
- `APP_ORIGIN`
- `ALLOWED_ORIGINS`
- `GEMINI_API_KEY`
- `WA_TOKEN`
- `WA_PHONE_ID`
- `WA_VERIFY_TOKEN`

Optional but required for production CA AI Auditor:

- `ANTHROPIC_API_KEY`

## Database Migration Procedure

Use `supabase/migrations/` as the source of truth. Do not rerun `supabase/schema.sql` against an existing production database.

For a new database, run migrations in order:

1. `001_initial_schema.sql`
2. `002_production_readiness_upgrade.sql`
3. `003_inbound_message_idempotency.sql`
4. `004_audit_log_integrity.sql`

For an existing prototype database, run only the pending migration files. If Supabase reports that a policy or object already exists, verify whether the matching migration has already been applied before retrying.

After migrations, verify:

```sql
select count(*) from clients;
select count(*) from transactions;
select count(*) from console_audit_logs;
select count(*) from inbound_messages;
```

## Render Deployment

1. Push the verified commit to `main`.
2. Trigger Render deploy from the latest `main`.
3. Wait until Render reports a successful deploy.
4. Check:
   ```text
   GET https://<app-origin>/health
   GET https://<app-origin>/version
   GET https://<app-origin>/ready
   ```
5. `/ready` must return `status: "ready"` and `database: "ok"`.
6. `/version` must report the expected commit for the deployed revision.

## Production Smoke Test

Run from a machine with Node/npm available:

```powershell
$env:SMOKE_BASE_URL="https://taxbot-u2vh.onrender.com"
$env:SMOKE_CA_EMAIL="<test-ca-email>"
$env:SMOKE_CA_PASSWORD="<test-ca-password>"
npm run smoke:prod
```

Expected coverage:

- Health endpoint responds.
- Readiness endpoint responds.
- CA login succeeds and returns session data.
- Protected route rejects anonymous access.
- CA clients and transaction APIs respond under authentication.
- Raw unsigned payment page is blocked.

## Rollback

1. Prefer Render rollback to the last known-good deploy when only application code changed.
2. If a database migration caused the issue, do not manually delete production data. Create a forward fix migration unless a tested rollback SQL is available.
3. After rollback, run `/health`, `/ready`, and `npm run smoke:prod`.
4. Record the incident, commit hash, deployment time, migration file, observed symptom, and final resolution in the project issue tracker or ops notes.

## Incident Triage

Use this order during production incidents:

1. Check `/ready` to separate app availability from database/env readiness.
2. Check Render logs by request id, status code, and endpoint.
3. Check Supabase availability and recent migration changes.
4. Check Meta webhook delivery status and signature failures.
5. Check provider failures for Gemini, Anthropic, and WhatsApp API. Do not paste secrets or full customer payloads into issue notes.

## Common Failure Modes

| Symptom | Likely Cause | Action |
| --- | --- | --- |
| `Cannot GET /` | Static files missing from deployed image or wrong start command | Confirm Docker image copies `public/` and Render starts `npm start`. |
| `/ready` returns `not_ready` | Missing env or Supabase unavailable | Add missing env, confirm service-role key, redeploy. |
| CA login returns `Internal Server Error` | Missing/unsafe `JWT_SECRET`, bad Supabase key, or legacy DB mismatch | Check Render logs and `cas.password_hash` format; Argon2 and 64-char SHA-256 are supported. |
| WhatsApp webhook returns 401 | Bad `META_APP_SECRET` or signature not forwarded | Verify Meta app secret and proxy/header behavior. |
| Email webhook returns 401 | Missing/incorrect `EMAIL_WEBHOOK_SECRET` | Configure provider with bearer token or `x-taxbot-email-secret`. |
| Export returns 403 | Expired or mismatched signed token | Regenerate the WhatsApp export link. |
| Export returns 413 | Ledger period exceeds row ceiling | Narrow the period or implement paginated export workflow. |

## Post-Deploy Checks

After each production deploy:

1. Confirm login in the CA console.
2. Open client dashboard and global transactions.
3. Generate one CSV export and one Tally XML export from a test client.
4. Verify one signed payment link and one unsigned payment URL denial.
5. Confirm audit logs are written to `console_audit_logs`.
6. Confirm no raw phone numbers, secrets, or full webhook bodies appear in logs.
