'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { once } = require('node:events');
const { openDatabase } = require('../src/db');
const { createServer } = require('../src/server');

test('independent Reviewer approves a pending request', async (t) => {
  const db = openDatabase(':memory:');
  const requesterToken = 't014-requester-token';
  const reviewerToken = 't014-reviewer-token';
  for (const [id, name, role, token] of [
    [31, 'Requester', 'Requester', requesterToken],
    [32, 'Reviewer', 'Reviewer', reviewerToken],
  ]) {
    db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').run(id, name);
    db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)').run(id, role);
    db.prepare('INSERT INTO access_tokens (token_hash, user_id) VALUES (?, ?)')
      .run(createHash('sha256').update(token).digest('hex'), id);
  }
  const result = db.prepare(`
    INSERT INTO change_requests (title, description, reason, requester_id, status, version)
    VALUES (?, ?, ?, 31, 'PendingReview', 1)
  `).run('Request', 'Description', 'Reason');
  const id = Number(result.lastInsertRowid);

  const server = createServer(db);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.close();
    db.close();
  });

  const response = await fetch(`http://127.0.0.1:${server.address().port}/change-requests/${id}/approve`, {
    method: 'POST',
    headers: { authorization: `Bearer ${reviewerToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ version: 1 }),
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.id, id);
  assert.equal(payload.status, 'Approved');
  assert.equal(payload.version, 2);
  assert.deepEqual(
    db.prepare('SELECT requester_id, status, version FROM change_requests WHERE id = ?').get(id),
    { requester_id: 31, status: 'Approved', version: 2 },
  );
});
