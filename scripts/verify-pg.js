'use strict';

/**
 * Verify PostgreSQL schema tables and key constraints.
 * Usage: npm run db:verify
 */

require('dotenv').config();

const { getDb, migrate, closeDb, tableExists } = require('../src/lib/db');

const REQUIRED = [
  'users',
  'auth_identities',
  'clients',
  'websites',
  'data_identities',
  'connections',
  'metric_snapshots',
  'reports',
  'notifications',
  'admin_google_tokens',
  'admin_meta_tokens',
];

migrate();
const db = getDb();

const missing = REQUIRED.filter((t) => !tableExists(t));
if (missing.length) {
  console.error('Missing tables:', missing.join(', '));
  closeDb();
  process.exit(1);
}

const fk = db
  .prepare(
    `SELECT COUNT(*) AS c
     FROM information_schema.table_constraints
     WHERE table_schema = 'public' AND constraint_type = 'FOREIGN KEY'`
  )
  .get().c;

const users = db.prepare(`SELECT COUNT(*) AS c FROM users`).get().c;
const clients = db.prepare(`SELECT COUNT(*) AS c FROM clients`).get().c;

console.log('OK: all required tables present');
console.log(`Foreign keys: ${fk}`);
console.log(`users=${users} clients=${clients}`);
closeDb();
