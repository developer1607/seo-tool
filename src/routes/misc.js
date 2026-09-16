'use strict';

const express = require('express');
const { requireAuth, requireClient } = require('../middleware/auth');
const { getDb } = require('../lib/db');
const { resolvePreset, PRESETS } = require('../lib/dates');
const notifications = require('../lib/notifications');

const router = express.Router();

router.use(requireAuth);

router.get('/reports', requireClient, (req, res) => {
  const reports = getDb()
    .prepare(
      `SELECT * FROM reports WHERE client_id = ? ORDER BY created_at DESC`
    )
    .all(req.selectedClient.id);
  const range = resolvePreset(req.query.preset || 'last_30', req.query.from, req.query.to);
  res.render('dashboard/reports', {
    title: 'Reports',
    nav: 'reports',
    reports,
    range,
    presets: PRESETS,
  });
});

router.get('/notifications', (req, res) => {
  res.redirect('/');
});

router.post('/notifications/:id/read', (req, res) => {
  notifications.markRead(req.user.id, Number(req.params.id));
  res.redirect(req.body.return_to || '/notifications');
});

router.post('/notifications/read-all', (req, res) => {
  notifications.markAllRead(req.user.id);
  res.redirect(req.body.return_to || '/notifications');
});

router.get('/settings', (req, res) => {
  res.render('settings', {
    title: 'Settings',
    nav: 'settings',
    platform: {
      google: Boolean(
        process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ),
      meta: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
    },
  });
});

module.exports = router;
