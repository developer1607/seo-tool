# Notifications (all layers)

In-app notifications for **Admin**, **Client**, and **Website** scopes. PoC: store + bell drawer + page banners. Email/push = later.

Related: `docs/API_VIEW_MAP.md`, `db/schema.sql`, `docs/IA.md`.

---

## Layers

| Layer | Audience | Scope | Examples |
| --- | --- | --- | --- |
| **Platform (Admin)** | `role=ADMIN` | Whole product | OAuth app misconfigured; many sites failing sync; new Client created |
| **Client** | That Client user | All their websites | Any site needs reauth; onboarding incomplete; sync errors |
| **Website** | Users who can open that site (Admin + owning Client) | One `website_id` | Connection ACTIVE/ERROR; probe failed; sync finished with gaps |

Delivery rules:

- Create a row per **recipient user** (fan-out), or one row with `audience` + `user_id` null for Admin broadcast — PoC prefers **one row per user** for simple unread counts.
- Website events notify: owning Client + all Admins (PoC: owning Client + every Admin).
- Never put tokens or raw API bodies in `body` / `meta_json`.

---

## Schema (`notifications`)

| Column | Purpose |
| --- | --- |
| `id` | PK |
| `user_id` | Recipient |
| `website_id` | Nullable; set for website-scoped |
| `client_id` | Nullable; set for client-scoped |
| `layer` | `PLATFORM` \| `CLIENT` \| `WEBSITE` |
| `type` | Stable event key (below) |
| `severity` | `info` \| `success` \| `warn` \| `error` |
| `title` | Short |
| `body` | Human message |
| `href` | Deep link path |
| `meta_json` | Safe ids only (`provider`, `connection_id`, counts) |
| `read_at` | Null = unread |
| `created_at` | ISO |

Indexes: `(user_id, read_at)`, `(website_id)`, `(created_at)`.

---

## Event catalog (PoC)

### Platform (`PLATFORM`) → Admins

| `type` | When | Severity | `href` |
| --- | --- | --- | --- |
| `platform.env_missing` | Boot or Settings: Google/Meta env incomplete | `warn` | `/settings` |
| `platform.sync_failures_spike` | N websites ERROR in 24h (threshold e.g. 5) | `error` | `/` |
| `client.created` | Admin created a Client | `info` | `/clients/:id` |

### Client (`CLIENT`) → that Client (+ Admins optional)

| `type` | When | Severity | `href` |
| --- | --- | --- | --- |
| `client.website_added` | Website created under them | `info` | `/websites/:id` |
| `client.setup_incomplete` | Onboarding DRAFT > 24h or no ACTIVE connection | `warn` | `/websites/:id/onboarding` |
| `client.connections_need_attention` | Any owned site NEEDS_REAUTH / ERROR | `warn` | `/websites` |

### Website (`WEBSITE`) → Client owner + Admins

| `type` | When | Severity | `href` |
| --- | --- | --- | --- |
| `connection.authorized` | OAuth callback token saved | `info` | `…/integrations` |
| `connection.pending_select` | Token OK, resource not chosen | `warn` | `…/integrations` |
| `connection.active` | Probe passed → ACTIVE | `success` | `…/integrations` |
| `connection.error` | Probe/sync failed | `error` | `…/integrations` |
| `connection.needs_reauth` | Provider 401/revoked | `error` | `…/integrations` |
| `connection.disconnected` | User disconnected | `info` | `…/integrations` |
| `sync.completed` | Backfill/range sync OK | `success` | `/websites/:id` |
| `sync.partial` | Some days missing / soft errors | `warn` | `/websites/:id/performance` |
| `onboarding.completed` | Status → COMPLETE | `success` | `…/integrations` |
| `mapping.missing` | ACTIVE ads/analytics but no conversion map for LEADS/ECOMMERCE | `warn` | `…/onboarding` |

Deduplicate: same `(user_id, type, website_id, provider)` within 6h → update existing unread instead of spam.

---

## UI surfaces

| Surface | Behavior |
| --- | --- |
| Header **bell icon** | Dropdown panel (LinkedIn-style); badge = unread count |
| Overview **alerts strip** | Unread `warn`/`error` only (max 3) — optional |
| Website Overview **banners** | Website-layer unread + connection status (even if notification read) |
| Clients / Websites **cards** | Pill from connection health (live status, not only notifications) |
| Flash toasts | Immediate POST success/fail (session flash); not persisted |

Toast examples: “Client created”, “Onboarding saved”, “Disconnected Meta Ads”.

---

## API routes (PoC)

| Method | Path | Who |
| --- | --- | --- |
| `GET /notifications` | Full page or drawer partial | Session user |
| `POST /notifications/:id/read` | Mark one read | Owner only |
| `POST /notifications/read-all` | Mark all read | Session user |

JSON optional later; PoC can be form posts + redirect.

---

## Emit helpers (code)

```
notifyPlatform({ type, severity, title, body, href, meta })
notifyClient(clientUserId, { … })
notifyWebsite(websiteId, { … })  // resolves owner + admins
```

Call from: OAuth callback, probe, sync, onboarding save, disconnect, Admin create Client.

---

## What not to notify (PoC)

- Every successful daily stale refresh (too noisy) — only first backfill `sync.completed` and failures
- Raw rate-limit retries that succeed
- Admin browsing pages
