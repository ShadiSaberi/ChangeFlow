'use strict';

const { createHash } = require('node:crypto');

class UnauthenticatedError extends Error {
  constructor() {
    super('توکن ارسال نشده یا نامعتبر است.');
    this.name = 'UnauthenticatedError';
    this.status = 401;
    this.statusCode = 401;
    this.code = 'UNAUTHENTICATED';
  }
}

function authenticate(db, headers) {
  const authorization = headers?.authorization ?? headers?.Authorization;
  const match = typeof authorization === 'string'
    ? /^Bearer\s+([^\s]+)$/i.exec(authorization.trim())
    : null;

  if (!match) throw new UnauthenticatedError();

  const tokenHash = createHash('sha256').update(match[1]).digest('hex');
  const user = db.prepare(`
    SELECT users.id
    FROM access_tokens
    JOIN users ON users.id = access_tokens.user_id
    WHERE access_tokens.token_hash = ?
  `).get(tokenHash);

  if (!user) throw new UnauthenticatedError();

  const roles = db.prepare(`
    SELECT role FROM user_roles WHERE user_id = ? ORDER BY role
  `).all(user.id).map(({ role }) => role);

  return { id: user.id, roles };
}

module.exports = { authenticate, UnauthenticatedError };
