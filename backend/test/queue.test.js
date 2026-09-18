import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import app from '../src/app.js';
import pool from '../src/database/pool.js';

test('queue pagination, sorting, and assignee filtering', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const runId = randomUUID();
  const password = 'QueueTest!123';
  const requesterEmail = `queue-requester-${runId}@example.com`;
  const supportEmail = `queue-support-${runId}@example.com`;
  const categoryName = `Queue Test ${runId}`;
  let requester;
  let support;
  let requesterToken;
  let supportToken;
  let categoryId;
  const createdTickets = [];

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
    requester = await register('Queue Requester', requesterEmail);
    support = await register('Queue Support', supportEmail);
    await pool.query("UPDATE users SET role = 'support' WHERE id = $1", [support.id]);

    requesterToken = await login(requesterEmail);
    supportToken = await login(supportEmail);

    const category = await pool.query(
      'INSERT INTO categories (name) VALUES ($1) RETURNING id',
      [categoryName],
    );
    categoryId = category.rows[0].id;

    const priorities = ['low', 'medium', 'high'];
    for (let index = 0; index < 12; index += 1) {
      const result = await request('/api/tickets', {
        method: 'POST',
        bearer: requesterToken,
        body: {
          title: `Queue ticket ${String(index + 1).padStart(2, '0')} ${runId}`,
          description: `Pagination fixture ${index + 1} for ${runId}.`,
          categoryId,
          priority: priorities[index % priorities.length],
        },
      });
      assert.equal(result.status, 201);
      createdTickets.push(result.body.ticket);
    }

    await t.test('pagination returns metadata, full filtered totals, and stable pages', async () => {
      const query = new URLSearchParams({
        categoryId: String(categoryId),
        page: '1',
        pageSize: '5',
        sort: 'oldest',
      });
      const first = await request('/api/tickets?' + query.toString(), { bearer: supportToken });

      assert.equal(first.status, 200);
      assert.equal(first.body.pagination.page, 1);
      assert.equal(first.body.pagination.pageSize, 5);
      assert.equal(first.body.pagination.total, 12);
      assert.equal(first.body.pagination.totalPages, 3);
      assert.equal(first.body.tickets.length, 5);
      assert.equal(first.body.summary.open, 12);
      assert.equal(first.body.summary.inProgress, 0);
      assert.equal(first.body.summary.resolved, 0);
      assert.deepEqual(
        first.body.tickets.map((ticket) => ticket.id),
        createdTickets.slice(0, 5).map((ticket) => ticket.id),
      );

      query.set('page', '3');
      const third = await request('/api/tickets?' + query.toString(), { bearer: supportToken });
      assert.equal(third.status, 200);
      assert.equal(third.body.pagination.page, 3);
      assert.equal(third.body.tickets.length, 2);
      assert.deepEqual(
        third.body.tickets.map((ticket) => ticket.id),
        createdTickets.slice(10).map((ticket) => ticket.id),
      );
    });

    await t.test('out-of-range pages clamp to the final page', async () => {
      const query = new URLSearchParams({
        categoryId: String(categoryId),
        page: '99',
        pageSize: '5',
        sort: 'oldest',
      });
      const result = await request('/api/tickets?' + query.toString(), { bearer: supportToken });
      assert.equal(result.status, 200);
      assert.equal(result.body.pagination.page, 3);
      assert.equal(result.body.tickets.length, 2);
    });

    await t.test('pagination and sort input are validated', async () => {
      for (const suffix of [
        'page=0',
        'page=bad',
        'pageSize=0',
        'pageSize=101',
        'sort=unknown',
      ]) {
        const result = await request(
          `/api/tickets?categoryId=${categoryId}&${suffix}`,
          { bearer: supportToken },
        );
        assert.equal(result.status, 400);
      }
    });

    await t.test('newest and oldest sorting use deterministic id tie-breakers', async () => {
      const newest = await request(
        `/api/tickets?categoryId=${categoryId}&sort=newest&pageSize=100`,
        { bearer: supportToken },
      );
      const oldest = await request(
        `/api/tickets?categoryId=${categoryId}&sort=oldest&pageSize=100`,
        { bearer: supportToken },
      );
      assert.equal(newest.status, 200);
      assert.equal(oldest.status, 200);
      assert.deepEqual(
        newest.body.tickets.map((ticket) => ticket.id),
        [...createdTickets].reverse().map((ticket) => ticket.id),
      );
      assert.deepEqual(
        oldest.body.tickets.map((ticket) => ticket.id),
        createdTickets.map((ticket) => ticket.id),
      );
    });

    await t.test('priority sorting places high before medium before low', async () => {
      const result = await request(
        `/api/tickets?categoryId=${categoryId}&sort=priority&pageSize=100`,
        { bearer: supportToken },
      );
      assert.equal(result.status, 200);
      const rank = { high: 1, medium: 2, low: 3 };
      const values = result.body.tickets.map((ticket) => rank[ticket.priority]);
      assert.deepEqual(values, [...values].sort((a, b) => a - b));
    });

    await t.test('assignee filter is staff-only and supports assigned and unassigned queues', async () => {
      const assignedTicket = createdTickets[0];
      const updated = await request('/api/tickets/' + assignedTicket.id, {
        method: 'PATCH',
        bearer: supportToken,
        body: { assignedTo: support.id },
      });
      assert.equal(updated.status, 200);

      const forbidden = await request(
        `/api/tickets?assigneeId=${support.id}`,
        { bearer: requesterToken },
      );
      assert.equal(forbidden.status, 403);

      const assigned = await request(
        `/api/tickets?categoryId=${categoryId}&assigneeId=${support.id}&pageSize=100`,
        { bearer: supportToken },
      );
      assert.equal(assigned.status, 200);
      assert.equal(assigned.body.pagination.total, 1);
      assert.deepEqual(assigned.body.tickets.map((ticket) => ticket.id), [assignedTicket.id]);

      const unassigned = await request(
        `/api/tickets?categoryId=${categoryId}&assigneeId=unassigned&pageSize=100`,
        { bearer: supportToken },
      );
      assert.equal(unassigned.status, 200);
      assert.equal(unassigned.body.pagination.total, 11);
      assert.ok(unassigned.body.tickets.every((ticket) => ticket.assigned_to === null));
    });
  } finally {
    if (categoryId) {
      await pool.query('DELETE FROM tickets WHERE category_id = $1', [categoryId]);
      await pool.query('DELETE FROM categories WHERE id = $1', [categoryId]);
    }
    await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [[requesterEmail, supportEmail]]);
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
});
