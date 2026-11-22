'use strict';

const { mkdirSync } = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const defaultDatabasePath = path.join(__dirname, '..', 'data', 'changeflow.sqlite');

const schema = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_roles (
    user_id INTEGER NOT NULL REFERENCES users(id),
    role TEXT NOT NULL CHECK (role IN ('Requester', 'Reviewer')),
    PRIMARY KEY (user_id, role)
  );

  CREATE TABLE IF NOT EXISTS access_tokens (
    token_hash TEXT NOT NULL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS change_requests (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    description TEXT NOT NULL CHECK (length(trim(description)) > 0),
    reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
    requester_id INTEGER NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'Draft'
      CHECK (status IN ('Draft', 'PendingReview', 'ChangesRequested', 'Approved')),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1)
  );
`;

function openDatabase(filename = defaultDatabasePath) {
  if (filename !== ':memory:') {
    mkdirSync(path.dirname(filename), { recursive: true });
  }

  const db = new Database(filename);
  try {
    db.pragma('foreign_keys = ON');
    db.transaction(() => db.exec(schema)).immediate();
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

module.exports = { openDatabase };
