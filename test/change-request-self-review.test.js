'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { once } = require('node:events');
const { openDatabase } = require('../src/db');
const { createServer } = require('../src/server');

async function setup(t, suffix) {
  const db = openDatabase(':memory:');
  const token = `dual-role-${suffix}`;
  db.prepare('INSERT INTO users (id, name) VALUES (51, ?)').run('Dual-role requester');
  db.prepare("INSERT INTO user_roles (user_id, role) VALUES (51, 'Requester'), (51, 'Reviewer')").run();
  db.prepare('INSERT INTO access_tokens (token_hash, user_id) VALUES (?, 51)')
    .run(createHash('sha256').update(token).digest('hex'));
  const result = db.prepare(`
    INSERT INTO change_requests (title, description, reason, requester_id, status, version)
    VALUES ('Own request', 'Description', 'Reason', 51, 'PendingReview', 5)
  `).run();
  const id = Number(result.lastInsertRowid);
  const server = createServer(db);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.close();
    db.close();
  });
  return { db, id, token, url: `http://127.0.0.1:${server.address().port}` };
}

async function assertForbiddenWithoutMutation(context, action) {
  const response = await fetch(`${context.url}/change-requests/${context.id}/${action}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${context.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ version: 5 }),
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'FORBIDDEN');
  assert.deepEqual(
    context.db.prepare('SELECT status, version FROM change_requests WHERE id = ?').get(context.id),
    { status: 'PendingReview', version: 5 },
  );
}

test('dual-role requester cannot approve their own request', async (t) => {
  const context = await setup(t, 'approve');
  await assertForbiddenWithoutMutation(context, 'approve');
});

test('dual-role requester cannot request changes on their own request', async (t) => {
  const context = await setup(t, 'request-changes');
  await assertForbiddenWithoutMutation(context, 'request-changes');
});
