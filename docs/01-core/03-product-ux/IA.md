# Information architecture � Webastral

Source: `docs/01-core/02-requirements/SRS.md`. Do not invent Client-login nav or Phase-3 SEO tools in the primary shell.

## Admin shell

```
Webastral
�
+-- [Client + website switcher]   # top bar � session context
+-- [Date range bar]              # Overview + platform pages
�
+-- Performance
�   +-- Overview                  # selected WEBSITE KPIs
�   +-- Google Ads
�   +-- Meta Ads (soon)
�   +-- GA4
�   +-- Search Console
+-- Setup
�   +-- Integrations              # website account binding
�   +-- Reports
+-- Agency
    +-- Agency dashboard          # portfolio ops (/agency)
    +-- Clients                   # list / add / Import from Google
    �   +-- [client]              # research + client rollup
    +-- Settings                  # platform env health
```

See `docs/01-core/03-product-ux/NAVIGATION.md` for page jobs, three dashboard levels, and anti-loop guardrails.

## Client profile fields (Add/Edit)

- Name (required)
- Website URL (required)
- Logo upload
- Brand primary / secondary color
- Timezone, currency (reporting)

## Platform page pattern

Each of Google Ads / Meta / GA4 / GSC:

1. Connection status (or Connect CTA)
2. KPI strip for selected range + comparison ?
3. Trend chart placeholder
4. Campaign / query / page table (columns configurable later FR-023)
5. Soft-fail banner if this source failed (others still show)

## Reports

- Generate from current range + comparison + AI summary (editable)
- List saved reports
- PDF export, copy share link (Email/WhatsApp)

## Out of Phase-1 nav

Keywords, Site audit, Backlinks, App Store / Play, Client self-serve signup.
