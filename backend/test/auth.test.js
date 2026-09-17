import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import pool from '../src/database/pool.js';
import { jwtSecret } from '../src/config/auth.js';
import { authorizeRoles } from '../src/middleware/authorizeRoles.js';

// Uses the configured local database. Only this run's unique user is deleted.
test('authentication integration against local PostgreSQL', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const email = 'auth-test-' + randomUUID() + '@example.com';
  const password = randomUUID() + '!aA1';
  let user;
  let token;

  async function request(path, { method = 'GET', body, bearer, headers = {} } = {}) {
    const response = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }
  function safeProfile(value) {
    assert.deepEqual(Object.keys(value).sort(), ['email', 'id', 'name', 'role']);
  }

  try {
    await t.test('health endpoint remains available', async () => {
      const result = await request('/api/health');
      assert.equal(result.status, 200);
      assert.equal(result.body.success, true);
    });
    await t.test('required fields, malformed input, and password limits are validated', async () => {
      for (const body of [
        {}, null, { name: [], email, password }, { name: 'Test', email: {}, password },
        { name: 'Test', email: 'bad-email', password }, { name: 'Test', email, password: 'short' },
        { name: 'Test', email, password: 'é'.repeat(37) },
        { name: 'Test', email, password: {} }, { name: ' '.repeat(3), email, password },
      ]) {
        assert.equal((await request('/api/auth/register', { method: 'POST', body })).status, 400);
      }
    });
    await t.test('registration normalizes input and ignores elevated role and client id', async () => {
      const result = await request('/api/auth/register', {
        method: 'POST', body: { name: '  Auth Test  ', email: '  ' + email.toUpperCase() + '  ', password, role: 'admin', id: -1 },
      });
      assert.equal(result.status, 201);
      user = result.body.user;
      safeProfile(user);
      assert.equal(user.name, 'Auth Test');
      assert.equal(user.email, email);
      assert.equal(user.role, 'user');
      assert.ok(user.id > 0);
    });
    await t.test('stored password is a bcrypt hash', async () => {
      const { rows } = await pool.query('SELECT password FROM users WHERE email = $1', [email]);
      assert.notEqual(rows[0].password, password);
      assert.match(rows[0].password, /^\$2[aby]\$/);
      assert.equal(await bcrypt.compare(password, rows[0].password), true);
    });
    await t.test('duplicate email is rejected case-insensitively', async () => {
      const result = await request('/api/auth/register', {
        method: 'POST', body: { name: 'Other', email: email.toUpperCase(), password },
      });
      assert.equal(result.status, 409);
      assert.match(result.body.message, /already exists/);
    });
    await t.test('login returns a safe profile and a one-day JWT with only identity claims', async () => {
      const result = await request('/api/auth/login', {
        method: 'POST', body: { email: ' ' + email.toUpperCase() + ' ', password },
      });
      assert.equal(result.status, 200);
      safeProfile(result.body.user);
      token = result.body.token;
      const payload = jwt.verify(token, jwtSecret);
      assert.deepEqual(Object.keys(payload).sort(), ['exp', 'iat', 'id']);
      assert.equal(payload.id, user.id);
      assert.equal(payload.exp - payload.iat, 86400);
    });
    await t.test('wrong password, unknown email, and SQL injection input have the same generic response', async () => {
      for (const body of [
        { email, password: 'incorrect-password' },
        { email: 'missing-' + email, password },
        { email: "' OR 1=1 --", password },
        { email, password: { invalid: true } },
      ]) {
        const result = await request('/api/auth/login', { method: 'POST', body });
        assert.equal(result.status, 401);
        assert.equal(result.body.message, 'Invalid email or password');
      }
    });
    await t.test('me rejects missing, malformed, expired, and wrongly signed tokens', async () => {
      const invalidTokens = [
        undefined, 'invalid',
        jwt.sign({ id: user.id }, jwtSecret, { expiresIn: -1 }),
        jwt.sign({ id: user.id }, randomUUID()),
        jwt.sign({ id: 'bad-id' }, jwtSecret),
        jwt.sign({ id: user.id }, jwtSecret, { algorithm: 'HS384' }),
      ];
      for (const bearer of invalidTokens) {
        assert.equal((await request('/api/auth/me', { bearer })).status, 401);
      }
      assert.equal((await request('/api/auth/me', { headers: { Authorization: 'Basic abc' } })).status, 401);
    });
    await t.test('me restores the safe user with a valid token', async () => {
      const result = await request('/api/auth/me', { bearer: token });
      assert.equal(result.status, 200);
      safeProfile(result.body.user);
      assert.deepEqual(result.body.user, user);
    });
    await t.test('database role is authoritative even when a token contains another role', async () => {
      await pool.query("UPDATE users SET role = 'support' WHERE id = $1", [user.id]);
      const staleToken = jwt.sign({ id: user.id, role: 'admin' }, jwtSecret);
      const result = await request('/api/auth/me', { bearer: staleToken });
      assert.equal(result.status, 200);
      assert.equal(result.body.user.role, 'support');
      await pool.query("UPDATE users SET role = 'user' WHERE id = $1", [user.id]);
    });
    await t.test('role middleware enforces authentication and allowed roles', () => {
      for (const [profile, expected] of [[undefined, 401], [{ role: 'user' }, 403], [{ role: 'support' }, 200], [{ role: 'admin' }, 200]]) {
        let status;
        const res = { status(code) { status = code; return this; }, json() {} };
        authorizeRoles('support', 'admin')({ user: profile }, res, () => { status = 200; });
        assert.equal(status, expected);
      }
    });
    await t.test('deleted user cannot use a previously issued token', async () => {
      await pool.query('DELETE FROM users WHERE email = $1', [email]);
      assert.equal((await request('/api/auth/me', { bearer: token })).status, 401);
    });
  } finally {
    await pool.query('DELETE FROM users WHERE email = $1', [email]);
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
});
