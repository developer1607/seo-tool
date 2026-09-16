# Integrations + Sync multi-agent audit — 2026-09-15

Agents: OAuth/Integrations · Sync pipeline · Token/reauth honesty · Smoke paths A–D.

## Verdict

Integrations + Sync have **real P0 honesty and binding bugs**. Sonic Soak `NEEDS_REAUTH` is expected when Google revoked the refresh token — but the portal **overstates “Connected”** and **keeps showing stale KPIs**, which looks like Sync is broken.

Heal/apply for multi-identity **does** scope by `data_identity_id` (Reconnect A should not heal B).

---

## What you see today (Sonic Soak)

| Symptom | Root |
|---------|------|
| GA4 / GSC / Ads: Token expired or revoked | Google `invalid_grant` → connections marked `NEEDS_REAUTH` on Sync |
| Overview still shows old numbers | Soft-fail banners + **snapshots still summed** |
| Services tab “Connected” | `agencyGoogleStatus.linked` = decryptable row, **no refresh probe** |
| Google Import may say reconnect | Discover does probe — tabs disagree |

**Ops fix now:** Integrations → Google → **Reconnect** → then header **Sync**.

---

## P0 — fix next (code)

1. **Select / link path may omit `data_identity_id`** — orphaned connections; Sync may use wrong identity  
   `src/routes/google.js` select handler  
2. **Services “Connected” while token dead** — session linked without refresh probe  
   `agencyGoogleStatus` + `integrations-inner.tsx`  
3. **Overview KPIs stay live-looking under NEEDS_REAUTH** — mute / “stale as of …”  
   `web/app/page.tsx`  
4. **Import GA4 auto-link GSC can fail after client already created** — orphan CRM rows  
   `src/routes/google.js` import  
5. **Identity chip setDefault can fail silently** — Link-to-website uses old default  
   `google-inventory.tsx` `selectIdentity`

## P1 — Sync / UX

6. Sync always **`last_30`** — ignores Overview date range  
7. Header Sync **silently skips** “not active” / NEEDS_REAUTH providers  
8. Meta still attempted when Meta env missing  
9. Discover reauth does not mark website connections until Sync  
10. `data_identities.needs_reauth` **never written** (schema-only)  
11. Services “Disconnect all” vs Import per-identity disconnect  
12. Tab deep-link: `website_id` can flash Website tab after Google OAuth  

## Smoke paths

| Path | Result |
|------|--------|
| A Connect → Sync accounts → Import | **FAIL risk** — GSC auto-link can leave orphan client |
| B Link to website → select → Sync | **RISK** — select may drop identity / race on default |
| C Header Sync | **PASS** with silent skips |
| D Add Google → chip → Import | **FAIL risk** — optimistic chip if setDefault fails |
| Reconnect A vs B heal | **PASS** — scoped by `data_identity_id` |

---

## Recommended fix order

1. Reconnect Google (ops) for Sonic Soak  
2. P0-2 + P0-3 (honesty: Connected + stale KPIs)  
3. P0-1 + P0-5 (identity binding + setDefault errors)  
4. P0-4 (import transaction / soft-fail auto-link)  
5. P1 Sync date range + skip messaging  

Say **fix integrations sync P0** to implement.
