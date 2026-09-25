# Design reference

Saved page dumps: `docs/design-mocks/`. Layout reference only. IA: `docs/IA.md`. Naming: `docs/01-core/03-product-ux/NAMING.md`.

**SEO report visual/IA reference:** AgencyAnalytics SEO template — local dump `docs/design-mocks/refrence-report-ui.html` (source: https://agencyanalytics.com/templates/reports/seo). Fill with GSC / GA4 / Ads / Meta; leave backlinks / SERP features / site audit for Phase 3.

`overview.html` is a login dump, not Overview. Use `clients.html`, `performance.html`, `client-workspace.html`.

Rebuild as Express + EJS. Do not paste dump HTML or ship “northstar”.

## Shell (PoC)

- Sidebar **244px**; hamburger below `lg`
- Header **76px**
- Nav (Phase 1 IA): Overview · Google Ads · Meta · GA4 · Search Console · Integrations · Reports · Clients · Settings
- Shared **date range bar** on Overview + platform pages (presets + custom + prior-period compare)
- Header bell + unread badge (`docs/NOTIFICATIONS.md`)
- Hide Keywords / Audit / Backlinks **nav** until Phase 3 (keyword *tables* on Overview/Reports use GSC queries)
- Hide quota card in PoC

## Overview / saved report sections (fillable now)

Aligned to AgencyAnalytics SEO template; data from snapshots:

1. SEO report summary — headline KPIs
2. Goals & objectives — static framing (OKRs later)
3. Search visibility — GSC clicks / impressions / CTR / position
4. Keyword rankings — tracked + top GSC queries with prior position change
5. GSC performance — top queries table
6. Website traffic (GA4) — sessions / users / engagement + source mix
7. Conversions & business impact — GA4 + paid
8. Paid media — Ads / Meta
9. Recommendations + summary + platform status

**Not yet:** backlinks, SERP features, technical audit, competitor pack, GA4 organic-only channel filter.

## Visual pattern (AgencyAnalytics SEO dashboard)

**Target:** card grid like `docs/design-mocks/ref-shots/aa-seo-dashboard-grid.png` — not a long numbered document.

Hero row:
1. Wide **Google Rankings** stacked bar (position buckets 1–3 / 4–10 / 11–20 / 21–50 / 51+)
2. 2×2 tiles: improved / declined / top-10 count / tracked keywords
3. Tall **Visibility** card (GSC CTR %)
4. Four **gauge** cards (CTR / engagement / top-10 share / click momentum — Lighthouse not available yet)

Below: KPI strip, keyword + top-query tables, paid / summary / connections cards.

CSS: `.aa-dash`, `.aa-card*` in `web/app/globals.css`. Component: `seo-aa-dashboard.tsx`.

## Screens

| Route | Mock | Content |
| --- | --- | --- |
| `/` | AA SEO template | Website SEO report (sections above) |
| `/clients` | `clients.html` | Admin client cards |
| `/websites` | `clients.html` | Client’s websites |
| `/websites/:id` | — | Site overview + setup status |
| `/websites/:id/performance` | `performance.html` | Google Organic vs Meta (not LinkedIn/TikTok) |
| `/websites/:id/onboarding` | — | Goals form |
| `/websites/:id/integrations` | — | Provider cards + connect wizard |
| `/reports` | `client-workspace.html` | Saved reports list |
| `/reports/:id` | AA SEO template | Printable SEO report (same fillable sections) |

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
