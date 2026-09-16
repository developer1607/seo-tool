# Webastral

Admin SEO / marketing reporting portal: connect Google (GA4, Search Console, Ads) and Meta, sync snapshots, review Overview / platform pages, and generate branded client reports (PDF via print).

## Stack

| Piece | Path | Port |
|-------|------|------|
| Next.js UI | `web/` | 3000 |
| Express API | `src/` | 4000 |
| SQLite | `db/schema.sql` → `db/app.sqlite` (local, gitignored) | — |

Requires **Node.js 24+**.

## Quick start

```bash
cp .env.example .env
# Edit AUTH_SECRET, APP_ENCRYPTION_KEY, APP_URL, Google OAuth fields
npm run setup
npm run dev
```

- UI: http://localhost:3000  
- API health: http://localhost:4000/health  

Never commit `.env` or live SQLite files.

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
| `npm run dev` | API + web together |
| `npm run build` / `npm start` | Production build + start |
| `npm run db:init` | Apply schema / seed |
| `npm run smoke:ui` | UI smoke against running API |

## Repo layout

```
web/          Next.js app
src/          Express API + Google/Meta libs
db/           schema.sql (sqlite files gitignored)
docs/         Product docs (see docs/README.md)
scripts/      init-db + smoke scripts
.cursor/      Agent rules + /replicate-webastral command
```

`client/` is a legacy Vite experiment — not the live UI.

## Git / secrets

Ignored (do not force-add): `.env`, `Engineering.md`, `db/*.sqlite*`, `cookies.txt`, `design-mocks/`, `node_modules/`, `web/.next/`.

Remote: `https://github.com/developer1607/seo-tool.git`
