# Account → Integrations plan (Cursor-style)

**Status:** In progress — Phases 0 / A / B / C shipped; D code ready (ops); E pending  
**Updated:** 2026-09-16  
**Product:** Webastral — admin-only agency SEO/reporting  
**Goal:** Feel like Cursor: create/sign in to an account, then connect Google / Meta under **Integrations** — without confusing app login with data OAuth.

Related docs: `DEV_LOGBOOK.md`, `PHASES.md`, `../02-requirements/SRS.md`, `../03-product-ux/NAVIGATION.md`, `../03-product-ux/IA.md`, `../04-integrations/STANDARD_GOOGLE_ACCESS_REVOKED.md`, `../../02-product-plans/01-google-identity/`, `../../04-audits-archive/02-portal-audits/`.

---

## Master checklist (2026-09-15)

### Done - ship / use now

- [x] **Phase 0** - Single agency Google harden (`google_email` / `sub`, no promote, revoke on disconnect, read-only discover)
- [x] **Phase A** - Admin login: email/password **or** Continue with Google (OIDC); `auth_identities`; SSO ? data OAuth
- [x] **Phase B** - Integrations hub (`/integrations` tabs: services / Google import / link to website); `/google-accounts` redirects
- [x] **Phase C** - Multi Google (and Meta) data identities: `data_identities`, `connections.data_identity_id`, picker + **Add Google account**
- [x] **Google data path** - Connect ? Sync inventory ? Import/Link GA4 / GSC / Ads ? header Sync ? `metric_snapshots` ? Overview
- [x] **Meta data path (code)** - Connect / list / link / sync ? `META_ADS` snapshots (needs Meta `.env` + App Review for real clients)
- [x] **Dashboards / reports (core)** - Overview, GA4, GSC, Google Ads, Meta pages; report generate + section pickers
- [x] **Admin identity** - Portal admin email set for SSO match (`searcheno1@gmail.com`)
- [x] **Login landing** - post-login ? `/agency` (not Overview)
- [x] **Header client chrome** - switcher + Sync only on Overview / platforms / reports / integrations / client detail; hidden on Agency / Clients list / Settings
- [x] **Sidebar order** - Agency ? Setup ? Performance
- [x] **Overview = SEO report layout** - E-Moto-style sections 1?8 (objectives, GSC, GA4, paid, summary, recommendations + Phase 3 placeholders)
- [x] **Integrations + Sync P0s** - identity bind on select/import; honest Connected / Needs reconnect; Sync provider-scoped identity; Overview dims when `NEEDS_REAUTH`; Meta Sync skipped if unset (`docs/04-audits-archive/02-portal-audits/INTEGRATIONS_SYNC_AUDIT-2026-09-15.md`)
- [x] **Google access revoked (standard)** - live confirm via `POST /clients/:id/verify-google`; `AccessRevokedBanner` + Remove client (`docs/01-core/04-integrations/STANDARD_GOOGLE_ACCESS_REVOKED.md`)
- [x] **Platform charts** - interactive Recharts (area / bar / composed) + channel-specific KPIs & daily tables (GA4 / GSC / Ads / Meta)
- [x] **Reports polish** - dynamic section numbering 1-N; clean branded document (client `brand_primary` + Webastral mark/footer); **Export PDF** (print ? Save as PDF); copy page link
- [x] **Report KPI charts** - every Key wins / GSC / GA4 KPI has scorecard + chart; period vs prior benchmark; Generate chart-type + Use Overview defaults (`columns_json` v2)
- [x] **Client-facing report copy** - recommendations / summary / empty sections speak to the client (no internal roadmap / Phase language)
- [x] **Brand rename** - Astralytics ? **Webastral** (UI, reports, API messages, core docs); session cookie `webastral_session`
- [x] **Dev logbook** - `docs/01-core/01-shipping/DEV_LOGBOOK.md` day log + `/replicate-webastral` command for other Cursor profiles

### Pending - not ready / not done

- [x] **Bulk import on Google integrate** - `POST /integrations/google/import-bulk`; Integrations ? Google - Import ? Import all / selected (GA4+GSC); hostname attach; Ads stay per-website
- [x] **Alpha test pack (2026-09-16)** - multi-agent report `docs/03-qa/01-alpha/ALPHA_TEST-2026-09-16.md`; `/health`; bulk cap 80; report brand sanitize + print colours
- [ ] **On-visit Sync** - when opening Overview / GA4 / GSC / Ads / Meta, refresh stale linked sources without relying only on header Sync
- [x] **Mobile nav drawer** - hamburger + full sidebar/subnav at =760px
- [ ] **Free deploy volume** - persistent disk for `db/app.sqlite` before public URL
- [ ] **Agency vs Clients content** - clarify portfolio ops vs research/list under the new shell
- [ ] **Nightly / cron Sync** - still manual header Sync (deferred; on-visit Sync may cover day-to-day)
- [ ] **Phase D ops** - `META_APP_ID` / `SECRET` in `.env` + Meta Developer Console redirect + App Review / Business Verification for external BMs
- [ ] **Phase E polish** - password reset, login rate limit, staging vs prod OAuth clients
- [ ] **Google production verification** - sensitive-scope demo / verification for production client scale
- [ ] **Client / freelancer portal login** - still admin-only
- [ ] **In-app email invites** - invite checklist exists; transactional email deep-link = later
- [ ] **Reports Phase 2 remaining** - public/secure share link (token); stronger AI summary polish; optional server-rendered PDF file download
- [ ] **Later SRS** - website auditing, app-store analytics, public multi-tenant signup

### Smoke before calling -done for the day-

- [ ] Login password **or** Continue with Google (`searcheno1@gmail.com`) ? lands on **Agency** (re-login once after Webastral cookie rename)
- [ ] Brand shows **Webastral** (sidebar / login / report footer)
- [ ] Integrations ? Connect / Reconnect Google ? Sync accounts ? Import or Link one property
- [ ] Overview shows report-style sections; header Sync refreshes (honest skip / reconnect messages)
- [ ] Open GA4 / GSC platform page ? charts + daily table load
- [ ] Open or regenerate a report ? client-facing recommendations ? sections 1-N ? **Export PDF** ? Save as PDF
- [ ] (Optional) Revoked Google path ? -Access revoked- banner ? Remove client or Reconnect
- [ ] (Optional) **Add Google account** ? second Gmail ? Import under that chip
- [ ] (Optional) Meta Connect when `.env` Meta keys are set

---

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

**Status: code shipped (2026-09-14)** - **ops / App Review still pending** for production clients.

**Ship (product)**

- [x] Meta card on Integrations: Connect / Reconnect / Disconnect.
- [x] List ad accounts; **link to website**; Sync insights ? `META_ADS` snapshots.
- [x] `/platforms/meta` live when linked.

**Still required from operator**

- [ ] `META_APP_ID` / `META_APP_SECRET` / redirect URI in Meta Developer Console.
- [ ] App Review / Business Verification / Tech Provider for external client BMs.

---

### Phase E - Polish

**Status: pending**

- [ ] Password reset, login rate limit, staging vs prod OAuth clients.
- [ ] Google sensitive-scope verification demo for production.
- [ ] Optional: invite deep-link that opens Integrations connect (still admin-only).
- [ ] Nightly / cron Sync job per identity.

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
