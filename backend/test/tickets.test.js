import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import app from '../src/app.js';
import pool from '../src/database/pool.js';

// Uses unique rows in the configured local database and removes only those rows.
test('ticket integration against local PostgreSQL', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const runId = randomUUID();
  const password = 'TicketTest!123';
  const emails = {
    first: `ticket-first-${runId}@example.com`,
    second: `ticket-second-${runId}@example.com`,
    support: `ticket-support-${runId}@example.com`,
  };
  const categoryName = `Ticket Test ${runId}`;
  let categoryId;
  let firstUser;
  let secondUser;
  let supportUser;
  let firstToken;
  let secondToken;
  let supportToken;
  let firstTicket;
  let secondTicket;

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
    firstUser = await register('Ticket First', emails.first);
    secondUser = await register('Ticket Second', emails.second);
    supportUser = await register('Ticket Support', emails.support);
    await pool.query("UPDATE users SET role = 'support' WHERE id = $1", [supportUser.id]);

    firstToken = await login(emails.first);
    secondToken = await login(emails.second);
    supportToken = await login(emails.support);

    const insertedCategory = await pool.query(
      'INSERT INTO categories (name) VALUES ($1) RETURNING id',
      [categoryName],
    );
    categoryId = insertedCategory.rows[0].id;

    await t.test('ticket and category endpoints require authentication', async () => {
      assert.equal((await request('/api/categories')).status, 401);
      assert.equal((await request('/api/tickets')).status, 401);
      assert.equal((await request('/api/tickets/1')).status, 401);
    });

    await t.test('authenticated category list contains the available category', async () => {
      const result = await request('/api/categories', { bearer: firstToken });
      assert.equal(result.status, 200);
      assert.ok(result.body.categories.some((category) => category.id === categoryId && category.name === categoryName));
    });

    await t.test('ticket creation validates required fields, category, and priority', async () => {
      for (const body of [
        {},
        { title: '', description: 'Description', categoryId, priority: 'high' },
        { title: 'x'.repeat(201), description: 'Description', categoryId, priority: 'high' },
        { title: 'Title', description: '', categoryId, priority: 'high' },
        { title: 'Title', description: 'Description', categoryId: 0, priority: 'high' },
        { title: 'Title', description: 'Description', categoryId: 999999999, priority: 'high' },
        { title: 'Title', description: 'Description', categoryId, priority: 'urgent' },
      ]) {
        assert.equal((await request('/api/tickets', { method: 'POST', body, bearer: firstToken })).status, 400);
      }
    });

    await t.test('ticket creation derives ownership from authentication and calculates high-priority target', async () => {
      const result = await request('/api/tickets', {
        method: 'POST',
        bearer: firstToken,
        body: {
          title: 'Unable to connect to campus Wi-Fi',
          description: 'Connection drops repeatedly after joining the network.',
          categoryId,
          priority: 'HIGH',
          userId: secondUser.id,
          user_id: secondUser.id,
          status: 'resolved',
        },
      });
      assert.equal(result.status, 201);
      firstTicket = result.body.ticket;
      assert.equal(firstTicket.user_id, firstUser.id);
      assert.equal(firstTicket.priority, 'high');
      assert.equal(firstTicket.status, 'open');
      assert.equal(firstTicket.category_id, categoryId);

      const createdAt = new Date(firstTicket.created_at).getTime();
      const targetAt = new Date(firstTicket.target_resolution_at).getTime();
      const targetHours = (targetAt - createdAt) / (60 * 60 * 1000);
      assert.ok(targetHours > 11.9 && targetHours <= 12.1, `expected about 12 hours, received ${targetHours}`);
    });

    await t.test('a second user can create a separate ticket', async () => {
      const result = await request('/api/tickets', {
        method: 'POST',
        bearer: secondToken,
        body: {
          title: 'Keyboard replacement request',
          description: 'Several keys are no longer responding.',
          categoryId,
          priority: 'low',
        },
      });
      assert.equal(result.status, 201);
      secondTicket = result.body.ticket;
      assert.equal(secondTicket.user_id, secondUser.id);
    });

    await t.test('normal users only list their own tickets', async () => {
      const first = await request('/api/tickets', { bearer: firstToken });
      const second = await request('/api/tickets', { bearer: secondToken });
      assert.equal(first.status, 200);
      assert.equal(second.status, 200);
      assert.deepEqual(first.body.tickets.map((ticket) => ticket.id), [firstTicket.id]);
      assert.deepEqual(second.body.tickets.map((ticket) => ticket.id), [secondTicket.id]);
    });

    await t.test('search, status, priority, and category filters work together', async () => {
      const query = new URLSearchParams({
        search: 'campus',
        status: 'open',
        priority: 'high',
        categoryId: String(categoryId),
      });
      const result = await request('/api/tickets?' + query, { bearer: firstToken });
      assert.equal(result.status, 200);
      assert.deepEqual(result.body.tickets.map((ticket) => ticket.id), [firstTicket.id]);

      assert.equal((await request('/api/tickets?status=invalid', { bearer: firstToken })).status, 400);
      assert.equal((await request('/api/tickets?priority=urgent', { bearer: firstToken })).status, 400);
      assert.equal((await request('/api/tickets?categoryId=bad', { bearer: firstToken })).status, 400);
    });

    await t.test('normal users cannot open another user ticket', async () => {
      const own = await request('/api/tickets/' + firstTicket.id, { bearer: firstToken });
      const other = await request('/api/tickets/' + firstTicket.id, { bearer: secondToken });
      assert.equal(own.status, 200);
      assert.equal(own.body.ticket.id, firstTicket.id);
      assert.equal(other.status, 403);
      assert.equal((await request('/api/tickets/not-a-number', { bearer: firstToken })).status, 400);
      assert.equal((await request('/api/tickets/999999999', { bearer: firstToken })).status, 404);
    });

    await t.test('support role can list and open tickets from different users', async () => {
      const list = await request('/api/tickets?categoryId=' + categoryId, { bearer: supportToken });
      assert.equal(list.status, 200);
      const ids = list.body.tickets.map((ticket) => ticket.id).sort((a, b) => a - b);
      assert.deepEqual(ids, [firstTicket.id, secondTicket.id].sort((a, b) => a - b));

      const detail = await request('/api/tickets/' + firstTicket.id, { bearer: supportToken });
      assert.equal(detail.status, 200);
      assert.equal(detail.body.ticket.id, firstTicket.id);
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
