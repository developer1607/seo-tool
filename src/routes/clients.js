'use strict';

const express = require('express');
const { getDb } = require('../lib/db');
const { requireAuth } = require('../middleware/auth');
const { listClients, getClient } = require('../lib/clients');
const { createWebsite } = require('../lib/websites');
const { setSession, readSession } = require('../lib/session');
const { createNotification } = require('../lib/notifications');
const {
  setClientOriginIfNew,
  recordClientSource,
} = require('../lib/clientProvenance');

const router = express.Router();

router.use(requireAuth);

router.get('/clients', (req, res) => {
  res.render('clients/list', {
    title: 'Clients',
    nav: 'clients',
    clients: listClients(),
    needSelect: req.query.need_select === '1',
    error: null,
    edit: null,
  });
});

router.post('/clients', (req, res) => {
  console.log(req.body);
  const name = String(req.body.name || '').trim();
  const website_url = String(req.body.website_url || '').trim();
  const brand_primary = String(req.body.brand_primary || '#0d7a6f').trim();
  const brand_secondary = String(req.body.brand_secondary || '#1e2530').trim();
  const timezone = String(req.body.timezone || 'Asia/Kolkata').trim();
  const currency = String(req.body.currency || 'INR').trim();

  if (!name || !website_url) {
    return res.status(400).render('clients/list', {
      title: 'Clients',
      nav: 'clients',
      clients: listClients(),
      needSelect: false,
      error: 'Name and website URL required.',
      edit: null,
    });
  }

  const info = getDb()
    .prepare(
      `INSERT INTO clients (
         name, website_url, brand_primary, brand_secondary, timezone, currency,
         origin, created_by_user_id
       ) VALUES (?, ?, ?, ?, ?, ?, 'MANUAL', ?)`
    )
    .run(
      name,
      website_url,
      brand_primary,
      brand_secondary,
      timezone,
      currency,
      req.user.id
    );
  setClientOriginIfNew(info.lastInsertRowid, 'MANUAL', req.user.id);
  const site = createWebsite(info.lastInsertRowid, {
    name,
    url: website_url,
    timezone,
    currency,
  });
  recordClientSource({
    clientId: info.lastInsertRowid,
    websiteId: site?.id,
    source: 'MANUAL',
    externalAccountId: '',
    createdByUserId: req.user.id,
  });

  createNotification({
    userId: req.user.id,
    clientId: info.lastInsertRowid,
    layer: 'CLIENT',
    type: 'client.created',
    severity: 'info',
    title: 'Client created',
    body: name,
    href: `/clients/${info.lastInsertRowid}/select`,
  });

  const session = readSession(req);
  setSession(res, {
    userId: req.user.id,
    role: req.user.role,
    selectedClientId: info.lastInsertRowid,
    selectedWebsiteId: site?.id || null,
  });
  res.redirect('/');
});

router.get('/clients/:id/edit', (req, res) => {
  const edit = getClient(req.params.id);
  if (!edit) {
    return res.status(404).render('error', {
      title: 'Not found',
      message: 'Client not found.',
      status: 404,
    });
  }
  res.render('clients/list', {
    title: 'Clients',
    nav: 'clients',
    clients: listClients(),
    needSelect: false,
    error: null,
    edit,
  });
});

router.post('/clients/:id', (req, res) => {
  const client = getClient(req.params.id);
  if (!client) {
    return res.status(404).render('error', {
      title: 'Not found',
      message: 'Client not found.',
      status: 404,
    });
  }
  const name = String(req.body.name || '').trim();
  const website_url = String(req.body.website_url || '').trim();
  if (!name || !website_url) {
    return res.status(400).render('clients/list', {
      title: 'Clients',
      nav: 'clients',
      clients: listClients(),
      needSelect: false,
      error: 'Name and website URL required.',
      edit: client,
    });
  }
  getDb()
    .prepare(
      `UPDATE clients SET
         name = ?, website_url = ?,
         brand_primary = ?, brand_secondary = ?,
         timezone = ?, currency = ?,
         updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(
      name,
      website_url,
      String(req.body.brand_primary || client.brand_primary),
      String(req.body.brand_secondary || client.brand_secondary),
      String(req.body.timezone || client.timezone),
      String(req.body.currency || client.currency),
      client.id
    );
  res.redirect('/clients');
});

router.post('/clients/:id/delete', (req, res) => {
  getDb().prepare(`DELETE FROM clients WHERE id = ?`).run(req.params.id);
  const session = readSession(req);
  let selected = session?.selectedClientId;
  if (String(selected) === String(req.params.id)) {
    selected = getDb().prepare(`SELECT id FROM clients ORDER BY name LIMIT 1`).get()?.id || null;
  }
  setSession(res, {
    userId: req.user.id,
    role: req.user.role,
    selectedClientId: selected,
  });
  res.redirect('/clients');
});

router.get('/clients/:id/select', (req, res) => {
  const client = getClient(req.params.id);
  if (!client) {
    return res.redirect('/clients');
  }
  setSession(res, {
    userId: req.user.id,
    role: req.user.role,
    selectedClientId: client.id,
  });
  res.redirect(req.query.return_to || '/');
});

router.post('/clients/:id/logo', (req, res) => {
  // Placeholder: logo upload wiring next (multer). Keep route for SRS UI.
  res.redirect(`/clients/${req.params.id}/edit`);
});

module.exports = router;
