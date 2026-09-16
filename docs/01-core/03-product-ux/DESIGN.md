# Design reference

Saved page dumps: `docs/design-mocks/`. Layout reference only. IA: `docs/IA.md`. Naming: `docs/01-core/03-product-ux/NAMING.md`.

`overview.html` is a login dump, not Overview. Use `clients.html`, `performance.html`, `client-workspace.html`.

Rebuild as Express + EJS. Do not paste dump HTML or ship “northstar”.

## Shell (PoC)

- Sidebar **244px**; hamburger below `lg`
- Header **76px**
- Nav (Phase 1 IA): Overview · Google Ads · Meta · GA4 · Search Console · Integrations · Reports · Clients · Settings
- Shared **date range bar** on Overview + platform pages (presets + custom + prior-period compare)
- Header bell + unread badge (`docs/NOTIFICATIONS.md`)
- Hide Keywords / Audit / Backlinks until Phase 3 (not in nav)
- Hide quota card in PoC

## Screens

| Route | Mock | Content |
| --- | --- | --- |
| `/` | — | Clients/Websites counts; organic + Meta rollups; connection health |
| `/clients` | `clients.html` | Admin client cards |
| `/websites` | `clients.html` | Client’s websites |
| `/websites/:id` | — | Site overview + setup status |
| `/websites/:id/performance` | `performance.html` | Google Organic vs Meta (not LinkedIn/TikTok) |
| `/websites/:id/onboarding` | — | Goals form |
| `/websites/:id/integrations` | — | Provider cards + connect wizard |
| `/reports` | `client-workspace.html` | Stub |

## Integrations UI

Catalog cards with status pills (`NOT_STARTED` → `ACTIVE` / `ERROR` / `NEEDS_REAUTH`). Wizard: Prerequisites → Authorize → Select account → Configure → Done. See `docs/01-core/04-integrations/INTEGRATIONS.md`.

## Visual tokens

Dense light agency dashboard for **Webastral** (`docs/01-core/02-requirements/SRS.md`):

- Page bg `#eef0f3`, white panels, dark sidebar; selected Client `brand_primary` tints chrome
- Client switcher + date range bar in header/content
- Nav: Overview · Google Ads · Meta · GA4 · Search Console · Integrations · Reports · Clients · Settings
- Tables + KPI strips; create/edit Client beside list
- Status badges small squared pills

Mocks in `docs/design-mocks/` are reference only; SRS PDF is requirements source.
