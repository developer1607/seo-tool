'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../lib/db');
const { setSession, clearSession } = require('../lib/session');
const { take, clientKey } = require('../lib/rateLimit');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('login', { title: 'Sign in', layout: false, error: null });
});

router.post('/login', (req, res) => {
  const limited = take(clientKey(req, 'login'), {
    limit: 8,
    windowMs: 15 * 60 * 1000,
  });
  if (!limited.ok) {
    return res.status(429).render('login', {
      title: 'Sign in',
      layout: false,
      error: 'Too many sign-in attempts. Wait a few minutes and try again.',
    });
  }
  const email = String(req.body.email || '')
    .trim()
    .toLowerCase();
  const password = String(req.body.password || '');
  const user = getDb()
    .prepare(`SELECT * FROM users WHERE email = ? AND role = 'ADMIN'`)
    .get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).render('login', {
      title: 'Sign in',
      layout: false,
      error: 'Invalid Admin email or password.',
    });
  }
  const first = getDb().prepare(`SELECT id FROM clients ORDER BY name LIMIT 1`).get();
  setSession(res, {
    userId: user.id,
    role: user.role,
    selectedClientId: first?.id || null,
  });
  res.redirect('/');
});

router.post('/logout', (req, res) => {
  clearSession(res);
  res.redirect('/login');
});

module.exports = router;
