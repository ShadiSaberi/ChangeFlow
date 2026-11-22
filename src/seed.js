"use strict";

const { createHash } = require("node:crypto");
const { openDatabase } = require("./db");

const testUsers = [
  {
    id: 101,
    name: "Test Requester",
    roles: ["Requester"],
    token: "dev-requester",
  },
  {
    id: 102,
    name: "Test Reviewer",
    roles: ["Reviewer"],
    token: "dev-reviewer",
  },
  {
    id: 103,
    name: "Test Dual Role",
    roles: ["Requester", "Reviewer"],
    token: "dev-dual-role",
  },
];

const db = openDatabase();

try {
  const insertUser = db.prepare(`
    INSERT INTO users (id, name) VALUES (?, ?)
    ON CONFLICT(id) DO NOTHING
  `);
  const insertRole = db.prepare(`
    INSERT INTO user_roles (user_id, role) VALUES (?, ?)
    ON CONFLICT(user_id, role) DO NOTHING
  `);
  const insertToken = db.prepare(`
    INSERT INTO access_tokens (token_hash, user_id) VALUES (?, ?)
    ON CONFLICT(token_hash) DO NOTHING
  `);

  const seed = db.transaction(() => {
    for (const user of testUsers) {
      insertUser.run(user.id, user.name);

      for (const role of user.roles) {
        insertRole.run(user.id, role);
      }

      const tokenHash = createHash("sha256").update(user.token).digest("hex");
      insertToken.run(tokenHash, user.id);
    }
  });

  seed.immediate();

  console.table(
    db
      .prepare(
        `
    SELECT users.id, users.name, user_roles.role
    FROM users
    JOIN user_roles ON user_roles.user_id = users.id
    WHERE users.id IN (101, 102, 103)
    ORDER BY users.id, user_roles.role
  `,
      )
      .all(),
  );
} finally {
  db.close();
}
