---
description: Resume or replicate Webastral from the development logbook (use in any Cursor profile on this repo)
---

# Replicate / resume Webastral from the logbook

You are continuing **Webastral** (SEO reporting portal) in this repo.

## Single source of truth (read in this order)

1. `docs/01-core/01-shipping/DEV_LOGBOOK.md` — day-by-day what/how (newest first)
2. `docs/01-core/01-shipping/ACCOUNT_INTEGRATIONS_PLAN.md` — master Done / Pending + smoke
3. `docs/01-core/01-shipping/PHASES.md` — phase status
4. `docs/README.md` — full folder map (every doc has a labeled folder)
5. `Engineering.md` — stack, ports, env (never ask for secrets in chat; gitignored)
6. `.cursor/rules/seo-reporting-collaboration.mdc` — product instincts
7. `docs/01-core/04-integrations/STANDARD_GOOGLE_ACCESS_REVOKED.md` — if touching Google token / revoke UX

## Do this now

1. Summarize in ≤8 bullets: **current Done**, **top Pending**, **last logbook date**
2. Ask which Pending item to execute next (or continue the newest incomplete smoke)
3. When you ship anything: append/update `docs/01-core/01-shipping/DEV_LOGBOOK.md` **and** the master checklist the same turn
4. Prefer minimal diffs; no commit/push unless asked
5. Client-facing reports: no internal roadmap / Phase language

## Stack reminder

- UI: `web/` → http://localhost:3000  
- API: `src/` → http://localhost:4000  
- `npm run dev` from repo root  

Start by reading the logbook and checklist, then report status.
