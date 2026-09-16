# Multi Google accounts for the agency portal

**Question:** As portal owner (agency admin) with many clients and websites, can the agency sync **multiple Gmails** into Astralytics?

**Agents:** repo map + market IA + critique. Consensus: **yes as a product direction**; **not a safe drop-in on today’s single-slot model**.

## What you already have

```
Admin (portal owner)
└── Clients (many)                    ✅ already
    └── Websites (many per client)    ✅ already
        └── Connections (GA4/GSC/Ads) ✅ already
```

Google identity today:

```
Admin user
└── ONE agency Gmail   (admin_google_tokens.user_id PRIMARY KEY)
    └── inventory Sync / Import / Use portal Google
+ optional per-website OAuth (local) per site
```

Reconnect **replaces** that one slot; it does not add a second agency login.

## Why multiple agency Gmails (real cases)

- Founder Gmail owns some clients; SEO lead Gmail owns others  
- Separate Ads MCC logins by region/vertical  
- Acquired agency keeps its old Google login  
- Client grants access only to a dedicated `agency+brand@…` inbox  

Market tools (AgencyAnalytics-class) treat “connect another Google” as a data source.

## Verdict

| Horizon | Decision |
|---|---|
| **Now (v1)** | Keep **1 agency Gmail** + invite that Gmail + per-site OAuth escape hatch |
| **Next (v1.5)** | Harden single login (store email, stop blind heal/clone, no promote-from-website surprises) |
| **Later (v2)** | **Multiple named Google identities** per agency, each with its own Sync inventory |

Do **not** ship “Add another agency Google” until each connection knows **which** Gmail owns it — otherwise reconnect/heal mixes tokens across clients.

## Target hierarchy (v2)

```
Admin (portal owner)
├── Google identity A  (agency@company.com)     ← Sync inventory A
├── Google identity B  (mcc-us@company.com)     ← Sync inventory B
├── Google identity C  (partner@…)              ← Sync inventory C  [optional; prefer local for true partners]
└── Clients
    └── Website
        └── Connection → google_identity_id OR website-local token
```

Rules:

1. One OAuth **app** in `.env` (Client ID/Secret never shared with clients).  
2. Many **user refresh tokens** (one per Gmail).  
3. Discover/Import is **per identity** (picker), not one merged list (duplicate properties / wrong token).  
4. Heal/reconnect only rows bound to that identity.  
5. Partner/client-owned logins stay **website-local** unless you intentionally add them as an agency identity.

## How to cover clients today (without multi-login)

1. Prefer: invite **one** agency Gmail to all GA4/GSC/Ads → Sync once.  
2. Or MCC: one login sees many Ads customers → link per website.  
3. Or Integrations → **Connect this site’s Google** when that Gmail can’t see the property.  
4. Multiple websites under one client: Add website → bind Google per site (see `MULTI_WEBSITE_ACCESS.md`).

## Anti-patterns

- Emailing Client ID/Secret to anyone  
- Overwriting agency token when connecting a second Gmail (current schema)  
- Merging all Gmails’ properties into one flat list without ownership  
- Healing every website with whatever token was last connected  

## Suggested build order

1. **P0** — Document + UX honesty: “one agency Google; reconnect replaces it”  
2. **P1** — Store `google_email` on the single admin token; show it on Google accounts / invite checklist  
3. **P2** — `google_accounts` (1:N) + `connections.google_account_id` + picker on `/google-accounts`  
4. **P2** — Migrate existing `admin_google_tokens` → default identity; scoped heal  

Full standards-backed plan (RFCs, NIST, Google Ads multi-user, phased acceptance criteria):

→ **`docs/02-product-plans/01-google-identity/STANDARDS_MULTI_GOOGLE_PLAN.md`**

## Related docs

- `docs/02-product-plans/01-google-identity/STANDARDS_MULTI_GOOGLE_PLAN.md` — research plan (authoritative)
- `docs/01-core/03-product-ux/NAVIGATION.md` — three Google layers  
- `docs/02-product-plans/02-websites/MULTI_WEBSITE_ACCESS.md` — add website + invite vs local OAuth  
- `db/schema.sql` — `admin_google_tokens`  
