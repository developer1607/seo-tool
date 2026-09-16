# Data lifecycle + multi-email research

**Date:** 2026-09-14  
**Question:** After I integrate Google/Meta, data should live in the DB; next login I only Sync; dashboards show it; metrics stay associated with **multiple emails**.

Related: `STANDARDS_MULTI_GOOGLE_PLAN.md`, `MULTI_GOOGLE_ACCOUNTS.md`, `ACCOUNT_INTEGRATIONS_PLAN.md`.

---

## 1. What you want (product story)

```
Day 1
  Sign in → Integrations → Connect Gmail A / Meta
  → Import / Link accounts to Clients + Websites
  → First Sync writes metrics into SQLite
  → Overview / GA4 / Ads / Meta show numbers

Day 2+ (same or later session)
  Sign in again (password or SSO)
  → Tokens + clients + bindings + old snapshots still in DB
  → Only press Sync (or scheduled job) for fresh days
  → Dashboard keeps working offline of Google until Sync

Multi-email
  Gmail A owns Client 1–5
  Gmail B owns Client 6–10
  Meta C owns paid social for some sites
  Sync never mixes A’s token into B’s properties
```

---

## 2. What already works today

| Layer | Table(s) | Survives logout? |
|-------|----------|------------------|
| Portal login | `users`, `auth_identities` | Yes (SSO link) |
| Agency Google / Meta data logins | `data_identities` (N per admin); `admin_*_tokens` mirrors default | Yes |
| CRM | `clients`, `websites` | Yes |
| Bindings (which GA4/Ads/Meta on which site) | `connections` (+ `data_identity_id`) | Yes |
| Dashboard numbers | `metric_snapshots` | Yes |

**Lifecycle (correct shape, multi-email supported):**

1. **Connect / Add account** → save OAuth token on a `data_identities` row.  
2. **Import / Link** → create/update `clients` / `websites` / `connections` (+ usually first Sync).  
3. **Sync** → write/update `metric_snapshots` using that connection’s identity token.  
4. **Logout** → clears cookie only; DB stays.  
5. **Login again** → open Overview (old data) → **Sync** for fresh data.

---

## 3. Multi-email (shipped)

Tokens are **N per Admin** via `data_identities` (keyed by provider + `sub`).  
Legacy `admin_google_tokens` / `admin_meta_tokens` still mirror the **default** identity for compatibility.

Reconnect updates **that** identity; Import/Sync use the selected identity; connections store `data_identity_id`.

Industry pattern (AgencyAnalytics-class / Stripe Connect–style):

**Connection-as-a-Resource** — each Google/Meta identity is a first-class object; each website `connection` points at exactly one identity.

Standards anchors (already in `STANDARDS_MULTI_GOOGLE_PLAN.md`): RFC 6749/9700/7009, OIDC `sub`, least privilege, no token cloning across tenants.

---

## 4. Recommended object model

```
Admin (portal user)                    ← login (password / SSO)
└── Workspace (today: implicit single agency)
      ├── DataIdentity[]               ← N Google + N Meta (by provider sub)
      │     encrypted tokens, email, scopes, status
      │
      └── Client[]
            └── Website[]
                  └── Connection[]     ← GA4 / GSC / Ads / Meta
                        ├── external_account_id
                        ├── data_identity_id   ← which email’s token
                        └── status / last_sync
                  └── MetricSnapshot[] ← dashboard (unchanged)
```

**Laws**

1. Refresh/access tokens live on **DataIdentity**, not cloned onto every connection.  
2. Import / Discover / Sync run **scoped to one identity** (picker when N>1).  
3. Reconnect identity A updates only connections with `data_identity_id = A`.  
4. Disconnect A revokes A only; B keeps syncing.  
5. Website-local OAuth stays `data_identity_id = NULL` + `google_auth=website`.  
6. Dashboard always reads **snapshots** — never requires the user to stay on Google’s UI.

---

## 5. Recommended user flow (multi-email)

### First-time (per email)

1. Integrations → **Add Google account** (Gmail A) → Connect.  
2. Identity A selected → Sync inventory → Import/Link → first metrics Sync.  
3. Later: **Add Google account** (Gmail B) → same steps; do **not** overwrite A.  
4. Meta: **Add Meta** (or one Meta identity for now) → Link ad accounts.

### Returning day

1. Login (any SSO/password for the **same Admin**).  
2. Dashboard already shows last snapshots.  
3. Header **Sync** (or cron): for each ACTIVE connection, use **that row’s** `data_identity_id` token → upsert snapshots.  
4. Re-Import only when attaching a **new** property — not every login.

### Association rule

| Thing | Associated to |
|-------|----------------|
| Portal session | Admin user |
| Token | DataIdentity (`sub` + email display) |
| Property binding | `connections.data_identity_id` |
| KPIs / charts | `metric_snapshots` via `website_id` (indirectly via identity through connection) |

Clients do **not** need an `owned_by_email` column if every connection carries `data_identity_id` — badge “via searcheno1@…” on Integrations is enough.

---

## 6. Build sequence (do not skip)

| Step | Work | Why |
|------|------|-----|
| **Done** | Phase 0 single identity harden + email/sub | Safe base |
| **Done** | Account SSO + Integrations hub + Meta path | Cursor-style shell |
| **Done = Phase C** | `data_identities` + `connections.data_identity_id`; migrate admin_* tokens; scoped discover/import/sync; UI picker + **Add Google account** | Multi-email |
| **Later** | Nightly Sync job per identity | “Login → already fresh” |

**Do not** implement “login with Gmail B switches client list” via logout — that confuses portal SSO with data identity.

---

## 7. Acceptance tests (multi-email)

- [ ] Connect Gmail A + B; Sync A never uses B’s refresh token.  
- [ ] Reconnect A does not change B-bound connections.  
- [ ] Disconnect A; B websites still Sync.  
- [ ] Logout/login; Overview still shows snapshots; Sync refreshes dates.  
- [ ] Same GA4 property cannot ACTIVE on two websites (existing rule).  
- [ ] Dashboard Client A never shows Client B metrics.

---

## 8. What you can do **now**

With `searcheno1@gmail.com` as admin:

1. Integrations → Connect Google → Import/Link (writes CRM + connections + first snapshots).  
2. **Add Google account** for a second Gmail → switch identity chip → Import under it.  
3. Connect Meta (when `.env` set) → Link ad accounts.  
4. Next day: login → Overview already has data → **Sync** for new days.

---

## 9. Remaining

- [x] Phase C1–C4 (data identities + connection FK + picker + scoped sync)  
- [ ] Cron / nightly Sync (deferred)  
- [ ] Meta App Review / production Meta keys (ops)
