# Webastral documentation

Numbered folders keep order and labels clear. **Every document lives in a labeled subfolder** (nothing loose except this index).

```
docs/
├── README.md                          ← you are here
├── 01-core/                           Core (current truth)
│   ├── 01-shipping/                   Logbook, checklist, phases
│   ├── 02-requirements/               SRS
│   ├── 03-product-ux/                 Nav, IA, design, naming, onboarding
│   ├── 04-integrations/               Integrations + revoke standard
│   ├── 05-data-api/                   Metrics, API map, notifications
│   └── 06-engineering/                Legacy / unmounted notes
├── 02-product-plans/                  Longer research (reference)
│   ├── 01-google-identity/
│   └── 02-websites/
├── 03-qa/                             Test / alpha packs
│   └── 01-alpha/
├── 04-audits-archive/                 Historical audits
│   ├── 01-handoffs/
│   ├── 02-portal-audits/
│   └── 03-research/
└── design-mocks/                      Local only — gitignored
```

## Start here

| Path | Role |
|------|------|
| [01-core/01-shipping/DEV_LOGBOOK.md](./01-core/01-shipping/DEV_LOGBOOK.md) | Day-by-day shipping log |
| [01-core/01-shipping/ACCOUNT_INTEGRATIONS_PLAN.md](./01-core/01-shipping/ACCOUNT_INTEGRATIONS_PLAN.md) | Master Done / Pending |
| [01-core/01-shipping/PHASES.md](./01-core/01-shipping/PHASES.md) | Phase board |
| [01-core/01-shipping/DOC_AND_PG_EVAL-2026-09-17.md](./01-core/01-shipping/DOC_AND_PG_EVAL-2026-09-17.md) | Docs vs Postgres cutover |
| [01-core/02-requirements/SRS.md](./01-core/02-requirements/SRS.md) | Requirements |
| [01-core/04-integrations/STANDARD_GOOGLE_ACCESS_REVOKED.md](./01-core/04-integrations/STANDARD_GOOGLE_ACCESS_REVOKED.md) | Revoke UX standard |

Local stack: root `Engineering.md` (gitignored). Env: `.env.example`.  
Cursor: **`/replicate-webastral`**.

## Folder labels

| # | Folder | Label |
|---|--------|--------|
| 01 | [`01-core/`](./01-core/) | **Core** — what is true now |
| 02 | [`02-product-plans/`](./02-product-plans/) | **Product plans** — research / future design |
| 03 | [`03-qa/`](./03-qa/) | **QA** — alpha & deploy readiness |
| 04 | [`04-audits-archive/`](./04-audits-archive/) | **Audits archive** — historical only |

## Do not commit

`.env`, `db/*.sqlite*`, `cookies.txt`, `Engineering.md`, `docs/design-mocks/`, `node_modules/`, `web/.next/`
