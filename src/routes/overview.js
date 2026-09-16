'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { overviewAdmin, overviewClient } = require('../lib/metrics/views');
const notifications = require('../lib/notifications');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const data =
    req.user.role === 'ADMIN' ? overviewAdmin() : overviewClient(req.user.id);
  const alerts = notifications
    .listForUser(req.user.id, { limit: 10 })
    .filter((n) => !n.read_at && (n.severity === 'warn' || n.severity === 'error'))
    .slice(0, 3);
  res.render('overview', {
    title: 'Overview',
    nav: 'overview',
    data,
    alerts,
  });
});

module.exports = router;
