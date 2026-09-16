'use strict';

const bcrypt = require('bcryptjs');
const { getDb, migrate, dbPath } = require('../src/lib/db');
const { createWebsite, listWebsites } = require('../src/lib/websites');

migrate();
const db = getDb();

const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
const adminPass = process.env.SEED_ADMIN_PASSWORD || 'admin123';

const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
if (!existing) {
  const hash = bcrypt.hashSync(adminPass, 10);
  db.prepare(
    `INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, 'ADMIN')`
  ).run(adminEmail, 'Admin', hash);
  console.log(`Created ADMIN: ${adminEmail} / ${adminPass}`);
} else {
  console.log(`Admin exists: ${adminEmail}`);
}

const admin = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);

let clients = db.prepare('SELECT COUNT(*) AS c FROM clients').get().c;
if (clients === 0) {
  const a = db
    .prepare(
      `INSERT INTO clients (name, website_url, brand_primary, brand_secondary, timezone, currency)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run('Demo Client A', 'https://example-a.com', '#0d7a6f', '#1e2530', 'Asia/Kolkata', 'INR');
  const b = db
    .prepare(
      `INSERT INTO clients (name, website_url, brand_primary, brand_secondary, timezone, currency)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run('Demo Client B', 'https://example-b.com', '#1a5f9e', '#1e2530', 'Asia/Kolkata', 'INR');
  createWebsite(a.lastInsertRowid, {
    name: 'Example A site',
    url: 'https://example-a.com',
  });
  createWebsite(b.lastInsertRowid, {
    name: 'Example B site',
    url: 'https://example-b.com',
  });
  console.log('Created demo clients', a.lastInsertRowid, b.lastInsertRowid);

  db.prepare(
    `INSERT INTO notifications (user_id, client_id, layer, type, severity, title, body, href)
     VALUES (?, ?, 'CLIENT', 'client.created', 'info', 'Demo clients ready',
       'Select a client and add websites or connect platforms.', '/clients')`
  ).run(admin.id, a.lastInsertRowid);
} else {
  const all = db.prepare(`SELECT * FROM clients`).all();
  for (const c of all) {
    if (listWebsites(c.id).length === 0) {
      createWebsite(c.id, {
        name: c.name,
        url: c.website_url || 'https://example.com',
        timezone: c.timezone,
        currency: c.currency,
      });
      console.log('Backfilled website for client', c.id);
    }
  }
}

console.log('DB ready:', dbPath);
