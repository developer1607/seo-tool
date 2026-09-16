'use strict';

const express = require('express');
const { requireAuth, requireClient } = require('../middleware/auth');
const { buildKpis, platformStatus } = require('../lib/clients');
const { resolvePreset, PRESETS } = require('../lib/dates');
const notifications = require('../lib/notifications');

const router = express.Router();

function rangeFromReq(req) {
  return resolvePreset(
    req.query.preset || req.rangeCookie?.preset || 'last_30',
    req.query.from || req.rangeCookie?.from,
    req.query.to || req.rangeCookie?.to
  );
}

router.use(requireAuth);

router.get('/', requireClient, (req, res) => {
  const range = rangeFromReq(req);
  const { kpis } = buildKpis(req.selectedClient.id, range.from, range.to);
  const compare = buildKpis(
    req.selectedClient.id,
    range.compareFrom,
    range.compareTo
  ).kpis;
  const platforms = platformStatus(req.selectedClient.id);
  const alerts = notifications
    .listForUser(req.user.id, { limit: 10 })
    .filter((n) => !n.read_at && (n.severity === 'warn' || n.severity === 'error'))
    .slice(0, 3);

  res.render('dashboard/overview', {
    title: 'Overview',
    nav: 'overview',
    range,
    presets: PRESETS,
    kpis,
    compare,
    platforms,
    alerts,
  });
});

function platformPage(nav, providerKey, title) {
  return (req, res) => {
    const range = rangeFromReq(req);
    const { kpis, bySource } = buildKpis(req.selectedClient.id, range.from, range.to);
    const compare = buildKpis(
      req.selectedClient.id,
      range.compareFrom,
      range.compareTo
    ).kpis;
    const platforms = platformStatus(req.selectedClient.id);
    const status = platforms.find((p) => p.key === providerKey);

    res.render('dashboard/platform', {
      title,
      nav,
      range,
      presets: PRESETS,
      kpis,
      compare,
      status,
      providerKey,
      rows: [],
    });
  };
}

router.get(
  '/platforms/google-ads',
  requireClient,
  platformPage('google-ads', 'GOOGLE_ADS', 'Google Ads')
);
router.get('/platforms/meta', requireClient, platformPage('meta', 'META_ADS', 'Meta Ads'));
router.get(
  '/platforms/ga4',
  requireClient,
  platformPage('ga4', 'GOOGLE_ANALYTICS', 'GA4')
);
router.get(
  '/platforms/gsc',
  requireClient,
  platformPage('gsc', 'GOOGLE_SEARCH_CONSOLE', 'Search Console')
);

router.get('/integrations', requireClient, (req, res) => {
  res.render('dashboard/integrations', {
    title: 'Integrations',
    nav: 'integrations',
    platforms: platformStatus(req.selectedClient.id),
    range: rangeFromReq(req),
    presets: PRESETS,
  });
});

module.exports = router;
