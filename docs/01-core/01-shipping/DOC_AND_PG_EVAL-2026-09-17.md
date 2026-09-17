# Doc + post-Postgres evaluation — 2026-09-17

**Purpose:** Full pass of `docs/` against live code and the local PostgreSQL cutover.  
**Live check (this session):** embedded PG on **5434** recovered from unclean shutdown; `db:verify` OK; `db:verify-queries` ALL PASSED; `GET /api/health` → `db: up`; `npm run smoke:pg` → **23/23**.

Related: `DEV_LOGBOOK.md`, `ACCOUNT_INTEGRATIONS_PLAN.md`, `PHASES.md`.

---

## 1. What is true now (stack)

| Piece | Where | Port / URL | Status this session |
|-------|--------|------------|---------------------|
| Next UI | `web/` | http://localhost:3000 | Up (login HTML 200). Earlier in the same terminal: proxy **ECONNREFUSED :4000** while API was down. |
| Express API | `src/index.js` | http://localhost:4000 | Up now. Health `{ ok, db: "up" }`. Mounts only `routes/google`, `routes/meta`, `routes/api`. |
| Embedded Postgres | `data/pg-utf8/` via `npm run db:pg:start` | **127.0.0.1:5434** | Ready after crash recovery. `DATABASE_URL` rewritten into `.env`. |
| Canonical DDL | `db/schema.postgres.sql` | applied by `src/lib/db.js` `migrate()` | Live. |
| Legacy SQLite DDL | `db/schema.sql` | unused at runtime | Stale vs PG (missing tables). |
| SQLite data backup | `db/app.sqlite` (gitignored) | `npm run db:migrate-sqlite` | One-shot copy only. |
| Docker compose | `docker-compose.yml` (PG 16 on **5432**) | not used by `npm` scripts | Present but **out of the local path**. Docs still say “no Docker”. |

`npm run dev` already starts `pg` + wait + api + web. `npm start` / `npm run setup` do **not** start Postgres — that is why “UI up / API down / login spinner” happens if someone runs only the web process.

---

## 2. Data after migration (live counts)

| Table | Rows | Notes |
|-------|------|--------|
| `users` | 2 | Seed + real admin |
| `auth_identities` | 1 | Google SSO linked |
| `clients` | 10 | Migrated portfolio |
| `websites` | 10 | 1:1 with clients |
| `data_identities` | 2 | Google + Meta |
| `connections` | 28 | 11 ACTIVE, 3 NEEDS_REAUTH, 14 PENDING_SELECT |
| `metric_snapshots` | 273 | KPIs numeric after pg-worker type parsers |
| `reports` | 6 | `/api/reports/1` smoked |
| `notifications` | 31 | `WEBSITE` layer constraint OK |
| `admin_google_tokens` | 1 | Agency Google |
| `admin_meta_tokens` | 1 | Agency Meta |
| `website_onboarding` | **0** | Table exists; no product UI writes it |
| `client_invites` | **0** | Table exists; invite routes unmounted |

SQLite → PG copier (`scripts/migrate-sqlite-to-pg.js`) only copies the 11 core tables above the line. It never copies `website_onboarding` / `client_invites` (those were also missing from `db/schema.sql`).

---

## 3. Why things “are not” (root causes)

### A. Login / session looked dead

**Where:** Next `web/` proxy → `127.0.0.1:4000/api/session`.  
**Why:** API process was not listening. Postgres *was* up. UI cannot talk to PG directly.  
**Now:** API is up; health and session smoke pass. If it happens again: one `src/index.js` on :4000, plus `db:pg:start`.

### B. Unclean PG shutdown

**Where:** `data/pg-utf8` cluster log: “database system was not properly shut down”.  
**Why:** Embedded PG is a long-lived Node process; killing the terminal / crash leaves WAL recovery. Cluster recovered; not data loss this time.  
**Do not:** commit `data/pg-utf8/` or stop PG by killing the window without Ctrl+C.

### C. Onboarding / invites look missing

**Where (schema):** `db/schema.postgres.sql` (`website_onboarding`, `client_invites`).  
**Where (code):** `src/routes/websites.js` (EJS `res.render`), `src/lib/invites.js`.  
**Why not live:** `src/index.js` never mounts those routers. Next app uses `src/routes/api.js` website CRUD only. `views.js` *is* live (agency/client overview) despite `LEGACY_UNMOUNTED.md` saying otherwise. Empty tables are expected, not a failed migration.

### D. SQLite SQL still in app code

**Where:** many `datetime('now')` / `ON CONFLICT(...)` in `src/lib/*`.  
**Why it still works:** `src/lib/pg-adapter.js` `rewriteSql()` maps `datetime('now')` and `date('now', …)` to Postgres. Agency `date('now', '-N days')` was also replaced in `views.js`.  
**Why the checklist still says “SQL audit”:** rewrite is a compatibility layer, not a rewrite of every statement. Residual risk on new SQL that the rewriter does not cover.

### E. Dual schema files

**Where:** `db/schema.sql` (SQLite: `PRAGMA`, `COLLATE NOCASE`, no `admin_google_tokens` / onboarding / invites) vs `db/schema.postgres.sql` (live).  
**Why:** cutover added a PG file; the old file was not brought to parity. Runtime uses only the PG file. Docs that still say “full DDL: `db/schema.sql`” are wrong.

### F. Docker file vs “no Docker” docs

**Where:** `docker-compose.yml` maps **5432**; local embedded uses **5434**.  
**Why it is not the local setup:** Windows path was chosen as `embedded-postgres` so nobody needs Docker Desktop. Compose is unused leftover. Pointing `DATABASE_URL` at 5432 with no container → connect fail.

### G. `npm start` / `setup` vs `dev`

**Where:** `package.json`.  
**Why prod-style start fails locally:** `start` = api+web only. `setup` = `db:init` with no wait for PG. Local happy path is `db:pg:start` then `db:init` / `dev`.

---

## 4. Documentation evaluation (every labeled folder)

Legend: **Current** = still true · **Stale** = contradicts code · **Archive OK** = historical on purpose.

### 01-core / 01-shipping — Current, needs today’s log

| File | Verdict |
|------|---------|
| `DEV_LOGBOOK.md` | Current. Second 2026-09-16 PG entry was missing a `##` heading (fixed this day). |
| `ACCOUNT_INTEGRATIONS_PLAN.md` | Master checklist current. **§2 Research** still describes pre-ship world (password-only login, Meta stub). Treat §2 as history; trust the top checklist. |
| `PHASES.md` | Phases A–C Done, D ops open, E pending. Does not mention Postgres (should). |
| This eval | New 2026-09-17 |

### 01-core / 02-requirements — Current product, stale paths

| File | Verdict |
|------|---------|
| `SRS.md` | Requirements still the product law. Cross-links `docs/METRICS.md` etc. without the numbered folders. Hierarchy still says website URL lives on Client (FR-24) while code is Client → Website. |

### 01-core / 03-product-ux — Mixed

| File | Verdict |
|------|---------|
| `NAVIGATION.md` | Current (agency / integrations / revoke). One leftover: OAuth error still mentions `/google-accounts?google_error=`. |
| `IA.md` | Stale sketch: “Meta Ads (soon)”, “Import from Google” under Clients. |
| `NAMING.md` | Current (Webastral, revoke path). |
| `DESIGN.md` / `ONBOARDING.md` | Useful; relative `docs/METRICS.md` links broken after folder move. Onboarding doc describes a flow the Next UI does not run (`website_onboarding` unused). |

### 01-core / 04-integrations — Mixed

| File | Verdict |
|------|---------|
| `STANDARD_GOOGLE_ACCESS_REVOKED.md` | **Current law.** Keep. |
| `INTEGRATIONS.md` | Pattern still right (probe before Connected). Paths `docs/ONBOARDING.md` broken. Catalog still talks `/websites/:id/integrations` (now hub `/integrations`). |

### 01-core / 05-data-api — Stale presentation, live pipeline

| File | Verdict |
|------|---------|
| `METRICS.md` | Field meanings still useful. |
| `API_VIEW_MAP.md` | Pipeline still true (snapshots → views). Wrong: `db/schema.sql`, “EJS pages”, `src/lib/integrations/*`. Live UI is Next `web/`; live schema is `schema.postgres.sql`. |
| `NOTIFICATIONS.md` | Still useful; schema pointer is SQLite. |

### 01-core / 06-engineering — **Wrong “current truth”**

| File | Verdict |
|------|---------|
| `LEGACY_UNMOUNTED.md` | Half-right. Unmounted: `auth.js`, `clients.js`, `websites.js`, `overview.js`, `dashboard.js`, `misc.js`, `notifications.js`, `invites.js`. **Wrong:** lists `src/lib/metrics/views.js` as unused — it is required by `routes/api.js` (agency/client overview). `website_onboarding` is in PG schema, not “contradicts Admin-only”. |

### 02-product-plans — Research, not runtime

Google-identity / websites plans: keep as design history. They still say `/google-accounts`, `db/schema.sql`, “metrics into SQLite”. Do not treat as setup instructions.

### 03-qa — Alpha pack **pre-Postgres**

`ALPHA_TEST-2026-09-16.md` still grades free deploy as **SQLite volume / WAL / `db/app.sqlite`**. That P0 is superseded: prod must be **managed Postgres (`DATABASE_URL`)**, not a SQLite disk. Scale notes (bulk cap 80, no cron, sequential Sync) still apply.

### 04-audits-archive — Archive OK

Handoffs / portal audits / research: SQLite, `/google-accounts`, Astralytics, “no commits yet”. Do not update except to add a one-line “superseded by PG cutover” if someone is confused. Broken relative links (`docs/IA.md`) expected.

### Operator files (not under `docs/`)

| File | Verdict |
|------|---------|
| `Engineering.md` | Setup is PG-correct. Revoke path still `docs/STANDARD_GOOGLE_ACCESS_REVOKED.md` (file moved). |
| `README.md` | Quick start OK. Port table says Postgres **5432** (wrong for embedded; that’s Docker). Layout still `db/schema.sql`. Scripts table omits `db:pg:start` / `smoke:pg`. |
| `.env.example` | Correct (5434 comment, empty `DATABASE_URL`). |
| `/replicate-webastral` | Did not mention waiting for PG; stack line was only `npm run dev`. |

---

## 5. Post-migration: present vs missing vs pending

### Present (use these)

- `db/schema.postgres.sql` + `src/lib/db.js` + `pg-adapter.js` / `pg-worker.js`
- `scripts/start-embedded-pg.js`, `wait-for-pg.js`, `init-db.js`, `verify-pg.js`, `verify-pg-queries.js`, `migrate-sqlite-to-pg.js`, `smoke-pg-apis.js`
- Migrated clients / snapshots / identities / reports
- API smoke 23/23 on Agency, clients, overview, platforms, reports, integrations

### Missing or not wired (and why)

| Gap | Where it lives | Why it is not live |
|-----|----------------|--------------------|
| Prod / free-host Postgres | Checklist pending | Local cluster is `data/pg-utf8` (gitignored, dies with the machine). Alpha still tells people to volume-mount SQLite. |
| Browser product smoke | Checklist smoke list | Script smoke ≠ clicking Login → Agency → Overview → PDF. |
| Native PG SQL | `src/lib/*.js` | Adapter rewrites SQLite functions; not a full SQL rewrite. |
| `website_onboarding` rows + UI | schema + unmounted `routes/websites.js` | Next never used EJS onboarding. |
| Client invites | `invites.js` unmounted | Admin-only; later SRS. |
| `db/schema.sql` parity | `db/schema.sql` | Dead file; not what `migrate()` reads. |
| Docker as documented local path | `docker-compose.yml` | Intentionally unused locally. |
| `npm start` starts PG | `package.json` | Only `dev` includes `db:pg:start`. |
| Cron / on-visit Sync | Phase 1 / E | Unchanged product gap, not a migration bug. |
| Meta App Review | Phase D | Code + Dev Connect exist; external BMs do not. |

### Not missing (false alarms)

- Data “lost” — 10 clients, 273 snapshots, 6 reports are in PG.
- `website_onboarding` empty — never part of the SQLite product path.
- Dual schema — PG file is canonical; SQLite file is leftover.

---

## 6. Smoke this machine actually ran

```
npm run db:verify          → tables OK; users=2 clients=10
npm run db:verify-queries  → ALL PASSED (overview, KPIs, COUNT/FLOAT8, onboarding table)
GET http://127.0.0.1:4000/health → db: up
npm run smoke:pg           → 23/23
```

Not run this pass: browser login, Integrations OAuth, header Sync, Export PDF.

---

## 7. Safe next steps (do not mix)

1. **Keep using** one API + `npm run db:pg:start` (or `npm run dev` which starts both).
2. **If login fails with proxy errors** — start API; do not re-run SQLite migrate (that wipes PG tables then copies sqlite).
3. **Docs to treat as current:** this file, logbook, checklist top, revoke standard, Engineering setup block.
4. **Docs to ignore for setup:** alpha SQLite deploy, `LEGACY_UNMOUNTED` on `views.js`, `API_VIEW_MAP` EJS, compose 5432 unless you actually run Docker.
5. **Product pending (unchanged):** Postgres prod, on-visit/cron Sync, Phase D ops, Phase E, share-link reports.
