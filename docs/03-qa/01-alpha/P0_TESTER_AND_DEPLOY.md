# P0 — Internal tester pass · Meta redirect · durable Postgres · browser smoke

**Updated:** 2026-09-21  
**Owner checklist:** `docs/01-core/01-shipping/ACCOUNT_INTEGRATIONS_PLAN.md` (P0 section)

Goal: make Webastral safe to hand to **internal / Meta app role** testers. External client Business Managers still need Meta App Review.

---

## 1. Meta redirect URI (local — confirmed in repo)

| Layer | Value |
|-------|--------|
| Code default | `http://localhost:3000/auth/meta/callback` (`src/lib/meta/oauth.js`) |
| `.env.example` | same |
| Local `.env` | must equal that string (machine check: set and matches default) |

**You must still confirm in Meta Developer Console** (Facebook Login for Business → Valid OAuth Redirect URIs):

1. Open https://developers.facebook.com/apps → your Webastral app  
2. Facebook Login for Business → Settings  
3. **Valid OAuth Redirect URIs** includes exactly:  
   `http://localhost:3000/auth/meta/callback`  
4. App mode = **Development**  
5. Each tester is an **app role** (Administrator / Developer / Tester)  
6. Scopes stay `ads_read` + `business_management` only  

When you get a staging host, add a second URI, e.g. `https://YOUR_HOST/auth/meta/callback`, and set `META_REDIRECT_URI` to that same URL (Google: same pattern with `GOOGLE_REDIRECT_URI`).

**Status:** code/env **aligned for localhost** · Meta Console checkbox = **human** (below).

- [ ] Meta Console redirect URI matches localhost (or staging)  
- [ ] Testers added as Meta app roles  

---

## 2. Internal tester pass (human)

Prereqs: `npm run db:pg:start` (leave running) · `npm run dev` · Meta + Google `.env` set.

| # | Step | Pass? |
|---|------|-------|
| 1 | Login (password or Continue with Google) → **Agency** | [ ] |
| 2 | Brand shows **Webastral** | [ ] |
| 3 | Integrations → Google Connect → Sync → Import or Link one property | [ ] |
| 4 | Overview loads; header **Sync** works | [ ] |
| 5 | `/platforms/ga4` and `/platforms/gsc` charts | [ ] |
| 6 | Report → Export PDF | [ ] |
| 7 | Meta Connect → Sync accounts | [ ] |
| 8 | Meta → **Create client & link** (enter website URL) → Clients shows **Meta** badge | [ ] |
| 9 | Overview / Meta page has data for that client | [ ] |
| 10 | Link Meta onto a **Google**-imported client → origin stays **Google** | [ ] |
| 11 | Phone width: hamburger opens full nav | [ ] |

Mark all `[x]` in `ACCOUNT_INTEGRATIONS_PLAN.md` smoke section when done.

---

## 3. Durable / prod Postgres (recommended path)

Local embedded PG (`npm run db:pg:start` → `data/pg-utf8` on **5434**) is fine for **solo Dev**. It is **not** durable for shared testers or a public URL (laptop sleep / wipe = data loss).

### Recommended staging stack (post-SQLite)

| Piece | Host | Why |
|-------|------|-----|
| Postgres | **Neon** / **Supabase** / **Railway Postgres** (free tier OK) | Managed, backups, `DATABASE_URL` |
| API (`src/` Express) | **Railway** or **Render** (one always-on or sleep-OK service) | Needs long-lived process + env |
| UI (`web/` Next) | **Vercel** or same host as API | Proxies to API |

**Do not** use file SQLite on serverless. Prefer Postgres everywhere testers share.

### Cutover steps (staging)

1. Create a managed Postgres database; copy the connection string.  
2. Set on the API host:  
   - `DATABASE_URL=postgresql://…`  
   - `AUTH_SECRET`, `APP_ENCRYPTION_KEY` (stable — rotating encryption key forces reconnects)  
   - `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI=https://YOUR_PUBLIC_WEB/auth/meta/callback`  
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI=…`  
   - `APP_URL` / public web origin as used by OAuth  
3. Deploy API; on boot `migrate()` creates schema + seeds `integration_providers`.  
4. Optional: dump local data → restore to managed PG (only if you need existing clients).  
5. Add Meta + Google OAuth redirect URIs for the **public** web origin.  
6. Probe: `GET https://API_HOST/api/health` → `{ ok: true, db: "up" }`  
7. Restart the API once — clients still present.

**Status:** runbook ready · **provisioning still manual** (no host credentials in repo).

- [ ] Managed Postgres provisioned  
- [ ] API + web env pointed at it  
- [ ] OAuth redirects updated for public URL  
- [ ] Health + restart persistence verified  

---

## 4. Browser / API smoke (automation)

| Check | How | Status |
|-------|-----|--------|
| Schema + APIs | `npm run smoke:pg` | Expect **25/25** when API+PG up |
| Health | `GET /api/health` | Must be `db: up` |
| Full UI paths | Human table in §2 | Pending human |

---

## 5. Definition of “P0 done”

- [x] Meta localhost redirect code/env consistent  
- [ ] Meta Console URI + tester roles confirmed  
- [ ] Tester table §2 fully checked  
- [ ] Staging uses managed Postgres (not only laptop `data/pg-utf8`)  
- [ ] OAuth redirects work on staging host  

Then mark P0 items in `ACCOUNT_INTEGRATIONS_PLAN.md` and continue with **P1** → `docs/03-qa/01-alpha/P1_OPS_AND_POLISH.md`.
