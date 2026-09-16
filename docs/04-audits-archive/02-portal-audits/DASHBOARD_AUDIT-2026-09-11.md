# Astralytics dashboard audit — 2026-09-11

Multi-agent review (Claude Opus backend + frontend, GPT E2E, Gemini product, Grok security). Grades and BEST marks below.

---

## Executive summary

| Layer | Grade | Verdict |
| --- | --- | --- |
| **Backend** | **B−** | Live Google/sync/crypto path is strong; dead legacy routes + GET write side-effects + empty `payload_json` hold it back |
| **Frontend** | **B−** | Dense honest agency UI; fake green trends + dual Google surfaces + mobile KPI grid hurt trust |
| **E2E readiness** | **6/10** | Smokes pass HTTP paths; browser honesty + Meta + Ads not covered |
| **Security (multi-admin / public)** | **C** | Fine for single-admin LAN; token bleed + body `website_id` + `'dev'` OAuth secret are ship blockers if exposed |
| **Product maturity** | **3.3 / 5** | Solid IA + soft-fail; PDF/share + LLM narrative + full Meta still gaps |

**Mark BEST (do not regress):** AES-GCM tokens, HMAC sessions, soft-fail discover, never ACTIVE without probe, scope preserve, Overview empty/error/sync-nudge pattern, single `PlatformPage`, two-layer Google (login vs inventory).

---

## Backend report

### Grade: B−

Live path (`src/routes/api.js`, `src/routes/google.js`, `src/lib/google/*`, `crypto.js`, `session.js`) is well-built. Grade dragged by dead unmounted routes, schema drift, GET mutations, and empty drill-down payloads.

### Strengths (BEST)

- AES-256-GCM + typed `NEEDS_REAUTH` on decrypt (`src/lib/crypto.js`)
- HMAC sessions + `timingSafeEqual` + httpOnly cookies (`src/lib/session.js`)
- Scope preserve / `__cleared__` tombstone / never ACTIVE without probe (`src/lib/google/agency.js`)
- Discover soft-fail 200 + isolated Ads errors (`src/routes/google.js`)
- Ads error taxonomy 401/403/404 (`src/lib/google/ads.js`)
- Probe → `markVerified` → sync; snapshot upserts + indexes (`sync.js`, `db.js`)

### Critical / trust issues

| Pri | Issue | Evidence |
| --- | --- | --- |
| P0 | Dead routes/libs contradict schema (`CLIENT` role, `website_onboarding`, `client_invites`) | Unmounted: `routes/auth|clients|websites|overview|dashboard|misc|notifications.js`, `lib/invites.js`, `lib/metrics/views.js` |
| P1 | GET endpoints write DB (session/overview/research apply agency tokens) | `api.js` `platformsForReq`, `agency.js` promote |
| P1 | Token heal can overwrite across websites / admins | `healGoogleWebsiteTokens`, `findAnyGoogleEncryptedToken` |
| P1 | `admin_google_tokens` not in `db/schema.sql` | Runtime `ensureAdminGoogleTable` |
| P1 | Body/query `website_id` not bound to selected client | `google.js` start/select/sync/import |
| P2 | OAuth state falls back to HMAC secret `'dev'` | `crypto.js` |
| P2 | `payload_json` always `{}` — no keywords/campaigns/pages | `sync.js` |
| P2 | Sync ignores requested range (always last_30); import soft-swallows sync errors | `sync.js`, `google.js` |
| P2 | No login rate limit; cookies.txt / WAL files gitignore gaps | `api.js`, `.gitignore` |
| P2 | Ciphertext may appear in JSON via `SELECT *` connections | `connections.js` → google routes |

### API surface (live only)

Mounted: `google` + `api` only (`src/index.js`). Auth, overview, platforms, integrations, clients/websites CRUD, reports, notifications, Google OAuth/discover/import/select/sync.

### Backend backlog (ranked)

1. Quarantine/delete dead routes + invites + views.js  
2. Put `admin_google_tokens` in `schema.sql` / init-db  
3. Gitignore WAL/shm + remove `cookies.txt`  
4. No writes on GET — seed tokens only on connect/select/sync  
5. Scope heal/promote to owning user + website  
6. Require `website_id` ∈ selected client  
7. Strip `encrypted_refresh_token` from API DTOs  
8. Fix `'dev'` OAuth secret fallback; login rate limit + helmet  
9. Populate `payload_json` or document reserved  
10. Surface import sync failures; accept sync date range + validate GAQL dates  
11. Parallelize/timeout Ads list  
12. Guard destructive migrate behind env flag  
13. Schema-drift CI check  
14. Clarify single vs multi frontend (`web/` vs `client/`)  
15. Integration tests for heal / probe / discover soft-fail  

---

## Frontend report

### Grade: B−

Dense, information-heavy agency dashboard with strong Overview honesty and a smart Google two-layer model. Held back by lying trend arrows, dual connect surfaces, and reuse debt.

### Strengths (BEST)

- Overview state machine: empty → loading → soft-fail `last_error` → needs-sync nudge → Retry (`web/app/page.tsx`)
- Honest connection pills (`ACTIVE` vs `ERROR` / `NEEDS_REAUTH`) + `last_error` on Overview / Integrations / Client research
- Single `PlatformPage` + META map (`platform-page.tsx`)
- Google accounts: Available/Imported, GA4 import without URL, Ads client/website picker, non-blocking `adsError`
- Client detail as research hub (`clients/[clientId]/page.tsx`)
- Report generate live preview + section checklist
- `AdminShell` + `PageHeader` + persisted date range (`date-range.ts`)

### Critical UX / trust issues

| Pri | Issue | Evidence |
| --- | --- | --- |
| P0 | Trend always `↗` green even when Δ negative | `page.tsx`, `platform-page.tsx`, `reports/[id]` |
| P1 | Platform KPI grid `repeat(5,1fr)` breaks mobile stack | `platform-page.tsx` inline style |
| P1 | Two Google connect stories without “login here / pick there” | `/google-accounts` vs `/integrations` |
| P1 | Login pre-fills `admin@example.com` / `admin123` | `login/page.tsx` |
| P1 | Report detail scoped to session website → bookmark 404 | `api.js` + `reports/[id]` |
| P2 | Date range ignored on report generate | `reports/generate` |
| P2 | Meta nav live but Coming soon / no sync | shell + integrations |
| P2 | Duplicate `pct` / status / metric-card JSX | multiple pages |
| P2 | Three CSS stacks (hand CSS + Tailwind import + legacy `public/css`) | `globals.css`, `app.css` |
| P2 | Mobile nav glyphs unlabeled; small tap targets | `admin-shell.tsx` |

### Frontend backlog (ranked)

1. Shared `TrendBadge` — direction/color from sign  
2. Fix platform KPI responsive grid  
3. Clear login defaults  
4. Extract `MetricCard`, `StatusPill`, `PlatformRow`, `pct` helpers  
5. One-line Google story on both connect pages  
6. Unify tabs on `.subsection-tabs`  
7. Wire global date range into report generate (or label independent)  
8. One delete confirm UX  
9. Tap targets ≥40px; aria on mobile nav  
10. Platform empty: “ACTIVE but 0 rows” distinct from “not connected”  
11. Channel-aware daily table columns  
12. Memoize session helpers in `providers.tsx`  
13. Collapse CSS/font pipelines  
14. Refactor Integrations `actionButton` state map  
15. Surface import sync failure before redirect  

---

## Product scorecard (BEST definition)

| # | Criterion | Score |
| --- | ---: | ---: |
| 1 | Fast client/website context switch | 4 |
| 2 | Single agency OAuth reuse | 4 |
| 3 | Normalized multi-channel snapshots | 3 |
| 4 | Period comparison engine | 4 |
| 5 | Soft-fail isolation | 5 |
| 6 | AI executive summary | 2 |
| 7 | PDF + share links | 2 |
| 8 | Modular report sections | 4 |
| 9 | Dense light agency UI | 4 |
| 10 | Connection health / reauth | 3 |
| | **Overall** | **3.3 / 5** |

---

## Combined “make it BEST” next sprint

1. Frontend trend honesty + mobile KPI grid + login defaults  
2. Backend: no GET writes; website_id ownership; strip token ciphertext  
3. Quarantine dead routes; schema.sql includes `admin_google_tokens`  
4. Report deep-link self-selects website; import shows sync failure  
5. Meta: wire or demote everywhere; Ads readiness split (OAuth / scope / API / linked)  
6. Then PDF/share + LLM summary for agency deliverables  

Agents: Backend [Opus](0fbd2c4f-c3d6-44f2-8b4b-2b7f0b2da768) · Frontend [Opus](b50bf219-ce19-49a2-8355-f2cc096f5872) · E2E [GPT](499f7aca-b333-4e80-819c-4ba5b73ff0a8) · Product [Gemini](c158689c-6726-492f-a2f5-ae13e792b194) · Security [Grok](174c70d8-1d83-445f-bda2-3b6e6a9599bf)
