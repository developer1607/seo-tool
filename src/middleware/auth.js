'use strict';

function requireAuth(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.redirect('/login');
  }
  next();
}

function requireClient(req, res, next) {
  if (!req.selectedClient) {
    return res.redirect('/clients?need_select=1');
  }
  next();
}

module.exports = { requireAuth, requireClient };
