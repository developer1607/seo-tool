# Integrations system

How every data source is enabled, authorized, configured, and synced. This pattern must stay stable so Google Ads, Meta, and later providers plug in the same way.

Related: `docs/ONBOARDING.md` (goals), `docs/METRICS.md` (fields), `docs/IA.md` (nav).

---

## Two layers (do not mix)

| Layer | Who | What |
| --- | --- | --- |
| **Platform credentials** | Admin only | Our Google Cloud OAuth client, Meta App ID/secret, (later) Google Ads developer token — **`.env` once for the whole product** |
| **Website connections** | Admin or Client | **Each Website’s** refresh/long-lived token + selected GA4 property / GSC site / Meta ad account — table `connections` |

Client never pastes app secrets. They only OAuth with **their** Google/Meta login and pick **their** accounts. Many Clients → many connection rows; still **one** `GOOGLE_CLIENT_ID` / `META_APP_ID` for our app.

Analogy: “Sign in with Google” on a website uses that site’s Client ID for everyone; each user still has their own Google account and token.

Industry parallel: AgencyAnalytics opens a **Client** → Data Sources → Connect → OAuth → select account → Save. We use **Website** as that attach point (one Client can have many sites).

---

## Provider catalog

Each provider is a card in `/websites/:id/integrations`.

| Provider key | Label | Phase | Auth | After OAuth: select |
| --- | --- | --- | --- | --- |
| `GOOGLE_SEARCH_CONSOLE` | Google Search Console | 0 | Google OAuth `webmasters.readonly` | GSC site URL / `sc-domain:` |
| `GOOGLE_ANALYTICS` | Google Analytics 4 | 0 | Google OAuth `analytics.readonly` | GA4 `properties/{id}` |
| `META_ADS` | Meta Ads | 0 | Meta OAuth `ads_read` | `act_{ad_account_id}` |
| `GOOGLE_ADS` | Google Ads | 1 | Google OAuth `adwords` + platform developer token | Customer ID (+ `login-customer-id` if MCC) |
| `LINKEDIN_ADS` | LinkedIn Ads | later | LinkedIn OAuth | Ad account |
| `TIKTOK_ADS` | TikTok Ads | later | TikTok OAuth | Advertiser |

**PoC implementation note:** One Google OAuth consent can request GA4 + GSC scopes together and create **two** `Connection` rows (or one `GOOGLE` row with both external ids). Prefer **one row per provider key** for a clean catalog UI.

---

## Lifecycle (same for every provider)

```
Intent          →  User enables channel (onboarding) or clicks Connect on catalog
Prerequisites   →  Show checklist (permissions, Business Manager, etc.)
Authorize       →  OAuth (state = website_id + provider + csrf)
Select resource →  List accounts/properties user can access; user picks one
Configure       →  Optional: conversion action, attribution window, date default
Validate        →  Probe API (one light request); fail closed if error
Activate        →  status=ACTIVE; enqueue backfill (e.g. 28–90 days)
Sync            →  Scheduled / on-read stale refresh → MetricSnapshot
Health          →  OK | NEEDS_REAUTH | ERROR | DISCONNECTED
```

### Status machine

| Status | Meaning | UI |
| --- | --- | --- |
| `NOT_STARTED` | Never connected | Connect button |
| `PENDING_AUTH` | Redirected to OAuth | Spinner / waiting |
| `PENDING_SELECT` | Token OK, resource not chosen | Account picker |
| `ACTIVE` | Sync allowed | Connected + last sync time |
| `ERROR` | Last sync/probe failed | Message + Retry |
| `NEEDS_REAUTH` | Token revoked/expired | Reconnect |
| `DISCONNECTED` | User disconnected | Connect again |

Never show “Connected” without a successful probe (Admaxxer-style validate-before-persist).

---

## Step detail

### 1. Intent

- From **Onboarding** channel checkboxes (`channels_json`), or
- From Integrations catalog “Add” even if not in onboarding (then add channel to onboarding)

Disabled Phase 1+ cards show **Coming soon** with short “what you’ll need”.

### 2. Prerequisites (per provider)

Show **before** OAuth. Not secrets — access requirements.

**Google Analytics 4**

- Google account with at least Viewer on the GA4 property
- Correct property for this Website’s domain

**Search Console**

- User is owner/full user on the URL-prefix or domain property
- Property matches Website domain

**Meta Ads**

- Facebook login with access to the ad account (Employee+ in Business Manager — AgencyAnalytics requires employee-level)
- Prefer **one ad account per Website** (shared accounts mix campaigns across clients)

**Google Ads (Phase 1)**

- Read access on the Google Ads account
- Platform has an approved **developer token** (MCC)
- If connecting via manager: store `login_customer_id` (MCC) + `customer_id` (client)
- Direct invite to the ads account is more reliable than MCC-only visibility

### 3. Authorize

- `GET /auth/:provider?website_id=&return=`
- `state` = signed payload `{ websiteId, provider, nonce, exp }`
- Callback: exchange code → encrypt refresh/long-lived token → upsert `Connection` → redirect to **select** step
- Reject if session cannot access `website_id`

Google: `access_type=offline`, `prompt=consent` when needing a new refresh token.  
Meta: exchange short-lived → long-lived; store expiry.

### 4. Select resource

| Provider | List API (concept) | Store on Connection |
| --- | --- | --- |
| GA4 | Account summaries / properties list | `external_account_id` = `properties/123` |
| GSC | Sites list | `external_account_id` = site URL |
| Meta | Ad accounts for user | `act_…` |
| Google Ads | `listAccessibleCustomers` + names | `customer_id`, optional `login_customer_id` |

UI: searchable list, name + id + currency/timezone when available. Confirm matches Website domain when possible (soft warn if mismatch).

### 5. Configure (provider-specific)

| Provider | Config fields |
| --- | --- |
| GA4 | Key events (prefill from onboarding; allow pick from metadata) |
| GSC | Optional country/device filters |
| Meta | Primary `action_type`(s); optional attribution window later |
| Google Ads | Conversion action IDs included in `metrics.conversions` |

Persist on `Connection.config_json` and/or `WebsiteOnboarding` (onboarding = business intent; connection config = technical IDs).

### 6. Validate + activate

- One cheap call (GA4 `runReport` 1 day; GSC query 1 day; Meta insights `date_preset=yesterday`; Google Ads GAQL LIMIT 1)
- On success → `ACTIVE`, `last_verified_at`
- On failure → `ERROR`, human message (no raw stack)

### 7. Sync

- Backfill last 28 days (PoC); 90 later
- Ongoing: stale-on-read (>6h) or cron
- Respect onboarding channels; skip disconnected providers
- Write `MetricSnapshot`; update `last_sync_at` / `last_error`

### 8. Disconnect / reconnect

- Disconnect: delete or soft-disable connection; stop sync; keep historical snapshots
- Reconnect: new OAuth (do not reuse dead token); re-select resource

---

## Data model

### `connections`

| Column | Purpose |
| --- | --- |
| `id` | PK |
| `website_id` | FK |
| `provider` | Catalog key |
| `status` | Status machine |
| `encrypted_refresh_token` | Secret |
| `token_expires_at` | Meta / access expiry if tracked |
| `external_account_id` | Property / site / act_ / customer id |
| `external_account_name` | Display |
| `login_customer_id` | Google Ads MCC (nullable) |
| `config_json` | Filters, conversion ids, attribution |
| `scopes_json` | Granted scopes |
| `last_verified_at` | Probe |
| `last_sync_at` | Last successful sync |
| `last_error` | Safe message |
| `connected_by_user_id` | Audit |
| `created_at` / `updated_at` | |

Unique: `(website_id, provider)` for PoC (one Meta account per site). Multiple later if needed.

### Platform env (Admin)

```
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI
META_APP_ID / META_APP_SECRET / META_REDIRECT_URI
GOOGLE_ADS_DEVELOPER_TOKEN          # Phase 1
APP_ENCRYPTION_KEY / APP_URL
```

---

## UI: Integrations page

**Path:** `/websites/:id/integrations`

1. Header: Website name + “Data sources”
2. Grid of provider cards: logo, name, phase badge, status pill
3. Card actions: Connect / Continue setup / Reconnect / Disconnect / Sync now
4. Side panel or step wizard: Prerequisites → Authorize → Select → Configure → Done
5. Link: “Edit goals & conversion mapping” → onboarding

**Settings → Integrations (Admin):** show whether Google/Meta *apps* are configured (env present), not Client tokens. Link to docs for creating Cloud/Meta apps.

---

## Flow diagrams

### Happy path (Meta on a Website)

```
Onboarding: enable Meta Ads
    → Integrations: Connect Meta
    → Prerequisites OK
    → Meta OAuth (ads_read)
    → Pick act_123
    → Pick action_type=lead (from onboarding default)
    → Probe insights
    → ACTIVE → backfill 28d
    → Performance shows Meta row
```

### Happy path (Google Ads later)

```
Admin sets GOOGLE_ADS_DEVELOPER_TOKEN
    → Onboarding: enable Google Ads
    → Connect Google Ads (adwords scope; may reuse Google login + extra consent)
    → listAccessibleCustomers
    → Pick customer (+ MCC login-customer-id if needed)
    → Pick conversion actions
    → Probe GAQL
    → ACTIVE → snapshots with spend/conversions
```

### Shared Google login for GA4 + GSC

```
Connect Google Analytics → OAuth (analytics.readonly [+ openid email])
Connect Search Console → same user; if refresh exists and scopes missing → reconsent with both scopes
Store two connections, one token blob or shared token reference — implementation choice; catalog still shows two cards
```

---

## Rules for future providers

1. Add a catalog row (key, label, phase, scopes, list/select/probe/sync modules)
2. Implement `src/lib/integrations/{provider}.js` with: `getAuthUrl`, `handleCallback`, `listResources`, `probe`, `syncRange`
3. No provider-specific routes beyond `/auth/:provider` + shared select/save handlers
4. Always bind to `website_id`
5. Always encrypt tokens; never send to browser
6. Always probe before ACTIVE
7. Always map conversions via onboarding + `config_json`

---

## PoC build order

1. Catalog UI with GA4, GSC, Meta cards (Google Ads card disabled “Phase 1”)
2. Google OAuth + select property/site + probe + sync
3. Meta OAuth + select ad account + action_type + probe + sync
4. Status + last sync on Website Overview
5. Wire Performance to snapshots only
