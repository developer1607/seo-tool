'use strict';

/**
 * Poll DATABASE_URL until PostgreSQL accepts connections (or timeout).
 * Used so `npm run dev` can start API after embedded PG is up.
 */

require('dotenv').config();

const { Client } = require('pg');

const url = String(process.env.DATABASE_URL || '').trim();
const timeoutMs = Number(process.env.PG_WAIT_MS || 60000);
const intervalMs = 500;

if (!url) {
  console.error(
    'DATABASE_URL is not set. Run: npm run db:pg:start (or set DATABASE_URL).'
  );
  process.exit(1);
}

async function once() {
  const client = new Client({ connectionString: url });
  try {
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
    return true;
  } catch {
    try {
      await client.end();
    } catch {
      /* ignore */
    }
    return false;
  }
}

async function main() {
  const start = Date.now();
  process.stdout.write(`Waiting for PostgreSQL…`);
  while (Date.now() - start < timeoutMs) {
    if (await once()) {
      console.log(' ready');
      return;
    }
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  console.error(
    `\nTimed out after ${timeoutMs}ms. Start Postgres with: npm run db:pg:start`
  );
  process.exit(1);
}

main();
