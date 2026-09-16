# Multi-website Google access plan

How a Client (manual **or** agency-imported) gets a **second+ website** connected without sharing OAuth secrets.

Related: `docs/01-core/03-product-ux/NAVIGATION.md`, `docs/02-product-plans/01-google-identity/GOOGLE_ACCOUNTS_UX.md`, `docs/01-core/04-integrations/INTEGRATIONS.md`.

## Hard rules

1. **Clients never receive** `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / refresh tokens. Platform app stays in `.env` (`/settings`).
2. **Import vs manual** does not change the model after create — both are Client → Website(s) → connections.
3. **Add website** always creates a CRM row first; Google bind is a **second step** on Integrations for that `website_id`.
4. Tokens / auth mode are **per website** (`config_json.google_auth`: `agency` | `website`), not per client.

## Today (already built)

| Step | Behavior |
|---|---|
| Add site | `/clients/[id]/add-website` → `POST /clients/:id/websites` → website row only (no connections) |
| Agency path | Integrations → **Use portal Google** → pick GA4/GSC/Ads visible to agency Gmail |
| Fallback | Integrations → **Connect this site’s Google** (`force=1&local=1`) — does not overwrite agency login |
| Inventory | `/google-accounts` lists only what agency Gmail can see |

**Not live:** in-app email invite / magic-link (`invites.js` unmounted — see `docs/LEGACY_UNMOUNTED.md`).

## Decision tree (after Add website)

```
New website under Client
        │
        ▼
Does agency Gmail already have Viewer/access on this site’s GA4 + GSC (+ Ads)?
        │
   ┌────┴────┐
  YES        NO / unknown
   │          │
   ▼          ▼
Use portal   Ask client to INVITE agency Gmail
Google       (checklist — see below)
+ pick            │
accounts     ┌────┴────┐
            Done     Client won’t / can’t invite
             │            │
             ▼            ▼
        Use portal   Per-website OAuth
        Google       (admin + client on a call,
                     or later: magic-link start URL)
```

## What “invite” means

### v1 (ship this — no email product)

**Google-side ACL**, not an Astralytics password invite.

Admin shows (copy-paste):

- Agency Gmail to invite (from linked agency account / settings)
- GA4: add as **Viewer** (or Analyst+) on the property
- Search Console: add as **Full** user on the property/URL-prefix
- Google Ads: grant read (or link under MCC the agency can see)

Then: Integrations → Use portal Google → Sync / pick accounts.

Client page already has this checklist; keep it next to **Add website** and on each site’s “Choose accounts” path.

### v2 (later)

- Magic-link / “Connect this website” start URL that opens **Google consent** (server-side code exchange — secret never in browser)
- Optional: mailto / transactional email with the checklist + deep link to Integrations
- Still **not** a client login dashboard unless product expands beyond admin-only

## Token model

| Mode | When | Where token lives | Heal/apply |
|---|---|---|---|
| `agency` | Portal Google / invite path | Prefer `admin_google_tokens`; website connection may reference same ciphertext today | Heal may refresh `agency` rows; **skip** `website` rows |
| `website` | Per-site OAuth | Only that website’s connections | Never overwrite agency login; never heal onto other sites |

**Ideal later:** agency mode stores property IDs + `google_auth=agency` and reads refresh from `admin_google_tokens` only (stop cloning ciphertext onto every row). Not required to ship add-website UX.

## UX placement

1. **Client hub** — Add website → success → “Connect Google for this site” CTA with `?website_id=`
2. **Per website card** — status + Choose accounts + short access hint (invite vs site OAuth)
3. **Integrations** — keep both CTAs; if portal lists empty for this URL, show invite checklist + Connect this site’s Google

## Anti-patterns

| Don’t | Do |
|---|---|
| Email Client ID/Secret to the client | Keep secrets in `.env`; client only Allow on Google or invites Gmail |
| Auto-match second site by domain fuzzy | Explicit property/site pick |
| One client-level Google token for all sites | Per-website bind + auth mode |
| Force per-site OAuth when invite would work | Prefer invite + portal |
| Treat empty inventory as “Connected” | Show needs access / pick account |

## Implementation backlog (ordered)

1. **P0 UX** — After add-website, deep-link to `/integrations?website_id=` with the invite vs portal vs local CTAs visible  
2. **P0 honesty** — Empty GA4/GSC list after portal reuse → invite checklist panel (agency email shown)  
3. **P1** — Surface agency Gmail on client hub for copy  
4. **P2** — Magic-link connect (server start URL, no client secrets)  
5. **P2** — Reduce token clone; agency rows resolve via `admin_google_tokens`

## Smoke

- [ ] Imported client → Add website → new row → Integrations with that `website_id`  
- [ ] Agency can see property → Use portal Google → ACTIVE  
- [ ] Agency cannot see property → empty list / invite copy → Connect this site’s Google works; agency login unchanged  
- [ ] Never prompt admin to paste Client Secret into chat or send to client  
