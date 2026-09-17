# Webastral

Admin SEO / marketing reporting portal: connect Google (GA4, Search Console, Ads) and Meta, sync snapshots, review Overview / platform pages, and generate branded client reports (PDF via print).

## Stack

| Piece | Path | Port |
|-------|------|------|
| Next.js UI | `web/` | 3000 |
| Express API | `src/` | 4000 |
| PostgreSQL | `db/schema.postgres.sql` via `DATABASE_URL` | **5434** local embedded (`npm run db:pg:start`); 5432 only if using `docker-compose.yml` |

Requires **Node.js 24+**.

## Quick start

```bash
cp .env.example .env
# Edit AUTH_SECRET, APP_ENCRYPTION_KEY, APP_URL, Google OAuth fields
npm install
# Terminal A — local Postgres (embedded, no Docker):
npm run db:pg:start
# Terminal B:
npm run db:init
npm run db:verify
# Optional: copy legacy SQLite → Postgres (keeps db/app.sqlite as backup)
# npm run db:migrate-sqlite
npm run dev
```

- UI: http://localhost:3000  
- API health: http://localhost:4000/health  

Never commit `.env` or live database files. Legacy `db/app.sqlite` is backup-only after cutover.

## Docs

See **[docs/README.md](docs/README.md)** — every document sits in a numbered, labeled folder.

| Folder | Contents |
|--------|----------|
| `docs/01-core/` | Current truth (shipping, SRS, UX, integrations, data/API) |
| `docs/02-product-plans/` | Research plans |
| `docs/03-qa/` | Alpha / test reports |
| `docs/04-audits-archive/` | Historical audits |

Day log: [docs/01-core/01-shipping/DEV_LOGBOOK.md](docs/01-core/01-shipping/DEV_LOGBOOK.md)  
Checklist: [docs/01-core/01-shipping/ACCOUNT_INTEGRATIONS_PLAN.md](docs/01-core/01-shipping/ACCOUNT_INTEGRATIONS_PLAN.md)

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Embedded PG + API + web |
| `npm run db:pg:start` | Local Postgres (UTF-8, port 5434) — leave running if not using `dev` |
| `npm run db:init` | Apply `schema.postgres.sql` / seed |
| `npm run db:verify` | Confirm required tables |
| `npm run smoke:pg` | API smoke against running API + PG |
| `npm run build` / `npm start` | Production build + start (**does not** start Postgres) |
| `npm run smoke:ui` | UI smoke against running API |

## Repo layout

```
web/          Next.js app
src/          Express API + Google/Meta libs
db/           schema.postgres.sql (live); schema.sql leftover SQLite; sqlite files gitignored
docs/         Product docs (see docs/README.md)
scripts/      init-db + smoke scripts
.cursor/      Agent rules + /replicate-webastral command
```

`client/` is a legacy Vite experiment — not the live UI.

## Git / secrets

Ignored (do not force-add): `.env`, `Engineering.md`, `db/*.sqlite*`, `cookies.txt`, `design-mocks/`, `node_modules/`, `web/.next/`.

Remote: `https://github.com/developer1607/seo-tool.git`
