import pool from '../database/pool.js';

export async function listUsers(req, res) {
  const { rows } = await pool.query(
    `SELECT id, name, email, role, created_at
     FROM users
     ORDER BY created_at ASC, id ASC`,
  );
  res.json({ users: rows });
}

export async function updateUserRole(req, res) {
  const userId = Number(req.params.id);
  const { role } = req.body ?? {};

  if (!Number.isInteger(userId) || userId < 1) {
    return res.status(400).json({ message: 'Invalid user id.' });
  }

  if (!['user', 'support'].includes(role)) {
    return res.status(400).json({ message: 'Role must be user or support.' });
  }

  if (userId === req.user.id) {
    return res.status(400).json({ message: 'You cannot change your own admin role.' });
  }

  const { rows: existingRows } = await pool.query(
    'SELECT id, role FROM users WHERE id = $1',
    [userId],
  );
  const existingUser = existingRows[0];

  if (!existingUser) {
    return res.status(404).json({ message: 'User not found.' });
  }

  if (existingUser.role === 'admin') {
    return res.status(403).json({ message: 'Admin roles cannot be changed from this screen.' });
  }

  const { rows } = await pool.query(
    `UPDATE users
     SET role = $1
     WHERE id = $2
     RETURNING id, name, email, role, created_at`,
    [role, userId],
  );

  res.json({ user: rows[0] });
}
