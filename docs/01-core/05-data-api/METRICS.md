# Metrics & conversions catalog

How we get numbers from each API, what “conversion” means on each platform, and how we normalize them for dashboards. Aligns with design mocks (Overview KPIs, Performance channels) and onboarding goals (`docs/ONBOARDING.md`).

**PoC sources:** Google Analytics 4, Google Search Console, Meta Ads Insights.  
**Phase 1:** Google Ads API.  
**Out of PoC:** LinkedIn, TikTok, Conversions API *write* paths (CAPI is for sending events *to* Meta, not for reading report metrics).

---

## Mental model

| Layer | Question | Source |
| --- | --- | --- |
| Visibility | Are we showing up in search? | Search Console |
| Behavior | What happens on the site? | GA4 |
| Paid Meta | What did Meta ads cost and return? | Meta Ads Insights |
| Paid Google | What did Google Ads cost and return? | Google Ads API (Phase 1) |

Conversions are **not** one field across vendors. Onboarding maps each Website’s primary conversion to provider-specific names. Our app stores a normalized KPI:

```
primary_conversions   // count
primary_conversion_value  // money, nullable
spend                 // ad spend where applicable
roas                  // value / spend when both exist
```

---

## 1. Google Search Console (organic search)

**API:** Search Analytics `sites/{siteUrl}/searchAnalytics/query`  
**Scope:** `https://www.googleapis.com/auth/webmasters.readonly`  
**Auth:** OAuth refresh token (same Google user who has GSC access)

### Metrics (per day / query / page)

| Field | Meaning |
| --- | --- |
| `clicks` | Clicks from Google Search to the property |
| `impressions` | How often a link was shown |
| `ctr` | clicks / impressions (0–1) |
| `position` | Average ranking position |

### Dimensions we use

- `date` — time series
- `query` — top queries (row limit; API returns top rows, not always full set)
- `page` — top landing pages
- Optional filters: `country`, `device`

### Conversions?

**None.** GSC has no conversion or revenue. Pair with GA4 for post-click outcomes.

### Sync notes

- Property string is URL-prefix (`https://example.com/`) or domain (`sc-domain:example.com`)
- Prefer finalized data; recent days can be incomplete (`dataState`)
- Brand split: classify `query` against onboarding `brand_terms_json`

### Snapshot fields (organic)

`gsc_clicks`, `gsc_impressions`, `gsc_ctr`, `gsc_avg_position`, plus JSON for top queries/pages

---

## 2. Google Analytics 4 (site analytics)

**API:** Analytics Data API `properties/{id}:runReport`  
**Scope:** `https://www.googleapis.com/auth/analytics.readonly`  
**Auth:** Same Google OAuth as GSC in PoC; user must have access to the GA4 property

### Core metrics for PoC

| API metric | UI use |
| --- | --- |
| `sessions` | Traffic |
| `totalUsers` / `activeUsers` | Audience |
| `engagedSessions` | Quality traffic |
| `engagementRate` | Engagement |
| `screenPageViews` | Page views (optional) |
| `eventCount` + filter by event | Key actions |
| `keyEvents` / key event counts | Primary conversions (modern GA4 naming) |
| `conversions` (legacy naming in some docs) | Prefer key events marked in GA4 |
| `purchaseRevenue` / `totalRevenue` | Ecommerce value |

GA4 language: **key events** = important site actions. **Conversions** in advertising reports are a related but separate Ads concept when GA4 is linked to Google Ads. For organic SEO reports, pull **key events** named in onboarding.

### Useful dimensions

- `date`
- `sessionDefaultChannelGroup` or `sessionSource` / `sessionMedium` — channel mix
- `landingPagePlusQueryString` or `pagePath` — landing pages
- `eventName` — when listing events after connect

### After connect (property picker)

1. List GA4 properties (Admin API or account summaries)
2. Optionally `getMetadata` for custom dimensions/metrics and conversion/key-event names
3. Store `ga4_property_id` on `Connection` (e.g. `properties/123456`)

### Snapshot fields (GA4)

`ga4_sessions`, `ga4_users`, `ga4_engaged_sessions`, `ga4_key_events` (mapped), `ga4_revenue` (nullable), series JSON

---

## 3. Meta Ads (Facebook / Instagram ads)

**API:** Marketing API Insights  
`GET /v{version}/act_{AD_ACCOUNT_ID}/insights`  
**Permission:** `ads_read`  
**Auth:** User OAuth → short-lived token → exchange for long-lived; store encrypted

Meta Pixel / Conversions API (CAPI) **send** events into Meta. Reporting **reads** Insights. We do not implement CAPI for PoC.

### Delivery & cost fields (scalars)

| Field | Meaning |
| --- | --- |
| `spend` | Amount spent |
| `impressions` | Times ads were shown |
| `reach` | Unique users (optional) |
| `clicks` | All clicks (or use `inline_link_clicks` for link clicks) |
| `cpc`, `cpm`, `ctr` | Efficiency |

### Conversion fields (arrays — important)

Meta does **not** return one `conversions` number for everything. It returns lists:

| Field | Contents |
| --- | --- |
| `actions` | `[{ action_type, value }]` counts |
| `action_values` | `[{ action_type, value }]` money |
| `cost_per_action_type` | Cost per action type |
| `purchase_roas` | `[{ action_type, value }]` ROAS ratios |
| `website_purchase_roas` | Website purchase ROAS |
| `conversions` / `conversion_values` | Newer unified fields when available — still often action-like lists |

**Common `action_type` values**

| action_type | Typical use |
| --- | --- |
| `lead` | Lead |
| `complete_registration` | Signup |
| `purchase` / `omni_purchase` | Purchase |
| `offsite_conversion.fb_pixel_purchase` | Pixel purchase |
| `offsite_conversion.fb_pixel_lead` | Pixel lead |
| `link_click` | Traffic |

**Parsing rule:** Find the row where `action_type` matches onboarding `meta_action_types_json`. Sum `value`. Never assume `actions[0]` is the primary conversion.

**ROAS:** Prefer `purchase_roas` / `website_purchase_roas` for ecommerce; or compute `action_values / spend` for the mapped purchase type. For leads, show **CPA** = `spend / lead_count`, not ROAS.

### Levels & ranges

- Account rollup for Overview KPIs
- `level=campaign` for Performance list (mock “channel / campaign” rows)
- `time_range` or `date_preset=last_28d` / `last_30d`
- Timezone: ad account timezone; store Website timezone for display consistency

### Snapshot fields (Meta)

`meta_spend`, `meta_impressions`, `meta_clicks`, `meta_ctr`, `meta_cpc`, `meta_conversions`, `meta_conversion_value`, `meta_roas` or `meta_cpa`, campaigns JSON

---

## 4. Google Ads (Phase 1 — document now, build later)

**API:** Google Ads API (GAQL via `GoogleAdsService.Search`)  
**Needs:** OAuth scope `https://www.googleapis.com/auth/adwords` **plus** a **developer token** from a Google Ads manager (MCC) account. Extra approval vs GA4/GSC.  
**Header:** `login-customer-id` when accessing client accounts via MCC.

### Core metrics

| GAQL metric | Meaning |
| --- | --- |
| `metrics.impressions` | Impressions |
| `metrics.clicks` | Clicks |
| `metrics.ctr` | CTR |
| `metrics.average_cpc` | Avg CPC (micros) |
| `metrics.cost_micros` | Spend in micros ÷ 1_000_000 = currency |
| `metrics.conversions` | Conversions with `include_in_conversions_metric = true` |
| `metrics.all_conversions` | All conversion actions |
| `metrics.conversions_value` | Conversion value |
| `metrics.cost_per_conversion` | CPA |
| `metrics.conversions_value_per_cost` | Close to ROAS |

**ROAS:** Often `conversions_value / (cost_micros/1e6)` when not using a dedicated ROAS field.

Filter `campaign.status != REMOVED`. Segment by `segments.date`.

### Why Phase 1

Developer token access levels, MCC setup, and app verification are heavier than Meta Insights + GA4. PoC proves the product with GA4 + GSC + Meta first; Google Ads plugs into the same onboarding conversion map later.

---

## 5. Normalized snapshot contract

Every sync writes (per `website_id`, `source`, `date`):

| Column / JSON key | Sources |
| --- | --- |
| `spend` | META_ADS, GOOGLE_ADS |
| `impressions` | GSC, META, GOOGLE_ADS |
| `clicks` | GSC, META, GOOGLE_ADS |
| `sessions` | GA4 |
| `users` | GA4 |
| `primary_conversions` | GA4 key events / Meta actions / Google Ads conversions (mapped) |
| `primary_value` | Revenue / action_values when goal is ECOMMERCE |
| `efficiency` | ROAS or CPA depending on `value_mode` |
| `payload_json` | Raw + breakdowns (campaigns, top queries) |

Overview KPIs (mock-style): attributed outcomes ≈ sum of primary conversions / value; ROAS only if spend + value exist; “active campaigns” from Meta/Google Ads campaign count when connected.

Performance list (PoC): rows for **Google Organic** (GSC+GA4 summary), **Meta Ads**, and later **Google Ads** — not LinkedIn/TikTok.

---

## 6. Conversion mapping cheat sheet

| Business goal | GA4 | Meta Insights | Google Ads (P1) |
| --- | --- | --- | --- |
| Lead gen | Key event e.g. `generate_lead` | `lead` or `offsite_conversion.fb_pixel_lead` | Conversion action marked primary |
| Ecommerce | `purchase` + `purchaseRevenue` | `purchase` / `offsite_conversion.fb_pixel_purchase` + `purchase_roas` | `conversions` + `conversions_value` |
| Traffic only | `sessions`, `engagedSessions` | `impressions`, `clicks`, `link_click` | clicks / impressions |
| Brand SEO | GSC branded queries | — | — |

If mapping missing after OAuth: Admin UI lists discovered GA4 events and Meta action types from a sample Insights call; save into onboarding.

---

## 7. Attribution & caveats (document for Client)

- Meta, Google Ads, and GA4 **will not match** exactly (windows, models, view-through).
- Show each channel’s numbers **in that channel’s column**; do not invent a single “truth” ROAS across vendors in PoC.
- GSC clicks ≠ GA4 sessions (different definitions).
- Recent GSC and Meta data can still be processing.

---

## 8. PoC sync checklist

1. Read `website_onboarding` (channels + conversion map)
2. For each connected source, pull last 28 days
3. Parse Meta `actions` with onboarding types
4. Write daily `metric_snapshots`
5. UI reads snapshots only — never browser → Meta/Google with tokens
