'use strict';

const ADS_SCOPE = 'https://www.googleapis.com/auth/adwords';

/** Prefer env; otherwise try current Google Ads REST versions (v19 404s for many projects). */
const ADS_API_VERSION_CANDIDATES = ['25', '22', '21', '20', '19'];
let resolvedApiVersion =
  process.env.GOOGLE_ADS_API_VERSION || null;

function adsConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
  );
}

function apiVersion() {
  return resolvedApiVersion || ADS_API_VERSION_CANDIDATES[0];
}

function developerToken() {
  return String(process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '').trim();
}

function normalizeCustomerId(raw) {
  if (raw == null) return '';
  return String(raw)
    .replace(/^customers\//i, '')
    .replace(/-/g, '')
    .trim();
}

function adsHeaders(accessToken, loginCustomerId) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
  // Optional after 2026-09-09 token sunset — Cloud project access level is authoritative.
  const token = developerToken();
  if (token) headers['developer-token'] = token;
  const login = normalizeCustomerId(loginCustomerId);
  if (login) headers['login-customer-id'] = login;
  return headers;
}

async function adsFetchOnce(version, path, accessToken, { method = 'GET', body, loginCustomerId } = {}) {
  const url = path.startsWith('http')
    ? path
    : `https://googleads.googleapis.com/v${version}${path}`;
  const res = await fetch(url, {
    method,
    headers: adsHeaders(accessToken, loginCustomerId),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { res, data, version };
}

async function adsFetch(path, accessToken, opts = {}) {
  const versions = resolvedApiVersion
    ? [resolvedApiVersion]
    : ADS_API_VERSION_CANDIDATES;

  let last = null;
  for (const version of versions) {
    const { res, data } = await adsFetchOnce(version, path, accessToken, opts);
    last = { res, data, version };
    if (res.ok) {
      resolvedApiVersion = version;
      return data;
    }
    // Try next version on 404 / UNIMPLEMENTED
    const status = data.error?.status || '';
    if (res.status === 404 || status === 'NOT_FOUND' || status === 'UNIMPLEMENTED') {
      continue;
    }
    break;
  }

  const detail =
    last?.data?.error?.message ||
    last?.data?.error?.status ||
    `Google Ads API ${last?.res?.status || 'error'}`;
  const status = last?.res?.status;
  let message = detail;
  let code = 'ADS_API_ERROR';
  // 401 = bad/revoked OAuth. 403 = Cloud project / MCC / ACL — not fixed by reconnect alone.
  if (status === 401) {
    code = 'NEEDS_REAUTH';
  } else if (status === 403) {
    code = 'ADS_PERMISSION';
    message = `${detail} (permission / MCC login-customer-id / Cloud Ads access — not only reconnect)`;
  } else if (status === 404) {
    code = 'ADS_API_ERROR';
    message = `${detail} — enable Google Ads API on the same Cloud project as OAuth`;
  }
  const err = new Error(message);
  err.code = code;
  err.status = status;
  err.details = last?.data?.error?.details || null;
  throw err;
}

async function searchAds(accessToken, customerId, query, loginCustomerId) {
  const cid = normalizeCustomerId(customerId);
  const results = [];
  let pageToken = '';
  do {
    const body = { query };
    if (pageToken) body.pageToken = pageToken;
    const data = await adsFetch(
      `/customers/${cid}/googleAds:search`,
      accessToken,
      { method: 'POST', body, loginCustomerId }
    );
    results.push(...(data.results || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return results;
}

async function listAccessibleCustomerIds(accessToken) {
  const data = await adsFetch(
    '/customers:listAccessibleCustomers',
    accessToken,
    { method: 'GET' }
  );
  return (data.resourceNames || [])
    .map(normalizeCustomerId)
    .filter(Boolean);
}

async function fetchCustomerInfo(accessToken, customerId, loginCustomerId) {
  const cid = normalizeCustomerId(customerId);
  const rows = await searchAds(
    accessToken,
    cid,
    `SELECT
      customer.id,
      customer.descriptive_name,
      customer.currency_code,
      customer.time_zone,
      customer.manager,
      customer.test_account
    FROM customer
    LIMIT 1`,
    loginCustomerId || cid
  );
  const c = rows[0]?.customer;
  if (!c) return null;
  return {
    id: normalizeCustomerId(c.id || cid),
    name: c.descriptiveName || `Account ${cid}`,
    currency: c.currencyCode || null,
    timeZone: c.timeZone || null,
    manager: Boolean(c.manager),
    testAccount: Boolean(c.testAccount),
    loginCustomerId: normalizeCustomerId(loginCustomerId || cid),
  };
}

async function listClientAccounts(accessToken, managerId) {
  const mid = normalizeCustomerId(managerId);
  const rows = await searchAds(
    accessToken,
    mid,
    `SELECT
      customer_client.client_customer,
      customer_client.descriptive_name,
      customer_client.currency_code,
      customer_client.time_zone,
      customer_client.manager,
      customer_client.level,
      customer_client.status
    FROM customer_client
    WHERE customer_client.status = 'ENABLED'
      AND customer_client.manager = FALSE
      AND customer_client.level <= 1`,
    mid
  );
  return rows
    .map((r) => {
      const cc = r.customerClient || {};
      const id = normalizeCustomerId(cc.clientCustomer || '');
      if (!id) return null;
      return {
        id,
        name: cc.descriptiveName || `Account ${id}`,
        currency: cc.currencyCode || null,
        timeZone: cc.timeZone || null,
        manager: false,
        loginCustomerId: mid,
        account: `MCC ${mid}`,
      };
    })
    .filter(Boolean);
}

async function mapPool(items, concurrency, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  const n = Math.min(concurrency, Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

/**
 * Flat list of selectable Ads accounts (direct + MCC clients).
 * Managers themselves are omitted unless they also have campaigns (rare).
 */
async function listAdsAccounts(accessToken) {
  const accessible = await listAccessibleCustomerIds(accessToken);
  const seen = new Set();
  const groups = await mapPool(accessible, 5, async (cid) => {
    let info = null;
    try {
      info = await fetchCustomerInfo(accessToken, cid, cid);
    } catch {
      try {
        info = await fetchCustomerInfo(accessToken, cid, null);
      } catch {
        return [];
      }
    }
    if (!info) return [];

    if (info.manager) {
      try {
        return await listClientAccounts(accessToken, cid);
      } catch {
        /* manager may lack hierarchy permission */
      }
      return [];
    }

    return [{
      id: info.id,
      name: info.name,
      currency: info.currency,
      timeZone: info.timeZone,
      manager: false,
      loginCustomerId: info.id,
      account: info.testAccount ? 'Test account' : 'Direct',
    }];
  });

  const out = [];
  for (const item of groups.flat()) {
    const id = normalizeCustomerId(item.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ ...item, id });
  }

  out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return out;
}

async function probeAds(accessToken, customerId, loginCustomerId) {
  const cid = normalizeCustomerId(customerId);
  const login = normalizeCustomerId(loginCustomerId) || cid;
  const rows = await searchAds(
    accessToken,
    cid,
    `SELECT customer.id FROM customer LIMIT 1`,
    login
  );
  if (!rows.length) {
    throw new Error('Google Ads account probe returned no rows');
  }
  return { ok: true, customerId: cid, loginCustomerId: login };
}

function num(v) {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function fetchAdsDaily(accessToken, customerId, loginCustomerId, from, to) {
  const cid = normalizeCustomerId(customerId);
  const login = normalizeCustomerId(loginCustomerId) || cid;
  const query = `
    SELECT
      segments.date,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value,
      metrics.average_cpc
    FROM campaign
    WHERE segments.date BETWEEN '${from}' AND '${to}'
      AND campaign.status != 'REMOVED'
  `;
  const rows = await searchAds(accessToken, cid, query, login);
  const byDate = new Map();

  for (const r of rows) {
    const date = r.segments?.date;
    if (!date) continue;
    const cur = byDate.get(date) || {
      date,
      impressions: 0,
      clicks: 0,
      cost_micros: 0,
      conversions: 0,
      conversions_value: 0,
    };
    cur.impressions += num(r.metrics?.impressions);
    cur.clicks += num(r.metrics?.clicks);
    cur.cost_micros += num(r.metrics?.costMicros ?? r.metrics?.cost_micros);
    cur.conversions += num(r.metrics?.conversions);
    cur.conversions_value += num(
      r.metrics?.conversionsValue ?? r.metrics?.conversions_value
    );
    byDate.set(date, cur);
  }

  return [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => {
      const spend = r.cost_micros / 1e6;
      const ctr = r.impressions > 0 ? r.clicks / r.impressions : 0;
      const efficiency =
        spend > 0 && r.conversions_value > 0
          ? r.conversions_value / spend
          : spend > 0 && r.conversions > 0
            ? spend / r.conversions
            : null;
      const efficiency_kind =
        spend > 0 && r.conversions_value > 0
          ? 'ROAS'
          : spend > 0 && r.conversions > 0
            ? 'CPA'
            : 'NONE';
      return {
        date: r.date,
        impressions: r.impressions,
        clicks: r.clicks,
        ctr,
        spend,
        primary_conversions: r.conversions,
        primary_value: r.conversions_value,
        efficiency,
        efficiency_kind,
      };
    });
}

module.exports = {
  ADS_SCOPE,
  adsConfigured,
  normalizeCustomerId,
  listAdsAccounts,
  probeAds,
  fetchAdsDaily,
};
