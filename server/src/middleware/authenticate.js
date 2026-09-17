import jwt from 'jsonwebtoken';
import pool from '../database/pool.js';
import { jwtSecret } from '../config/auth.js';

export async function authenticate(req, res, next) {
  const match = /^Bearer\s+(\S+)$/i.exec(req.get('Authorization') || '');
  const unauthorized = () => res.status(401).json({ message: 'Please log in with a valid session.' });
  if (!match) return unauthorized();

  let payload;
  try {
    payload = jwt.verify(match[1], jwtSecret, { algorithms: ['HS256'] });
  } catch {
    return unauthorized();
  }
  if (!Number.isInteger(payload.id) || payload.id < 1 || payload.id > 2147483647) {
    return unauthorized();
  }

  // Always load current identity and role from the database, never from client input.
  const { rows } = await pool.query(
    'SELECT id, name, email, role FROM users WHERE id = $1',
    [payload.id],
  );
  if (!rows[0]) return unauthorized();
  req.user = rows[0];
  next();
}
