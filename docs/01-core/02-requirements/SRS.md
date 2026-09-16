# Software Requirements Specification — Webastral

Canonical product requirements. Source dump: `docs/design-mocks/Software Requirements Specification (SRS).pdf` (gitignored). Keep this file in sync when the PDF changes.

**Product:** Webastral — Multi-Channel Marketing Reporting Tool  
**Phase 1 audience:** Internal / freelance agency (Admin only). Not public SaaS signup.

---

## Overview

Internal web platform that pulls **Google Ads**, **Meta Ads**, **GA4**, and **Google Search Console** into one branded dashboard per client. Admin connects accounts, switches clients, views KPIs/charts/comparisons, generates an editable AI summary, saves reports, exports PDF, and shares a secure view-only link (copy into Email / WhatsApp).

**Intended user:** One Admin (freelancer/agency). Clients do **not** log in.

---

## Hierarchy (locked from SRS)

```
ADMIN (only login)
  â””â”€â”€ Client profile (name, website URL, logo, brand colors)
        â”œâ”€â”€ Platform connections (Google Ads, Meta, GA4, GSC)
        â”œâ”€â”€ Cached / normalized metrics
        â””â”€â”€ Saved reports + share links
```

| Term | Meaning |
| --- | --- |
| Admin | Sole operator login |
| Client | Reporting profile + branding + isolated credentials/data â€” **not** a login |
| Connection | OAuth tokens for one platform on one Client |
| Report | Saved snapshot of range, comparison, branding, KPIs, charts, AI text |

Website URL lives **on the Client** (FR-24). Multi-property later if needed; do not invent a separate Client-login role.

---

## Functional requirements (renumbered)

Original PDF reused FR-13â€¦ numbers. Use these IDs in code/tests.

### Integrations

| ID | Requirement |
| --- | --- |
| FR-001 | Google Ads OAuth â€” campaign metrics: impressions, clicks, CTR, CPC, cost, conversions, conv. rate, ROAS |
| FR-002 | Meta Marketing OAuth â€” reach, impressions, clicks, CTR, CPC, spend, conversions, ROAS |
| FR-003 | GA4 Data API â€” sessions, users, engagement rate, conversions, source/medium, top landing pages |
| FR-004 | GSC API â€” clicks, impressions, CTR, avg position, top queries, top pages |
| FR-005 | Tokens encrypted; mapped to that Client only |

### Date range & sync

| ID | Requirement |
| --- | --- |
| FR-006 | Presets: Last 7 / 30 days, Last Month, Current Month, Previous Month, Custom |
| FR-007 | On range change, refresh data for all connected sources for that range |
| FR-008 | Cache fetched ranges; avoid redundant API calls |
| FR-009 | Comparisons: DoD, WoW, MoM, 3M vs 3M, Prev 30 vs Curr 30, custom |
| FR-010 | Show Î” absolute, %, and visual up/down indicators |

### Dashboard & visualization

| ID | Requirement |
| --- | --- |
| FR-011 | Overview combining top KPIs from all four sources |
| FR-012 | Tabs/pages: Google Ads Â· Meta Ads Â· GA4 Â· Search Console |
| FR-013 | Charts (trend, bar, comparison), KPI cards, tables; report customizable |
| FR-014 | Branding: logo, client/company name, website URL, color theme |
| FR-015 | Color scheme match client brand |
| FR-016 | Upload logo â€” top of dashboard and reports |
| FR-017 | Website URL shown with logo/client info |
| FR-018 | Positive/negative changes highlighted |
| FR-019 | Visual comparison SEO / Google Ads / Meta / GA4 across periods |
| FR-020 | Generated reports auto-saved |
| FR-021 | Access prior reports anytime |
| FR-022 | Saved reports keep range, comparison, branding, KPIs, charts, data |
| FR-023 | Admin can add/remove (and preferably reorder/save) report columns |

### AI summary

| ID | Requirement |
| --- | --- |
| FR-024 | Send structured metrics for period to AI (Claude/GPT) |
| FR-025 | Plain-language summary: overall, notable Î” vs prior, 2â€“3 takeaways |
| FR-026 | Summary editable before finalize |

### Multi-client

| ID | Requirement |
| --- | --- |
| FR-027 | Create / edit / delete Client profiles |
| FR-028 | Each Client: connections, branding, report history |
| FR-029 | Switch Client from central list / switcher |

### Export & sharing

| ID | Requirement |
| --- | --- |
| FR-030 | Export current report as PDF |
| FR-031 | Secure view-only share link (for Email / WhatsApp share â€” link first, not WhatsApp API) |

### Admin access

| ID | Requirement |
| --- | --- |
| FR-032 | Admin login only; Clients do not log in |
| FR-033 | Add Client: name, website URL, logo, basic details |
| FR-034 | Connect platforms per Client separately |
| FR-035 | Hard isolation â€” never mix Client data |
| FR-036 | Client switcher; dashboard shows only selected Client |
| FR-037 | Generate report uses that Clientâ€™s data + branding |

### Reliability / security (from challenges annex)

| ID | Requirement |
| --- | --- |
| FR-038 | Background sync; store last successful sync per platform |
| FR-039 | Retry failed API calls; one platform failure must not blank others |
| FR-040 | Encrypted tokens; disconnect/revoke; audit important admin actions |
| FR-041 | Share links: non-guessable token, view-only, optional expiry/revoke |
| FR-042 | Connector architecture so new platforms (audit, App Store, Play) plug in |

---

## UI shell (must match SRS â€” not invent roles)

```
Webastral
â”œâ”€â”€ Client switcher (header)
â”œâ”€â”€ Date range + comparison presets
â”œâ”€â”€ Overview          (all-source KPIs)
â”œâ”€â”€ Google Ads
â”œâ”€â”€ Meta Ads
â”œâ”€â”€ GA4
â”œâ”€â”€ Search Console
â”œâ”€â”€ Integrations      (connect OAuth per platform)
â”œâ”€â”€ Reports           (saved + generate + PDF + share)
â”œâ”€â”€ Clients           (list / add / edit branding)
â””â”€â”€ Settings          (Admin + platform OAuth apps)
```

No Client login portal. No fictional â€œfreelancer workspaceâ€ nav.

---

## Build order (from SRS annex)

1. DB architecture â†’ 2. Client management â†’ 3. OAuth â†’ 4. Per-API integrations â†’ 5. Normalize â†’ 6. Sync/cache â†’ 7. Date/comparison engine â†’ 8. Reporting API â†’ 9. Dashboard UI â†’ 10. AI summary â†’ 11. PDF â†’ 12. Share links â†’ 13. Security/tests

PoC may ship UI shell + Client CRUD + branding + tabs early, with live OAuth/sync next â€” but IA must already match this SRS.

---

## Out of Phase 1

Website auditing; Apple App Store / Google Play analytics; public multi-tenant signup; native WhatsApp Business API (share **link** only).

---

## Related docs

`docs/METRICS.md`, `docs/API_VIEW_MAP.md`, `docs/01-core/04-integrations/INTEGRATIONS.md`, `docs/NOTIFICATIONS.md`, `Engineering.md`
