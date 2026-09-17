# Legacy / unmounted code (do not mount)

`src/index.js` mounts only `routes/google`, `routes/meta`, and `routes/api`.

These files are **not** in the live request path (EJS `res.render` / old HTML routers):

- `src/routes/auth.js`
- `src/routes/clients.js`
- `src/routes/websites.js` (this is where `website_onboarding` HTML lived)
- `src/routes/overview.js`
- `src/routes/dashboard.js`
- `src/routes/misc.js`
- `src/routes/notifications.js`
- `src/lib/invites.js` (`client_invites` — table exists in Postgres, 0 rows, unused)

**Live (do not treat as legacy):** `src/lib/metrics/views.js` — used by `src/routes/api.js` for `/api/agency/overview` and client overview.

`website_onboarding` and `client_invites` exist in `db/schema.postgres.sql` for the unmounted EJS flow. The Next UI does not write onboarding rows. Empty tables after SQLite → PG copy are expected.

Do not remount the EJS routers without a rewrite against the Next `web/` app and `db/schema.postgres.sql`.
