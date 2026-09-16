# Legacy / unmounted code (do not mount)

`src/index.js` mounts only `routes/google` and `routes/api`.

These files are **not** in the live request path and contradict Admin-only schema
(`CLIENT` role, `website_onboarding`, `client_invites`, EJS `res.render`):

- `src/routes/auth.js`
- `src/routes/clients.js`
- `src/routes/websites.js`
- `src/routes/overview.js`
- `src/routes/dashboard.js`
- `src/routes/misc.js`
- `src/routes/notifications.js`
- `src/lib/invites.js`
- `src/lib/metrics/views.js`

Do not wire them without a full rewrite against `db/schema.sql`.
