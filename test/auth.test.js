'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const Database = require('better-sqlite3');
const { authenticate } = require('../src/auth');

function createTestDatabase() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL
    );
    CREATE TABLE user_roles (
      user_id INTEGER NOT NULL REFERENCES users(id),
      role TEXT NOT NULL CHECK (role IN ('Requester', 'Reviewer')),
      PRIMARY KEY (user_id, role)
    );
    CREATE TABLE access_tokens (
      token_hash TEXT NOT NULL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id)
    );
  `);

  const token = 'test-reviewer-token';
  db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').run(42, 'Test User');
  db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)').run(42, 'Requester');
  db.prepare('INSERT INTO user_roles (user_id, role) VALUES (?, ?)').run(42, 'Reviewer');
  db.prepare('INSERT INTO access_tokens (token_hash, user_id) VALUES (?, ?)')
    .run(createHash('sha256').update(token).digest('hex'), 42);

  return { db, token };
}

test('valid token returns the user id and current roles', (t) => {
  const { db, token } = createTestDatabase();
  t.after(() => db.close());

  assert.deepEqual(authenticate(db, { authorization: `Bearer ${token}` }), {
    id: 42,
    roles: ['Requester', 'Reviewer'],
  });
});

test('missing, malformed, and unknown tokens return 401 UNAUTHENTICATED', (t) => {
  const { db } = createTestDatabase();
  t.after(() => db.close());

  for (const headers of [
    {},
    { authorization: 'Basic test-reviewer-token' },
    { authorization: 'Bearer unknown-token' },
  ]) {
    assert.throws(
      () => authenticate(db, headers),
      (error) => error.status === 401 && error.code === 'UNAUTHENTICATED',
    );
  }
});

test('role removal is reflected on the next lookup with the same token', (t) => {
  const { db, token } = createTestDatabase();
  t.after(() => db.close());

  db.prepare("DELETE FROM user_roles WHERE user_id = ? AND role = 'Reviewer'").run(42);

  assert.deepEqual(authenticate(db, { authorization: `Bearer ${token}` }), {
    id: 42,
    roles: ['Requester'],
  });
});
