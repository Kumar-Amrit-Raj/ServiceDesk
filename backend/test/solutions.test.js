import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import app from '../src/app.js';
import pool from '../src/database/pool.js';

test('resolved ticket suggestions against local PostgreSQL', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const runId = randomUUID();
  const password = 'SolutionTest!123';
  const emails = {
    first: `solution-first-${runId}@example.com`,
    second: `solution-second-${runId}@example.com`,
    support: `solution-support-${runId}@example.com`,
  };
  const categoryName = `Solution Test ${runId}`;
  let categoryId;
  let firstUser;
  let secondUser;
  let supportUser;
  let firstToken;
  let secondToken;
  let supportToken;
  let solvedTicket;

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
    firstUser = await register('Solution First', emails.first);
    secondUser = await register('Solution Second', emails.second);
    supportUser = await register('Solution Support', emails.support);
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
        description: 'Wireless network drops after connecting in the hostel room.',
        categoryId,
        priority: 'high',
      },
    });
    assert.equal(created.status, 201);
    solvedTicket = created.body.ticket;

    const comment = await request('/api/tickets/' + solvedTicket.id + '/comments', {
      method: 'POST',
      bearer: supportToken,
      body: { message: 'Removed the saved wireless profile and reconnected with the updated campus credentials.' },
    });
    assert.equal(comment.status, 201);

    const resolved = await request('/api/tickets/' + solvedTicket.id, {
      method: 'PATCH',
      bearer: supportToken,
      body: { status: 'resolved' },
    });
    assert.equal(resolved.status, 200);

    const payload = {
      title: 'Campus Wi-Fi connection keeps disconnecting',
      description: 'Wireless network drops repeatedly when I connect in my hostel room.',
      categoryId,
    };

    await t.test('solution suggestions require authentication and validate input', async () => {
      assert.equal((await request('/api/tickets/solution-suggestions', {
        method: 'POST',
        body: payload,
      })).status, 401);

      assert.equal((await request('/api/tickets/solution-suggestions', {
        method: 'POST',
        bearer: firstToken,
        body: { ...payload, title: '' },
      })).status, 400);

      assert.equal((await request('/api/tickets/solution-suggestions', {
        method: 'POST',
        bearer: firstToken,
        body: { ...payload, categoryId: 999999999 },
      })).status, 400);
    });

    await t.test('similar resolved ticket returns a previous support resolution', async () => {
      const result = await request('/api/tickets/solution-suggestions', {
        method: 'POST',
        bearer: firstToken,
        body: payload,
      });

      assert.equal(result.status, 200);
      assert.equal(result.body.suggestions.length, 1);
      assert.equal(result.body.suggestions[0].id, solvedTicket.id);
      assert.equal(result.body.suggestions[0].status, 'resolved');
      assert.match(result.body.suggestions[0].resolution_note, /wireless profile/i);
      assert.ok(result.body.suggestions[0].match_percent >= 40);
      assert.ok(result.body.suggestions[0].matched_keywords.length >= 2);
    });

    await t.test('normal users only receive suggestions from their own resolved tickets while support sees all', async () => {
      const secondUserResult = await request('/api/tickets/solution-suggestions', {
        method: 'POST',
        bearer: secondToken,
        body: payload,
      });
      assert.equal(secondUserResult.status, 200);
      assert.deepEqual(secondUserResult.body.suggestions, []);

      const supportResult = await request('/api/tickets/solution-suggestions', {
        method: 'POST',
        bearer: supportToken,
        body: payload,
      });
      assert.equal(supportResult.status, 200);
      assert.ok(supportResult.body.suggestions.some((suggestion) => suggestion.id === solvedTicket.id));
    });

    await t.test('unrelated resolved tickets are not suggested', async () => {
      const result = await request('/api/tickets/solution-suggestions', {
        method: 'POST',
        bearer: firstToken,
        body: {
          title: 'Printer toner replacement',
          description: 'The printer needs a new black toner cartridge.',
          categoryId,
        },
      });

      assert.equal(result.status, 200);
      assert.deepEqual(result.body.suggestions, []);
    });

    await t.test('active tickets are not returned as previous solutions', async () => {
      const active = await request('/api/tickets', {
        method: 'POST',
        bearer: firstToken,
        body: {
          title: 'Campus Wi-Fi connection keeps disconnecting',
          description: 'Wireless network drops repeatedly when I connect in my hostel room.',
          categoryId,
          priority: 'medium',
        },
      });
      assert.equal(active.status, 201);

      const result = await request('/api/tickets/solution-suggestions', {
        method: 'POST',
        bearer: firstToken,
        body: payload,
      });
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.suggestions.map((item) => item.id), [solvedTicket.id]);
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
