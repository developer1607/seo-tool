'use strict';

const { listWebsites } = require('../websites');
const { listConnections, GOOGLE_PROVIDERS } = require('../connections');
const { getAccessTokenForWebsite } = require('./sync');
const {
  getAccessTokenForDiscover,
  agencyGoogleStatus,
} = require('./agency');

/**
 * Confirm Google access for a client by calling Google's token endpoint.
 * Marks connections / identity NEEDS_REAUTH when Google returns invalid_grant.
 */
async function verifyClientGoogleAccess(userId, clientId) {
  const sites = listWebsites(clientId);
  const websites = [];
  let accessRevoked = false;
  let checked = 0;
  let ok = 0;

  for (const site of sites) {
    const googleConns = listConnections(site.id).filter(
      (c) =>
        GOOGLE_PROVIDERS.includes(c.provider) &&
        !['DISCONNECTED', 'NOT_STARTED'].includes(c.status)
    );
    if (!googleConns.length) {
      websites.push({
        websiteId: site.id,
        name: site.name,
        checked: false,
        status: 'no_google',
      });
      continue;
    }
    checked += 1;
    try {
      await getAccessTokenForWebsite(site.id, userId);
      websites.push({
        websiteId: site.id,
        name: site.name,
        checked: true,
        status: 'ok',
      });
      ok += 1;
    } catch (e) {
      if (e.code === 'NEEDS_REAUTH') {
        accessRevoked = true;
        websites.push({
          websiteId: site.id,
          name: site.name,
          checked: true,
          status: 'revoked',
          error: e.message,
        });
      } else {
        websites.push({
          websiteId: site.id,
          name: site.name,
          checked: true,
          status: e.code === 'NOT_CONNECTED' ? 'not_connected' : 'error',
          error: e.message,
        });
      }
    }
  }

  let agency = agencyGoogleStatus(userId);
  if (agency.linked && !agency.needsReauth) {
    try {
      await getAccessTokenForDiscover(userId, agency.identityId || null);
      agency = agencyGoogleStatus(userId);
    } catch (e) {
      if (e.code === 'NEEDS_REAUTH') {
        accessRevoked = true;
        agency = agencyGoogleStatus(userId);
      }
    }
  } else if (agency.needsReauth) {
    accessRevoked = true;
  }

  return {
    accessRevoked,
    confirmed: accessRevoked,
    checked,
    ok,
    agencyNeedsReauth: Boolean(agency.needsReauth),
    message: accessRevoked
      ? 'Google confirmed access is revoked for this client.'
      : ok > 0
        ? 'Google access is valid.'
        : checked === 0
          ? 'No Google connections to verify on this client.'
          : 'Could not verify Google access.',
    websites,
  };
}

module.exports = {
  verifyClientGoogleAccess,
};
