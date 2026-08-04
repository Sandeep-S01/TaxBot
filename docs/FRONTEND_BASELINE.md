# TaxBot Frontend Baseline

## Environment

- Browser: Playwright Chromium
- Viewports: 390x844 and 1440x1000
- Theme: light-only Digital Khata surface
- Test command: `npm run test:ui`
- Snapshot update command: `npm run test:ui:update`
- Optional external server: set `PLAYWRIGHT_BASE_URL`
- Optional authenticated coverage: set `TAXBOT_UI_CA_EMAIL` and `TAXBOT_UI_CA_PASSWORD`

## Route Inventory

Always covered:

- `/` - landing page
- `/console.html` - CA login
- `/console.html` after activating Sign Up - CA registration

Covered when test credentials are supplied:

- `/console.html#overview`
- `/console.html#clients`
- `/console.html#transactions`
- `/console.html#documents`
- `/console.html#gst`
- `/console.html#insights`
- `/console.html#exports`
- `/console.html#billing`
- `/console.html#settings`
- `/console.html#client/:clientId` when the test CA has a linked client
- Client workspace tabs: overview, transactions, documents, GST, reconciliation, reports, exports, and AI audit
- Notification dropdown from the console header

## Baseline Results

Each accessible view is exercised by two Playwright projects:

| Project | Width | Theme |
| --- | ---: | --- |
| `mobile-light` | 390px | Light |
| `desktop-light` | 1440px | Light |

Every baseline test records:

- Successful page/container loading
- Browser console errors
- Uncaught page errors
- Failed required asset requests
- HTTP errors for required local assets
- Full-page screenshot comparison
- Page-level horizontal overflow
- Minimal keyboard reachability
- Light-only token application

Initial public baseline before remediation:

| View | Light 390 | Dark 390 | Light 1440 | Dark 1440 | Existing diagnostics |
| --- | --- | --- | --- | --- | --- |
| Landing | Loaded; screenshot; no overflow; keyboard pass; test fails | Loaded; screenshot; no overflow; keyboard pass; test fails | Loaded; screenshot; no overflow; keyboard pass; test fails | Loaded; screenshot; no overflow; keyboard pass; test fails | `tailwind is not defined`; `/favicon.ico` returns 404 |
| Login | Loaded; screenshot; no overflow; keyboard pass; test fails | Loaded; screenshot; no overflow; keyboard pass; test fails | Loaded; screenshot; no overflow; keyboard pass; test fails | Loaded; screenshot; no overflow; keyboard pass; test fails | `tailwind is not defined` |
| Registration | Loaded; screenshot; no overflow; keyboard pass; test fails | Loaded; screenshot; no overflow; keyboard pass; test fails | Loaded; screenshot; no overflow; keyboard pass; test fails | Loaded; screenshot; no overflow; keyboard pass; test fails | `tailwind is not defined` |

Authenticated route results are not available in this environment because no safe test credentials are configured.

## Known Baseline Failures

- At the initial B001 baseline, both HTML pages configured `tailwind` before loading the Tailwind CDN script. Chromium reported `ReferenceError: tailwind is not defined`.
- At the initial baseline, the landing page did not declare a favicon, so Chromium requested `/favicon.ico` and produced a 404 console error.
- At the initial baseline, the Tailwind CDN emitted its production-use warning. It was retained as baseline output rather than allowlisted or hidden.
- Authenticated console coverage still requires safe UI test credentials.

## Remediation Status

- B003 replaced the Tailwind runtime CDN/configuration with the locally generated `public/css/tailwind.css`.
- The `tailwind is not defined` exception and Tailwind production-CDN warning are resolved.
- Reviewed snapshots were updated after the compiled stylesheet began applying the repository's declared custom utilities consistently.
- The design-system foundation centralizes primitive, semantic, and compatibility tokens in `public/css/tokens.css`.
- Landing and auth use `public/css/public-pages.css`; the console uses `public/css/dashboard-khata.css` and modular console scripts.
- The landing page now declares the same inline SVG favicon as the console, resolving the `/favicon.ico` failure.
- The shared console shell now has focused coverage for header action alignment, dropdown coordination, command palette focus, notification readability, and add-client modal contrast without requiring real CA credentials.
- Console component migration now standardizes repeated button, form field, card, panel, table, badge, and empty-state styling through the shared shell layer.
- Focused shell coverage now checks migrated component families on Exports, GST, Settings, and Billing in 390px/1440px light projects.
- Page-level UX polish now covers Settings validation, webhook save/test feedback, notification test actions, export busy/success states, and GST file/bulk-file action feedback.
- Route-wide mocked console QA now visits every console route plus client workspace tabs without real CA credentials, checking shell visibility, horizontal overflow, and visible control contrast in 390px/1440px light projects.
- Console status colors now use semantic success, warning, error, and info tokens instead of raw Tailwind status colors; selected document navigation and colored outline actions were tightened to meet readable contrast.
- Auth login/registration snapshots were updated after the shared shell contrast rules made form labels, placeholders, and focused inputs visibly readable.
- Landing/auth parity now loads `public/css/public-pages.css` after existing page styles to align public CTAs, cards, forms, modal surfaces, theme colors, and mobile spacing with the console token system.
- Public baseline now checks visible landing/auth controls for 4.5:1 contrast before screenshot comparison.
- Current public/shell result: baseline and console shell coverage pass across 390px and 1440px in light mode; real-auth suites are skipped when credentials are not configured.

## Authentication Limitations

The repository does not provide a test CA account, a test-only authentication fixture, or safe UI credentials. The harness does not create users, weaken authentication, or fabricate a session.

Without `TAXBOT_UI_CA_EMAIL` and `TAXBOT_UI_CA_PASSWORD`, authenticated console coverage is reported as skipped. When credentials are provided, the test signs in through the real login form and existing API. Client workspace tabs additionally require at least one linked client.

## Baseline Screenshot Location

Tracked snapshots use Playwright naming conventions under:

`tests/ui/baseline.pw.ts-snapshots/`

Transient failure screenshots, traces, and the HTML report are written to ignored `test-results/` and `playwright-report/` directories.

No dynamic UI is hidden. No screenshot masks are currently used.

## CI Preparation

The Playwright configuration is CI-compatible, but the existing GitHub Actions workflow is unchanged in B001. A future CI task should install Chromium with:

`npx playwright install --with-deps chromium`

and run:

`npm run test:ui`
