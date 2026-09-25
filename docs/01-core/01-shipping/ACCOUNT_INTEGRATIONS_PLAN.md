# Account → Integrations plan (Cursor-style)

**Status:** In progress — Phases 0–C + Meta Dev path + provenance schema shipped; **internal testers OK**; external Meta BMs need App Review; prod Postgres + Phase E still open.  
**Updated:** 2026-09-24  
**Product:** Webastral — admin-only agency SEO/reporting  
**Goal:** Feel like Cursor: create/sign in to an account, then connect Google / Meta under **Integrations** — without confusing app login with data OAuth.

Related docs: `DEV_LOGBOOK.md`, `PHASES.md`, `DOC_AND_PG_EVAL-2026-09-17.md`, `../02-requirements/SRS.md`, `../03-product-ux/NAVIGATION.md`, `../03-product-ux/IA.md`, `../04-integrations/INTEGRATIONS.md`, `../04-integrations/STANDARD_GOOGLE_ACCESS_REVOKED.md`, `../05-data-api/PROVENANCE_AND_INTEGRATIONS_SCHEMA.md`, `../../02-product-plans/01-google-identity/`, `../../04-audits-archive/02-portal-audits/`.

---

## Master checklist (2026-09-21)

### Done — ship / use now

**Account & shell**
- [x] **Phase 0** — Single agency Google harden (`google_email` / `sub`, no promote, revoke on disconnect, read-only discover)
- [x] **Phase A** — Admin login: email/password **or** Continue with Google (OIDC); `auth_identities`; SSO ≠ data OAuth
- [x] **Admin identity** — Portal admin email set for SSO match (`searcheno1@gmail.com`)
- [x] **Login landing** — post-login → `/agency` (not Overview)
- [x] **Header client chrome** — switcher + Sync only on Overview / platforms / reports / integrations / client detail
- [x] **Sidebar order** — Agency → Setup → Performance
- [x] **Brand rename** — **Webastral**; session cookie `webastral_session`
- [x] **Mobile nav drawer** — hamburger + full sidebar/subnav at ≤760px
- [x] **Dev logbook** — `DEV_LOGBOOK.md` + `/replicate-webastral`

**Integrations hub**
- [x] **Phase B** — Integrations hub (`/integrations` tabs: services / Google import / link to website); `/google-accounts` redirects
- [x] **Phase C** — Agency Google data access + Meta data identities: `data_identities`, `connections.data_identity_id`; Google UI is single agency account, Meta can still add/reconnect accounts
- [x] **Google data path** — Connect agency Google → Sync inventory → Import/Link GA4 / GSC / Ads → header Sync → `metric_snapshots` → Overview
- [x] **Google companion import sync** — Import/select GA4/GSC links matching Search Console/GA4 by hostname when accessible, avoids defaulting unrelated inventory rows, then syncs all active Google sources for that website (GSC keywords included)
- [x] **Multi-site GA4 account import** — Import one Analytics account as one client with all properties/websites; matching uses ID/domain first; platform pages stay website-scoped; Client Details is the rollup
- [x] **Bulk Google import** — `POST /integrations/google/import-bulk`; Import all / selected (GA4+GSC); Ads stay per-website
- [x] **Integrations + Sync P0s** — identity bind; honest Connected / Needs reconnect; Overview dims on `NEEDS_REAUTH`
- [x] **On-visit Sync** — Overview + platform pages refresh ACTIVE sources older than **6h**; header Sync = force refresh
- [x] **Google access revoked (standard)** — `POST /clients/:id/verify-google` + `AccessRevokedBanner` + Remove client
- [x] **Meta Connect scopes (Dev)** — `ads_read` + `business_management` only; Connect works in Development
- [x] **Meta hub = Google pattern** — Manage Meta inventory, identity chips, add/reconnect, Available vs Linked, Link to website
- [x] **Meta data path (code)** — Connect / list / link / sync → `META_ADS` snapshots (App Review still needed for external BMs)

**NEW 2026-09-21 — Meta-only + provenance (expandable)**
- [x] **Meta-only clients** — `POST /integrations/meta/import`; Manage Meta → **Create client & link** (user supplies website URL — Meta has none)
- [x] **Client provenance** — `clients.origin` (first family only, never overwritten) + `created_by_user_id`
- [x] **Channel history** — `client_sources` (`source`, `family`, `meta_json`, external account id)
- [x] **Domain key** — `websites.primary_domain` (normalized hostname for future employee ACL)
- [x] **Integration catalog** — `src/lib/integrations/catalog.js` + seeded `integration_providers` (Google/Meta on; LinkedIn/TikTok/Microsoft stubbed)
- [x] **Open TEXT providers** — no closed CHECKs on origin / provider / source (add a channel without DDL rewrite)
- [x] **Write-path tags** — Manual Add Client → `MANUAL`; Google import → `GOOGLE`; Meta create → `META`; Meta link onto existing keeps origin
- [x] **Origin badges UI** — Clients list + client detail (`Manual` / `Google` / `Meta` / …)
- [x] **ACL stubs (schema only)** — `user_client_access`, `user_domain_access` — **no employee UI yet**
- [x] **Provenance research doc** — `docs/01-core/05-data-api/PROVENANCE_AND_INTEGRATIONS_SCHEMA.md`
- [x] **Git** — pushed `917d9fc` to `origin/master`

**Dashboards & reports**
- [x] **Overview = SEO report layout** — AgencyAnalytics-style sections (fillable GSC/GA4/Ads; Phase 3 stubs removed from Overview)
- [x] **Platform charts** — Recharts + daily tables (GA4 / GSC / Ads / Meta)
- [x] **GSC keywords** — top 10 auto + custom track/add/remove (`website_gsc_keywords`)
- [x] **Overview/report keyword + top-query tables** — from snapshot `payload_json.top_queries` + prior-period position change
- [x] **Reports polish** — section numbering, branding, Export PDF (print), copy page link
- [x] **Report KPI charts** — scorecard + period vs prior; `columns_json` v2
- [x] **Client-facing report copy** — no internal roadmap language
- [x] **Keywords report section** — Phase 1 default on (GSC-based; not third-party rank tracker)

**Data / QA**
- [x] **PostgreSQL cutover (local)** — `DATABASE_URL` + `db/schema.postgres.sql`; `npm run db:pg:start` (port 5434)
- [x] **Alpha test pack** — `docs/03-qa/01-alpha/ALPHA_TEST-2026-09-16.md`
- [x] **API smoke** — `npm run smoke:pg` **25/25** (2026-09-21, includes `schema/provenance`)

### Pending — not ready / not done

**P0 — unblock real testers / deploy (do next)**  
Runbook: `docs/03-qa/01-alpha/P0_TESTER_AND_DEPLOY.md`

- [~] **Internal tester pass** — Meta inventory live; imported high-spend act → **208 days / ~$2262** KPIs with `preset=last_365` (Last 30 can look empty if no recent delivery). Full UI table still human.
- [~] **Meta App Site URL / redirect** — code + local `.env` = `http://localhost:3000/auth/meta/callback` (**confirmed**); **you still paste that into Meta Console** + add app-role testers
- [ ] **Postgres prod / free deploy** — managed Postgres (Neon/Supabase/Railway) + API host — runbook §3
- [~] **Browser product smoke** — API Meta KPI verify OK; Login → Agency → PDF still human

**P1 — Meta / Google production ops**  
Runbook: `docs/03-qa/01-alpha/P1_OPS_AND_POLISH.md`

- [ ] **Phase D ops** — Meta App Review + Business Verification (+ Tech Provider if serving external BMs) — runbook §1
- [ ] **Google production verification** — sensitive-scope demo / verification for production client scale — runbook §2
- [~] **Phase E polish** — login rate limit + Settings change password **shipped**; email reset still open; staging vs prod OAuth = runbook §3

**P2 — product polish (after testers)**
- [ ] **Agency vs Clients content** — clarify portfolio ops vs research/list under the shell
- [ ] **Nightly / cron Sync** — deferred; on-visit Sync covers day-to-day
- [ ] **Reports Phase 2 remaining** — public/secure share link (token); AI summary polish; optional server PDF file
- [ ] **In-app email invites** — transactional email deep-link = later

**P3 — later SRS (not this quarter unless asked)**
- [ ] **Client / freelancer portal login** — still admin-only (use provenance + domain stubs when building ACL)
- [ ] **Employee multi-tenant UI** — grants on `user_client_access` / `user_domain_access` (schema ready)
- [ ] **New ad channels** — LinkedIn / TikTok / Microsoft (catalog rows exist `enabled=0`; implement OAuth + sync)
- [ ] **Later SRS** — website auditing, app-store analytics, public multi-tenant signup

### Next approach (recommended order)

1. **You (Meta Console):** add Valid OAuth Redirect URI = localhost callback; add each tester as Meta app role — runbook §1  
2. **You (browser):** complete tester table §2 — especially Meta **Create client & link** + origin badges  
3. **Staging:** provision managed Postgres + set `DATABASE_URL` / OAuth public redirects — runbook §3  
4. **Then** start Meta App Review calendar — `docs/03-qa/01-alpha/P1_OPS_AND_POLISH.md`  
5. **Do not** build employee portal / LinkedIn / cron until (1)–(3) are moving  

### Smoke before calling “done for the day”

- [x] `npm run db:pg:start` + `npm run db:verify` + API `/api/health` → `db: up` (`smoke:pg` **25/25** on 2026-09-21)
- [~] Login page loads (**Webastral** title / Continue with Google + email) — full login → Agency still human
- [ ] Login password **or** Continue with Google → lands on **Agency** (API must be running on :4000)
- [ ] Brand shows **Webastral** (sidebar / login / report footer)
- [ ] Integrations → Connect / Reconnect Google → Sync → Import or Link one property
- [ ] Overview sections load; header Sync refreshes (honest skip / reconnect)
- [ ] Open GA4 / GSC → charts + daily table
- [ ] Report → Export PDF → Save as PDF
- [ ] **(New)** Meta → Create client & link (website URL) → Clients shows **Meta** badge → Overview/Meta has data
- [ ] **(New)** Link Meta onto a Google-imported client → origin stays **Google**
- [ ] (Optional) Revoked Google → banner → Remove / Reconnect
- [ ] (Optional) **Add Google account** → second Gmail → Import under that chip
- [ ] (Optional) Meta Connect — no Invalid Scopes (`ads_read` + `business_management` only)

Full P0 sheet: `docs/03-qa/01-alpha/P0_TESTER_AND_DEPLOY.md`.

## 1. What you asked for

1. Login with **email + password** *or* **Continue with Google (Gmail SSO)**.
2. After login, **integrate** Google (and **Facebook / Meta**) like Cursor connects GitHub / Slack / Linear.
3. Reorganize the whole flow so -account- and -data connections- are obvious.
4. Research first (multi-agent), then a detailed plan with benefits - **this document**.

---

## 2. Research summary (multi-agent)

### Agent A - Current auth (codebase)

| Today | Finding |
|-------|---------|
| App login | Admin **email/password only** ? HMAC cookie `webastral_session` |
| Google on login page | **None** - no -Sign in with Google- for the app |
| Google OAuth in product | **Data only** (GA4 / GSC / Ads); callback requires already logged-in admin |
| Meta | `META_APP_ID` / `SECRET` in Settings status only - **no OAuth routes**, UI -soon- |
| Roles | Schema is **ADMIN-only** (no client portal login) |

### Agent B - Current connect UX (codebase)

Three separate mental homes today:

| Page | Job |
|------|-----|
| `/settings` | Env flags (Configured / Missing) - does not connect |
| `/google-accounts` | Agency Google connect + inventory Import/Link (under Clients nav) |
| `/integrations` | Per-website attach GA4/GSC/Ads (needs top-bar website) |

Pain vs Cursor: no single **Account ? Integrations** hub; dual -portal Google- vs -this site-s Google-; Meta looks connectable but is a stub.

### Agent C - Industry / Google / Meta standards

| Decision | Recommendation |
|----------|----------------|
| App SSO vs data OAuth | **Separate flows, separate UX, separate token storage** ([GIS: separate auth vs authorization](https://developers.google.com/identity/gsi/web/guides/integrate)) |
| Google Cloud | One project; **two OAuth clients** - Login (OIDC) vs Data (GA/GSC/Ads) |
| Login scopes | `openid` `email` `profile` only |
| Data scopes | Keep current readonly Analytics / GSC / Ads |
| Login Google ? data Google | **Allowed and expected** (staff Gmail vs agency inventory Gmail) |
| Meta | **Not** portal login in v1; **Integrations** via [Facebook Login for Business](https://developers.facebook.com/docs/facebook-login/facebook-login-for-business/) + Marketing API (`ads_read`, etc.) |
| Meta compliance | App Review Advanced Access + Business Verification + often [Tech Provider](https://developers.facebook.com/docs/development/release/tech-providers/) for external clients - longest calendar track |

**Phase 0 (already shipped):** harden single agency Google data identity (email/sub, no promote, revoke on disconnect, read-only discover). Keep that; build Account/Integrations on top.

---

## 3. Target mental model (Cursor analogy)

| Cursor | Webastral target |
|--------|--------------------|
| Create / sign in to Cursor | Create / sign in to Webastral (**password or Google SSO**) |
| Settings ? Integrations | **Account / Integrations** hub |
| Connect GitHub | **Connect Google** (data: GA4 + GSC + Ads inventory) |
| Connect Slack / Linear | **Connect Meta** (Ads reporting) |
| Pick repos / channels | **Import / link** properties ? Client ? Website |
| Cursor keeps OAuth app secrets | Webastral keeps `GOOGLE_*` / `META_*` in **server `.env`** (users never paste secrets) |

Important: **SSO does not replace `.env` Client ID/Secret.** Those identify *Webastral the app* to Google/Meta - same as Cursor-s backend apps.

---

## 4. Reorganized user flow

### 4.1 Sign in

```
/login
  +-- Email + password ? Webastral session
  +-- Continue with Google ? OIDC only ? Webastral session
         (does NOT grant Analytics / Ads data)
```

Optional later: link Google login to an existing password account (verify email / confirm password to prevent takeover).

### 4.2 After login - Integrations hub (primary)

```
/integrations   (or /account/integrations - one canonical URL)
  +-- Google
  -     status: Not connected | Connected as you@agency.com | Needs reconnect
  -     [Connect] [Reconnect] [Disconnect]
  -     ? when connected: -Browse accounts- (today-s discover list)
  -           Import GA4/GSC ? Client + Website
  -           Link Ads ? existing Website
  -
  +-- Meta (Facebook)
  -     status: Not connected | Connected | Needs review / soon
  -     [Connect] - ? list ad accounts ? link to Website
  -
  +-- (future) other services
```

**Website-level pickers** (which GA4 property on which site) stay as a **second step** inside the hub or a -Link to website- drawer - not a second competing -Google home.-

### 4.3 Performance stays performance

```
Overview / GA4 / GSC / Google Ads / Meta Ads
  ? read snapshots for selected website
  ? header Sync refreshes linked connections
```

No OAuth on those pages.

### 4.4 Settings shrinks

```
/settings
  ? Operator-only: env readiness, encryption, Ads API notes
  ? Not where end-users -connect Google-
```

### 4.5 What goes away (as primary paths)

| Retire / fold | Into |
|---------------|------|
| `/google-accounts` as separate IA under Clients | Integrations ? Google ? Browse / Import |
| Sidebar -Import from Google- as main story | Same hub CTA |
| Dual unexplained OAuth buttons without labels | One **Connect Google**; advanced -Use different Google for this site only- under website link |

---

## 5. Domain model (target)

```
PortalUser (ADMIN)
  +-- auth_identities[]          # password hash; google_oidc (sub, email)
  +-- connected_accounts[]       # google_data, meta_ads (many later)
        +-- linked assets via connections[]
              # GA4 / GSC / Ads / Meta ad account on website_id
```

Rules:

| Action | Behavior |
|--------|----------|
| **Add** Google data | New connected account (multi-Gmail = Phase C) |
| **Reconnect** | Replace tokens on **that** row; keep website links |
| **Disconnect** | Revoke at provider + clear tokens; **stay logged into Webastral** |
| Login Gmail ? data Gmail | OK |
| Logout Webastral | Ends session only - does **not** switch client groups by Gmail |

---

## 6. Benefits

| Benefit | Why it matters |
|---------|----------------|
| **One mental model** | Account ? connect services ? attach assets - matches Cursor / Notion / Linear |
| **Safer consent** | Staff understand -sign in- ? -read all client Analytics- |
| **Faster onboarding** | New admin: SSO in ? Connect Google ? Import - fewer orphan pages |
| **Meta-ready IA** | Facebook sits beside Google in the same hub (not a fake platform row forever) |
| **Keeps CRM truth** | Client ? Website still owns dashboards; integrations only feed them |
| **Builds on Phase 0** | Identity email/sub, revoke, no silent promote - required for multi-connect later |
| **No secret sharing** | Clients never see Client ID/Secret; invite-to-agency-Gmail remains the access pattern |
| **Verification path** | Login OAuth client stays light scopes; data client carries sensitive-scope review |

---

## 7. Phased delivery

### Phase A - Portal login + SSO (2-4 weeks)

**Status: shipped (2026-09-14)** - password + Continue with Google (OIDC).

**Ship**

- [x] Login page: email/password **and** Continue with Google.
- [x] Callback modes `login` / `link_login` (OIDC scopes only; no data refresh stored).
- [x] Table `auth_identities`; Gmail must match an existing ADMIN email (no open signup).
- [x] Settings: link / unlink Google sign-in; copy that SSO ? Analytics connect.

**Exit criteria**

- [x] Can enter Webastral with password **or** Google SSO.
- [x] Data OAuth paths unchanged and still require a Webastral session (except login callback).

---

### Phase B - Integrations hub reorganization (2-3 weeks)

**Status: shipped (2026-09-14)**

**Ship**

- [x] Canonical **Integrations** page = connection hub (Google card + Meta card).
- [x] Tabs: Connected services - Google - Import - Link to website.
- [x] Fold Google accounts inventory into Integrations ? Google; `/google-accounts` redirects.
- [x] Nav: removed -Import from Google- under Clients; Settings = sign-in + env.
- [x] Header Sync unchanged.

**Exit criteria**

- [x] New admin can complete: Login ? Integrations ? Connect Google ? Sync list ? Import ? Overview - from one Setup home.

---

### Phase C - Multiple Google data identities (2-3 weeks)

**Status: shipped (2026-09-14)**

- [x] `data_identities` 1:N (google + meta); migrate from `admin_*_tokens`.
- [x] `connections.data_identity_id`; Sync/Discover/Import scoped by identity.
- [x] Integrations ? Google: identity chips + **Add Google account** (does not overwrite default) vs Reconnect (selected identity).
- [x] Migration re-entry crash fixed (login session / Continue with Google).

**Depends on:** Phase 0 (done) + Phase B hub.

---

### Phase D - Meta / Facebook integrate (longest calendar)

**Status: Connect + Meta-only create works in Development (2026-09-21)** — **App Review / Business Verification** still pending for external client BMs.

**Ship (product)**

- [x] Meta card on Integrations: Connect / Reconnect / Disconnect.
- [x] List ad accounts; **link to website**; Sync insights → `META_ADS` snapshots.
- [x] `/platforms/meta` live when linked.
- [x] Dev OAuth scopes fixed: `ads_read` + `business_management` only (no consumer `email` / `public_profile`).
- [x] Manage Meta inventory matches Google hub (identities, Available / Linked).
- [x] **Create client & link** (`POST /integrations/meta/import`) — Meta-only clients with user-supplied website URL + provenance `origin=META`.

**Still required from operator**

- [ ] Confirm Meta App **Site URL** / redirect matches `META_REDIRECT_URI` (local or staging).
- [ ] App Review / Business Verification / Tech Provider for external client BMs.
- [ ] Add `ads_management` only when create-ads UI ships.
---

### Phase E - Polish

**Status: partial (2026-09-21)** — full ops checklist in `docs/03-qa/01-alpha/P1_OPS_AND_POLISH.md`

- [x] Login rate limit (`src/lib/rateLimit.js` on `/api/login` + EJS `/login`)
- [x] Logged-in change password (`POST /api/account/password` + Settings)
- [ ] Email password reset (forgot flow / mailer)
- [ ] Staging vs prod OAuth clients (operator — runbook §3)
- [ ] Google sensitive-scope verification demo for production (runbook §2)
- [ ] Optional: invite deep-link that opens Integrations connect (still admin-only)
- [ ] Nightly / cron Sync job per identity

---

## 8. What we will **not** do

| Anti-goal | Reason |
|-----------|--------|
| Replace `.env` Google/Meta secrets with -SSO only- | App credentials ? user login |
| Bundle Analytics scopes into Continue with Google | Violates Google UX guidance; worse verification |
| Logout ? different Gmail ? different client groups | Wrong tool; use Phase C multi-identity |
| Client self-serve portal in this plan | Still admin-only per IA |
| Meta as Webastral IdP in v1 | Extra IdP cost; Meta is for ads data |

---

## 9. Navigation target (IA sketch)

```
Performance
  Overview, Google Ads, Meta Ads, GA4, Search Console

Setup
  Integrations     ? hub (Google + Meta + browse/import)
  Reports

Agency
  Agency dashboard, Clients (list / add - no -Import from Google- sibling)
  Settings         ? env / operator

Login
  Password | Continue with Google
```

---

## 10. Success metrics

| Metric | Target |
|--------|--------|
| Time for new admin to first imported client | ? vs today (fewer page hops) |
| Support confusion -I signed in with Google but see no clients- | Solved by explicit Integrations Connect + copy |
| Accidental overwrite of agency data Google when -logging in- | Zero (separate clients/flows) |
| Meta path clarity | One Connect card; no -Configured but soon- trap without explanation |

---

## 11. Recommended build order (status)

1. [x] **Approve this plan** (product).
2. [x] **Phase A** - login + Continue with Google (SSO).
3. [x] **Phase B** - Integrations hub reorganization (fold Google accounts).
4. [x] **Phase C** - multi Google data (when you need multiple Gmails for client groups).
5. [~] **Phase D** - Meta connect (code done; start / finish Meta app review + `.env`).
6. [ ] **Phase E** - polish + optional cron Sync.

---

## 12. Open product choices (resolved defaults)

1. **SSO account rule:** Only allow Google SSO if Gmail matches an existing ADMIN row - **chosen** (no open signup).
2. **Canonical URL:** keep `/integrations` as hub - **chosen**.
3. **Meta naming in UI:** **Meta Ads** with Facebook Login for Business under the hood - **chosen**.
4. **Per-website Google:** keep as advanced escape hatch (-Use a different Google for this website-) - **kept**.

---
