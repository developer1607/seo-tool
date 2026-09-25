# Delivery phases — Webastral

Aligned to `docs/01-core/02-requirements/SRS.md` and `docs/01-core/01-shipping/ACCOUNT_INTEGRATIONS_PLAN.md`.  
**Checklist updated:** 2026-09-21  

**Data:** local PostgreSQL via `DATABASE_URL` (`db/schema.postgres.sql`). See `DOC_AND_PG_EVAL-2026-09-17.md`. Prod Postgres still pending.

## Account / Integrations track (Cursor-style)

| Phase | Status |
|-------|--------|
| 0 Harden single Google identity | Done |
| A Portal SSO (password + Continue with Google) | Done |
| B Integrations hub | Done |
| C Multi Google/Meta data identities | Done |
| D Meta Ads connect | Dev Connect + Meta-only create+link (2026-09-21) — App Review / external BMs pending |
| Provenance + expandable catalog | Done (schema + UI badges; ACL stubs only) |
| E Polish + cron Sync | Rate limit + change password Done; email reset + cron + staging OAuth ops still open |

Master checklist + **Next approach:** top of `ACCOUNT_INTEGRATIONS_PLAN.md`.

## Phase 0 — Shell + clients (done)

- [x] Admin-only login
- [x] Client CRUD + branding fields + switcher
- [x] Nav: Overview · Google Ads · Meta · GA4 · GSC · Integrations · Reports
- [x] Date range presets + prior-period Δ placeholders
- [x] Schema: clients, connections, snapshots, reports

## Phase 1 — Live data (mostly done)

- [x] OAuth + probe + sync for GA4, GSC, Google Ads
- [x] Meta Ads OAuth + link + sync (ops/App Review still open)
- [x] Meta-only **Create client & link** (user website URL)
- [x] Cache + last sync; soft-fail per source
- [x] Charts on platform pages (interactive Recharts + channel tables)
- [x] Google access revoked standard (live confirm + Remove client)
- [x] On-visit Sync for performance pages
- [ ] Scheduled / nightly Sync job

## Phase 1b — Provenance (done 2026-09-21)

- [x] `clients.origin` + `created_by_user_id` (first family, never overwritten)
- [x] `client_sources` + `websites.primary_domain`
- [x] `integration_providers` catalog (open TEXT keys)
- [x] Origin badges on Clients
- [x] ACL stubs `user_client_access` / `user_domain_access` (no UI)

## Phase 2 — Reports pack (mostly done)

- [x] Save reports; section checkboxes / catalog
- [x] Dynamic section numbering (1…N for included body sections)
- [x] Branded report document (client brand + Webastral)
- [x] PDF export (print → Save as PDF)
- [x] Copy page link (signed-in share)
- [x] Client-facing recommendations / summary (no internal roadmap copy)
- [x] Product brand Webastral
- [~] AI summary (basic auto summary — polish TBD)
- [ ] Public / secure share link (token + expiry)
- [ ] Optional server PDF file download

## Phase 3 — Later SRS

- [ ] Employee multi-tenant UI (use domain/client ACL stubs)
- [ ] LinkedIn / TikTok / Microsoft Ads (catalog stubs ready)
- [ ] Website auditing
- [ ] Apple App Store / Google Play analytics
- [ ] Public multi-tenant signup (if ever)
- [ ] Client / freelancer portal login
- [ ] Keyword / backlink / competitor report modules
