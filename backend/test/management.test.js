import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import app from '../src/app.js';
import pool from '../src/database/pool.js';

test('admin management and analytics authorization', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const runId = randomUUID();
  const password = 'AdminTest!123';
  const adminEmail = `admin-owner-${runId}@example.com`;
  const otherAdminEmail = `admin-other-${runId}@example.com`;
  const userEmail = `admin-target-${runId}@example.com`;
  const categoryName = `Managed Category ${runId}`;
  let admin;
  let otherAdmin;
  let targetUser;
  let adminToken;
  let targetToken;
  let categoryId;

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
    admin = await register('Admin Owner', adminEmail);
    otherAdmin = await register('Other Admin', otherAdminEmail);
    targetUser = await register('Role Target', userEmail);

    await pool.query("UPDATE users SET role = 'admin' WHERE id = ANY($1::int[])", [[admin.id, otherAdmin.id]]);
    adminToken = await login(adminEmail);
    targetToken = await login(userEmail);

    await t.test('normal users cannot access admin routes or support analytics', async () => {
      assert.equal((await request('/api/admin/users', { bearer: targetToken })).status, 403);
      assert.equal((await request('/api/admin/categories', { bearer: targetToken })).status, 403);
      assert.equal((await request('/api/tickets/analytics', { bearer: targetToken })).status, 403);
    });

    await t.test('admin can list users and promote a normal user to support', async () => {
      const list = await request('/api/admin/users', { bearer: adminToken });
      assert.equal(list.status, 200);
      assert.ok(list.body.users.some((user) => user.id === targetUser.id && user.role === 'user'));

      const promoted = await request('/api/admin/users/' + targetUser.id + '/role', {
        method: 'PATCH',
        bearer: adminToken,
        body: { role: 'support' },
      });
      assert.equal(promoted.status, 200);
      assert.equal(promoted.body.user.role, 'support');

      const me = await request('/api/auth/me', { bearer: targetToken });
      assert.equal(me.status, 200);
      assert.equal(me.body.user.role, 'support');
    });

    await t.test('promoted support user can access analytics and receives the expected shape', async () => {
      const result = await request('/api/tickets/analytics', { bearer: targetToken });
      assert.equal(result.status, 200);
      const analytics = result.body.analytics;
      for (const key of [
        'total',
        'open',
        'in_progress',
        'resolved_closed',
        'overdue',
        'sla_met',
        'sla_breached',
        'avg_resolution_hours',
        'sla_compliance_percent',
        'priorities',
        'top_categories',
      ]) {
        assert.ok(Object.prototype.hasOwnProperty.call(analytics, key), `missing analytics key: ${key}`);
      }
      assert.ok(Array.isArray(analytics.priorities));
      assert.ok(Array.isArray(analytics.top_categories));
    });

    await t.test('admin cannot demote self or modify another admin from user management', async () => {
      const self = await request('/api/admin/users/' + admin.id + '/role', {
        method: 'PATCH',
        bearer: adminToken,
        body: { role: 'user' },
      });
      assert.equal(self.status, 400);

      const other = await request('/api/admin/users/' + otherAdmin.id + '/role', {
        method: 'PATCH',
        bearer: adminToken,
        body: { role: 'user' },
      });
      assert.equal(other.status, 403);
    });

    await t.test('admin category management creates, detects duplicates, and disables categories', async () => {
      const created = await request('/api/admin/categories', {
        method: 'POST',
        bearer: adminToken,
        body: { name: categoryName },
      });
      assert.equal(created.status, 201);
      categoryId = created.body.category.id;
      assert.equal(created.body.category.is_active, true);

      const duplicate = await request('/api/admin/categories', {
        method: 'POST',
        bearer: adminToken,
        body: { name: categoryName.toUpperCase() },
      });
      assert.equal(duplicate.status, 409);

      const publicBefore = await request('/api/categories', { bearer: adminToken });
      assert.ok(publicBefore.body.categories.some((category) => category.id === categoryId));

      const disabled = await request('/api/admin/categories/' + categoryId, {
        method: 'PATCH',
        bearer: adminToken,
        body: { isActive: false },
      });
      assert.equal(disabled.status, 200);
      assert.equal(disabled.body.category.is_active, false);

      const publicAfter = await request('/api/categories', { bearer: adminToken });
      assert.ok(!publicAfter.body.categories.some((category) => category.id === categoryId));
    });

    await t.test('disabled categories cannot be used to create new tickets', async () => {
      const result = await request('/api/tickets', {
        method: 'POST',
        bearer: targetToken,
        body: {
          title: 'Disabled category request',
          description: 'This category should no longer accept new tickets.',
          categoryId,
          priority: 'medium',
        },
      });
      assert.equal(result.status, 400);
    });

    await t.test('admin can demote support back to user and access changes immediately', async () => {
      const demoted = await request('/api/admin/users/' + targetUser.id + '/role', {
        method: 'PATCH',
        bearer: adminToken,
        body: { role: 'user' },
      });
      assert.equal(demoted.status, 200);
      assert.equal(demoted.body.user.role, 'user');
      assert.equal((await request('/api/tickets/analytics', { bearer: targetToken })).status, 403);
    });
  } finally {
    if (categoryId) {
      await pool.query('DELETE FROM tickets WHERE category_id = $1', [categoryId]);
      await pool.query('DELETE FROM categories WHERE id = $1', [categoryId]);
    }
    await pool.query(
      'DELETE FROM users WHERE email = ANY($1::text[])',
      [[adminEmail, otherAdminEmail, userEmail]],
    );
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
});
