# Provenance & expandable integrations schema

Research + DDL design for client provenance, website domains, and future channels (LinkedIn, TikTok, Microsoft Ads, …) without another schema rewrite.

Related: `INTEGRATIONS.md`, `src/lib/integrations/catalog.js`, `src/lib/clientProvenance.js`, `db/schema.postgres.sql`.

---

## Research summary (2026-09-21)

Agency reporting stacks (AgencyAnalytics-style, warehouse connectors like OWOX / SyncRange) share the same shape:

1. **Tenant / client** owns reporting truth.
2. **Many ad + analytics platforms** attach as data sources (Google, Meta, LinkedIn, TikTok, Microsoft/Bing, …).
3. **Normalized warehouse facts** (spend, impressions, clicks, conversions by date) keyed by platform + account + date.
4. **Access control** is usually by client and/or property domain — not by raw OAuth account id.

Hard `CHECK (provider IN (…))` constraints force a migration for every new channel. Industry practice: **open string keys + a product catalog**.

---

## Mental model

| Concept | Column / table | Rule |
| --- | --- | --- |
| First provenance | `clients.origin` | Family: `MANUAL` \| `GOOGLE` \| `META` \| `LINKEDIN` \| `TIKTOK` \| `MICROSOFT` \| `OTHER`. **Never overwritten** when another channel links later. |
| Channel history | `client_sources` | One row per `(client, source, external_account_id)`. Includes `family` + optional `meta_json`. |
| Domain ACL key | `websites.primary_domain` | Lowercase hostname without `www.` — future `user_domain_access`. |
| Live connection | `connections.provider` | Catalog key (`GOOGLE_ANALYTICS`, `META_ADS`, `LINKEDIN_ADS`, …). Open TEXT. |
| Metrics | `metric_snapshots.source` | Same key family as connection provider. Open TEXT. |
| OAuth identity | `data_identities.provider` | Family slug (`google`, `meta`, later `linkedin`). Open TEXT. |
| Product registry | `integration_providers` | Seeded from `catalog.js` on migrate. `enabled=0` = Coming soon. |
| Future ACL | `user_client_access`, `user_domain_access` | Stub tables only — no employee UI this pass. |

```
Create paths          Persist
─────────────────     ──────────────────────────────────────
Add Client      →     origin=MANUAL + source MANUAL
Google import   →     origin=GOOGLE (if new) + GA4/GSC/Ads sources
Meta create+link→     origin=META + META_ADS + primary_domain from URL
Meta link only  →     origin unchanged + META_ADS source
Later LinkedIn  →     origin=LINKEDIN (if new) + LINKEDIN_ADS — same helpers
```

---

## How to add a future integration

1. Append a row in `src/lib/integrations/catalog.js` (`PROVIDERS`).
2. Implement OAuth + list/probe/sync under `src/lib/<platform>/` (same lifecycle as Meta/Google).
3. On create/link, call `setClientOriginIfNew(…, family)` + `recordClientSource(…, sourceKey)`.
4. Restart / migrate seeds `integration_providers` — **no ALTER for CHECKs**.

Do **not** re-introduce closed CHECKs on `provider` / `source` / `origin`.

---

## Status machine (unchanged)

`NOT_STARTED` → `PENDING_AUTH` → `PENDING_SELECT` → `ACTIVE` \| `ERROR` \| `NEEDS_REAUTH` \| `DISCONNECTED`.

Never mark Connected without probe.

---

## Employee multi-tenant (later)

Grants attach to `user_client_access.client_id` and/or `user_domain_access.primary_domain`. Filter list/overview queries by those tables once employee roles ship. Provenance + domain indexes are the prerequisite shipped now.
