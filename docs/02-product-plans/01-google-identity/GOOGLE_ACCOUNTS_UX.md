# Google accounts UX research (agency)

Logged: 2026-09-10. Informs `/google-accounts` (From Google).

## Problem we saw

After importing a client from Google, **From Google** still showed “Connect your agency Gmail” with no account list and no Sync. Token lived on `connections` for a website, but the page only treated `admin_google_tokens` as “connected,” and failed discover collapsed into the empty Connect CTA.

## What best products do

### AgencyAnalytics

Sources: [GA integration](https://agencyanalytics.com/integrations/google-analytics), [Accounts per integration](https://help.agencyanalytics.com/en/articles/8563037-understanding-accounts-per-integration), [Account-level Data Sources](https://help.agencyanalytics.com/en/articles/5719775-account-level-data-sources-overview).

| Pattern | Detail |
| --- | --- |
| OAuth once | Agency user connects Google; client passwords usually not needed (invite agency email) |
| Account-level Data Sources | One place to see **all** Google (and other) connections across clients |
| Status + reconnect | Connected / disconnected; reconnect without reopening every client |
| Reuse connection | “Connect another” can pick an **existing** Google login vs new OAuth |
| Sync expectation | Data refreshes when client/source is opened; account-level status may lag until refresh |

### Supermetrics

Sources: [GA4 connection guide](https://docs.supermetrics.com/docs/google-analytics-4-connection-guide), [add/remove accounts](https://docs.supermetrics.com/docs/how-to-add-and-remove-data-source-accounts-and-data-source-connections-in-google-sheets).

| Pattern | Detail |
| --- | --- |
| Sign in with Google → Allow | Clear connected state on Hub / data sources |
| Then **select properties** | Connection ≠ property; list properties under the login |
| Shared vs private connection | Agency reuse of one Google auth across destinations |
| Add connection vs select accounts | Separate “auth” from “which properties to use” |

### Whatagraph

Source: [GA4 integration](https://whatagraph.com/integrations/ga4).

| Pattern | Detail |
| --- | --- |
| Data Sources → Connect | After Allow, source **appears** in the list (connected inventory) |
| Then attach to reports | Import/link is a second step |

## Design rules for Astralytics

1. **Two layers:** (A) Agency Google **login** connected · (B) Properties/sites **available** vs **imported** as Client/Website.
2. Never show “Connect Gmail” empty state if any usable Google refresh token exists (admin table **or** any website connection).
3. Connected view always has: **Sync accounts** (re-list GA4/GSC), **Reconnect**, optional **Disconnect agency login**.
4. Logical views/tabs: **Available** (not in Astralytics) · **Imported** (already linked) · filters **GA4** / **Search Console**.
5. Prefer real URLs (GSC site URL or GA4 web stream `defaultUri`); never invent `.example` hosts.
6. Import = create Client + Website + connection + optional sync (already implemented).

## Implementation mapping

| Research | Our UI/API |
| --- | --- |
| Account-level Data Sources | `/google-accounts` |
| Sign in with Google | `mode=discover` OAuth → `admin_google_tokens` |
| Reuse existing auth | Discover falls back to any website token; promote to admin token |
| Select properties | Available list + Import as client |
| Refresh status | Sync accounts button → `GET /integrations/google/discover` |
