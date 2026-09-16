# Standards-aligned plan: multi Google identities for the agency portal

Research synthesis (2026-09-11) for Astralytics AI.  
Agents: standards/OAuth (Opus), market architecture (Gemini), standards critique (Grok), repo gap (GPT).  
External anchors: **RFC 6749**, **RFC 9700** (OAuth 2.0 Security BCP), **RFC 7009** (token revocation), **RFC 9207** (issuer mix-up defenses), **OpenID Connect**, **NIST SP 800-63B/C**, **Google Ads multi-user OAuth / MCC access model**.

Related: `docs/02-product-plans/01-google-identity/MULTI_GOOGLE_ACCOUNTS.md`, `docs/02-product-plans/02-websites/MULTI_WEBSITE_ACCESS.md`, `docs/01-core/03-product-ux/NAVIGATION.md`.

---

## 1. Problem (global framing)

You are the **agency (portal owner)**. You have:

- Many **Clients**
- Each Client → many **Websites**
- Data from **multiple Google identities** (personal Gmail, company Workspace, MCC login, partner Gmail)

Industry pattern name: **Connection-as-a-Resource** (Stripe Connect–style) + **Hub-and-spoke identity federation** (agency hub, Google accounts as spokes).

This is **not** “log the admin into many Gmails in one browser cookie.”  
It is: **one confidential OAuth app**, **N refresh tokens**, each **bound to a Google subject**, each **connection** pointing at exactly one identity.

---

## 2. Standards principles (must follow)

| Principle | Standard | What it means for Astralytics |
|---|---|---|
| Confidential client | RFC 6749 §2.3 | `GOOGLE_CLIENT_ID` / `SECRET` stay server-side in `.env`. Never email to clients. |
| Authorization code + offline refresh | RFC 6749; Google web apps | Code exchange on server; store refresh token encrypted. |
| Security BCP | RFC 9700 | Exact redirect URI, `state`, no implicit flow; bind tokens to the client that obtained them. |
| Revoke on disconnect | RFC 7009 | Call Google revoke when disconnecting an **identity**; don’t leave live clones. |
| Mix-up defense | RFC 9207 / RFC 9700 §4.4 | One Google issuer today is simpler; if multi-AS later, validate `iss`. |
| Stable subject | OpenID Connect | Key identities on Google **`sub`**, email for display only (email can change). |
| Session / token hygiene | NIST SP 800-63B | Encrypt at rest; least privilege; don’t reuse tokens out of context. |
| Tenant / resource binding | Multi-tenant SaaS practice + NIST session binding idea | Token for Client A’s property must not fetch Client B’s data (confused deputy). |
| Google Ads reality | Google Ads API multi-user + access model | One refresh token per Google user; use `login-customer-id` for MCC; don’t invent a second Ads ACL model. |

---

## 3. Best-outcome object model

```
Workspace / Admin (portal owner)
├── GoogleIdentity[]          ← N Gmails (sub, email, encrypted refresh, scopes)
│     └── Inventory cache     ← GA4 / GSC / Ads visible to THAT identity
└── Client[]
      └── Website[]
            └── Connection[]  ← provider + external_account_id
                  ├── google_identity_id   (agency path)
                  └── OR website-local token (per-site OAuth)
```

**Laws**

1. Refresh token lives on **GoogleIdentity** (or Connection for website-local only) — not cloned onto every row.  
2. Discover / Sync runs **per identity** (picker), never one merged ambiguous list.  
3. Heal / reconnect updates **only** connections bound to that identity.  
4. Website-local OAuth never promotes into the agency pool (kills confused deputy).  
5. Ads: inventory sync ≠ auto-bind; bind explicitly (global agency practice).

---

## 4. Gap vs Astralytics today

| Current | World-class target | Severity |
|---|---|---|
| `admin_google_tokens.user_id` PK → 1 Gmail | 1:N identities keyed by Google `sub` | **P0** for multi |
| Heal clones ciphertext across agency rows | Resolve token from identity row | **P0** |
| `findAny` may promote website token → admin | Explicit connect only; no promote | **P0** |
| No `google_email` / `sub` on token | Persist + show identity | **P1** |
| GET discover can write/heal | Read-only GET; heal = POST after OAuth | **P1** |
| Agency disconnect tombstone without full revoke story | RFC 7009 revoke for that identity | **P1** |
| No `connections.google_identity_id` | FK required before 2nd Gmail | **P0** gate |
| Per-site OAuth exists | Keep as escape hatch | Keep |

---

## 5. Phased plan (best possible outcome)

### Phase 0 — Standards bar on **one** identity (2–4 weeks)

**Status: shipped (2026-09-14)**

- [x] Persist `google_email` + Google `sub` on connect (userinfo); backfill on Sync if missing.  
- [x] UX reconnect-replaces confirm (before multi-add).  
- [x] Disable promote-from-website into admin slot.  
- [x] Make discover/resources **read-only** for connection tokens (no heal/apply on GET).  
- [x] Agency disconnect: revoke (RFC 7009) then tombstone.  
- [x] Prefer resolving refresh from agency / identity for `google_auth=agency` (stop new ciphertext clones on apply/heal).

**Exit criteria:** reconnect/heal cannot silently retarget the wrong clients; identity is visible on Integrations → Google.

### Phase 1 — Identity binding schema (2–3 weeks)

**Status: shipped as Account Integrations Phase C (2026-09-14)** — table name `data_identities` (google + meta).

- [x] Introduce `data_identities` (1:N).  
- [x] Migrate single admin token row → `is_default` identity.  
- [x] Add `connections.data_identity_id` for agency-mode rows; backfill.  
- [x] Scope heal/apply to matching `data_identity_id`.  
- [x] Local OAuth remains `data_identity_id = NULL` + `google_auth=website`.

**Exit criteria:** N can be 1 in production, but the **data model** already supports N.

### Phase 2 — Multi Google UX (3–4 weeks)

**Status: shipped as Account Integrations Phase C UI (2026-09-14)**

- [x] Integrations → Google: identity picker + **Add Google account** (insert row, never overwrite by default).  
- [x] Sync/Import scoped to selected identity.  
- [ ] Badge “via email” on every imported client card (nice-to-have; chip on inventory is enough for now).  
- [ ] Invite checklist shows the **exact** Gmail for that website’s identity (partial — agency email shown elsewhere).

**Exit criteria (testable)**

- [ ] AC1: Two Gmails connected; Sync A never lists B’s-only properties as owned by A’s token.  
- [ ] AC2: Reconnect identity A does not change connections bound to B.  
- [ ] AC3: Disconnect A revokes A only; B keeps syncing.  
- [ ] AC4: Website-local OAuth never appears in agency inventory / never heals globally.  
- [ ] AC5: Client A’s Overview never shows Client B metrics even if same identity authorized both (resource binding).

### Phase 3 — World-class (quarter+)

1. Magic-link “Connect this website” (client consents; secret stays server-side).  
2. Token health dashboard (which identity / which sites degraded).  
3. Optional AAD/KMS envelope encryption; audit log of connect/disconnect.  
4. Same Connection primitive for Meta / other sources.

---

## 6. Operating model

Multi-identity (Phase 1–2 / Account Phase C) is shipped. Preferred flow:

```
Prefer: Add / Connect agency Gmail(s) → pick identity → Sync → Import/bind per website
Else:   MCC under that Gmail → link Ads customers explicitly
Else:   Integrations → Connect this site’s Google (website-local)
```

Multiple **clients**, **websites**, and **agency Google identities** are supported.

---

## 7. Non-goals (violate standards / market)

- Sharing Client ID/Secret with clients or partners  
- One flat merged property list across Gmails without identity ownership  
- Auto-linking every Ads customer on Sync  
- Healing all agency sites with “whatever token connected last”  
- Promoting a call-side client OAuth into the agency pool  
- Claiming “disconnected” while cloned refresh tokens still work  

---

## 8. 12-month “world class” picture

Agency opens **Google accounts** → sees named identities → Sync per identity → Import/Link with clear ownership badges.  
Client/website pages show **which Gmail powers** each connection.  
Token death → precise reauth CTA (not whole-book outage).  
Clients who won’t invite get magic-link or per-site OAuth without ever seeing platform secrets.

That matches global OAuth BCP + Google multi-user practice + agency SaaS norms (AgencyAnalytics / Supermetrics-class connections).

---

## 9. Immediate recommendation

**Phase 0–2 (schema + multi Google UX) are shipped** via Account Integrations Phase C (`data_identities`).  
**Next:** operator smoke (AC1–AC5), Meta App Review / `.env`, then Phase E polish + optional cron Sync.  
**Do not** use logout/SSO to “switch client portfolios” — use identity picker instead.

