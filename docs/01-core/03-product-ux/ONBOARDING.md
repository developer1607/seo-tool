# Website onboarding

Onboarding answers: **what this Website is**, **what success looks like**, and **which channels/events matter**. It does **not** replace OAuth.

**Integrations** (`docs/01-core/04-integrations/INTEGRATIONS.md`) does the technical connect: prerequisites → OAuth → pick GA4 property / GSC site / Meta ad account → probe → sync.

| Step | Doc |
| --- | --- |
| Goals & conversion labels | This file |
| Connect accounts | `docs/01-core/04-integrations/INTEGRATIONS.md` |
| Field-level API metrics | `docs/METRICS.md` |

Admin or Client can complete it. One form per **Website**.

## Flow

1. Admin creates **Client** (email, name, password / invite later)
2. Client (or Admin) adds **Website** (name + domain)
3. **Onboarding** for that Website (goals + channels + conversion mapping)
4. **Integrations** — provider catalog; OAuth; pick resources; validate (`docs/01-core/04-integrations/INTEGRATIONS.md`)
5. Sync uses onboarding + connections → `MetricSnapshot`
6. Overview / Performance only show metrics enabled by onboarding + **ACTIVE** connections

Incomplete onboarding: allow connect, but mark dashboard “Setup incomplete” and skip conversion KPIs that have no mapping.

## Form sections

### A. Identity (required)

| Field | Why |
| --- | --- |
| Website display name | UI labels |
| Primary domain (`https://…`) | Match GSC property; display |
| Business / brand name | Reports |
| Industry (optional select) | Defaults / templates later |
| Timezone | Day boundaries for snapshots |
| Currency | Spend / revenue display |

### B. Reporting goal (required)

Pick **one primary** goal. Optional secondary.

| Goal | Typical success metric |
| --- | --- |
| `LEADS` | Form submit, call, demo request |
| `ECOMMERCE` | Purchase, revenue, ROAS |
| `TRAFFIC` | Sessions, clicks, engaged sessions |
| `BRAND` | Branded queries, impressions |
| `OTHER` | Free-text primary KPI |

### C. Channels to include (required, multi-select)

| Channel | PoC | Notes |
| --- | --- | --- |
| Google Search (organic) | Yes | Search Console |
| Google Analytics (site) | Yes | GA4 |
| Meta Ads | Yes | Ads Insights |
| Google Ads | Phase 1 | Needs developer token |
| LinkedIn / TikTok | Later | Out of PoC |

Only selected channels appear on Performance and get synced.

### D. Conversion definition (required if goal is LEADS or ECOMMERCE)

Platforms name conversions differently. Onboarding stores **our** name + **provider mapping**.

| Field | Example |
| --- | --- |
| Primary conversion label | “Lead form”, “Purchase” |
| GA4 key event name(s) | `generate_lead`, `purchase` |
| Meta primary `action_type` | `lead`, `offsite_conversion.fb_pixel_purchase`, `purchase` |
| Google Ads conversion action name / ID | Phase 1 |
| Count as | `EVENT` (leads) or `VALUE` (revenue) |
| Value currency | Same as Website currency |

If the Client does not know event names, collect “how you track leads today” (Pixel / GA4 / thank-you page) and let Admin fill mapping after connect (list events from APIs).

### E. Organic / SEO focus (optional, for GSC)

| Field | Why |
| --- | --- |
| Brand terms (comma list) | Split branded vs non-branded queries |
| Priority landing pages | Highlight in reports |
| Target countries / devices | GSC filters |

### F. Access checklist (required acknowledgements)

Checkboxes — not secrets in the form:

- [ ] Client can grant GA4 Viewer (or higher) to the connecting Google account
- [ ] Client can grant Search Console access for the domain/URL-prefix property
- [ ] Client can grant Meta Ads access (`ads_read`) for the ad account
- [ ] (Phase 1) Google Ads access / MCC link

Store who connected and when on `Connection`, not passwords.

### G. Report preferences (optional)

| Field | Default |
| --- | --- |
| Default range | Last 28 days |
| Compare to | Previous period |
| Cadence note | Weekly / monthly (scheduling later) |

## What we store (`website_onboarding`)

One row per Website (upsert). Suggested columns:

- `website_id` (unique)
- `goal_primary`, `goal_secondary` (nullable)
- `channels_json` — `["GSC","GA4","META_ADS"]`
- `conversion_label`
- `ga4_key_events_json` — `["generate_lead"]`
- `meta_action_types_json` — `["lead"]`
- `google_ads_conversion_ids_json` — Phase 1
- `value_mode` — `NONE` | `EVENT` | `REVENUE`
- `brand_terms_json`, `priority_pages_json`
- `timezone`, `currency`
- `status` — `DRAFT` | `COMPLETE`
- `completed_at`, `updated_at`

Do not store OAuth tokens here. Tokens stay on `connections`.

## How onboarding drives sync

| Onboarding says | Sync does |
| --- | --- |
| Channel off | Skip that API |
| Goal `TRAFFIC` | Pull sessions / clicks / impressions; skip conversion arrays |
| Goal `LEADS` + Meta `lead` | Sum only matching `actions[].action_type` |
| Goal `ECOMMERCE` + `purchase` | Sum purchase actions + `action_values` / `purchase_roas` |
| GA4 key events listed | Request those event names; else all key events |
| Brand terms set | Tag GSC queries branded / non-branded in snapshot JSON |

Normalized output always writes into the same snapshot shape (see `docs/METRICS.md`). Raw provider payloads can live in JSON; KPIs used by the UI are extracted fields.

## UI copy

- Page title: **Website onboarding**
- Subtitle: Tell us what to measure so reports match this site’s goals.
- CTA: **Save and continue to integrations**
- Incomplete: amber status on Website card
- After save, deep-link to `/websites/:id/integrations` with channels from onboarding highlighted

## PoC minimum

Ship sections A–D + F. E and G can be defaults (timezone UTC or Asia/Kolkata — set from Client preference later; currency INR/USD select).
