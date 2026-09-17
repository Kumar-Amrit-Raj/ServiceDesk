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


function validCategoryId(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function cleanCategoryName(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function listAdminCategories(req, res) {
  const { rows } = await pool.query(
    `SELECT
       c.id,
       c.name,
       c.is_active,
       COUNT(t.id)::integer AS ticket_count
     FROM categories c
     LEFT JOIN tickets t ON t.category_id = c.id
     GROUP BY c.id, c.name, c.is_active
     ORDER BY c.name ASC`,
  );
  res.json({ categories: rows });
}

export async function createAdminCategory(req, res) {
  const name = cleanCategoryName(req.body?.name);

  if (!name || name.length > 100) {
    return res.status(400).json({ message: 'Category name is required and must be 100 characters or fewer.' });
  }

  const duplicate = await pool.query(
    'SELECT id FROM categories WHERE lower(name) = lower($1)',
    [name],
  );
  if (duplicate.rows[0]) {
    return res.status(409).json({ message: 'A category with this name already exists.' });
  }

  const { rows } = await pool.query(
    `INSERT INTO categories (name, is_active)
     VALUES ($1, TRUE)
     RETURNING id, name, is_active`,
    [name],
  );

  res.status(201).json({ category: { ...rows[0], ticket_count: 0 } });
}

export async function updateAdminCategory(req, res) {
  const categoryId = validCategoryId(req.params.id);
  if (!categoryId) {
    return res.status(400).json({ message: 'Invalid category id.' });
  }

  const hasName = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'name');
  const hasIsActive = Object.prototype.hasOwnProperty.call(req.body ?? {}, 'isActive');

  if (!hasName && !hasIsActive) {
    return res.status(400).json({ message: 'Provide a category name or active state.' });
  }

  const existing = await pool.query(
    'SELECT id, name, is_active FROM categories WHERE id = $1',
    [categoryId],
  );
  if (!existing.rows[0]) {
    return res.status(404).json({ message: 'Category not found.' });
  }

  let nextName = existing.rows[0].name;
  let nextIsActive = existing.rows[0].is_active;

  if (hasName) {
    nextName = cleanCategoryName(req.body.name);
    if (!nextName || nextName.length > 100) {
      return res.status(400).json({ message: 'Category name is required and must be 100 characters or fewer.' });
    }

    const duplicate = await pool.query(
      'SELECT id FROM categories WHERE lower(name) = lower($1) AND id <> $2',
      [nextName, categoryId],
    );
    if (duplicate.rows[0]) {
      return res.status(409).json({ message: 'A category with this name already exists.' });
    }
  }

  if (hasIsActive) {
    if (typeof req.body.isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive must be true or false.' });
    }
    nextIsActive = req.body.isActive;
  }

  const { rows } = await pool.query(
    `UPDATE categories
     SET name = $1, is_active = $2
     WHERE id = $3
     RETURNING id, name, is_active`,
    [nextName, nextIsActive, categoryId],
  );

  const countResult = await pool.query(
    'SELECT COUNT(*)::integer AS ticket_count FROM tickets WHERE category_id = $1',
    [categoryId],
  );

  res.json({
    category: {
      ...rows[0],
      ticket_count: countResult.rows[0].ticket_count,
    },
  });
}
