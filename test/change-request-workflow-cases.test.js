'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { once } = require('node:events');
const { openDatabase } = require('../src/db');
const { createServer } = require('../src/server');

async function fixture(t, options = {}) {
  const db = openDatabase(':memory:');
  const people = [
    { id: 1, name: 'Requester', token: 'workflow-requester', roles: ['Requester'] },
    { id: 2, name: 'Reviewer', token: 'workflow-reviewer', roles: ['Reviewer'] },
    { id: 3, name: 'Dual role', token: 'workflow-dual', roles: ['Requester', 'Reviewer'] },
  ];
  for (const person of people) {
    db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').run(person.id, person.name);
    for (const role of person.roles) {
      db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)').run(person.id, role);
    }
    db.prepare('INSERT INTO access_tokens (token_hash, user_id) VALUES (?, ?)')
      .run(createHash('sha256').update(person.token).digest('hex'), person.id);
  }

  const id = Number(db.prepare(`
    INSERT INTO change_requests (title, description, reason, requester_id, status, version)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    options.title || 'Original title', 'Original description', 'Original reason',
    options.requesterId ?? 1, options.status || 'Draft', options.version ?? 1,
  ).lastInsertRowid);

  const server = createServer(db);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.close();
    db.close();
  });

  const base = `http://127.0.0.1:${server.address().port}/change-requests/${id}`;
  async function send(path, token, method, body) {
    return fetch(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  return { db, id, send };
}

function stored(db, id) {
  return db.prepare('SELECT title, description, reason, requester_id, status, version FROM change_requests WHERE id = ?').get(id);
}

test('T016: editing an approved request returns INVALID_STATE without changing data', async (t) => {
  const f = await fixture(t, { status: 'Approved', version: 4 });
  const before = stored(f.db, f.id);
  const response = await f.send('', 'workflow-requester', 'PATCH', { version: 4, title: 'Attempted edit' });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'INVALID_STATE');
  assert.deepEqual(stored(f.db, f.id), before);
});

test('T017: a stale second edit returns VERSION_CONFLICT and preserves the first edit', async (t) => {
  const f = await fixture(t);
  const first = await f.send('', 'workflow-requester', 'PATCH', { version: 1, title: 'First edit' });
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.version, 2);

  const second = await f.send('', 'workflow-requester', 'PATCH', { version: 1, title: 'Stale edit' });
  assert.equal(second.status, 409);
  assert.equal((await second.json()).code, 'VERSION_CONFLICT');
  assert.deepEqual(stored(f.db, f.id), {
    title: 'First edit', description: 'Original description', reason: 'Original reason',
    requester_id: 1, status: 'Draft', version: 2,
  });
});

test('T018: returned request can be edited and resubmitted', async (t) => {
  const f = await fixture(t, { status: 'PendingReview' });
  const returned = await f.send('/request-changes', 'workflow-reviewer', 'POST', { version: 1 });
  assert.equal(returned.status, 200);
  assert.equal((await returned.json()).status, 'ChangesRequested');
  assert.deepEqual(stored(f.db, f.id), {
    title: 'Original title', description: 'Original description', reason: 'Original reason',
    requester_id: 1, status: 'ChangesRequested', version: 2,
  });

  const edited = await f.send('', 'workflow-requester', 'PATCH', { version: 2, description: 'Updated description' });
  assert.equal(edited.status, 200);
  const editedBody = await edited.json();
  assert.equal(editedBody.status, 'ChangesRequested');
  assert.equal(editedBody.version, 3);

  const submitted = await f.send('/submit', 'workflow-requester', 'POST', { version: 3 });
  assert.equal(submitted.status, 200);
  const submittedBody = await submitted.json();
  assert.equal(submittedBody.status, 'PendingReview');
  assert.equal(submittedBody.version, 4);
  assert.deepEqual(stored(f.db, f.id), {
    title: 'Original title', description: 'Updated description', reason: 'Original reason',
    requester_id: 1, status: 'PendingReview', version: 4,
  });
});

test('T019: revoked Reviewer cannot approve after viewing a pending request', async (t) => {
  const f = await fixture(t, { requesterId: 1, status: 'PendingReview', version: 6 });
  const viewed = await f.send('', 'workflow-reviewer', 'GET');
  assert.equal(viewed.status, 200);
  const viewBody = await viewed.json();
  assert.equal(viewBody.status, 'PendingReview');
  assert.equal(viewBody.version, 6);

  f.db.prepare("DELETE FROM user_roles WHERE user_id = 2 AND role = 'Reviewer'").run();
  const approval = await f.send('/approve', 'workflow-reviewer', 'POST', { version: 6 });
  assert.equal(approval.status, 403);
  assert.equal((await approval.json()).code, 'FORBIDDEN');
  assert.deepEqual(stored(f.db, f.id), {
    title: 'Original title', description: 'Original description', reason: 'Original reason',
    requester_id: 1, status: 'PendingReview', version: 6,
  });
});
