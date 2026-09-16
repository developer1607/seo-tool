'use strict';

require('dotenv').config();

if (process.argv.includes('--prod')) {
  process.env.NODE_ENV = 'production';
}

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const { migrate, getDb } = require('./lib/db');
const { readSession } = require('./lib/session');
const { getClient } = require('./lib/clients');
const { getWebsite, listWebsites } = require('./lib/websites');

migrate();

const PORT = Number(process.env.PORT) || 4000;

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use('/public', express.static(path.join(__dirname, '..', 'public')));

app.use((req, res, next) => {
  const session = readSession(req);
  req.user = null;
  req.selectedClient = null;
  req.selectedWebsite = null;

  if (session?.userId) {
    const user = getDb()
      .prepare(
        `SELECT id, email, name, role FROM users WHERE id = ? AND role = 'ADMIN'`
      )
      .get(session.userId);
    if (user) {
      req.user = user;
      if (session.selectedClientId) {
        const client = getClient(session.selectedClientId);
        if (client) {
          req.selectedClient = client;
          if (session.selectedWebsiteId) {
            const site = getWebsite(session.selectedWebsiteId);
            if (site && site.client_id === client.id) {
              req.selectedWebsite = site;
            }
          }
          if (!req.selectedWebsite) {
            const sites = listWebsites(client.id);
            req.selectedWebsite = sites[0] || null;
          }
        }
      }
    }
  }
  next();
});

/** Liveness for free-host probes (no auth). */
function healthHandler(_req, res) {
  try {
    getDb().prepare('SELECT 1 AS ok').get();
    res.json({
      ok: true,
      service: 'webastral-api',
      db: 'up',
      time: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({ ok: false, db: 'down', error: 'database unavailable' });
  }
}
app.get('/health', healthHandler);
app.get('/api/health', healthHandler);

app.use('/api', require('./routes/google'));
app.use('/api', require('./routes/meta'));
app.use('/api', require('./routes/api'));

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
});

app.listen(PORT, () => {
  console.log(`Webastral API http://localhost:${PORT}`);
});
