# P1 — Meta App Review · Google production verify · Phase E polish

**Updated:** 2026-09-22  
**Owner checklist:** `docs/01-core/01-shipping/ACCOUNT_INTEGRATIONS_PLAN.md` (P1 section)  
**Prereq:** P0 runbook `P0_TESTER_AND_DEPLOY.md` (Meta localhost redirect + internal testers moving)

Goal: open **external** Meta Business Managers and production-scale Google OAuth, and ship the small auth polish that rates as Phase E.

**Tick rule:** `[x]` only when a human confirms that Console / BV step in the live product console (or when the repo can prove it). Do not mark App Review / BV done from code alone.

---

## 1. Meta App Review / Business Verification (ops — human calendar)

Code already uses **Development** friendlies: `ads_read` + `business_management` only. External client BMs need Live / Advanced Access.

### Local (repo-verified 2026-09-22)

| Check | Status |
|-------|--------|
| Local `.env` `META_REDIRECT_URI` = `http://localhost:3000/auth/meta/callback` | [x] |
| Code default matches that URI (`src/lib/meta/oauth.js`) | [x] |
| Scopes in code stay `ads_read` + `business_management` | [x] |

### Console / BV — open and tick yourself

**Console:** https://developers.facebook.com/apps → app id from `META_APP_ID` → Facebook Login for Business → Settings  

Paste into **Valid OAuth Redirect URIs** (exact):

```
http://localhost:3000/auth/meta/callback
```

When you have a public host, also add:

```
https://YOUR_HOST/auth/meta/callback
```

| Check | Status |
|-------|--------|
| Valid OAuth Redirect URIs include **localhost** callback (above) | [ ] |
| Valid OAuth Redirect URIs include **prod/staging** `https://YOUR_HOST/auth/meta/callback` | [ ] |
| `META_REDIRECT_URI` on that host matches Console exactly | [ ] |
| App **Privacy Policy** + **Terms** URLs live | [ ] |
| Data deletion / user data instructions URL live | [ ] |
| Screencast: Connect → Sync accounts → Link / Create client & link → Overview Meta KPIs | [ ] |
| Business Verification started on Meta Business Manager | [ ] |
| Tech Provider path if you manage **external** client BMs ([docs](https://developers.facebook.com/docs/development/release/tech-providers/)) | [ ] |

### Scopes (keep minimal)

- Request / justify: `ads_read`, `business_management`
- Do **not** add `ads_management` until create-ads UI exists
- App Review use case: agency reporting / insights pull, not publishing ads

### After Advanced Access

- [ ] Switch app mode **Live** (or keep Dev for internal-only)
- [ ] Re-test one **external** BM ad account import + Sync
- [ ] Confirm Insights still land with `preset=last_365` when last_30 is empty

**Status:** local redirect **aligned in repo** · Console / BV / Review = **still human** (weeks, not a code sprint).

---

## 2. Google production verification (ops — human)

### Local (repo-verified 2026-09-22)

| Check | Status |
|-------|--------|
| Local `.env` `GOOGLE_REDIRECT_URI` = `http://localhost:3000/auth/google/callback` | [x] |
| `APP_URL` = `http://localhost:3000` | [x] |
| `GOOGLE_CLIENT_ID` set in local `.env` | [x] |

### Console — open and tick yourself

**Console:** https://console.cloud.google.com/apis/credentials → OAuth 2.0 Client → Authorized redirect URIs  

Must include:

```
http://localhost:3000/auth/google/callback
```

Consent screen: https://console.cloud.google.com/apis/credentials/consent  

| Check | Status |
|-------|--------|
| OAuth consent screen: **External** (or Internal if Workspace-only) | [ ] |
| Sensitive scopes justified (GA4 / GSC / Ads as used) | [ ] |
| Branding + homepage + privacy policy URLs match prod | [ ] |
| Localhost redirect URI present in Google OAuth client | [ ] |
| `GOOGLE_REDIRECT_URI` = `https://YOUR_HOST/auth/google/callback` in Console **and** host `.env` (when staging/prod exists) | [ ] |
| Test users listed while app is Testing; verification submitted before 100+ users | [ ] |
| Google Ads API enabled on same Cloud project; access form approved | [ ] |
| Staging vs prod: **separate** OAuth clients (or clearly labeled) — see §3 | [ ] |

Demo video tips: login → Integrations Connect → Import one property → Overview Sync → GA4/GSC/Ads charts.

---

## 3. Staging vs prod OAuth clients (ops + env)

Never point localhost and production at the **same** public Client ID without listing both redirect URIs. Prefer:

| Env | Google | Meta | Local status |
|-----|--------|------|--------------|
| Local | `http://localhost:3000/auth/google/callback` | `http://localhost:3000/auth/meta/callback` | [x] `.env` matches |
| Staging | `https://staging…/auth/google/callback` | `https://staging…/auth/meta/callback` | [ ] no staging host yet |
| Prod | `https://app…/auth/google/callback` | `https://app…/auth/meta/callback` | [ ] no prod host yet |

Set on each host: `APP_URL`, `GOOGLE_REDIRECT_URI`, `META_REDIRECT_URI`, `GOOGLE_CLIENT_ID` / `SECRET`, `META_APP_ID` / `SECRET`.  
`.env.example` documents the localhost defaults.

- [x] Localhost env redirects documented + match code (2026-09-22)
- [ ] Staging host env + Console URIs added  
- [ ] Prod host env + Console URIs added  
- [ ] Localhost still works after prod URIs are added  

---

## 4. Phase E polish (code — shipped 2026-09-21)

| Item | Where | Status |
|------|--------|--------|
| Login rate limit (8 / 15 min / IP) | `POST /api/login`, EJS `POST /login` via `src/lib/rateLimit.js` | Done |
| Change password (logged-in) | `POST /api/account/password` + Settings → Admin | Done |
| Email password **reset** (forgot flow) | needs mailer | **Not** this P1 |
| Staging vs prod OAuth | this runbook §3 | Ops checklist |

### Smoke (code)

1. Wrong password 9+ times from same IP → `429` / “Too many sign-in attempts…”
2. Settings → Change password (min 10) → sign out → sign in with new password
3. Confirm Google/Meta connect still use host-specific redirect URIs after deploy

---

## 5. Done when

- [ ] Meta App Review submitted (or calendar date booked) + BV in progress  
- [ ] Google verification / sensitive-scope path started for prod  
- [ ] Staging (or prod) OAuth redirect URIs live in Consoles  
- [x] Rate limit + change-password in repo  
- [x] Local Meta + Google redirect URIs aligned in `.env` / code  

Then return to master checklist P1 and tick human items as Consoles complete. Reply in chat with which Console rows you finished and they will be marked `[x]` here.
