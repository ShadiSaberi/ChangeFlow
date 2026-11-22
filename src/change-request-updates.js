'use strict';

const { authenticate } = require('./auth');

class ChangeRequestError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ChangeRequestError';
    this.status = status;
    this.statusCode = status;
    this.code = code;
  }
}

/**
 * Applies a validated update atomically. Call with db, request headers, request id,
 * expected version, operation permissions, and a partial set of mutable fields.
 * Current roles and request data are read inside the same SQLite transaction as UPDATE.
 */
function updateChangeRequest(db, headers, id, expectedVersion, options = {}) {
  const transaction = db.transaction(() => {
    let user;
    try {
      user = authenticate(db, headers);
    } catch (error) {
      if (error.code === 'UNAUTHENTICATED') {
        throw new ChangeRequestError(401, 'UNAUTHENTICATED', error.message);
      }
      throw error;
    }

    const request = db.prepare('SELECT * FROM change_requests WHERE id = ?').get(id);
    if (!request) {
      throw new ChangeRequestError(404, 'NOT_FOUND', 'درخواست پیدا نشد.');
    }

    const allowedRoles = options.allowedRoles || [];
    if (!allowedRoles.some((role) => user.roles.includes(role)) ||
        (options.requireDifferentRequester && request.requester_id === user.id) ||
        (options.requireOwner && request.requester_id !== user.id)) {
      throw new ChangeRequestError(403, 'FORBIDDEN', 'مجوز انجام عملیات را ندارید.');
    }

    if (request.version !== expectedVersion) {
      throw new ChangeRequestError(409, 'VERSION_CONFLICT', 'درخواست تغییر کرده است. آن را دوباره بخوانید.');
    }

    if (options.allowedStatuses && !options.allowedStatuses.includes(request.status)) {
      throw new ChangeRequestError(409, 'INVALID_STATE', 'وضعیت فعلی درخواست اجازهٔ عملیات را نمی‌دهد.');
    }

    const changes = { ...(options.changes || {}) };
    if (options.status !== undefined) changes.status = options.status;
    const columns = Object.keys(changes);
    const allowedColumns = new Set(['title', 'description', 'reason', 'status']);
    if (columns.length === 0 || columns.some((column) => !allowedColumns.has(column))) {
      throw new ChangeRequestError(400, 'INVALID_INPUT', 'تغییرات درخواست نامعتبر است.');
    }

    const assignments = columns.map((column) => `${column} = @${column}`).join(', ');
    const result = db.prepare(`
      UPDATE change_requests
      SET ${assignments}, version = version + 1
      WHERE id = @id AND version = @expectedVersion
    `).run({ ...changes, id, expectedVersion });

    if (result.changes !== 1) {
      throw new ChangeRequestError(409, 'VERSION_CONFLICT', 'درخواست تغییر کرده است. آن را دوباره بخوانید.');
    }

    return db.prepare('SELECT * FROM change_requests WHERE id = ?').get(id);
  });

  return transaction.immediate();
}

module.exports = { updateChangeRequest, ChangeRequestError };
