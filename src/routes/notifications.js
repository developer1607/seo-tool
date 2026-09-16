'use strict';

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const notifications = require('../lib/notifications');

const router = express.Router();

router.get('/notifications', requireAuth, (req, res) => {
  const items = notifications.listForUser(req.user.id, { limit: 50 });
  res.render('notifications', {
    title: 'Notifications',
    nav: null,
    items,
  });
});

router.post('/notifications/:id/read', requireAuth, (req, res) => {
  notifications.markRead(req.user.id, Number(req.params.id));
  const back = req.body.return_to || '/notifications';
  res.redirect(back);
});

router.post('/notifications/read-all', requireAuth, (req, res) => {
  notifications.markAllRead(req.user.id);
  res.redirect(req.body.return_to || '/notifications');
});

module.exports = router;
