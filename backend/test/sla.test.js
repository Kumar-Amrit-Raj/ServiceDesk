import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import app from '../src/app.js';
import pool from '../src/database/pool.js';

test('SLA integration against local PostgreSQL', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const runId = randomUUID();
  const password = 'SlaTest!123';
  const userEmail = `sla-user-${runId}@example.com`;
  const supportEmail = `sla-support-${runId}@example.com`;
  const categoryName = `SLA Test ${runId}`;
  let categoryId;
  let user;
  let support;
  let userToken;
  let supportToken;
  let trackedTicket;

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
    user = await register('SLA User', userEmail);
    support = await register('SLA Support', supportEmail);
    await pool.query("UPDATE users SET role = 'support' WHERE id = $1", [support.id]);

    userToken = await login(userEmail);
    supportToken = await login(supportEmail);

    const insertedCategory = await pool.query(
      'INSERT INTO categories (name) VALUES ($1) RETURNING id',
      [categoryName],
    );
    categoryId = insertedCategory.rows[0].id;

    await t.test('new ticket exposes an on-track SLA state and remaining minutes', async () => {
      const result = await request('/api/tickets', {
        method: 'POST',
        bearer: userToken,
        body: {
          title: 'SLA tracking test',
          description: 'Verify target-resolution tracking.',
          categoryId,
          priority: 'high',
        },
      });

      assert.equal(result.status, 201);
      trackedTicket = result.body.ticket;
      assert.equal(trackedTicket.sla_state, 'on_track');
      assert.ok(trackedTicket.sla_minutes_remaining >= 710 && trackedTicket.sla_minutes_remaining <= 721);
    });

    await t.test('ticket becomes due soon when less than four hours remain', async () => {
      await pool.query(
        `UPDATE tickets SET target_resolution_at = CURRENT_TIMESTAMP + INTERVAL '2 hours' WHERE id = $1`,
        [trackedTicket.id],
      );

      const result = await request('/api/tickets/' + trackedTicket.id, { bearer: userToken });
      assert.equal(result.status, 200);
      assert.equal(result.body.ticket.sla_state, 'due_soon');
      assert.ok(result.body.ticket.sla_minutes_remaining >= 119 && result.body.ticket.sla_minutes_remaining <= 121);
    });

    await t.test('overdue SLA state can be filtered and invalid filters are rejected', async () => {
      // Preserve the database rule that an SLA target cannot predate ticket creation.
      // Moving both timestamps back simulates a legitimately old ticket whose target has passed.
      await pool.query(
        `UPDATE tickets
         SET created_at = CURRENT_TIMESTAMP - INTERVAL '2 hours',
             target_resolution_at = CURRENT_TIMESTAMP - INTERVAL '1 hour'
         WHERE id = $1`,
        [trackedTicket.id],
      );

      const detail = await request('/api/tickets/' + trackedTicket.id, { bearer: userToken });
      assert.equal(detail.status, 200);
      assert.equal(detail.body.ticket.sla_state, 'overdue');
      assert.ok(detail.body.ticket.sla_minutes_remaining <= -59);

      const overdue = await request('/api/tickets?sla=overdue', { bearer: userToken });
      assert.equal(overdue.status, 200);
      assert.deepEqual(overdue.body.tickets.map((ticket) => ticket.id), [trackedTicket.id]);

      assert.equal((await request('/api/tickets?sla=late', { bearer: userToken })).status, 400);
    });

    await t.test('resolving after the target records a breached SLA', async () => {
      const result = await request('/api/tickets/' + trackedTicket.id, {
        method: 'PATCH',
        bearer: supportToken,
        body: { status: 'resolved' },
      });

      assert.equal(result.status, 200);
      assert.equal(result.body.ticket.sla_state, 'breached');
      assert.ok(result.body.ticket.sla_minutes_remaining < 0);

      const breached = await request('/api/tickets?sla=breached', { bearer: supportToken });
      assert.equal(breached.status, 200);
      assert.ok(breached.body.tickets.some((ticket) => ticket.id === trackedTicket.id));
    });

    await t.test('resolving before the target records an SLA met state', async () => {
      const created = await request('/api/tickets', {
        method: 'POST',
        bearer: userToken,
        body: {
          title: 'Quick resolution test',
          description: 'This ticket should be resolved well before its target.',
          categoryId,
          priority: 'medium',
        },
      });
      assert.equal(created.status, 201);

      const resolved = await request('/api/tickets/' + created.body.ticket.id, {
        method: 'PATCH',
        bearer: supportToken,
        body: { status: 'resolved' },
      });
      assert.equal(resolved.status, 200);
      assert.equal(resolved.body.ticket.sla_state, 'met');
      assert.ok(resolved.body.ticket.sla_minutes_remaining > 0);

      const met = await request('/api/tickets?sla=met', { bearer: supportToken });
      assert.equal(met.status, 200);
      assert.ok(met.body.tickets.some((ticket) => ticket.id === created.body.ticket.id));
    });
  } finally {
    if (categoryId) {
      await pool.query('DELETE FROM tickets WHERE category_id = $1', [categoryId]);
    }
    await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [[userEmail, supportEmail]]);
    await pool.query('DELETE FROM categories WHERE name = $1', [categoryName]);
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
});
