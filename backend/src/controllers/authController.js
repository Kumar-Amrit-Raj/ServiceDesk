import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../database/pool.js';
import { jwtSecret } from '../config/auth.js';

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

export async function register(req, res) {
  const { name, email, password } = req.body ?? {};
  const cleanName = typeof name === 'string' ? name.trim() : '';
  const cleanEmail = normalizeEmail(email);

  if (!cleanName || !cleanEmail || typeof password !== 'string' || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required.' });
  }
  if (cleanName.length > 100 || cleanEmail.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ message: 'Use a name up to 100 characters and a valid email up to 255 characters.' });
  }
  // bcrypt processes at most 72 bytes; reject longer inputs instead of truncating.
  if (password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ message: 'Password must be at least 8 characters and no more than 72 UTF-8 bytes.' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password, role)
       VALUES ($1, $2, $3, 'user')
       RETURNING id, name, email, role`,
      [cleanName, cleanEmail, passwordHash],
    );
    return res.status(201).json({ user: rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }
    throw error;
  }
}

export async function login(req, res) {
  const { email, password } = req.body ?? {};
  const cleanEmail = normalizeEmail(email);
  const invalidCredentials = () => res.status(401).json({ message: 'Invalid email or password' });

  if (!cleanEmail || cleanEmail.length > 255 || typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > 72) {
    return invalidCredentials();
  }

  const { rows } = await pool.query(
    'SELECT id, name, email, role, password FROM users WHERE lower(email) = $1',
    [cleanEmail],
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return invalidCredentials();
  }

  const token = jwt.sign({ id: user.id }, jwtSecret, { algorithm: 'HS256', expiresIn: '1d' });
  return res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}

export function getMe(req, res) {
  res.json({ user: req.user });
}
