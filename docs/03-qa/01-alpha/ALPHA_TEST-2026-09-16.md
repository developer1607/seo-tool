# Webastral — Alpha test report (2026-09-16)

Multi-agent alpha: **flow/logic**, **bugs**, **responsive**, **scale + free deploy**.  
Live HTTP smoke was **blocked** (API not running in this session) — code-trace + static QA only. Run `npm run smoke:ui` / `smoke:full` locally after `npm run dev`.

Agents: flow [Flow](0a0b7535-0855-4910-8a19-68c413a3ea08) · responsive [Responsive](ce65680e-e523-4f3d-b1c9-9ed77b5c4b4b) · deploy [Deploy](6a956083-87fd-4064-85ad-dcc7c0a21826) · bugs [Bugs](d6d4ce76-8c1c-498d-9f85-36822c432d50)

---

## Verdict

**Alpha-ready for internal free deploy with constraints** — not yet “big traffic” ready without ops hardening.

| Area | Score | Notes |
|------|-------|--------|
| Core Google data path | B | Connect → discover → import/bulk → Sync → Overview is coherent in code |
| Reports / PDF | B+ | Print PDF works; brand sanitised; print-color-adjust added |
| Honesty (Connected / revoke) | B | Standard exists; verify on client/overview/platforms |
| Responsive mobile | B | Hamburger drawer restores full nav + subnav at ≤760px |
| Scale (large site portfolios) | C | SQLite + sequential bulk OK for tens of properties; not hundreds without caps/queues |
| Free deploy ops | C+ | Health OK; P0 = persistent SQLite volume; prefer Vercel UI + Railway API+disk |

---

## Flow scorecard (code-trace)

| Flow | Result |
|------|--------|
| Login → `/agency` | PASS (code) |
| Connect Google → discover → bulk GA4/GSC | PASS (code) — cap 80/run |
| Ads link + Sync + Overview | PASS (code) — Ads not in bulk |
| Platform charts from snapshots | PASS (code) |
| Report generate → numbered sections → Export PDF | PASS (code) |
| Access revoked → Remove client | PASS (code) |
| Multi Google identity picker | PASS (code) |
| Live smoke (`smoke:ui`) | FAIL this session — `ECONNREFUSED` (start `npm run dev`) |

---

## Bugs found (prioritised)

### Fixed in this pass
- [x] `/health` + `/api/health` for free-host probes  
- [x] Bulk import hard cap **80** properties/run  
- [x] Report brand CSS injection guard (`#RRGGBB` only)  
- [x] Print colour adjust for branded PDF  
- [x] Report KPI grid → 1 column under 520px  
- [x] Hostname match prefers indexed `LIKE` before full table scan  
- [x] **Mobile nav drawer** — hamburger + scrim + full sidebar/subnav (≤760px)  
- [x] Deduped `guessUrlFromGsc` (single export from `importAsset.js`)  

### Still open — P0
1. **Confirm free-host SQLite volume** — without a persistent disk, `db/app.sqlite` resets on every sleep/redeploy (data loss).  

### Still open — P1
2. Bulk `linkExtra` soft-fails can still mark parent import OK when paired GSC fails  
3. Mobile tap targets ~30–36px outside drawer (aim ≥44px on dense tables)  
4. Topbar fixed height vs wrap (verify after CSS tweak)  
5. No request timeout on bulk import UI  
6. Session expiry not re-validated against `exp` in middleware (cookie maxAge only)  

### Still open — P2 / scale
7. Sequential Sync across many websites will hit free-tier CPU timeouts  
8. Discover Ads list capped (~40) — large MCCs incomplete  
9. No cron / on-visit Sync yet — stale KPIs on large portfolios  
10. No rate limit on login / OAuth  
11. Overview Phase-3 placeholders still show internal admin chrome (OK for admin UI; keep out of client PDF — already fixed for reports)

---

## Large / high-traffic website organisation

**What “big traffic” means here:** many properties under one Google login, long date ranges, lots of `metric_snapshots` rows — **not** millions of public web visitors (this is an admin tool).

| Practice | Status |
|----------|--------|
| Indexes on snapshots/connections | Present (`src/lib/db.js`) |
| WAL journal | Present |
| Unique (website, source, date) | Present |
| Bulk import cap | **80** (new) |
| Hostname attach (no duplicate clients) | Present |
| Sync batching / queue | Missing — Sync one site at a time via header |
| Pagination on inventory / clients | Weak — full lists in UI |
| Payload/query breakdowns | Not synced (`payload_json` still `{}`) |

---

## Free deploy recommendation

From [Deploy](6a956083-87fd-4064-85ad-dcc7c0a21826) ops alpha:

**Least-bad free alpha path:** `web/` on **Vercel** + Express API on **Railway trial** with a **persistent disk** for `db/app.sqlite` (matches split in `web/next.config.ts`). Single-process, single-region API only — not serverless multi-instance (SQLite contention).

**Alternative:** one container/VM (Railway / Fly / Render) running both Next + Express with disk at `db/`.

**Avoid:** file-backed SQLite on Vercel/Cloudflare serverless; Render free without durable disk; promising “truly free long-term” without a volume.

**Update 2026-09-21:** product DB is **PostgreSQL** (`DATABASE_URL`). For shared testers / public URL use **managed Postgres** (Neon / Supabase / Railway), not laptop embedded `data/pg-utf8`. Full P0 steps: [`P0_TESTER_AND_DEPLOY.md`](./P0_TESTER_AND_DEPLOY.md).

**P0 before sharing a public URL**
1. Managed Postgres + `DATABASE_URL` on the API (survive restart/redeploy)  
2. Env: `AUTH_SECRET`, `APP_ENCRYPTION_KEY`, public web origin, `GOOGLE_*`, `META_*`, `PORT` (changing encryption key forces reconnects)  
3. Probe: `GET /api/health` → `{ ok: true, db: "up" }`  
4. OAuth redirect URIs match public web origin (`GOOGLE_REDIRECT_URI`, `META_REDIRECT_URI`)  
5. Single API instance against one DB is fine; no SQLite on serverless  

**Scale hardening (before large portfolios / long ranges)**
- Cap/paginate snapshot reads (`metrics/views.js` currently loads full ranges into memory)  
- SQL aggregates instead of `SELECT *` + JS filter where possible  
- Transaction + single-flight lock per website/provider sync; chunk long date windows  
- Keep bulk cap; don’t auto-sync every imported site at high count  
- Rate-limit login / OAuth / import; backup managed Postgres  

**Ops rule:** keep **≤30–50 websites** active on free tier; Sync sites you care about; chunk Import all past ~80.

---

## Alpha test checklist (manual — run before sharing URL)

Use the fuller sheet: [`P0_TESTER_AND_DEPLOY.md`](./P0_TESTER_AND_DEPLOY.md).

- [ ] `npm run dev` → login → Agency  
- [ ] Brand **Webastral**  
- [ ] Connect Google → Sync accounts → **Import all available** (or ≤80 selected)  
- [ ] Open a client → Overview → header Sync  
- [ ] `/platforms/ga4` charts  
- [ ] Generate report → Export PDF  
- [ ] Meta → **Create client & link** → Clients **Meta** badge  
- [ ] Phone width: ☰ opens full nav  
- [ ] `curl https://YOUR_API/api/health` → `{ ok: true }`  
- [ ] Restart host once — **clients still there** (managed PG OK)

---

## Next engineering order (post-alpha)

1. Confirm host + volume + env (P0 deploy)  
2. Harden bulk linkExtra honesty (P1)  
3. On-visit Sync / cron (pending product)  
4. Inventory pagination for large Google accounts  

Logbook / checklist updated separately when these ship.
