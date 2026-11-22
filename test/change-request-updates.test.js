'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { openDatabase } = require('../src/db');
const { updateChangeRequest, ChangeRequestError } = require('../src/change-request-updates');

function fixture() {
  const db = openDatabase(':memory:');
  db.prepare('INSERT INTO users (id, name) VALUES (1, ?)').run('Requester');
  db.prepare('INSERT INTO users (id, name) VALUES (2, ?)').run('Reviewer');
  db.prepare('INSERT INTO user_roles (user_id, role) VALUES (1, ?)').run('Requester');
  db.prepare('INSERT INTO user_roles (user_id, role) VALUES (2, ?)').run('Reviewer');
  for (const [id, token] of [[1, 'requester-token'], [2, 'reviewer-token']]) {
    db.prepare('INSERT INTO access_tokens (token_hash, user_id) VALUES (?, ?)')
      .run(createHash('sha256').update(token).digest('hex'), id);
  }
  const insert = db.prepare(`
    INSERT INTO change_requests (title, description, reason, requester_id, status, version)
    VALUES (?, ?, ?, 1, 'Draft', 1)
  `);
  const requestId = Number(insert.run('Before', 'Description', 'Reason').lastInsertRowid);
  return { db, requestId };
}

test('valid transactional update persists the change and increments version', (t) => {
  const { db, requestId } = fixture();
  t.after(() => db.close());

  const updated = updateChangeRequest(
    db,
    { authorization: 'Bearer requester-token' },
    requestId,
    1,
    { allowedRoles: ['Requester'], requireOwner: true, allowedStatuses: ['Draft'], changes: { title: 'After' } },
  );
  assert.equal(updated.title, 'After');
  assert.equal(updated.version, 2);
  assert.equal(db.prepare('SELECT title, version FROM change_requests WHERE id = ?').get(requestId).title, 'After');
});

test('stale version and revoked role leave request data unchanged', (t) => {
  const { db, requestId } = fixture();
  t.after(() => db.close());
  const headers = { authorization: 'Bearer requester-token' };
  const options = { allowedRoles: ['Requester'], requireOwner: true, allowedStatuses: ['Draft'], changes: { title: 'Should not persist' } };

  assert.throws(
    () => updateChangeRequest(db, headers, requestId, 0, options),
    (error) => error instanceof ChangeRequestError && error.status === 409 && error.code === 'VERSION_CONFLICT',
  );
  assert.deepEqual(db.prepare('SELECT title, status, version FROM change_requests WHERE id = ?').get(requestId), {
    title: 'Before', status: 'Draft', version: 1,
  });

  db.prepare("DELETE FROM user_roles WHERE user_id = 1 AND role = 'Requester'").run();
  assert.throws(
    () => updateChangeRequest(db, headers, requestId, 1, options),
    (error) => error instanceof ChangeRequestError && error.status === 403 && error.code === 'FORBIDDEN',
  );
  assert.deepEqual(db.prepare('SELECT title, status, version FROM change_requests WHERE id = ?').get(requestId), {
    title: 'Before', status: 'Draft', version: 1,
  });
});
