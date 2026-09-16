# Standard — Google access revoked

**Status:** shipped · **Product law** for Webastral  
**Related:** `docs/02-product-plans/01-google-identity/STANDARDS_MULTI_GOOGLE_PLAN.md` (RFC 7009 revoke), `docs/02-product-plans/02-websites/MULTI_WEBSITE_ACCESS.md`, `docs/01-core/03-product-ux/NAVIGATION.md`

Use this whenever a Google login may no longer work (user revoked app access, password reset, expired refresh, bad encryption key).

---

## 1. Law (do not violate)

1. **Confirm with Google before saying “Access revoked.”**  
   Call Google’s token endpoint (`refresh_token` grant). Only `invalid_grant` (or decrypt failure that we already treat as dead) → revoked.
2. **Never mark Connected** if `needs_reauth` / `NEEDS_REAUTH` is set.
3. **Show one clear banner:** title **Google access revoked** + short reason from the API.
4. **Primary destructive action:** **Remove client from dashboard** (cascade delete + best-effort unique token revoke). Agency Gmail stays for other clients.
5. **Secondary recovery:** **Reconnect Google** → Integrations → Google tab.
6. **Reuse the shared pieces** — do not invent a third banner or a second verify URL.

---

## 2. Canonical pieces

| Layer | Path | Role |
| --- | --- | --- |
| Probe | `src/lib/google/oauth.js` → `refreshAccessToken` | Sets `NEEDS_REAUTH` on `invalid_grant` |
| Client verify | `src/lib/google/access.js` → `verifyClientGoogleAccess` | Per-website refresh + agency discover refresh; marks DB |
| API | `POST /api/clients/:id/verify-google` | Auth’d; returns `{ accessRevoked, message, websites, … }` |
| Sync side-effect | `getAccessTokenForWebsite` | On revoke: `markWebsiteGoogleNeedsReauth` + `setIdentityNeedsReauth` |
| Agency honesty | `agencyGoogleStatus` | `needsReauth: true` when any identity `status === 'needs_reauth'` |
| Hook | `web/lib/use-google-access-verify.ts` | Standard client-side confirm |
| UI | `web/app/components/access-revoked-banner.tsx` | Banner + remove + reconnect |
| Delete | `DELETE /api/clients/:id?disconnectGoogle=1` | Remove client from dashboard |

---

## 3. When to run verify

| Surface | Trigger |
| --- | --- |
| **Client detail** `/clients/:id` | Always on load (every client open) |
| **Overview** `/` | When any platform status is `NEEDS_REAUTH` for the selected website |
| **Platform page** `/platforms/*` | When connection status is `NEEDS_REAUTH` |
| **Sync / Discover** | Already probes; must persist `NEEDS_REAUTH` / identity `needs_reauth` |

Do **not** call verify on every Agency KPI paint with no hint — wasteful. Prefer: DB hint → live confirm → banner.

---

## 4. Copy (locked)

- Banner title: **Google access revoked**
- Confirming state: **Confirming Google access with Google…**
- Primary button: **Remove client from dashboard** → confirm **Confirm remove client**
- Secondary: **Reconnect Google**
- Do not say only “Needs reconnect” on these surfaces once Google confirmed revoke (Integrations inventory may still say Needs reconnect for agency reconnect UX).

---

## 5. Implementation checklist (new page)

```
[ ] Import useGoogleAccessVerify + AccessRevokedBanner
[ ] enabled = true only when clientId known AND (always | NEEDS_REAUTH hint)
[ ] Render banner when accessRevoked || verifying
[ ] Remove uses DELETE ?disconnectGoogle=1 then apply(session) → /clients
[ ] No duplicate custom “access dead” panels
```

Example:

```tsx
const needsHint = platforms.some((p) => p.status === "NEEDS_REAUTH");
const { accessRevoked, message, verifying } = useGoogleAccessVerify({
  clientId: selectedClient?.id,
  enabled: Boolean(selectedClient?.id && needsHint),
});

{(verifying || accessRevoked) && selectedClient ? (
  <AccessRevokedBanner
    clientId={selectedClient.id}
    clientName={selectedClient.name}
    message={message}
    verifying={verifying}
  />
) : null}
```

---

## 6. What “Remove client” does / does not

**Does:** delete client row → cascade websites, connections, snapshots, reports; optionally revoke **unique** website refresh tokens.

**Does not:** delete GA4 properties / GSC sites / Ads accounts inside Google; does not clear agency identity used by other clients (shared agency token is skipped).

---

## 7. Meta (same pattern later)

When Meta tokens die, mirror this standard: live confirm → “Meta access revoked” → Remove client / Reconnect Meta. Until then, Google-only.
