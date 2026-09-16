# Research index

| Doc | Contents |
| --- | --- |
| `SRS.md` | **Canonical requirements** (from SRS PDF) — Astralytics AI |
| `IA.md` | Admin shell, client switcher, platform tabs |
| `NAMING.md` | Admin / Client profile (no client login) |
| `METRICS.md` | API fields & conversion parsing |
| `API_VIEW_MAP.md` | Provider JSON → snapshots → views (align `client_id`) |
| `INTEGRATIONS.md` | Connect lifecycle |
| `NOTIFICATIONS.md` | Alerts |
| `PHASES.md` | Delivery phases |
| `DESIGN.md` | Dense dashboard UI |

Source PDF: `docs/design-mocks/Software Requirements Specification (SRS).pdf` (gitignored).

## Architecture notes (from SRS annex)

1. Normalize four APIs into one metric model per `client_id`
2. Encrypt OAuth tokens; never mix clients
3. Sync → DB → dashboard (not live API on every click)
4. Soft-fail per platform
5. Share links = secure tokens; Email/WhatsApp share the link
6. Build order: DB → clients → OAuth → sync → dates → UI → AI → PDF → share
