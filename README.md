# TaxBot — AI-native Accounting Platform for Indian SMBs

TaxBot is a WhatsApp-first AI-native accounting firm replacement built for Indian small businesses. It processes receipts, invoices, and bank statements sent over WhatsApp, manages a real-time ledger, generates GSTR return summaries, sends proactive filing reminders, and answers accounting questions in English or Hindi.

---

## Technical Stack
- **Runtime & Language:** Node.js (v20+) & TypeScript
- **Web Framework:** Express.js
- **Database:** Supabase (PostgreSQL)
- **AI Engine:** Anthropic Claude 3.5 Sonnet (Vision + Text)
- **WhatsApp Gateway:** Meta Cloud API v19.0 (Webhook-based)
- **GST Validator:** Sandbox.co.in Compliance APIs
- **Job Scheduler:** node-cron
- **Unit Testing:** Vitest

---

## Project Structure
```text
taxbot/
├── src/
│   ├── index.ts              # Express application entry point
│   ├── webhook/
│   │   ├── handler.ts        # POST /webhook — message router
│   │   └── verify.ts         # GET /webhook — Meta verification handshake
│   ├── handlers/
│   │   ├── image.ts          # OCR & vision receipt/invoice parser
│   │   ├── text.ts           # Command routing & conversational AI
│   │   ├── document.ts       # PDF text extraction & transaction logger
│   │   └── commands/
│   │       ├── report.ts     # "report" -> monthly P&L summaries
│   │       ├── gst.ts        # "gst" -> GSTR-3B estimations
│   │       ├── gstin.ts      # "gstin <id>" -> save & validate business details
│   │       └── help.ts       # "help" -> list commands
│   ├── ai/
│   │   ├── claude.ts         # Anthropic API client wrappers with 30s timeout
│   │   ├── prompts.ts        # System prompts for OCR and assistant modes
│   │   └── categorise.ts     # Receipt & document categorization pipelines
│   ├── gst/
│   │   ├── sandbox.ts        # Sandbox.co.in GSTIN verification client
│   │   ├── gstr1.ts          # GSTR-1 sales categories builder
│   │   └── gstr3b.ts         # GSTR-3B tax offset builder
│   ├── db/
│   │   ├── client.ts         # Supabase client singleton
│   │   ├── clients.ts        # Client onboarding & update CRUD
│   │   └── transactions.ts   # Transaction insertion, reports & tax offsets
│   ├── jobs/
│   │   └── reminders.ts      # node-cron recurring reminders (18th at 9:00 AM IST)
│   └── types/
│       └── index.ts          # Common TypeScript interfaces
├── supabase/
│   └── schema.sql            # PostgreSQL schema definition with RLS
├── tests/
│   ├── gstin.test.ts         # Format verification tests
│   ├── transactions.test.ts  # Period calculator unit tests
│   └── cron.test.ts          # Billing period unit tests
├── .env.example
├── Dockerfile
├── package.json
└── README.md
```

---

## Local Setup & Installation

### 1. Prerequisites
- Install [Node.js v20+](https://nodejs.org/)
- Setup a free PostgreSQL database on [Supabase](https://supabase.com)
- Create a Meta Developer account and configure a WhatsApp Business sandbox/phone number.
- Register an API key on [Sandbox.co.in](https://sandbox.co.in) for live GST validation.
- Register an API key on [Anthropic](https://console.anthropic.com) for Claude Sonnet.

### 2. Install Dependencies
Run inside the project root:
```bash
npm install
```

### 3. Database Initialization and Migrations
Use the ordered SQL files in `supabase/migrations/` as the source of truth for database changes.

For a new Supabase project, run:
```text
supabase/migrations/001_initial_schema.sql
```

For an existing prototype database, run:
```text
supabase/migrations/002_production_readiness_upgrade.sql
supabase/migrations/003_inbound_message_idempotency.sql
```

Do not repeatedly paste the full `supabase/schema.sql` snapshot into production. It is kept as a reference snapshot only; production changes should be applied through versioned migration files.

### 4. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your API credentials:
```bash
cp .env.example .env
```
Ensure you set the variables:
- `ANTHROPIC_API_KEY`: Anthropic key.
- `GEMINI_API_KEY`: Optional Gemini key used for Gemini 2.5 Flash document, receipt, and audio flows.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` & `SUPABASE_SERVICE_ROLE_KEY`: Supabase project values. The backend should use the service-role key on the server.
- `JWT_SECRET`: Long random secret used to sign CA console sessions.
- `EXPORT_TOKEN_SECRET`: Long random secret used to sign temporary export links.
- `WA_TOKEN`: Meta WhatsApp Cloud permanent authorization bearer token.
- `WA_PHONE_ID`: Phone number ID from Meta developer panel.
- `WA_VERIFY_TOKEN`: A custom string of your choice used to verify your webhook subscription.
- `SANDBOX_API_KEY`: Sandbox.co.in API key.

---

## Running the Application

### Development Mode
Runs the typescript files dynamically using `tsx watch`:
```bash
npm run dev
```

### Production Build & Launch
Compiles the TS files to `/dist` and runs the compiled Javascript server:
```bash
npm run build
npm start
```

### Running Tests
Execute the Vitest suite:
```bash
npm run test
```

### Production Quality Gate
Run these checks before pushing or redeploying:
```bash
npm run lint
npm run build
npm test
npm run check:mojibake
npm run check:frontend-safety
npm audit --audit-level=moderate
```

The GitHub Actions workflow runs the same checks and validates that the Docker image builds.

### Render Deployment Checklist
1. Apply pending SQL files from `supabase/migrations/` in order.
2. Confirm production env vars with `npm run check:env` in the deployed environment where possible.
3. Redeploy Render from the latest `main` branch.
4. Verify `GET /health` and `GET /ready`.
5. Run `npm run smoke:prod` with `SMOKE_BASE_URL`, `SMOKE_CA_EMAIL`, and `SMOKE_CA_PASSWORD`.

---

## Meta Webhook Integration
To sync incoming WhatsApp messages to TaxBot:
1. Start your Express server (locally or on Railway/Heroku).
2. If running locally, tunnel the port using `ngrok` or similar:
   ```bash
   ngrok http 3000
   ```
3. Go to the **Meta Developer Console** -> WhatsApp -> Configuration.
4. Set the **Callback URL** to `https://<your-domain>/webhook`.
5. Set the **Verify Token** to the exact value of your local `WA_VERIFY_TOKEN`.
6. Click **Verify and Save**.
7. Subscribe to **messages** under the Webhook Fields grid.
