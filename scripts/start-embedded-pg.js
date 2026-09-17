'use strict';

/**
 * Start a project-local PostgreSQL (no Docker, no system install).
 * Writes connection hint; set DATABASE_URL in .env to match.
 *
 * Usage: npm run db:pg:start
 */

const fs = require('fs');
const path = require('path');
const EmbeddedPostgres = require('embedded-postgres').default || require('embedded-postgres');

const root = path.join(__dirname, '..');
const dataDir = path.join(root, 'data', 'pg-utf8');
const port = Number(process.env.PG_PORT || 5434);
const user = process.env.PG_USER || 'webastral';
const password = process.env.PG_PASSWORD || 'webastral';
const database = process.env.PG_DATABASE || 'webastral';

const url = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${port}/${database}`;

async function main() {
  fs.mkdirSync(dataDir, { recursive: true });

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user,
    password,
    port,
    persistent: true,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
  });

  const marker = path.join(dataDir, 'PG_VERSION');
  if (!fs.existsSync(marker)) {
    console.log('Initialising embedded PostgreSQL cluster…');
    await pg.initialise();
  }

  console.log(`Starting PostgreSQL on port ${port}…`);
  await pg.start();

  try {
    await pg.createDatabase(database);
    console.log(`Database ${database} ready`);
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    if (!/already exists/i.test(msg)) {
      // createDatabase may throw if exists — continue
      console.log(`createDatabase: ${msg}`);
    }
  }

  // Keep .env DATABASE_URL aligned with this embedded instance
  const envPath = path.join(root, '.env');
  if (fs.existsSync(envPath)) {
    let envText = fs.readFileSync(envPath, 'utf8');
    if (!/^DATABASE_URL=/m.test(envText)) {
      envText += `\nDATABASE_URL=${url}\n`;
      fs.writeFileSync(envPath, envText);
      console.log('Appended DATABASE_URL to .env');
    } else {
      envText = envText.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${url}`);
      fs.writeFileSync(envPath, envText);
      console.log('Updated DATABASE_URL in .env');
    }
  }

  console.log('DATABASE_URL=', url);
  console.log('Leave this process running. Ctrl+C stops Postgres.');

  const stop = async () => {
    try {
      await pg.stop();
    } catch {
      /* ignore */
    }
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  // Keep alive
  await new Promise(() => {});
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
