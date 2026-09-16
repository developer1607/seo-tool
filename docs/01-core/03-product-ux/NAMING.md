# Naming — Webastral

## Hierarchy

```
ADMIN          (only login for now)
  └── Client   (brand profile — NOT a login)
        └── Website   (one or many domains)
              ├── Connections (per provider)
              ├── Metric snapshots
              └── Reports
```

| Term | Schema / UI |
| --- | --- |
| Admin | `users.role = ADMIN` |
| Client | `clients` — name, logo, brand colors |
| Website | `websites` — name, url; switcher in shell |
| Connection | `connections` — OAuth per **website** + provider |
| Report | `reports` — scoped to website |

## Future (not this pass)

- Discover GA4/GSC properties from agency Google access → suggest/create Client/Website
- Freelancer login managing their own sites
- Still one platform Google/Meta app in `.env`

## Routes

| Path | Purpose |
| --- | --- |
| `/login` | Admin |
| `/clients/:id` | Client + websites list; **always** live-verifies Google access |
| `/clients/:id/add-website` | Add website |
| `/` | Overview for **selected website**; verifies Google if `NEEDS_REAUTH` |
| `/platforms/:key` | Channel page; verifies Google if that channel is `NEEDS_REAUTH` |
| `/integrations` | Connect platforms for selected website |
| `/reports` | Reports for selected website |
| `/settings` | Admin + platform OAuth **env** health |

**Google access revoked:** see `docs/01-core/04-integrations/STANDARD_GOOGLE_ACCESS_REVOKED.md` — confirm via API, then Remove client / Reconnect. Do not invent alternate banners.
