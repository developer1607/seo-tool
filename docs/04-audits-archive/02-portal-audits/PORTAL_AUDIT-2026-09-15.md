# Portal page-job audit — 2026-09-15

Multi-agent read-only audit + P0 bleed fixes applied the same day.

Agents: nav/bleed · overview · platforms · integrations · agency/clients.

## Root cause of “other page content on other pages”

Website **Overview (`/`)** was mixing **agency/CRM chrome** (Clients count, Add client, Manage clients, “Phase 1 paths”, “From Google”) into a page whose job is **selected-website KPIs only**. Agency and Clients already own that work.

## Fixed today (P0 bleed)

- [x] Remove Overview **Clients** KPI (workspace grain)
- [x] Replace Overview **Add client** with Integrations / Generate report
- [x] Soft-fail / sync links include `website_id`
- [x] Quick links = this-website paths (not Phase 1 / From Google)
- [x] Empty state: top-bar website (not sidebar)
- [x] Platform pages: Integrations links + Meta COMING_SOON hint
- [x] Settings: Meta / Google accounts copy updated
- [x] Client detail **Open Overview** selects that website first (no wrong-site jump)
- [x] Agency rollup CTA → Clients (not bare `/`)

## Still pending (from audit + product backlog)

### Ops (you)
- [ ] Reconnect Google for Sonic Soak (`NEEDS_REAUTH` / expired token)
- [ ] Set `META_APP_ID` / `SECRET` if Meta should leave COMING SOON

### Product (agreed next)
- [x] Hide client/website header except on client-scoped pages
- [ ] Bulk import on Google integrate
- [ ] On-visit Sync for Overview / platform pages
- [ ] Clarify Agency vs Clients content under new shell

### Honesty / polish (P1)
- [ ] Stale KPI cards while `NEEDS_REAUTH` (badge or mute)
- [ ] Multi-identity reauth: keep identity chips visible
- [ ] Mark `data_identities.needs_reauth` on invalid_grant
- [ ] Platform table columns per channel (GA4 clicks KPI always 0)
- [ ] Sync uses UI date range (not only last_30)
- [ ] Client detail: shorten Integrations tutorial; show unused `attention`
- [ ] Reports generate: align form client with session website
- [ ] Strip Phase leftover copy on Reports / Add client

## Page jobs (canonical)

| Route | Job |
|-------|-----|
| `/` | Website KPIs + soft-fails for **selected website** |
| `/agency` | Portfolio ops + attention + light book rollup |
| `/clients` | CRM list |
| `/clients/[id]` | Research + light rollup (attachment truth) |
| `/platforms/*` | One channel for selected website |
| `/integrations` | Connect / import / link |
| `/reports*` | Saved / generate reports |
| `/settings` | Sign-in + env health |

Hydration warning `cz-shortcut-listen` = browser extension (ignore).
