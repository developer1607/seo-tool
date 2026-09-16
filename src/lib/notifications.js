'use strict';

const { getDb } = require('./db');

function unreadCount(userId) {
  return getDb()
    .prepare(
      `SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL`
    )
    .get(userId).c;
}

function listForUser(userId, { limit = 30 } = {}) {
  return getDb()
    .prepare(
      `SELECT * FROM notifications WHERE user_id = ?
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(userId, limit);
}

function markRead(userId, id) {
  getDb()
    .prepare(
      `UPDATE notifications SET read_at = datetime('now')
       WHERE id = ? AND user_id = ? AND read_at IS NULL`
    )
    .run(id, userId);
}

function markAllRead(userId) {
  getDb()
    .prepare(
      `UPDATE notifications SET read_at = datetime('now')
       WHERE user_id = ? AND read_at IS NULL`
    )
    .run(userId);
}

function createNotification({
  userId,
  clientId = null,
  layer,
  type,
  severity = 'info',
  title,
  body = '',
  href = null,
  meta = {},
}) {
  getDb()
    .prepare(
      `INSERT INTO notifications
        (user_id, client_id, layer, type, severity, title, body, href, meta_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      userId,
      clientId,
      layer,
      type,
      severity,
      title,
      body,
      href,
      JSON.stringify(meta)
    );
}

module.exports = {
  unreadCount,
  listForUser,
  markRead,
  markAllRead,
  createNotification,
};
