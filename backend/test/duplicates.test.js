import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import app from '../src/app.js';
import pool from '../src/database/pool.js';

test('duplicate ticket detection against local PostgreSQL', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const runId = randomUUID();
  const password = 'DuplicateTest!123';
  const emails = {
    first: `duplicate-first-${runId}@example.com`,
    second: `duplicate-second-${runId}@example.com`,
    support: `duplicate-support-${runId}@example.com`,
  };
  const categoryName = `Duplicate Test ${runId}`;
  let categoryId;
  let firstUser;
  let secondUser;
  let supportUser;
  let firstToken;
  let secondToken;
  let supportToken;
  let existingTicket;

  async function request(path, { method = 'GET', body, bearer } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }

  async function register(name, email) {
    const result = await request('/api/auth/register', {
      method: 'POST',
      body: { name, email, password },
    });
    assert.equal(result.status, 201);
    return result.body.user;
  }

  async function login(email) {
    const result = await request('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    assert.equal(result.status, 200);
    return result.body.token;
  }

  try {
    firstUser = await register('Duplicate First', emails.first);
    secondUser = await register('Duplicate Second', emails.second);
    supportUser = await register('Duplicate Support', emails.support);
    await pool.query("UPDATE users SET role = 'support' WHERE id = $1", [supportUser.id]);

    firstToken = await login(emails.first);
    secondToken = await login(emails.second);
    supportToken = await login(emails.support);

    const insertedCategory = await pool.query(
      'INSERT INTO categories (name) VALUES ($1) RETURNING id',
      [categoryName],
    );
    categoryId = insertedCategory.rows[0].id;

    const created = await request('/api/tickets', {
      method: 'POST',
      bearer: firstToken,
      body: {
        title: 'Campus Wi-Fi disconnects repeatedly',
        description: 'Wireless network drops repeatedly after connecting in the hostel room.',
        categoryId,
        priority: 'high',
      },
    });
    assert.equal(created.status, 201);
    existingTicket = created.body.ticket;

    await t.test('duplicate check requires authentication and validates input', async () => {
      assert.equal((await request('/api/tickets/duplicate-check', {
        method: 'POST',
        body: { title: 'Campus Wi-Fi issue', description: 'Wireless network drops.', categoryId },
      })).status, 401);

      assert.equal((await request('/api/tickets/duplicate-check', {
        method: 'POST',
        bearer: firstToken,
        body: { title: '', description: 'Wireless network drops.', categoryId },
      })).status, 400);

      assert.equal((await request('/api/tickets/duplicate-check', {
        method: 'POST',
        bearer: firstToken,
        body: { title: 'Campus Wi-Fi issue', description: '', categoryId },
      })).status, 400);

      assert.equal((await request('/api/tickets/duplicate-check', {
        method: 'POST',
        bearer: firstToken,
        body: { title: 'Campus Wi-Fi issue', description: 'Wireless network drops.', categoryId: 999999999 },
      })).status, 400);
    });

    await t.test('similar open ticket in the same category is returned with deterministic keyword matching', async () => {
      const result = await request('/api/tickets/duplicate-check', {
        method: 'POST',
        bearer: firstToken,
        body: {
          title: 'Campus Wi-Fi connection keeps disconnecting',
          description: 'Wireless network drops repeatedly after I connect in my hostel room.',
          categoryId,
        },
      });

      assert.equal(result.status, 200);
      assert.equal(result.body.matches.length, 1);
      assert.equal(result.body.matches[0].id, existingTicket.id);
      assert.ok(result.body.matches[0].match_percent >= 40);
      assert.ok(result.body.matches[0].matched_keywords.length >= 2);
    });

    await t.test('unrelated ticket text does not create a false duplicate warning', async () => {
      const result = await request('/api/tickets/duplicate-check', {
        method: 'POST',
        bearer: firstToken,
        body: {
          title: 'Printer toner replacement',
          description: 'The office printer needs a new black toner cartridge.',
          categoryId,
        },
      });

      assert.equal(result.status, 200);
      assert.deepEqual(result.body.matches, []);
    });

    await t.test('normal users only see duplicate candidates from their own tickets while support can see all', async () => {
      const payload = {
        title: 'Campus Wi-Fi keeps disconnecting',
        description: 'Wireless network drops repeatedly after connecting in the hostel room.',
        categoryId,
      };

      const secondUserResult = await request('/api/tickets/duplicate-check', {
        method: 'POST',
        bearer: secondToken,
        body: payload,
      });
      assert.equal(secondUserResult.status, 200);
      assert.deepEqual(secondUserResult.body.matches, []);

      const supportResult = await request('/api/tickets/duplicate-check', {
        method: 'POST',
        bearer: supportToken,
        body: payload,
      });
      assert.equal(supportResult.status, 200);
      assert.ok(supportResult.body.matches.some((match) => match.id === existingTicket.id));
    });

    await t.test('resolved tickets are excluded from duplicate warnings', async () => {
      const resolved = await request('/api/tickets/' + existingTicket.id, {
        method: 'PATCH',
        bearer: supportToken,
        body: { status: 'resolved' },
      });
      assert.equal(resolved.status, 200);

      const result = await request('/api/tickets/duplicate-check', {
        method: 'POST',
        bearer: firstToken,
        body: {
          title: 'Campus Wi-Fi connection keeps disconnecting',
          description: 'Wireless network drops repeatedly after I connect in my hostel room.',
          categoryId,
        },
      });

      assert.equal(result.status, 200);
      assert.deepEqual(result.body.matches, []);
    });
  } finally {
    if (categoryId) {
      await pool.query('DELETE FROM tickets WHERE category_id = $1', [categoryId]);
    }
    await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [Object.values(emails)]);
    await pool.query('DELETE FROM categories WHERE name = $1', [categoryName]);
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
});
