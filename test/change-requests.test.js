'use strict';

// T006: successful request creation integration test. Run with `node --test test/change-requests.test.js`.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { once } = require('node:events');
const { openDatabase } = require('../src/db');
const { createServer } = require('../src/server');

test('POST /change-requests creates a Draft owned by the authenticated user', async (t) => {
  const db = openDatabase(':memory:');
  const token = 't006-requester-token';
  db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').run(7, 'Requester');
  db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)').run(7, 'Requester');
  db.prepare('INSERT INTO access_tokens (token_hash, user_id) VALUES (?, ?)')
    .run(createHash('sha256').update(token).digest('hex'), 7);

  const server = createServer(db);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.close();
    db.close();
  });

  const response = await fetch(`http://127.0.0.1:${server.address().port}/change-requests`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ title: 'Update report', description: 'Add a status column', reason: 'Improve tracking' }),
  });

  assert.equal(response.status, 201);
  const created = await response.json();
  assert.equal(created.requesterId, 7);
  assert.equal(created.status, 'Draft');
  assert.equal(created.version, 1);
  assert.deepEqual(
    db.prepare('SELECT requester_id, status, version FROM change_requests WHERE id = ?').get(created.id),
    { requester_id: 7, status: 'Draft', version: 1 },
  );
});
