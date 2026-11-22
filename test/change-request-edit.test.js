'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { once } = require('node:events');
const { openDatabase } = require('../src/db');
const { createServer } = require('../src/server');

test('PATCH /change-requests edits the owned draft and increments its version', async (t) => {
  const db = openDatabase(':memory:');
  const token = 't009-requester-token';
  db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').run(11, 'Requester');
  db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)').run(11, 'Requester');
  db.prepare('INSERT INTO access_tokens (token_hash, user_id) VALUES (?, ?)')
    .run(createHash('sha256').update(token).digest('hex'), 11);
  const result = db.prepare(`
    INSERT INTO change_requests (title, description, reason, requester_id, status, version)
    VALUES (?, ?, ?, ?, 'Draft', 1)
  `).run('Old title', 'Description', 'Reason', 11);
  const id = Number(result.lastInsertRowid);

  const server = createServer(db);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.close();
    db.close();
  });

  const response = await fetch(`http://127.0.0.1:${server.address().port}/change-requests/${id}`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ version: 1, title: 'Updated title' }),
  });
  assert.equal(response.status, 200);
  const updated = await response.json();
  assert.deepEqual(updated, {
    id,
    title: 'Updated title',
    description: 'Description',
    reason: 'Reason',
    requesterId: 11,
    status: 'Draft',
    version: 2,
  });
  assert.deepEqual(
    db.prepare('SELECT title, description, reason, requester_id, status, version FROM change_requests WHERE id = ?').get(id),
    { title: 'Updated title', description: 'Description', reason: 'Reason', requester_id: 11, status: 'Draft', version: 2 },
  );
});
