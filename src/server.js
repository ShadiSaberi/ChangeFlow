'use strict';

const http = require('node:http');
const { openDatabase } = require('./db');
const { authenticate } = require('./auth');
const { updateChangeRequest, ChangeRequestError } = require('./change-request-updates');

function sendJson(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function toApiRequest(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    reason: row.reason,
    requesterId: row.requester_id,
    status: row.status,
    version: row.version,
  };
}

function canView(user, row) {
  return (user.roles.includes('Requester') && row.requester_id === user.id) ||
    (user.roles.includes('Reviewer') && row.status === 'PendingReview');
}

function readJsonBody(request, response, onBody) {
  let rawBody = '';
  request.setEncoding('utf8');
  request.on('data', (chunk) => {
    rawBody += chunk;
    if (rawBody.length > 1024 * 1024) request.destroy();
  });
  request.on('end', () => {
    try {
      onBody(JSON.parse(rawBody));
    } catch (error) {
      if (error instanceof SyntaxError) {
        sendJson(response, 400, { code: 'INVALID_INPUT', message: 'بدنه باید JSON معتبر باشد.' });
      } else if (error instanceof ChangeRequestError) {
        sendJson(response, error.status, { code: error.code, message: error.message });
      } else {
        sendJson(response, 500, { code: 'INTERNAL_ERROR', message: 'خطای داخلی سرور.' });
      }
    }
  });
}

function createServer(db) {
  return http.createServer((request, response) => {
    const requestChangesMatch = request.method === 'POST' && /^\/change-requests\/([^/]+)\/request-changes$/.exec(request.url);
    if (requestChangesMatch) {
      const id = Number(requestChangesMatch[1]);
      if (!Number.isSafeInteger(id) || id < 1) {
        return sendJson(response, 400, { code: 'INVALID_INPUT', message: 'شناسهٔ درخواست نامعتبر است.' });
      }
      return readJsonBody(request, response, (body) => {
        if (!body || typeof body !== 'object' || Array.isArray(body) ||
            !Number.isSafeInteger(body.version) || body.version < 1) {
          throw new ChangeRequestError(400, 'INVALID_INPUT', 'نسخه باید عدد صحیح مثبت باشد.');
        }
        const updated = updateChangeRequest(db, request.headers, id, body.version, {
          allowedRoles: ['Reviewer'],
          requireDifferentRequester: true,
          allowedStatuses: ['PendingReview'],
          status: 'ChangesRequested',
        });
        sendJson(response, 200, toApiRequest(updated));
      });
    }

    const approveMatch = request.method === 'POST' && /^\/change-requests\/([^/]+)\/approve$/.exec(request.url);
    if (approveMatch) {
      const id = Number(approveMatch[1]);
      if (!Number.isSafeInteger(id) || id < 1) {
        return sendJson(response, 400, { code: 'INVALID_INPUT', message: 'شناسهٔ درخواست نامعتبر است.' });
      }
      return readJsonBody(request, response, (body) => {
        if (!body || typeof body !== 'object' || Array.isArray(body) ||
            !Number.isSafeInteger(body.version) || body.version < 1) {
          throw new ChangeRequestError(400, 'INVALID_INPUT', 'نسخه باید عدد صحیح مثبت باشد.');
        }
        const updated = updateChangeRequest(db, request.headers, id, body.version, {
          allowedRoles: ['Reviewer'],
          requireDifferentRequester: true,
          allowedStatuses: ['PendingReview'],
          status: 'Approved',
        });
        sendJson(response, 200, toApiRequest(updated));
      });
    }

    const submitMatch = request.method === 'POST' && /^\/change-requests\/([^/]+)\/submit$/.exec(request.url);
    if (submitMatch) {
      const id = Number(submitMatch[1]);
      if (!Number.isSafeInteger(id) || id < 1) {
        return sendJson(response, 400, { code: 'INVALID_INPUT', message: 'شناسهٔ درخواست نامعتبر است.' });
      }
      return readJsonBody(request, response, (body) => {
        if (!body || typeof body !== 'object' || Array.isArray(body) ||
            !Number.isSafeInteger(body.version) || body.version < 1) {
          throw new ChangeRequestError(400, 'INVALID_INPUT', 'نسخه باید عدد صحیح مثبت باشد.');
        }
        const updated = updateChangeRequest(db, request.headers, id, body.version, {
          allowedRoles: ['Requester'],
          requireOwner: true,
          allowedStatuses: ['Draft', 'ChangesRequested'],
          status: 'PendingReview',
        });
        sendJson(response, 200, toApiRequest(updated));
      });
    }

    const patchMatch = request.method === 'PATCH' && /^\/change-requests\/([^/]+)$/.exec(request.url);
    if (patchMatch) {
      const id = Number(patchMatch[1]);
      if (!Number.isSafeInteger(id) || id < 1) {
        return sendJson(response, 400, { code: 'INVALID_INPUT', message: 'شناسهٔ درخواست نامعتبر است.' });
      }

      return readJsonBody(request, response, (body) => {
        if (!body || typeof body !== 'object' || Array.isArray(body) ||
            !Number.isSafeInteger(body.version) || body.version < 1) {
          throw new ChangeRequestError(400, 'INVALID_INPUT', 'نسخه باید عدد صحیح مثبت باشد.');
        }
        const fields = ['title', 'description', 'reason'];
        const changes = {};
        for (const field of fields) {
          if (Object.hasOwn(body, field)) {
            if (typeof body[field] !== 'string' || body[field].trim().length === 0) {
              throw new ChangeRequestError(400, 'INVALID_INPUT', 'فیلدهای ارسال‌شده باید متن غیرخالی باشند.');
            }
            changes[field] = body[field].trim();
          }
        }
        if (Object.keys(changes).length === 0) {
          throw new ChangeRequestError(400, 'INVALID_INPUT', 'حداقل یکی از title، description یا reason لازم است.');
        }

        const updated = updateChangeRequest(db, request.headers, id, body.version, {
          allowedRoles: ['Requester'],
          requireOwner: true,
          allowedStatuses: ['Draft', 'ChangesRequested'],
          changes,
        });
        sendJson(response, 200, toApiRequest(updated));
      });
    }

    if (request.method === 'GET' && request.url === '/change-requests') {
      let user;
      try {
        user = authenticate(db, request.headers);
      } catch (error) {
        if (error.code === 'UNAUTHENTICATED') {
          return sendJson(response, 401, { code: error.code, message: error.message });
        }
        return sendJson(response, 500, { code: 'INTERNAL_ERROR', message: 'خطای داخلی سرور.' });
      }

      try {
        const rows = db.prepare('SELECT * FROM change_requests ORDER BY id').all();
        return sendJson(response, 200, rows.filter((row) => canView(user, row)).map(toApiRequest));
      } catch {
        return sendJson(response, 500, { code: 'INTERNAL_ERROR', message: 'خطای داخلی سرور.' });
      }
    }

    const detailMatch = request.method === 'GET' && /^\/change-requests\/([^/]+)$/.exec(request.url);
    if (detailMatch) {
      let user;
      try {
        user = authenticate(db, request.headers);
      } catch (error) {
        if (error.code === 'UNAUTHENTICATED') {
          return sendJson(response, 401, { code: error.code, message: error.message });
        }
        return sendJson(response, 500, { code: 'INTERNAL_ERROR', message: 'خطای داخلی سرور.' });
      }

      const id = Number(detailMatch[1]);
      if (!Number.isSafeInteger(id) || id < 1) {
        return sendJson(response, 400, { code: 'INVALID_INPUT', message: 'شناسهٔ درخواست نامعتبر است.' });
      }

      try {
        const row = db.prepare('SELECT * FROM change_requests WHERE id = ?').get(id);
        if (!row) return sendJson(response, 404, { code: 'NOT_FOUND', message: 'درخواست پیدا نشد.' });
        if (!canView(user, row)) {
          return sendJson(response, 403, { code: 'FORBIDDEN', message: 'مجوز مشاهدهٔ درخواست را ندارید.' });
        }
        return sendJson(response, 200, toApiRequest(row));
      } catch {
        return sendJson(response, 500, { code: 'INTERNAL_ERROR', message: 'خطای داخلی سرور.' });
      }
    }

    if (request.method !== 'POST' || request.url !== '/change-requests') {
      return sendJson(response, 404, { code: 'NOT_FOUND', message: 'مسیر پیدا نشد.' });
    }

    let rawBody = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      rawBody += chunk;
      if (rawBody.length > 1024 * 1024) {
        request.destroy();
      }
    });
    request.on('end', () => {
      let body;
      try {
        body = JSON.parse(rawBody);
      } catch {
        return sendJson(response, 400, { code: 'INVALID_INPUT', message: 'بدنه باید JSON معتبر باشد.' });
      }

      if (!body || typeof body !== 'object' || Array.isArray(body) ||
          ['title', 'description', 'reason'].some((key) =>
            typeof body[key] !== 'string' || body[key].trim().length === 0)) {
        return sendJson(response, 400, { code: 'INVALID_INPUT', message: 'عنوان، شرح و دلیل باید متن غیرخالی باشند.' });
      }

      let user;
      try {
        user = authenticate(db, request.headers);
      } catch (error) {
        if (error.code === 'UNAUTHENTICATED') {
          return sendJson(response, 401, { code: error.code, message: error.message });
        }
        return sendJson(response, 500, { code: 'INTERNAL_ERROR', message: 'خطای داخلی سرور.' });
      }

      if (!user.roles.includes('Requester')) {
        return sendJson(response, 403, { code: 'FORBIDDEN', message: 'مجوز ثبت درخواست را ندارید.' });
      }

      try {
        const result = db.prepare(`
          INSERT INTO change_requests (title, description, reason, requester_id, status, version)
          VALUES (?, ?, ?, ?, 'Draft', 1)
        `).run(body.title.trim(), body.description.trim(), body.reason.trim(), user.id);

        return sendJson(response, 201, {
          id: Number(result.lastInsertRowid),
          title: body.title.trim(),
          description: body.description.trim(),
          reason: body.reason.trim(),
          requesterId: user.id,
          status: 'Draft',
          version: 1,
        });
      } catch {
        return sendJson(response, 500, { code: 'INTERNAL_ERROR', message: 'خطای داخلی سرور.' });
      }
    });
  });
}

if (require.main === module) {
  const db = openDatabase();
  const port = Number(process.env.PORT || 3000);
  createServer(db).listen(port, () => console.log(`ChangeFlow API listening on port ${port}`));
}

module.exports = { createServer };
