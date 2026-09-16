# API response → schema → views

Single source of truth for how provider JSON becomes dashboard data. UI **never** reads raw Google/Meta payloads in the browser. Sync writes normalized rows; views bind only to **view models** below.

Related: `docs/METRICS.md` (field meanings), `docs/01-core/04-integrations/INTEGRATIONS.md` (connect), `docs/ONBOARDING.md` (conversion map), `docs/IA.md` (routes), `db/schema.sql`.

---

## Pipeline

```
Provider API JSON
    → sync module (src/lib/integrations/*)
    → parse + map via onboarding + connection.config_json
    → metric_snapshots (+ payload_json for breakdowns)
    → view model builders (src/lib/metrics/views.js)
    → EJS pages
```

| Rule | Detail |
| --- | --- |
| No live tokens in views | Pages load snapshots / connection status only |
| One day = one row per source | Unique `(website_id, source, date)` |
| Range rollup in app | Sum / avg over last N days for KPI cards |
| Attribution | Never merge Meta + GA4 into one “truth” number |
| Missing map | Hide conversion KPIs; show setup banner |

Default range PoC: **last 28 days** (exclusive of today when provider data is incomplete).

---

## Schema layout (logical)

```
users
  └── websites (client_id)
        ├── website_onboarding (1:1)
        ├── connections (1 per provider)
        ├── metric_snapshots (many: source × date)
        └── notifications (optional website_id)

notifications also: user_id (recipient), audience ADMIN|CLIENT|WEBSITE
```

Full DDL: `db/schema.sql`.

### `metric_snapshots` columns (normalized)

| Column | Type | Filled by |
| --- | --- | --- |
| `website_id` | FK | all |
| `source` | enum | `GOOGLE_SEARCH_CONSOLE` \| `GOOGLE_ANALYTICS` \| `META_ADS` \| later `GOOGLE_ADS` |
| `date` | DATE | day bucket |
| `spend` | REAL | Meta / Google Ads |
| `impressions` | REAL | GSC / Meta / Ads |
| `clicks` | REAL | GSC / Meta / Ads |
| `ctr` | REAL | derived or provider |
| `avg_position` | REAL | GSC only |
| `sessions` | REAL | GA4 |
| `users` | REAL | GA4 |
| `engaged_sessions` | REAL | GA4 |
| `engagement_rate` | REAL | GA4 |
| `primary_conversions` | REAL | mapped GA4 / Meta / Ads |
| `primary_value` | REAL | revenue / action_values |
| `efficiency` | REAL | ROAS or CPA (see `efficiency_kind`) |
| `efficiency_kind` | TEXT | `ROAS` \| `CPA` \| `NONE` |
| `payload_json` | TEXT | breakdowns (queries, pages, campaigns, series) |
| `synced_at` | TEXT | ISO |

### `payload_json` shapes (per source)

**GSC**

```json
{
  "top_queries": [
    { "query": "example shoes", "clicks": 42, "impressions": 900, "ctr": 0.0467, "position": 8.2, "branded": false }
  ],
  "top_pages": [
    { "page": "https://example.com/shoes", "clicks": 30, "impressions": 400, "ctr": 0.075, "position": 5.1 }
  ],
  "branded_clicks": 10,
  "non_branded_clicks": 32,
  "data_state": "final"
}
```

**GA4**

```json
{
  "by_channel": [
    { "channel": "Organic Search", "sessions": 120, "users": 100, "key_events": 8 }
  ],
  "by_landing": [
    { "path": "/shoes", "sessions": 40, "key_events": 3 }
  ],
  "key_events_by_name": [
    { "eventName": "generate_lead", "eventCount": 12 }
  ],
  "series": [
    { "date": "2026-09-01", "sessions": 40, "users": 35, "key_events": 2 }
  ]
}
```

**Meta**

```json
{
  "campaigns": [
    {
      "campaign_id": "1201",
      "campaign_name": "Prospecting — Leads",
      "spend": 150.5,
      "impressions": 20000,
      "clicks": 400,
      "primary_conversions": 18,
      "primary_value": null,
      "efficiency": 8.36,
      "efficiency_kind": "CPA"
    }
  ],
  "actions_raw_sample": [
    { "action_type": "lead", "value": "18" },
    { "action_type": "link_click", "value": "400" }
  ],
  "mapped_action_types": ["lead"],
  "series": [
    { "date": "2026-09-01", "spend": 20, "primary_conversions": 2 }
  ]
}
```

---

## 1. Google Search Console — raw → normalize

### Request (conceptual)

```
POST https://www.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query
{
  "startDate": "2026-08-13",
  "endDate": "2026-09-09",
  "dimensions": ["date"],
  "rowLimit": 1000,
  "dataState": "final"
}
```

Second calls with `dimensions: ["query"]` and `["page"]` for payload.

### Example response (date dimension)

```json
{
  "rows": [
    {
      "keys": ["2026-09-01"],
      "clicks": 48,
      "impressions": 1200,
      "ctr": 0.04,
      "position": 12.5
    }
  ],
  "responseAggregationType": "auto"
}
```

### Map → `metric_snapshots` (one row per day)

| API | Column |
| --- | --- |
| `keys[0]` | `date` |
| `clicks` | `clicks` |
| `impressions` | `impressions` |
| `ctr` | `ctr` |
| `position` | `avg_position` |
| — | `spend`, sessions, conversions = null |

`source` = `GOOGLE_SEARCH_CONSOLE`.

### View use

| Page | Uses |
| --- | --- |
| Overview (site / global) | Sum `clicks`, `impressions`; weighted avg `avg_position` |
| Performance → Google Organic | Same + sparkline from daily rows |
| Performance detail | `payload_json.top_queries` / `top_pages` |

---

## 2. Google Analytics 4 — raw → normalize

### Request (conceptual)

```
POST https://analyticsdata.googleapis.com/v1beta/properties/{id}:runReport
{
  "dateRanges": [{ "startDate": "28daysAgo", "endDate": "yesterday" }],
  "dimensions": [{ "name": "date" }],
  "metrics": [
    { "name": "sessions" },
    { "name": "totalUsers" },
    { "name": "engagedSessions" },
    { "name": "engagementRate" },
    { "name": "keyEvents" },
    { "name": "purchaseRevenue" }
  ]
}
```

For mapped conversions: filter or second report on `eventName` ∈ onboarding `ga4_key_events_json`.

### Example response

```json
{
  "dimensionHeaders": [{ "name": "date" }],
  "metricHeaders": [
    { "name": "sessions", "type": "TYPE_INTEGER" },
    { "name": "totalUsers", "type": "TYPE_INTEGER" },
    { "name": "engagedSessions", "type": "TYPE_INTEGER" },
    { "name": "engagementRate", "type": "TYPE_FLOAT" },
    { "name": "keyEvents", "type": "TYPE_INTEGER" },
    { "name": "purchaseRevenue", "type": "TYPE_CURRENCY" }
  ],
  "rows": [
    {
      "dimensionValues": [{ "value": "20260901" }],
      "metricValues": [
        { "value": "120" },
        { "value": "98" },
        { "value": "70" },
        { "value": "0.583" },
        { "value": "5" },
        { "value": "0" }
      ]
    }
  ],
  "rowCount": 1
}
```

### Map → columns

| API metric | Column | Notes |
| --- | --- | --- |
| date `YYYYMMDD` → `YYYY-MM-DD` | `date` | |
| `sessions` | `sessions` | |
| `totalUsers` / `activeUsers` | `users` | Prefer `totalUsers` for range |
| `engagedSessions` | `engaged_sessions` | |
| `engagementRate` | `engagement_rate` | |
| Mapped key event count | `primary_conversions` | Not raw unfiltered `keyEvents` if map exists |
| `purchaseRevenue` when goal ECOMMERCE | `primary_value` | Else null |
| — | `efficiency_kind` = `NONE` | Organic analytics |

`source` = `GOOGLE_ANALYTICS`.

### List properties (select step)

```json
{
  "accountSummaries": [
    {
      "account": "accounts/123",
      "displayName": "Example Org",
      "propertySummaries": [
        {
          "property": "properties/456789",
          "displayName": "example.com GA4"
        }
      ]
    }
  ]
}
```

Store `external_account_id` = `properties/456789`, `external_account_name` = display name.

---

## 3. Meta Ads Insights — raw → normalize

### Request (conceptual)

```
GET /v21.0/act_{AD_ACCOUNT_ID}/insights
  ?fields=spend,impressions,clicks,ctr,cpc,actions,action_values,purchase_roas,campaign_name,campaign_id
  &time_increment=1
  &time_range={"since":"2026-08-13","until":"2026-09-09"}
  &level=account
```

Campaign list: same with `level=campaign`.

### Example response (account day)

```json
{
  "data": [
    {
      "spend": "42.50",
      "impressions": "15000",
      "clicks": "320",
      "ctr": "2.133",
      "cpc": "0.132812",
      "actions": [
        { "action_type": "link_click", "value": "300" },
        { "action_type": "lead", "value": "7" },
        { "action_type": "omni_purchase", "value": "1" }
      ],
      "action_values": [
        { "action_type": "omni_purchase", "value": "89.00" }
      ],
      "purchase_roas": [
        { "action_type": "omni_purchase", "value": "2.09" }
      ],
      "date_start": "2026-09-01",
      "date_stop": "2026-09-01"
    }
  ],
  "paging": { "cursors": { "before": "…", "after": "…" } }
}
```

### Parse rule (mandatory)

```
mapped = onboarding.meta_action_types_json   // e.g. ["lead"]
primary_conversions = sum(actions[i].value where action_type in mapped)
primary_value       = sum(action_values[i].value where action_type in mapped)  // ecommerce
if value_mode == REVENUE and spend > 0:
  efficiency = primary_value / spend; efficiency_kind = ROAS
elif primary_conversions > 0:
  efficiency = spend / primary_conversions; efficiency_kind = CPA
else:
  efficiency_kind = NONE
```

Never use `actions[0]`. Meta `ctr` is often **percent** (2.133 = 2.133%); store as fraction `0.02133` or keep percent consistently — **PoC: store fraction 0–1** after `/100` when value > 1 looks like percent.

### Map → columns

| API | Column |
| --- | --- |
| `date_start` | `date` |
| `spend` | `spend` |
| `impressions` | `impressions` |
| `clicks` | `clicks` |
| derived ctr | `ctr` |
| mapped actions | `primary_conversions` |
| mapped action_values | `primary_value` |
| ROAS or CPA | `efficiency` + `efficiency_kind` |

`source` = `META_ADS`.

### Ad accounts list (select step)

```json
{
  "data": [
    {
      "account_id": "123456789",
      "id": "act_123456789",
      "name": "Example Brand Ads",
      "currency": "INR",
      "timezone_name": "Asia/Kolkata",
      "account_status": 1
    }
  ]
}
```

Store `external_account_id` = `act_123456789`.

---

## 4. View models (what EJS receives)

Builders return plain objects — no provider keys, no tokens.

### `OverviewAdminVM`

```json
{
  "totals": {
    "clients": 12,
    "websites": 34,
    "connections_active": 40,
    "connections_error": 3,
    "connections_needs_reauth": 2
  },
  "kpis": {
    "organic_clicks": 8400,
    "sessions": 22100,
    "meta_spend": 15230.5,
    "primary_conversions": 410,
    "range_label": "Last 28 days"
  },
  "alerts": [
    { "id": "…", "severity": "warn", "title": "3 connections need reconnect", "href": "/clients" }
  ],
  "unread_notifications": 5
}
```

### `OverviewClientVM`

Same shape without `totals.clients`; websites scoped to `client_id`.

### `WebsiteOverviewVM`

```json
{
  "website": { "id": 1, "name": "Example", "domain": "https://example.com" },
  "setup": {
    "onboarding_status": "COMPLETE",
    "channels_enabled": ["GSC", "GA4", "META_ADS"],
    "connections": [
      { "provider": "GOOGLE_SEARCH_CONSOLE", "status": "ACTIVE", "label": "sc-domain:example.com", "last_sync_at": "…" },
      { "provider": "GOOGLE_ANALYTICS", "status": "NEEDS_REAUTH", "label": "properties/456", "last_error": "Token revoked" },
      { "provider": "META_ADS", "status": "ACTIVE", "label": "Example Brand Ads", "last_sync_at": "…" }
    ]
  },
  "kpis": {
    "organic_clicks": 420,
    "sessions": 1100,
    "meta_spend": 890,
    "primary_conversions": 22,
    "avg_position": 14.2,
    "efficiency": 8.5,
    "efficiency_kind": "CPA",
    "range_label": "Last 28 days"
  },
  "series": {
    "labels": ["Sep 1", "Sep 2"],
    "organic_clicks": [20, 18],
    "sessions": [40, 35],
    "meta_spend": [30, 28]
  },
  "banners": [
    { "type": "error", "text": "Reconnect Google Analytics", "href": "/websites/1/integrations" }
  ]
}
```

### `PerformanceVM`

```json
{
  "website": { "id": 1, "name": "Example" },
  "range_label": "Last 28 days",
  "channels": [
    {
      "key": "GOOGLE_ORGANIC",
      "label": "Google Organic",
      "status": "ACTIVE",
      "metrics": {
        "clicks": 420,
        "impressions": 18000,
        "ctr": 0.023,
        "avg_position": 14.2,
        "sessions": 1100,
        "primary_conversions": 12
      },
      "href_detail": null
    },
    {
      "key": "META_ADS",
      "label": "Meta Ads",
      "status": "ACTIVE",
      "metrics": {
        "spend": 890,
        "impressions": 220000,
        "clicks": 4100,
        "ctr": 0.0186,
        "primary_conversions": 22,
        "efficiency": 40.45,
        "efficiency_kind": "CPA"
      },
      "campaigns": [ { "name": "Prospecting — Leads", "spend": 150.5, "primary_conversions": 18, "efficiency": 8.36, "efficiency_kind": "CPA" } ]
    }
  ],
  "hidden_channels": [
    { "key": "GOOGLE_ADS", "label": "Google Ads", "reason": "Phase 1" }
  ]
}
```

**Google Organic row** = GSC delivery metrics + GA4 sessions/conversions when both connected; label columns clearly (do not pretend GSC clicks = sessions).

### `IntegrationsVM`

```json
{
  "website": { "id": 1, "name": "Example" },
  "providers": [
    {
      "key": "GOOGLE_ANALYTICS",
      "label": "Google Analytics 4",
      "phase": 0,
      "status": "ACTIVE",
      "account_name": "example.com GA4",
      "last_sync_at": "…",
      "last_error": null,
      "actions": ["sync", "disconnect", "configure"]
    },
    {
      "key": "GOOGLE_ADS",
      "label": "Google Ads",
      "phase": 1,
      "status": "COMING_SOON",
      "actions": []
    }
  ]
}
```

---

## 5. Page → data binding matrix

| Route | Primary VM | KPI sources | Empty / error UX |
| --- | --- | --- | --- |
| `GET /` Admin | `OverviewAdminVM` | Rollup all websites’ snapshots | Zero state: create Client |
| `GET /` Client | `OverviewClientVM` | Own websites | CTA: add Website |
| `GET /clients` | list + connection health badges | users + websites counts | — |
| `GET /clients/:id` | client + websites cards | per-site connection pills | — |
| `GET /websites` | website cards | last sync + setup status | Add website |
| `GET /websites/:id` | `WebsiteOverviewVM` | snapshots + connections | Setup incomplete banner |
| `GET /websites/:id/performance` | `PerformanceVM` | snapshots + Meta campaigns JSON | Channel “Connect” CTA |
| `GET /websites/:id/onboarding` | form from `website_onboarding` | — | Draft save |
| `GET /websites/:id/integrations` | `IntegrationsVM` | connections only | Wizard |
| `GET /websites/:id/reports` | stub | — | Coming soon |
| `GET /reports` | stub list | — | — |
| `GET /settings` | profile + Admin platform env health | env booleans only | Missing GOOGLE_* warn |
| Notifications drawer | `NotificationVM[]` | `notifications` table | Mark read |

---

## 6. Navigation (PoC) ↔ notifications entry points

```
Sidebar
  Overview          → rollup alerts strip
  Clients|Websites  → row badges (ERROR / NEEDS_REAUTH)
  Reports
  Settings

Header
  Bell              → /notifications or drawer (all layers)
  User menu

Website tabs
  Overview | Performance | Onboarding | Integrations | Reports
  → banners from connection status + unread website-scoped notifications
```

Full notification catalog: `docs/NOTIFICATIONS.md`.

---

## 7. Aggregation helpers (implement once)

| Helper | Logic |
| --- | --- |
| `sum(field)` | Sum over dates in range |
| `avgPosition` | Σ(position × impressions) / Σ(impressions) |
| `avgCtr` | sum(clicks) / sum(impressions) |
| `rollupEfficiency` | If kind ROAS: sum(value)/sum(spend); if CPA: sum(spend)/sum(conversions) |
| `channelRowOrganic` | GSC sums + GA4 sessions/conversions side-by-side |

---

## 8. Sync checklist (prevent view bugs)

1. Write daily rows, not only range totals
2. Store Meta campaigns in `payload_json` of account-level day **or** separate sync write attached to latest day — PoC: attach campaign rollup for range on sync metadata table later; for PoC put **range campaign list** in a `sync_cache` JSON on connection `config_json.campaigns_cache` updated each sync
3. Onboarding change → do not rewrite history; next sync uses new map
4. Disconnect → keep snapshots; Performance shows channel as Disconnected
5. Probe failure → no ACTIVE; notify; views show previous snapshots + banner

---

## 9. Phase 1 stub (Google Ads) — do not build yet

Same snapshot columns. GAQL micros → currency. `efficiency_kind` ROAS/CPA from conversions_value / cost. Appears as third Performance channel when ACTIVE.
