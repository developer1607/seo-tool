# Webastral — development logbook

**Purpose:** Day-by-day record of *what* shipped and *how*, so another Cursor profile (or human) can resume or replicate from this repo alone.

**Canonical files to load with this book:**
- `docs/01-core/01-shipping/ACCOUNT_INTEGRATIONS_PLAN.md` — master Done / Pending checklist  
- `docs/01-core/01-shipping/PHASES.md` — phase status  
- `docs/01-core/01-shipping/DOC_AND_PG_EVAL-2026-09-17.md` — docs vs Postgres cutover  
- `Engineering.md` — stack + setup  
- `.cursor/rules/seo-reporting-collaboration.mdc` — product instincts  
- This file — chronological how/what  

**Single-command resume (other Cursor profile):**  
Open this repo → run slash command **`/replicate-webastral`** (defined in `.cursor/commands/replicate-webastral.md`).

---

## How to write an entry (every shipping day)

```markdown
## YYYY-MM-DD — short title

### Goal
One sentence.

### Done
- Bullet outcomes (user-visible)

### How (for replication)
- Key paths / APIs / standards touched
- Non-obvious decisions

### Checklist impact
- Moved X → Done / left Y pending (`ACCOUNT_INTEGRATIONS_PLAN.md`)

### Smoke
- Exact clicks to verify

### Do not
- Scope left out on purpose
```

**Rule:** Update this file the same turn as the checklist when something ships. Newest entry at the **top** (below this header).

---

## 2026-09-17 — Full docs eval + post-Postgres gap check

### Goal
Evaluate every labeled doc against live code, then record what the SQLite → Postgres cutover actually left in place vs missing.

### Done
- Wrote `docs/01-core/01-shipping/DOC_AND_PG_EVAL-2026-09-17.md` (folder-by-folder verdict + live table counts)
- Confirmed local PG: embedded **5434**, recovered from unclean shutdown, data present
- `db:verify` → users=2 clients=10; `db:verify-queries` ALL PASSED; `/health` `db: up`; `smoke:pg` **23/23**
- Earlier UI proxy `ECONNREFUSED :4000` was API-down, not a failed migration

### How (for replication)
- Canonical DDL: `db/schema.postgres.sql` (not `db/schema.sql`)
- Local PG: `npm run db:pg:start` → `data/pg-utf8/` → `DATABASE_URL` on 5434
- `docker-compose.yml` is unused leftover (5432); do not confuse with embedded 5434
- `website_onboarding` / `client_invites` exist in PG with **0 rows** — EJS routers never mounted on `src/index.js`
- `src/lib/metrics/views.js` **is live** (agency/client overview); `LEGACY_UNMOUNTED.md` was wrong on that file
- App SQL still uses `datetime('now')`; `pg-adapter.js` rewrites it

### Checklist impact
- Postgres SQL audit: **API smoke done**; browser product smoke + native SQL rewrite still pending
- Smoke item `db:pg:start` + `db:verify` + `/api/health` verified this machine
- Pending unchanged: Postgres prod, on-visit/cron Sync, Phase D ops, Phase E, share links

### Smoke
1. `npm run db:pg:start` (leave running)
2. `npm run db:verify` and `npm run db:verify-queries`
3. Single API: `npm run start:api` or `npm run dev`
4. `npm run smoke:pg` → 23/23
5. Hard-refresh http://localhost:3000/login — if session proxy fails, API is down, not PG

### Do not
- Re-run `db:migrate-sqlite` on a healthy PG (it DELETE-then-copy)
- Treat alpha SQLite-volume deploy notes as current
- Start only `web/` without API + PG

---

## 2026-09-16 — Agency PG date() crash + full API smoke

### Goal
Agency dashboard `function date(unknown, unknown) does not exist` after Postgres cutover; make portfolio/overview/reports APIs green.

### Done
- Root cause: SQLite `date('now', ?)` + **multiple stale `node src/index.js` processes** still serving old code
- `snapshotsSince` uses JS `YYYY-MM-DD` cutoff; `pg-adapter` also rewrites `date('now'…)`
- `websiteOverview` guards missing `website_onboarding` table
- Killed duplicate APIs; one clean `npm run start:api`
- `npm run smoke:pg` → **23/23** (agency, clients, overview, platforms, reports, integrations)

### Smoke
1. `npm run db:pg:start` (if needed)
2. Single API: `npm run start:api` (kill extra `src/index.js` first)
3. `npm run smoke:pg`
4. Hard-refresh http://localhost:3000/agency

### Do not
- Leave multiple API processes on :4000

---

## 2026-09-16 — PostgreSQL cutover (local, no Docker)

### Goal
Replace `node:sqlite` with PostgreSQL via `DATABASE_URL` (no Docker).

### Done
- `db/schema.postgres.sql` + sync `pg` adapter (`src/lib/pg-adapter.js` / `pg-worker.js`)
- `src/lib/db.js` requires `DATABASE_URL`; scripts: `db:init`, `db:verify`, `db:migrate-sqlite`, `db:pg:start`
- Embedded local PG (`embedded-postgres`, UTF-8 cluster on port **5434**) when no system install
- SQLite → PG data copy completed; `db/app.sqlite` left as backup
- Removed SQLite-only SQL (`COLLATE NOCASE`, `PRAGMA`, `sqlite_master`)
- Agency overview: replaced SQLite `date('now', '-N days')` with JS ISO cutoff (`views.js`)

### How (for replication)
1. `npm install` (approve `@embedded-postgres/windows-x64` scripts once)
2. `npm run db:pg:start` (leave running) — writes/updates `DATABASE_URL` in `.env`
3. `npm run db:init` → `npm run db:verify`
4. Optional: `npm run db:migrate-sqlite` if `db/app.sqlite` exists
5. `npm run dev`

### Checklist impact
- Done: **PostgreSQL cutover (local)**
- Pending: **Postgres prod / free deploy**, **Postgres SQL audit (full product smoke)**

### Smoke
- `npm run db:verify` → tables OK; clients/snapshots counts match prior SQLite
- API `/api/health` → `db: up`
- Agency dashboard should load after API restart (no `date(unknown, unknown)`)

### Do not
- Commit `.env`, `data/pg*`, or `db/app.sqlite`
- System winget Postgres (optional later); Docker still out of scope

---

## 2026-09-16 — Meta Connect: drop consumer OAuth scopes

### Goal
Facebook Login for Business Connect works in Development (reports).

### Done
- OAuth scopes `ads_read` + `business_management` only (`src/lib/meta/oauth.js`)
- `/me` fields `id,name` (no `email`)
- Ops notes in `Engineering.md` (localhost Site URL / restart after `.env`)

### Smoke
1. Restart API (src watch) → Settings → Meta **Configured**
2. Integrations → Connect Meta → Facebook login (no Invalid Scopes: email)
3. Link an ad account → Meta Ads page

### Do not
- Tech Provider / App Review / Live; `ads_management` until create-ads UI

---

## 2026-09-16 — Docs fully labeled (every file in a folder)

### Goal
Format entire `docs/` so every document has a numbered, labeled folder; split core into subfolders.

### Done
- Tree: `01-core/{01-shipping…06-engineering}`, `02-product-plans/{01-google-identity,02-websites}`, `03-qa/01-alpha`, `04-audits-archive/{01-handoffs,02-portal-audits,03-research}`
- Index READMEs in every folder; root `docs/README.md` + `/replicate-webastral` paths updated

---

## 2026-09-16 — Docs organised for GitHub push

### Goal
Clean doc layout + push-ready ignore rules before first commit to `developer1607/seo-tool`.

### Done
- Root `README.md` + `docs/README.md` index
- Audits → `docs/04-audits-archive/`; research plans → `docs/02-product-plans/`
- `.gitignore`: sqlite, `.env`, `Engineering.md`, `design-mocks/`, cookies
- Checklist: mobile nav marked Done; doc links updated

### Do not commit
`.env`, `Engineering.md`, `db/*.sqlite*`, `cookies.txt`, `design-mocks/`, `node_modules/`

---

## 2026-09-16 — Report comparison charts (every KPI)

### Goal
Period vs prior-period benchmark on reports; every KPI scorecard paired with a chart; chart type selectable on Generate.

### Done
- `last_14` preset (`src/lib/dates.js` + DateRangeBar presets)
- `columns_json` v2: `use_overview_defaults`, `chart_types` (`src/lib/reports.js`)
- KPI catalog `src/lib/report-kpis.js` + `web/lib/report-kpis.ts`
- Generate: period + benchmark hint, Use Overview defaults, per-KPI chart dropdowns
- Report view: each Key wins / GSC / GA4 KPI = scorecard + dual-series chart (this period vs prior period day-aligned)
- API returns `series` + `compareSeries` for overlay charts; print-safe Recharts

### Smoke
1. Reports → Generate → Last 7 → Save → each KPI has a chart; cover shows benchmark dates
2. Uncheck Overview defaults → disable GA4 → no GA4 charts
3. Set Sessions → Bar → Export PDF

### Do not
- Previous-year compare, drag reorder, server PDF, edit-after-save

---

## 2026-09-16 — Alpha multi-agent test + free-deploy hardening

### Goal
Complete-flow / bug / responsive / scale alpha before free deploy for large Google portfolios.

### Done
- Report: `docs/03-qa/01-alpha/ALPHA_TEST-2026-09-16.md`
- Agents: flow, responsive, bugs, deploy (see report links)
- Fixes: `/health`, bulk cap 80, brand `#hex` sanitize, print-color-adjust, KPI 1-col mobile, hostname LIKE match
- **Mobile nav drawer** (P0): hamburger + scrim + full sidebar/subnav at ≤760px (`admin-shell.tsx` + `globals.css`)
- Deduped `guessUrlFromGsc` → `importAsset.js` only

### Open P0
- Free host must use persistent SQLite volume (prefer Vercel `web/` + Railway API+disk — see alpha report)

### Smoke
- Start API → `GET /health`
- Narrow viewport ≤760px → ☰ opens Clients / Reports children; Escape / scrim closes
- Manual checklist in alpha report
- Deploy path confirmed by [Deploy](6a956083-87fd-4064-85ad-dcc7c0a21826): volume + single API process + secrets

---

## 2026-09-16 — Bulk import after Connect Google

### Goal
Create clients + websites + GA4/GSC connections in bulk from Google inventory (not one-by-one only).

### Done
- Shared `importGoogleAsset` + `importGoogleAssetsBulk` (`src/lib/google/importAsset.js`)
- `POST /api/integrations/google/import-bulk` — GA4 first (auto GSC), then leftover GSC; skip Ads
- Same-hostname attach to existing website (avoids duplicate clients)
- Integrations Google tab: **Import all available** / **Import selected** + checkboxes
- Single `/import` refactored to shared helper

### How
- Bulk defaults `sync: false` (use header Sync after)
- Ads still require explicit website Link

### Checklist impact
- Bulk import → Done

### Smoke
1. Integrations → Google · Import → Sync accounts  
2. **Import all available** (or select + Import selected)  
3. Clients list shows new rows; Ads still linked per site  

### Do not
- Do not bulk-import Ads without a website target  

---

## 2026-09-15 — Portal streamline, reports, Webastral brand

### Goal
Make Integrations/Sync honest, platform pages chart-rich, reports client-ready + PDF, revoke access as a standard, rename product to Webastral.

### Done
- Integrations/Sync P0s: identity bind on select/import; Needs reconnect honesty; Sync skips inactive / Meta-if-unset; Overview dims when `NEEDS_REAUTH`
- Google access revoked **standard**: `POST /api/clients/:id/verify-google` → confirm with Google token API → `AccessRevokedBanner` + Remove client (`docs/01-core/04-integrations/STANDARD_GOOGLE_ACCESS_REVOKED.md`, hook `useGoogleAccessVerify`)
- Platform pages: Recharts interactive charts + channel KPIs/tables
- Overview: E-Moto-style report sections; login → `/agency`; header chrome gated
- Reports: dynamic section numbers 1…N; clean branded PDF export (print → Save as PDF); **client-facing** recommendations (no roadmap/Phase copy in client PDF)
- Brand: **Astralytics → Webastral** (UI, API messages, core docs); cookie `webastral_session`
- Checklist refreshed in `ACCOUNT_INTEGRATIONS_PLAN.md` + `PHASES.md`

### How (for replication)
- Sync/agency: `src/lib/google/sync.js`, `agency.js`, `oauth.js`, `access.js`
- UI revoke: `web/lib/use-google-access-verify.ts`, `web/app/components/access-revoked-banner.tsx` — Client detail, Overview, platform pages
- Charts: `web/app/components/platform-charts.tsx` + `platform-page.tsx` (dep: `recharts` in `web/`)
- Reports: `web/app/reports/[id]/page.tsx`, `web/lib/report-sections.ts` (`dynamicSectionNumbers`), print CSS in `globals.css`, `src/lib/reports.js` `buildAutoSummary`
- Brand: user-facing strings + `src/lib/session.js` cookie name

### Checklist impact
- Marked Done: Sync P0s, revoke standard, charts, reports polish, client copy, Webastral brand  
- Still Pending: bulk import, on-visit Sync, Agency vs Clients, Meta ops, cron, share token, Phase E  

### Smoke
1. Re-login (new cookie) → Agency; brand says Webastral  
2. Integrations Google Sync / Import  
3. Overview + Sync messaging  
4. `/platforms/ga4` charts  
5. Report → Export PDF; recommendations are client language  

### Do not
- Do not put Phase/roadmap language in client reports again  
- Do not invent a second “access dead” banner — use the standard  

---

## 2026-09-14 — Account / Integrations phases A–C

### Goal
Cursor-style account + Integrations: SSO ≠ data OAuth; hub; multi-Google identities.

### Done
- Phase A: Continue with Google (OIDC) for admin login; Settings link/unlink  
- Phase B: `/integrations` hub (services / google / bind); `/google-accounts` redirects  
- Phase C: `data_identities` + `connections.data_identity_id`; Add Google account  
- Meta data path code (ops/App Review still open)  
- Docs: `ACCOUNT_INTEGRATIONS_PLAN.md`, `DATA_LIFECYCLE_MULTI_EMAIL.md`  

### How (for replication)
- Auth identities vs data identities separated  
- Admin email for SSO match configured for portal admin Gmail  
- Cron Sync deferred  

### Checklist impact
- Phases 0 / A / B / C → Done; D ops + E pending  

### Smoke
- Password or Google SSO login  
- Integrations Connect Google → inventory → Import  
- Overview numbers after Sync  

### Do not
- Do not treat SSO as GA4/Ads connect  

---

## 2026-09-11 — Dashboard / Google trust audits

### Goal
Harden Google trust and navigation after multi-agent audits.

### Done
- Probe-before-ACTIVE; no silent Connected; soft-fail; Ads isolation  
- Agency Google apply/heal rules; research hubs  
- Docs: `DASHBOARD_AUDIT-2026-09-11.md`, `STANDARDS_MULTI_GOOGLE_PLAN.md`, `NAVIGATION.md`  

### How
- See audit docs for P0 list; trust over feature velocity  

### Checklist impact
- Fed into Phase 0 harden + later multi-identity plan  

---

## 2026-09-10 — Merge + handoff baseline

### Goal
Searchly Next UI + Express API merged; first live Google OAuth path.

### Done
- `npm run dev` = :3000 + :4000  
- Client/website hierarchy; Integrations; Sync snapshots  
- Handoff: `docs/HANDOFF-2026-09-10.md`  

### How
- Stack: Next `web/` + Express `src/` + SQLite  

### Smoke
- Login → Connect Google → Sync → Overview  

---
