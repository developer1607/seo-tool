'use strict';

/**
 * Sync-compatible PostgreSQL wrapper matching node:sqlite DatabaseSync shape:
 *   db.prepare(sql).get(...args) | .all(...args) | .run(...args)
 *   db.exec(sql)
 * Worker thread + MessageChannel + Atomics (no native addons).
 */

const path = require('path');
const {
  Worker,
  MessageChannel,
  receiveMessageOnPort,
} = require('worker_threads');

function isPlainObject(v) {
  return (
    v !== null &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    !(v instanceof Date) &&
    !(v instanceof Buffer)
  );
}

function rewriteSql(sql) {
  let s = String(sql);
  // SQLite datetime('now') → PG
  s = s.replace(/datetime\s*\(\s*'now'\s*\)/gi, '(NOW()::text)');
  // SQLite date('now') → PG date as text YYYY-MM-DD
  s = s.replace(
    /date\s*\(\s*'now'\s*\)/gi,
    `(to_char(CURRENT_DATE, 'YYYY-MM-DD'))`
  );
  // SQLite date('now', ?) or date('now', '-7 days') → CURRENT_DATE + interval
  s = s.replace(
    /date\s*\(\s*'now'\s*,\s*\?\s*\)/gi,
    `(to_char(CURRENT_DATE + (?::text)::interval, 'YYYY-MM-DD'))`
  );
  s = s.replace(
    /date\s*\(\s*'now'\s*,\s*'([^']+)'\s*\)/gi,
    (_, mod) =>
      `(to_char(CURRENT_DATE + ('${mod}'::text)::interval, 'YYYY-MM-DD'))`
  );
  return s;
}

function bind(sql, args) {
  const text0 = rewriteSql(sql);
  if (args.length === 1 && isPlainObject(args[0])) {
    const obj = args[0];
    const names = [];
    const text = text0.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
      names.push(name);
      return `$${names.length}`;
    });
    return { text, values: names.map((n) => obj[n]) };
  }
  let i = 0;
  const text = text0.replace(/\?/g, () => `$${++i}`);
  return { text, values: args };
}

function splitStatements(sql) {
  const out = [];
  let cur = '';
  let inSingle = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === "'" && !inSingle) {
      inSingle = true;
      cur += ch;
      continue;
    }
    if (ch === "'" && inSingle) {
      if (next === "'") {
        cur += "''";
        i++;
        continue;
      }
      inSingle = false;
      cur += ch;
      continue;
    }
    if (ch === ';' && !inSingle) {
      const s = cur.trim();
      if (s) out.push(s);
      cur = '';
      continue;
    }
    cur += ch;
  }
  const tail = cur.trim();
  if (tail) out.push(tail);
  return out;
}

function createPgDatabase(connectionString) {
  const sab = new SharedArrayBuffer(4);
  const lock = new Int32Array(sab);
  const { port1, port2 } = new MessageChannel();

  const worker = new Worker(path.join(__dirname, 'pg-worker.js'), {
    workerData: { connectionString, sab },
  });

  let workerError = null;
  worker.on('error', (err) => {
    workerError = err;
    Atomics.add(lock, 0, 1);
    Atomics.notify(lock, 0);
  });

  worker.postMessage({ port: port2 }, [port2]);

  function waitMessage() {
    for (;;) {
      if (workerError) throw workerError;
      const queued = receiveMessageOnPort(port1);
      if (queued) return queued.message;
      const before = Atomics.load(lock, 0);
      // Recheck after load to avoid missing a notify
      const again = receiveMessageOnPort(port1);
      if (again) return again.message;
      Atomics.wait(lock, 0, before);
    }
  }

  // Wait for worker ready
  const ready = waitMessage();
  if (!ready || !ready.ok) {
    throw new Error('PostgreSQL worker failed to start');
  }

  let seq = 1;

  function call(type, payload = {}) {
    if (workerError) throw workerError;
    const id = seq++;
    port1.postMessage({ id, type, ...payload });
    const msg = waitMessage();
    if (!msg) throw new Error('PostgreSQL worker: empty response');
    if (!msg.ok) {
      throw new Error(msg.error || 'PostgreSQL query failed');
    }
    return msg;
  }

  try {
    call('query', { text: 'SELECT 1 AS ok', values: [] });
  } catch (e) {
    try {
      worker.terminate();
    } catch {
      /* ignore */
    }
    const hint =
      'Set DATABASE_URL to a running PostgreSQL database (no Docker). ' +
      'Or run: npm run db:pg:start';
    throw new Error(
      `PostgreSQL connect failed: ${e.message || e}. ${hint}`
    );
  }

  function prepare(sql) {
    return {
      get(...args) {
        const { text, values } = bind(sql, args);
        const msg = call('query', { text, values });
        return msg.rows[0] || undefined;
      },
      all(...args) {
        const { text, values } = bind(sql, args);
        const msg = call('query', { text, values });
        return msg.rows;
      },
      run(...args) {
        let { text, values } = bind(sql, args);
        const isInsert = /^\s*insert\b/i.test(text);
        if (isInsert && !/\breturning\b/i.test(text)) {
          text = `${text.replace(/;?\s*$/, '')} RETURNING *`;
        }
        const msg = call('query', { text, values });
        const row = msg.rows[0];
        const lastInsertRowid = row
          ? Number(
              row.id != null ? row.id : row.user_id != null ? row.user_id : 0
            )
          : 0;
        return {
          lastInsertRowid,
          changes: msg.rowCount || 0,
        };
      },
    };
  }

  function stripLeadingComments(stmt) {
    const lines = String(stmt).split(/\r?\n/);
    while (lines.length && /^\s*(--.*)?\s*$/.test(lines[0])) {
      lines.shift();
    }
    return lines.join('\n').trim();
  }

  function exec(sql) {
    const statements = splitStatements(rewriteSql(sql));
    for (const stmt of statements) {
      const text = stripLeadingComments(stmt);
      if (!text) continue;
      call('query', { text, values: [] });
    }
  }

  function close() {
    try {
      call('end', {});
    } catch {
      /* ignore */
    }
    worker.terminate();
    port1.close();
  }

  return { prepare, exec, close };
}

module.exports = { createPgDatabase, rewriteSql, bind };
