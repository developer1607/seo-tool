'use strict';

const { parentPort, workerData } = require('worker_threads');
const { Client, types } = require('pg');

types.setTypeParser(types.builtins.INT2, (v) => parseInt(v, 10));
types.setTypeParser(types.builtins.INT4, (v) => parseInt(v, 10));
types.setTypeParser(types.builtins.INT8, (v) => parseInt(v, 10));
types.setTypeParser(types.builtins.FLOAT4, parseFloat);
types.setTypeParser(types.builtins.FLOAT8, parseFloat);
types.setTypeParser(types.builtins.NUMERIC, parseFloat);

let client;
const lock = new Int32Array(workerData.sab);

async function getClient() {
  if (!client) {
    client = new Client({ connectionString: workerData.connectionString });
    await client.connect();
  }
  return client;
}

function reply(port, payload) {
  port.postMessage(payload);
  Atomics.add(lock, 0, 1);
  Atomics.notify(lock, 0);
}

parentPort.once('message', ({ port }) => {
  port.on('message', async (msg) => {
    const { id, type } = msg;
    try {
      if (type === 'query') {
        const c = await getClient();
        const res = await c.query(msg.text, msg.values || []);
        reply(port, {
          id,
          ok: true,
          rows: res.rows,
          rowCount: res.rowCount || 0,
        });
        return;
      }
      if (type === 'end') {
        if (client) {
          await client.end();
          client = null;
        }
        reply(port, { id, ok: true });
        return;
      }
      reply(port, { id, ok: false, error: `Unknown type ${type}` });
    } catch (e) {
      reply(port, {
        id,
        ok: false,
        error: e && e.message ? e.message : String(e),
      });
    }
  });
  reply(port, { id: 0, ok: true, ready: true });
});
