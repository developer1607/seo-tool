'use strict';

const { getDb } = require('./db');

function listWebsites(clientId) {
  return getDb()
    .prepare(
      `SELECT * FROM websites WHERE client_id = ? ORDER BY name COLLATE NOCASE`
    )
    .all(clientId);
}

function getWebsite(id) {
  return getDb().prepare(`SELECT * FROM websites WHERE id = ?`).get(id);
}

function createWebsite(clientId, { name, url, timezone, currency }) {
  const client = getDb().prepare(`SELECT * FROM clients WHERE id = ?`).get(clientId);
  if (!client) return null;
  const info = getDb()
    .prepare(
      `INSERT INTO websites (client_id, name, url, timezone, currency)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      clientId,
      String(name || '').trim() || 'Website',
      String(url || '').trim(),
      timezone || client.timezone,
      currency || client.currency
    );
  const site = getWebsite(info.lastInsertRowid);
  syncClientPrimaryUrl(clientId);
  return site;
}

function updateWebsite(id, fields) {
  const site = getWebsite(id);
  if (!site) return null;
  getDb()
    .prepare(
      `UPDATE websites SET
         name = ?, url = ?, timezone = ?, currency = ?,
         updated_at = datetime('now')
       WHERE id = ?`
    )
    .run(
      String(fields.name || site.name).trim(),
      String(fields.url || site.url).trim(),
      fields.timezone || site.timezone,
      fields.currency || site.currency,
      id
    );
  syncClientPrimaryUrl(site.client_id);
  return getWebsite(id);
}

function deleteWebsite(id) {
  const site = getWebsite(id);
  if (!site) return false;
  getDb().prepare(`DELETE FROM websites WHERE id = ?`).run(id);
  syncClientPrimaryUrl(site.client_id);
  return true;
}

function syncClientPrimaryUrl(clientId) {
  const first = getDb()
    .prepare(
      `SELECT url FROM websites WHERE client_id = ? ORDER BY id ASC LIMIT 1`
    )
    .get(clientId);
  getDb()
    .prepare(
      `UPDATE clients SET website_url = ?, updated_at = datetime('now') WHERE id = ?`
    )
    .run(first?.url || '', clientId);
}

module.exports = {
  listWebsites,
  getWebsite,
  createWebsite,
  updateWebsite,
  deleteWebsite,
  syncClientPrimaryUrl,
};
