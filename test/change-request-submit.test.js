'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { once } = require('node:events');
const { openDatabase } = require('../src/db');
const { createServer } = require('../src/server');

test('POST /change-requests/:id/submit sends a draft for review', async (t) => {
  const db = openDatabase(':memory:');
  const token = 't011-requester-token';
  db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').run(21, 'Requester');
  db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)').run(21, 'Requester');
  db.prepare('INSERT INTO access_tokens (token_hash, user_id) VALUES (?, ?)')
    .run(createHash('sha256').update(token).digest('hex'), 21);
  const result = db.prepare(`
    INSERT INTO change_requests (title, description, reason, requester_id, status, version)
    VALUES (?, ?, ?, ?, 'Draft', 1)
  `).run('Request', 'Description', 'Reason', 21);
  const id = Number(result.lastInsertRowid);

  const server = createServer(db);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.close();
    db.close();
  });

  const response = await fetch(`http://127.0.0.1:${server.address().port}/change-requests/${id}/submit`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ version: 1 }),
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.id, id);
  assert.equal(payload.status, 'PendingReview');
  assert.equal(payload.version, 2);
  assert.deepEqual(
    db.prepare('SELECT status, version FROM change_requests WHERE id = ?').get(id),
    { status: 'PendingReview', version: 2 },
  );
});
