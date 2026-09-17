# Delivery phases — Webastral

Aligned to `docs/01-core/02-requirements/SRS.md` and `docs/01-core/01-shipping/ACCOUNT_INTEGRATIONS_PLAN.md`.  
**Checklist updated:** 2026-09-17  

**Data:** local PostgreSQL via `DATABASE_URL` (`db/schema.postgres.sql`). See `DOC_AND_PG_EVAL-2026-09-17.md`. Prod Postgres still pending.

## Account / Integrations track (Cursor-style)

| Phase | Status |
|-------|--------|
| 0 Harden single Google identity | Done |
| A Portal SSO (password + Continue with Google) | Done |
| B Integrations hub | Done |
| C Multi Google/Meta data identities | Done |
| D Meta Ads connect | Dev Connect works (scopes fixed 2026-09-16) — App Review / external BMs pending |
| E Polish + cron Sync | Pending |

Master checklist: `docs/01-core/01-shipping/ACCOUNT_INTEGRATIONS_PLAN.md` (top of file).

## Phase 0 — Shell + clients (done)

- [x] Admin-only login
- [x] Client CRUD + branding fields + switcher
- [x] Nav: Overview · Google Ads · Meta · GA4 · GSC · Integrations · Reports
- [x] Date range presets + prior-period Δ placeholders
- [x] Schema: clients, connections, snapshots, reports

## Phase 1 — Live data (mostly done)

- [x] OAuth + probe + sync for GA4, GSC, Google Ads
- [x] Meta Ads OAuth + link + sync (ops/App Review still open)
- [x] Cache + last sync; soft-fail per source
- [x] Charts on platform pages (interactive Recharts + channel tables)
- [x] Google access revoked standard (live confirm + Remove client)
- [ ] Scheduled / nightly Sync job
- [ ] On-visit Sync for performance pages

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

- [ ] Website auditing
- [ ] Apple App Store / Google Play analytics
- [ ] Public multi-tenant signup (if ever)
- [ ] Client / freelancer portal login
- [ ] Keyword / backlink / competitor report modules