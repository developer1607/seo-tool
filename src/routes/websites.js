'use strict';

const express = require('express');
const { getDb } = require('../lib/db');
const { requireAuth, canAccessWebsite } = require('../middleware/auth');
const {
  websiteOverview,
  performanceVM,
  integrationsVM,
} = require('../lib/metrics/views');
const { createNotification } = require('../lib/notifications');

const router = express.Router();

function listWebsites(user) {
  if (user.role === 'ADMIN') {
    return getDb()
      .prepare(
        `SELECT w.*, cl.name AS client_name,
           (SELECT status FROM website_onboarding o WHERE o.website_id = w.id) AS onboarding_status,
           (SELECT COUNT(*) FROM connections c WHERE c.website_id = w.id AND c.status = 'ACTIVE') AS active_connections
         FROM websites w
         JOIN clients cl ON cl.id = w.client_id
         ORDER BY lower(w.name)`
      )
      .all();
  }
  return getDb()
    .prepare(
      `SELECT w.*, NULL AS client_name,
         (SELECT status FROM website_onboarding o WHERE o.website_id = w.id) AS onboarding_status,
         (SELECT COUNT(*) FROM connections c WHERE c.website_id = w.id AND c.status = 'ACTIVE') AS active_connections
       FROM websites w WHERE w.client_id = ?
       ORDER BY lower(w.name)`
    )
    .all(user.id);
}

router.get('/websites', requireAuth, (req, res) => {
  const clients =
    req.user.role === 'ADMIN'
      ? getDb()
          .prepare(`SELECT id, name, website_url AS email FROM clients ORDER BY lower(name)`)
          .all()
      : [];
  res.render('websites/list', {
    title: 'Websites',
    nav: 'websites',
    websites: listWebsites(req.user),
    clients,
    selectedClientId: req.query.client_id || '',
    error: null,
  });
});

router.get('/websites/new', requireAuth, (req, res) => {
  const q = req.query.client_id ? `?client_id=${encodeURIComponent(req.query.client_id)}` : '';
  res.redirect(`/websites${q}`);
});

router.post('/websites', requireAuth, (req, res) => {
  const name = String(req.body.name || '').trim();
  const domain = String(req.body.domain || '').trim();
  const timezone = String(req.body.timezone || 'Asia/Kolkata').trim();
  const currency = String(req.body.currency || 'INR').trim();
  let clientId = req.user.id;
  if (req.user.role === 'ADMIN') {
    clientId = Number(req.body.client_id);
  }
  const clients =
    req.user.role === 'ADMIN'
      ? getDb()
          .prepare(`SELECT id, name, website_url AS email FROM clients ORDER BY lower(name)`)
          .all()
      : [];
  if (!name || !domain || !clientId) {
    return res.status(400).render('websites/list', {
      title: 'Websites',
      nav: 'websites',
      websites: listWebsites(req.user),
      clients,
      selectedClientId: req.body.client_id || '',
      error: 'Name and domain required.',
    });
  }
  const owner = getDb().prepare(`SELECT id FROM clients WHERE id = ?`).get(clientId);
  if (!owner) {
    return res.status(400).render('websites/list', {
      title: 'Websites',
      nav: 'websites',
      websites: listWebsites(req.user),
      clients,
      selectedClientId: '',
      error: 'Invalid client.',
    });
  }
  const info = getDb()
    .prepare(
      `INSERT INTO websites (client_id, name, url, timezone, currency)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(clientId, name, domain, timezone, currency);
  getDb()
    .prepare(
      `INSERT INTO website_onboarding (website_id, goal_primary, channels_json, status)
       VALUES (?, 'TRAFFIC', '[]', 'DRAFT')`
    )
    .run(info.lastInsertRowid);
  createNotification({
    userId: clientId,
    clientId,
    websiteId: info.lastInsertRowid,
    layer: 'CLIENT',
    type: 'client.website_added',
    severity: 'info',
    title: 'Website added',
    body: name,
    href: `/websites/${info.lastInsertRowid}`,
  });
  res.redirect(`/websites/${info.lastInsertRowid}/onboarding`);
});

function loadSite(req, res, next) {
  const site = canAccessWebsite(req.user, req.params.id);
  if (!site) {
    return res.status(404).render('error', {
      title: 'Not found',
      message: 'Website not found.',
      status: 404,
    });
  }
  req.website = site;
  next();
}

router.get('/websites/:id', requireAuth, loadSite, (req, res) => {
  const data = websiteOverview(req.website.id);
  res.render('websites/overview', {
    title: req.website.name,
    nav: 'websites',
    tab: 'overview',
    website: req.website,
    data,
  });
});

router.get('/websites/:id/performance', requireAuth, loadSite, (req, res) => {
  const data = performanceVM(req.website.id);
  res.render('websites/performance', {
    title: `${req.website.name} — Performance`,
    nav: 'websites',
    tab: 'performance',
    website: req.website,
    data,
  });
});

router.get('/websites/:id/onboarding', requireAuth, loadSite, (req, res) => {
  const row = getDb()
    .prepare(`SELECT * FROM website_onboarding WHERE website_id = ?`)
    .get(req.website.id);
  res.render('websites/onboarding', {
    title: `${req.website.name} — Onboarding`,
    nav: 'websites',
    tab: 'onboarding',
    website: req.website,
    onboarding: row,
    saved: req.query.saved === '1',
  });
});

router.post('/websites/:id/onboarding', requireAuth, loadSite, (req, res) => {
  const goal = String(req.body.goal_primary || 'TRAFFIC');
  const channels = []
    .concat(req.body.channels || [])
    .map(String);
  const conversion_label = String(req.body.conversion_label || '').trim();
  const ga4 = String(req.body.ga4_key_events || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const meta = String(req.body.meta_action_types || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const value_mode = String(req.body.value_mode || 'NONE');
  const status = req.body.complete === '1' ? 'COMPLETE' : 'DRAFT';

  getDb()
    .prepare(
      `UPDATE website_onboarding SET
         goal_primary = ?,
         channels_json = ?,
         conversion_label = ?,
         ga4_key_events_json = ?,
         meta_action_types_json = ?,
         value_mode = ?,
         status = ?,
         completed_at = CASE WHEN ? = 'COMPLETE' THEN datetime('now') ELSE completed_at END,
         updated_at = datetime('now')
       WHERE website_id = ?`
    )
    .run(
      goal,
      JSON.stringify(channels),
      conversion_label || null,
      JSON.stringify(ga4),
      JSON.stringify(meta),
      value_mode,
      status,
      status,
      req.website.id
    );

  if (status === 'COMPLETE') {
    createNotification({
      userId: req.user.id,
      websiteId: req.website.id,
      clientId: req.website.client_id,
      layer: 'WEBSITE',
      type: 'onboarding.completed',
      severity: 'success',
      title: 'Onboarding complete',
      body: req.website.name,
      href: `/websites/${req.website.id}/integrations`,
    });
    return res.redirect(`/websites/${req.website.id}/integrations`);
  }
  res.redirect(`/websites/${req.website.id}/onboarding?saved=1`);
});

router.get('/websites/:id/integrations', requireAuth, loadSite, (req, res) => {
  const data = integrationsVM(req.website.id);
  res.render('websites/integrations', {
    title: `${req.website.name} — Integrations`,
    nav: 'websites',
    tab: 'integrations',
    website: req.website,
    data,
  });
});

router.get('/websites/:id/reports', requireAuth, loadSite, (req, res) => {
  res.render('websites/reports', {
    title: `${req.website.name} — Reports`,
    nav: 'websites',
    tab: 'reports',
    website: req.website,
  });
});

module.exports = router;
