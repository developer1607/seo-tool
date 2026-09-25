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

## 2026-09-25 — AgencyAnalytics SEO sections (fillable data)

### Goal
Wire Overview + saved reports to AgencyAnalytics SEO template sections we can fill from GSC / GA4 / Ads / Meta.

### Done
- Overview sections: summary, goals, search visibility, keyword rankings, GSC top queries, GA4 traffic + source mix, conversions, paid, recommendations
- Removed empty Phase 3 backlink / CWV / competitor tables from Overview
- `/overview` and `/reports/:id` return `keywords`, `topQueries`, `trafficMix`
- Report catalog: keywords = Phase 1, default on; tables render on saved report
- Design ref doc points at `refrence-report-ui.html`
- **AA light-report colours/pattern** on Overview (`.seo-report`) + green/red keyword deltas on saved reports
- **Redo:** Overview = AgencyAnalytics **card grid** (stacked rankings + 2×2 + Visibility + gauges) via `seo-aa-dashboard.tsx` — matches screenshot layout, not document sections
- Fixed Rankings chart height (Recharts); platforms + saved reports moved to `.aa-card` theme + AA chart colors

### How (for replication)
- Helpers: `buildKeywordRowsWithCompare`, `buildTopQueries`, `buildTrafficMix` in `src/lib/google/trackedKeywords.js`
- API: `seoReportExtras()` in `src/routes/api.js`
- UI: `web/app/page.tsx`, `web/app/reports/[id]/page.tsx`; catalog sync `src/lib/reports.js` + `web/lib/report-sections.ts`
- Styles: `.seo-report*` block in `web/app/globals.css`; ref shots under `docs/design-mocks/ref-shots/`

### Checklist impact
- Dashboards & reports → Overview AA-style + keyword/top-query tables Done (`ACCOUNT_INTEGRATIONS_PLAN.md`)

### Smoke
- Pick website with synced GSC → `/` keyword + top query tables populate
- Generate report with defaults → open report → Keyword rankings + GSC top queries

### Do not
- Backlinks / SERP features / site audit / competitor pack (no connectors yet)
- GA4 organic-only channel filter (still all-channel sessions)

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

## 2026-09-25 — GSC top-10 + custom keywords

### Goal
Cap Search Console keywords to top 10 and let users add/remove custom tracked keywords.

### Done
- Auto keywords capped at 10 (sync payload + platform table)
- `website_gsc_keywords` table: `custom` (track) / `hidden` (suppress auto)
- APIs: `POST/DELETE /api/platforms/gsc/keywords`
- GSC platform UI: add form + Remove per row; custom badge
- Sync pulls metrics for custom keywords via GSC query filters

### How (for replication)
- `src/lib/google/trackedKeywords.js`, `gsc.js`, `sync.js`
- `src/routes/api.js` platform gsc keyword routes
- `web/app/components/platform-page.tsx` + `globals.css`
- Schema: `db/schema.postgres.sql` (+ legacy `schema.sql`); `migrate()` calls `ensureTable()`

### Checklist impact
- Polish under GSC platform UX (no new Phase gate)

### Smoke
- Open `/platforms/gsc` → confirm ≤10 auto rows → Add a custom keyword → Remove it → Remove an auto row (hides) → Sync header and confirm custom metrics return after re-add

### Do not
- Overview “Keyword ranking update” Phase 3 placeholder unchanged

---

## 2026-09-24 — Same GA4 account → one client

### Goal
Stop creating a separate client for each GA4 property under the same Analytics account.

### Done
- Single / bulk GA4 import attaches sibling properties as websites on the existing client for that account.
- UI: “Add as website”; passes `ga4_account_id`; client name uses account name.
- Prefer **Import client with all websites** for multi-property accounts.

### How (for replication)
- `src/lib/google/importAsset.js` — `findClientIdForGa4Account`, `uniquifyWebsiteUrl`.
- `src/routes/google.js` + `web/app/integrations/google-inventory.tsx`.

### Smoke
- Import one Dingbats property → then Add as website on a second → same client, two websites.
- Or Import client with all websites (5) → one client, five websites.

### Do not
- Does not auto-merge already-duplicated clients; delete extras manually if needed.

---

## 2026-09-24 — GA4 import without web stream URL

### Goal
Allow “Import client with all websites” when GA4 properties have no `defaultUri` (e.g. Dingbats regional properties).

### Done
- URL resolve order: web stream → GSC domain/name match → unique `ga4-pending.local` placeholder.
- Account import creates **one website per GA4 property** (no host collapse for regional props).
- Inventory copy clarifies missing stream URL does not block import.

### How (for replication)
- `src/lib/google/resourceMatch.js` — `findGscByNameTokens`, `placeholderWebsiteUrl`.
- `src/lib/google/importAsset.js` — `resolveGa4WebsiteUrl`, `findWebsiteByGa4Property`.
- `web/app/integrations/google-inventory.tsx` — label text.

### Smoke
- Integrations → Dingbats Notebooks → Import client with all websites (5) → Client Details shows 5 websites; GA4 links ACTIVE.

### Do not
- No schema change (Client → many Websites already supported).

---

## 2026-09-24 — Client/website switcher always active

### Goal
Make Website an active dropdown relative to Client (top bar + Generate Report) so multi-site clients are easy to switch.

### Done
- Top-bar Website is always a `<select>` for the selected client (no longer a static label for single-site clients).
- Generate Report form has Client + Website side by side; changing Client loads that client's sites and updates session.
- Form stays in sync with top-bar selection.

### How (for replication)
- `web/app/components/client-website-switcher.tsx` — always render website select from session `websites`.
- `web/app/reports/generate/page.tsx` — website field + `selectClient` / `selectWebsite` on change.
- `web/app/globals.css` — drop unused `.topbar-context-static`.

### Smoke
- Workspace → Generate Report → change Client → Website list updates → switch Website → preview URL updates.
- Top bar: pick a multi-website client → Website dropdown lists all URLs.

### Do not
- No API/schema change.

---

## 2026-09-24 — Multi-site Google account import

### Goal
Import one GA4 account as one client with multiple websites/properties, while keeping Overview/platform/report pages website-scoped.

### Done
- GA4 discover now exposes account groups with `accounts/{id}`, properties, and stream URLs.
- Shared ID/domain-first matching for GA4, Search Console, and Ads.
- New `POST /integrations/google/import-account` creates/updates one client and links all selected properties as websites.
- Integrations Google inventory shows GA4 grouped by account with **Import client with all websites**.
- Platform/report pages stay on `selectedWebsite`; Client Details remains the multi-website rollup.

### How (for replication)
- `src/lib/google/ga4.js` — `listGa4AccountGroups`, account/property IDs, stream URLs.
- `src/lib/google/resourceMatch.js` — domain/ID scoring helpers.
- `src/lib/google/importAsset.js` — `importGoogleAccount`.
- `src/routes/google.js` — discover `ga4Accounts` + import-account route.
- `web/app/integrations/google-inventory.tsx` — account-grouped import UI.

### Smoke
- Integrations → Google → open GA4 accounts → Import client with all websites.
- Client Details shows each website; top website dropdown switches Overview/GA4/GSC/Ads context.

---

## 2026-09-24 — Complete Google ID-based discovery

### Goal
Make Google discovery consistent across GA4, Search Console, and Ads: IDs are the source of truth, names are display only, and large account inventories are not cut off.

### Done
- GA4 discovery now paginates all account summaries and data streams, so later-page properties like CRG are listed.
- Search Console continues to use `siteUrl` as the stable ID and permission source.
- Google Ads discovery no longer stops at the first 40 accessible customers; normalized customer IDs remain the stored key.

### How (for replication)
- `src/lib/google/ga4.js` — paginate `accountSummaries.list` and `properties.dataStreams.list`.
- `src/lib/google/ads.js` — remove the first-40 cap and discover all accessible direct/MCC child accounts with bounded concurrency.
- Client labels continue to show name plus ID; matching still prefers exact domain/stream URL first.

### Smoke
- Saved agency token `searcheno1@gmail.com` returns CRG GA4 `properties/533768888`, CRG GSC `https://www.crgtraffic.com.au/`, and Ads inventory without error.

---

## 2026-09-24 — Agency-only Google data access

### Goal
Simplify integrations: manual clients stay, but Google reporting data comes from agency/admin Google access only.

### Done
- Removed website-local/client Google OAuth entry points from the Integrations UI.
- Hid multi-Google add-account controls; Google inventory now presents one agency Google access path.
- Backend rejects stale `force=1` / `local=1` Google starts and old local-only callback states.
- Synced connections that were stale `PENDING_SELECT` now self-heal to `ACTIVE` when platform status is read.
- Header Sync now refreshes same-domain Google access from the saved agency OAuth token before syncing active Google/Meta data into snapshots.
- Google providers with no selected/matching resource now display as `ACCESS_NOT_GIVEN` instead of misleading `PENDING_SELECT`.
- Client Details now has inline Google resource dropdowns with names and IDs, so sync/access fixes happen on the client page instead of redirecting to Integrations.
- Google and Meta remain reporting providers; Meta account management stays available.

### How (for replication)
- `web/app/integrations/website-bindings.tsx` — only “Use agency Google” remains for website Google resources.
- `web/app/integrations/google-inventory.tsx` and `web/app/integrations/integrations-inner.tsx` — single agency Google copy/actions.
- `src/routes/google.js` — local website Google OAuth guard.
- `src/lib/clients.js` — status self-heal for previously synced pending connections.
- `web/app/components/admin-shell.tsx` — header Sync calls the combined access-refresh + data-sync endpoint.

### Checklist impact
- Google model changed from agency-or-local fallback to agency-only data access.

### Smoke
- `/integrations` → Google shows Connect/Manage/Reconnect agency Google only; no “Connect this site’s Google” or “Add Google account”.
- Manually add/select a client → Website links → Use agency Google → choose matching GA4/GSC/Ads → sync.

### Do not
- Remove Meta reporting access; keep Meta provider UI.

---

## 2026-09-24 — Google import syncs companion access

### Goal
When a client is imported from Search Console or GA4, bring in the matching Google access and Search Console keywords by default.

### Done
- GSC import now best-effort matches GA4 by website hostname and links it to the same website.
- Google imports now sync every active Google provider on the website after companion links are activated.
- Website-level Google resource picker now prefers current/same-domain matches and leaves unrelated first-row accounts unselected.
- Saving GA4/GSC from the website picker now best-effort activates the same-domain companion before syncing all active Google sources.
- GSC keyword rows continue to come from synced Search Console query payloads.

### How (for replication)
- `src/lib/google/importAsset.js` — companion GA4/GSC discovery plus one combined website Google sync after import.
- `src/lib/google/sync.js` — `syncAvailableGoogleProviders()` for active Google connections on a website.

### Checklist impact
- Google data path expanded: Import GA4/GSC now syncs available companion access in one pass.

### Smoke
- Integrations → Google → Import a Search Console property with a matching GA4 web stream → open `/platforms/gsc` and verify KPIs + Top keywords; open GA4 and verify rows are synced.

### Do not
- Auto-link Ads by guess; Ads still needs explicit website/account confirmation.

---

## 2026-09-21 — P1 ops runbook + Phase E auth polish

### Goal
Start P1: Meta App Review / Google verify operator path + Phase E login rate limit and change password.

### Done
- Runbook: `docs/03-qa/01-alpha/P1_OPS_AND_POLISH.md` (Meta BV/App Review, Google verification, staging vs prod OAuth)
- Login rate limit (8 / 15 min / IP) on `POST /api/login` and EJS `POST /login`
- `POST /api/account/password` + Settings → Change password (logged-in; email reset deferred)
- `.env.example` note for staging/prod redirect URIs

### How (for replication)
- `src/lib/rateLimit.js` — in-memory sliding window; `rateLimitMiddleware` + `take`/`clientKey`
- Settings form posts `{ current_password, new_password }` (min 10)
- Human Calendar items stay unchecked in master checklist until Consoles complete

### Checklist impact
- P1 Phase E → **[~]** (rate limit + change password Done; email reset + OAuth ops open)
- Phase D ops / Google verify still open (runbook only)
- `PHASES.md` Phase E row updated

### Smoke
- Fail login 9× → 429 message
- Settings → Update password → logout → login with new password
- Open P1 runbook §1–§3 and tick Console work as you go

### Do not
- Email “forgot password” mailer
- Meta App Review submission from code (ops only)
- Employee ACL UI / cron Sync

---

## 2026-09-21 — Meta KPI verify (import + wider backfill)

### Goal
Confirm Meta Console redirect string, import a real spent ad account, prove KPI JSON + snapshots.

### Done
- Redirect to paste: `http://localhost:3000/auth/meta/callback`
- Root cause of “empty Meta”: sync used last_30 while spend was older — Meta import now backfills **last_365**; default Meta sync **last_90**; presets `last_90` / `last_365` added
- Insights store `reach` + `payload_json` (actions/cpc/cpm)
- Imported **Anayiah Grewal** (`act_2009020426510342`) → client **18** origin **META** → **208** snapshot days, spend **~$2262**, imps **7.1M**, clicks **296k**
- `/api/platforms/meta?preset=last_365` returns full KPI set (spend, imps, clicks, reach, ctr, cpc, cpm) + daily rows with action JSON

### Still human
- Meta Developer Console: paste redirect URI + add tester roles
- UI: open client 18 → Meta → select Last 365 days

---


### Goal
Execute P0: confirm Meta localhost redirect, document durable Postgres, baseline API/browser smoke, give humans a pass sheet.

### Done
- Local Meta redirect: code + `.env` = `http://localhost:3000/auth/meta/callback`
- Runbook: `docs/03-qa/01-alpha/P0_TESTER_AND_DEPLOY.md`
- Alpha deploy notes switched from SQLite volume → **managed Postgres**
- `smoke:pg` **25/25**; login page browser smoke (Webastral title)

### Still human
- Meta Developer Console URI + app-role testers
- Full tester table (Create client & link, origin badges, PDF)
- Provision managed Postgres + staging OAuth redirects

---


### Goal
Reconcile master checklist with everything shipped (incl. Meta-only + provenance) and write a clear next approach for testers.

### Done
- Rewrote top of `ACCOUNT_INTEGRATIONS_PLAN.md`: grouped Done, P0–P3 Pending, **Next approach**, expanded smoke (Meta create+link + origin keep)
- Updated `PHASES.md` (Phase D + Phase 1b provenance)

### Checklist impact
- On-visit Sync moved fully under Done (was wrongly sitting in Pending)
- New P0: internal tester pass + Meta redirect confirm + prod Postgres
- Explicit: do not build employee portal / LinkedIn / cron until tester + App Review path is moving

---

## 2026-09-21 — Meta-only clients + expandable provenance schema

### Goal
Meta-only create+link (user supplies website URL), tag every client by first provenance, and open the schema so LinkedIn / TikTok / Microsoft can plug in later without CHECK rewrites. Log research + ACL stubs for future employee domain access.

### Done
- **Catalog-driven integrations:** `src/lib/integrations/catalog.js` + seeded `integration_providers` (Google / Meta enabled; LinkedIn / TikTok / Microsoft `enabled=0`)
- **Open TEXT keys:** dropped closed CHECKs on `clients.origin`, `connections.provider`, `metric_snapshots.source`, `client_sources.source`, `data_identities.provider`
- **Provenance:** `clients.origin` + `created_by_user_id`; `client_sources` (+ `family`, `meta_json`); `websites.primary_domain`
- **ACL stubs (no UI):** `user_client_access`, `user_domain_access`
- **Meta-only path:** `POST /integrations/meta/import` + Manage Meta → **Create client & link**
- **Write-path tags:** Manual / Google import / Meta create+link / Meta link-to-existing
- **UI:** Clients origin badges (Manual / Google / Meta / …)
- **Research doc:** `docs/01-core/05-data-api/PROVENANCE_AND_INTEGRATIONS_SCHEMA.md`

### How (for replication)
- Schema: `db/schema.postgres.sql` (+ `db/schema.sql` parity); migrate in `src/lib/db.js` + `clientProvenance.backfillProvenance`
- Helpers: `normalizeDomain`, `setClientOriginIfNew` (never overwrite non-MANUAL), `recordClientSource`
- Meta: `src/lib/meta/importAsset.js` (`importMetaAsClient`, `linkMetaToWebsite`); route in `src/routes/meta.js`
- Google / Manual: `src/lib/google/importAsset.js`, `POST /api/clients`
- UI: `web/app/integrations/meta-inventory.tsx`, `web/app/clients/page.tsx`, `origin-badge.tsx`

### Checklist impact
- Moved Meta-only + provenance → Done (`ACCOUNT_INTEGRATIONS_PLAN.md`)

### Smoke
- `npm run smoke:pg` (includes `schema/provenance`)
- Manual: Integrations → Meta → Create client & link → Clients shows **Meta** badge; link Meta onto Google client keeps origin **Google**

### Do not
- Do not re-add closed provider CHECKs
- Do not ship employee multi-tenant UI this pass (stubs only)

---

## 2026-09-18 — Meta integrations match Google hub

### Goal
Make Meta connect / inventory / link as fluid as Google (Ads-style: identity → list → link to website).

### Done
- Meta card: Connect / Manage / Add account / Reconnect / Disconnect (same pattern as Google)
- Manage Meta inventory: identity chips, Sync accounts, Available vs Linked, client+website picker, Link to website
- OAuth supports add / replace / reconnect; disconnect one identity without wiping others
- Website links: Choose Meta account picker + Save & sync (not only a bounce to Accounts)
- Needs reconnect honesty on the Meta status badge

### How (for replication)
- `src/lib/meta/oauth.js` — `connectMode` + `identityId` in OAuth state
- `src/lib/meta/agency.js` — identities default/disconnect + `needsReauth`
- `src/routes/meta.js` — `/accounts?identity_id=`, `/identities/default`, disconnect `identity_id`
- `web/app/integrations/meta-inventory.tsx` + hub card in `integrations-inner.tsx`
- Website picker: `website-bindings.tsx`

### Checklist impact
- Phase D Dev Connect already done; App Review / external BMs still pending
- No change to Postgres prod / cron / Phase E

### Smoke
1. Integrations → Connect Meta → lands on Manage Meta
2. Sync accounts → pick client + website → Link to website
3. Website links → Choose Meta account → Save & sync Meta
4. Add account keeps the previous Meta login

### Do not
- Meta App Review / Business Verification
- Bulk-import Meta like GA4 (Ads stay per-website, same as Google Ads)

---

## 2026-09-18 — On-visit Sync for performance pages

### Goal
Refresh stale linked sources when opening Overview / GA4 / GSC / Ads / Meta, without relying only on header Sync.

### Done
- `POST /api/integrations/sync-stale` syncs ACTIVE connections older than **6 hours** (or never synced)
- Overview refreshes all linked sources; each platform page refreshes that channel
- Cached KPIs stay on screen; header shows **Refreshing…** if the call takes >800ms, then **Updated …** or reconnect errors
- Header **Sync** still force-refreshes; Meta skipped when `.env` is unset; `NEEDS_REAUTH` is not retried
- `smoke:pg` includes dry-run of the new endpoint

### How (for replication)
- `src/lib/google/staleSync.js` — staleness + skip rules
- `src/lib/google/sync.js` — in-flight dedupe per website+provider
- `src/routes/google.js` — `POST /integrations/sync-stale` (`dry_run` for smoke)
- `web/app/components/admin-shell.tsx` — fires on performance routes; dispatches `webastral:synced` so pages reload snapshots

### Checklist impact
- On-visit Sync → **Done**
- Nightly / cron Sync still pending (day-to-day covered by on-visit)

### Smoke
1. Open Overview with a linked website whose last sync is >6h or empty → header may show Refreshing… then Updated GA4 · GSC (etc.)
2. Re-open immediately → silent (fresh); KPIs unchanged
3. Header Sync still force-refreshes
4. `npm run smoke:pg` includes `/api/integrations/sync-stale` dry_run

### Do not
- Cron / nightly job
- Sync on Agency / Clients / Settings
- Notify on every successful stale refresh

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
