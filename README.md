# ChangeFlow

ChangeFlow is a small local HTTP API for creating, reviewing, and approving change requests. It uses Node.js, SQLite, bearer tokens for the seeded demo users, and optimistic version checks for updates.

## Prerequisites

- Node.js 20.18.0 or newer
- npm (the project plan targets npm 10.8.2)

## Install and run

From the repository root:

```powershell
npm install
node src/seed.js
npm start
```

The API listens on port 3000 by default. Set `$env:PORT` before `npm start` to select another port. SQLite schema creation is automatic; the seed command adds demo users to `data/changeflow.sqlite`.

Send JSON requests with `Authorization: Bearer <token>` and `Content-Type: application/json`. Example:

```powershell
$headers = @{ Authorization = 'Bearer dev-requester'; 'Content-Type' = 'application/json' }
$body = @{ title = 'Update report'; description = 'Add a status column'; reason = 'Improve tracking' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri http://localhost:3000/change-requests -Headers $headers -Body $body
```

## Demo users

Run `node src/seed.js` to insert these users and their token hashes:

| User | Role | Demo bearer token |
| --- | --- | --- |
| Test Requester (101) | Requester | `dev-requester` |
| Test Reviewer (102) | Reviewer | `dev-reviewer` |
| Test Dual Role (103) | Requester, Reviewer | `dev-dual-role` |

These tokens are for local development and testing only. The database stores SHA-256 token hashes; the seed script contains the demo token values.

## API routes

- `POST /change-requests` creates a Draft.
- `GET /change-requests` lists requests visible to the caller.
- `GET /change-requests/{id}` reads one visible request.
- `PATCH /change-requests/{id}` edits a Draft or ChangesRequested request using its current `version`.
- `POST /change-requests/{id}/submit` submits a Draft or ChangesRequested request.
- `POST /change-requests/{id}/approve` approves a PendingReview request as an independent Reviewer.
- `POST /change-requests/{id}/request-changes` returns a PendingReview request as an independent Reviewer.

Successful responses include `version`. Updates require the version returned by the latest read; stale versions return `409 VERSION_CONFLICT`. See [the API contract](specs/001-change-request-workflow/contracts/change-requests-api.md) for request rules and error codes.

## Tests

Run the full test suite:

```powershell
npm test
```

Tests use Node's built-in `node:test`, HTTP requests against the real local server handler, and SQLite `:memory:` databases. They do not require the persistent demo database.

## Architecture decisions

- SQLite keeps the local setup self-contained and supports conditional writes.
- Access tokens are hashed with SHA-256. Roles are read from SQLite at each authentication check, so a revoked role takes effect without issuing a new token.
- Mutations read current roles and request state and write within one immediate SQLite transaction. The update matches both request ID and expected version and increments the version atomically.
- Requesters see their own requests; Reviewers see PendingReview requests. A dual-role user receives the combined visibility.
- Review decisions must be made by a Reviewer other than the request creator.

## Limitations

- This is a local training/demo API, not a production identity system. There is no login, account administration, token expiry/rotation, or deployment configuration.
- Demo tokens are static and intentionally documented for local use.
- There is no frontend, pagination, audit history, deletion, or automated database migration framework.
- `package.json` has no build script or compilation step; the runtime executes JavaScript directly.

## Coding Agent role

The Coding Agent implements the scoped tasks in the specification, updates code and tests, and records validation/convergence findings. It is a development-time collaborator, not an API runtime component or authentication authority. Project behavior is defined by the specification, clarifications, and API contract; changes should be validated with the documented test command.
