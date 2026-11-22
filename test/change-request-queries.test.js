'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { once } = require('node:events');
const { openDatabase } = require('../src/db');
const { createServer } = require('../src/server');

test('GET change requests enforces role visibility for lists and details', async (t) => {
  const db = openDatabase(':memory:');
  const users = [
    { id: 1, name: 'Requester A', token: 'requester-a', roles: ['Requester'] },
    { id: 2, name: 'Requester B', token: 'requester-b', roles: ['Requester'] },
    { id: 3, name: 'Reviewer', token: 'reviewer', roles: ['Reviewer'] },
    { id: 4, name: 'Both roles', token: 'both', roles: ['Requester', 'Reviewer'] },
  ];

  for (const user of users) {
    db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').run(user.id, user.name);
    for (const role of user.roles) {
      db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)').run(user.id, role);
    }
    db.prepare('INSERT INTO access_tokens (token_hash, user_id) VALUES (?, ?)')
      .run(createHash('sha256').update(user.token).digest('hex'), user.id);
  }

  const insertRequest = db.prepare(`
    INSERT INTO change_requests (title, description, reason, requester_id, status, version)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const ownDraftId = Number(insertRequest.run('Own draft', 'Description', 'Reason', 1, 'Draft', 1).lastInsertRowid);
  const otherDraftId = Number(insertRequest.run('Other draft', 'Description', 'Reason', 2, 'Draft', 2).lastInsertRowid);
  const pendingId = Number(insertRequest.run('Pending', 'Description', 'Reason', 2, 'PendingReview', 3).lastInsertRowid);
  const bothOwnDraftId = Number(insertRequest.run('Both own draft', 'Description', 'Reason', 4, 'Draft', 4).lastInsertRowid);

  const server = createServer(db);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.close();
    db.close();
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  async function get(path, token) {
    return fetch(`${baseUrl}${path}`, { headers: { authorization: `Bearer ${token}` } });
  }
  async function getList(token) {
    const response = await get('/change-requests', token);
    assert.equal(response.status, 200);
    return response.json();
  }

  const requesterList = await getList('requester-a');
  assert.deepEqual(requesterList.map(({ id }) => id), [ownDraftId]);
  assert.equal(requesterList[0].version, 1);

  const ownDetailResponse = await get(`/change-requests/${ownDraftId}`, 'requester-a');
  assert.equal(ownDetailResponse.status, 200);
  const ownDetail = await ownDetailResponse.json();
  assert.equal(ownDetail.id, ownDraftId);
  assert.equal(ownDetail.version, 1);

  const hiddenDraftResponse = await get(`/change-requests/${otherDraftId}`, 'requester-a');
  assert.equal(hiddenDraftResponse.status, 403);

  const reviewerList = await getList('reviewer');
  assert.deepEqual(reviewerList.map(({ id }) => id), [pendingId]);
  assert.equal(reviewerList[0].version, 3);
  const reviewerDetailResponse = await get(`/change-requests/${pendingId}`, 'reviewer');
  assert.equal(reviewerDetailResponse.status, 200);
  const reviewerDetail = await reviewerDetailResponse.json();
  assert.equal(reviewerDetail.id, pendingId);
  assert.equal(reviewerDetail.version, 3);

  const bothList = await getList('both');
  assert.deepEqual(bothList.map(({ id }) => id), [pendingId, bothOwnDraftId]);
  assert.deepEqual(bothList.map(({ version }) => version), [3, 4]);
  for (const id of [pendingId, bothOwnDraftId]) {
    const detailResponse = await get(`/change-requests/${id}`, 'both');
    assert.equal(detailResponse.status, 200);
    const detail = await detailResponse.json();
    assert.equal(detail.id, id);
    assert.ok(Number.isInteger(detail.version));
  }
});
