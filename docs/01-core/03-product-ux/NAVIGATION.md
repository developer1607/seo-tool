# Navigation — Webastral

Market-standard information architecture for the admin workspace. Keep this file and `docs/IA.md` aligned when routes move.

## Three dashboard levels (different jobs)

| Level | Route | Job | Grain |
|---|---|---|---|
| **Agency** | `/agency` | Portfolio ops — what’s on fire across the book | All clients/websites |
| **Client** | `/clients/[id]` | Account health + light rollup + research | One client’s sites |
| **Website** | `/` Overview | Performance KPIs, trends, soft-fails | Selected website only |

Do **not** put three identical KPI Overviews in Performance nav. Home stays website Overview.

## Page jobs (one job each)

| Route | Job | Context required |
|---|---|---|
| `/` Overview | Website KPIs + soft-fails for the **selected website** | Client + website |
| `/agency` | Agency ops + light book rollup + attention list | Auth only |
| `/platforms/*` | Single-source metrics for selected website | Client + website |
| `/integrations` | **Hub:** Connected services (Google / Meta) · Import inventory · Link to website | `?tab=services\|google\|website` ; website tab prefers `?website_id=` |
| `/google-accounts` | **Redirect** → `/integrations?tab=google` | — |
| `/clients` | CRM list | — |
| `/clients/[id]` | Client research hub + rollup strip — attachment truth | Client id in URL |
| `/reports`, `/reports/generate` | Saved reports / generate | Client + website for generate |
| `/settings` | Account sign-in methods + platform env health | — |

## Google layers (do not merge)

1. **Platform apps** — `.env` Client ID/Secret (`/settings`)
2. **Portal SSO** — Continue with Google (`/login`, Settings) — identity only
3. **Google data connect** — Integrations → Connect Google → Import (`/integrations?tab=google`)
4. **Website binding** — which GA4 / GSC / Ads on this site (`/integrations?tab=website`)

## Sidebar sections

- **Agency** — Agency dashboard (post-login home), Clients, Settings
- **Setup** — Integrations, Reports
- **Performance** — Overview (website SEO report), Google Ads, Meta, GA4, Search Console

Login lands on **`/agency`**. Client + website + Sync appear only on pages that need that context (see above).

## Canonical flows (no loops)

### A. Invite-based (preferred)

1. `/integrations` → Connect Google → Google · Import → Sync  
2. Import GA4/GSC **or** create client manually  
3. `/integrations?tab=website&website_id=` → Use portal Google → pick accounts → Sync  
4. `/` Overview

### B. Manual client + agency Google access

1. `/clients` → add client / website manually  
2. Client invites agency Google to GA4 / Search Console / Ads  
3. `/integrations?tab=website&website_id=` → Use agency Google → pick accounts → Sync  

### C. Monday book check

1. `/agency` → Needs attention → Fix (Integrations) or open Client  
2. Dive into `/` only when drilling a specific site

### D. Ads link from inventory

1. `/integrations?tab=google` → Ads  
2. Local client/website picker (**must not** call `selectClient` — local state only)  
3. Link → stays on Integrations

## Guardrails (anti-loop / anti-race)

1. **Idempotent session writers** — `selectClient` / `selectWebsite` no-op when already selected (`providers.tsx`).
2. **URL wins once** — `/integrations?website_id=` selects that website, then loads status/resources only when `selectedWebsite.id === website_id`.
3. **Reset website-scoped UI** on website change (platforms, resource pickers). Never show previous site’s account lists.
4. **OAuth flags are one-shot** — toast then strip `google` / `google_error` / `local` / `ads` from the URL.
5. **OAuth failure preserves mode** — website/local/ads → `/integrations?website_id=&google_error=`; discover → `/google-accounts?google_error=`.
6. **Honesty** — never treat `session.agencyGoogle.linked` as “inventory connected”. Discover / integrations payload is source of truth after load.
7. **Client detail URL sync** — URL client is source of truth: `selectClient(urlId)` first; only after aligned may top-bar changes `replace` to `/clients/{newId}`. Never redirect while session still lags the URL (causes 5↔9 loops).
8. **Deep links always carry `website_id`** when the destination is website-scoped (`/integrations`).
9. **Legacy** `/clients/[id]/connect-google` → `/clients/[id]` (research hub), not bare `/integrations`.
10. **Effects key on ids** — `selectedWebsite?.id`, not object identity.
11. **Dashboard grain labels** — Agency/Client rollups say “across websites”; never imply they replace site Overview.

## Competing pages

| Don’t | Do |
|---|---|
| Steal `/` for agency portfolio | Keep `/` = website; use `/agency` for book |
| Three Overview items in Performance | One website Overview + Agency under Agency |
| Use Google accounts as the per-site account picker | Use Integrations |
| Use Integrations as agency inventory Import | Use Google accounts |
| Mutate global client when filtering Ads link target | Local picker + `website_id` on import body |
| Redirect OAuth fail always to Google accounts | Preserve website context when state has `websiteId` |

## Smoke checklist

- [ ] `/agency` loads without a selected website  
- [ ] Agency attention → Fix opens Integrations with `website_id`  
- [ ] `/clients/[id]` shows rollup strip + research sections  
- [ ] `/` still website-scoped Overview  
- [ ] OAuth success local → `/integrations?website_id=&google=1&local=1` → pickers for that site only  
- [ ] OAuth fail local → same integrations URL with `google_error`  
- [ ] Integrations with `website_id` different from session → select then load (no wrong-site resources)  
- [ ] Google accounts Ads client change does **not** change top-bar client  
- [ ] Sidebar: Agency dashboard under Agency section  
