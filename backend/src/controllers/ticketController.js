import pool from '../database/pool.js';

const PRIORITIES = new Set(['low', 'medium', 'high']);
const STATUSES = new Set(['open', 'in_progress', 'resolved', 'closed']);
const RESOLUTION_HOURS = { high: 12, medium: 24, low: 48 };

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function ticketSelect() {
  return `
    SELECT
      t.id,
      t.user_id,
      requester.name AS requester_name,
      t.assigned_to,
      assignee.name AS assigned_to_name,
      t.category_id,
      c.name AS category_name,
      t.title,
      t.description,
      t.priority,
      t.status,
      t.target_resolution_at,
      t.resolved_at,
      t.created_at,
      t.updated_at
    FROM tickets t
    JOIN users requester ON requester.id = t.user_id
    JOIN categories c ON c.id = t.category_id
    LEFT JOIN users assignee ON assignee.id = t.assigned_to
  `;
}

export async function listCategories(req, res) {
  const { rows } = await pool.query('SELECT id, name FROM categories ORDER BY name ASC');
  res.json({ categories: rows });
}

export async function createTicket(req, res) {
  const title = String(req.body.title ?? '').trim();
  const description = String(req.body.description ?? '').trim();
  const categoryId = positiveInteger(req.body.categoryId);
  const priority = String(req.body.priority ?? 'medium').trim().toLowerCase();

  if (!title || title.length > 200) {
    return res.status(400).json({ message: 'Title is required and must be 200 characters or fewer.' });
  }
  if (!description) {
    return res.status(400).json({ message: 'Description is required.' });
  }
  if (!categoryId) {
    return res.status(400).json({ message: 'Please choose a valid category.' });
  }
  if (!PRIORITIES.has(priority)) {
    return res.status(400).json({ message: 'Priority must be low, medium, or high.' });
  }

  const category = await pool.query('SELECT id FROM categories WHERE id = $1', [categoryId]);
  if (!category.rows[0]) {
    return res.status(400).json({ message: 'Please choose a valid category.' });
  }

  const targetResolutionAt = new Date(Date.now() + RESOLUTION_HOURS[priority] * 60 * 60 * 1000);
  const inserted = await pool.query(
    `INSERT INTO tickets
      (user_id, category_id, title, description, priority, target_resolution_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [req.user.id, categoryId, title, description, priority, targetResolutionAt],
  );

  const { rows } = await pool.query(
    `${ticketSelect()} WHERE t.id = $1`,
    [inserted.rows[0].id],
  );

  res.status(201).json({ ticket: rows[0] });
}

export async function listTickets(req, res) {
  const where = [];
  const values = [];

  function addValue(value) {
    values.push(value);
    return '$' + values.length;
  }

  if (req.user.role === 'user') {
    where.push(`t.user_id = ${addValue(req.user.id)}`);
  }

  if (req.query.status) {
    const status = String(req.query.status).toLowerCase();
    if (!STATUSES.has(status)) {
      return res.status(400).json({ message: 'Invalid status filter.' });
    }
    where.push(`t.status = ${addValue(status)}`);
  }

  if (req.query.priority) {
    const priority = String(req.query.priority).toLowerCase();
    if (!PRIORITIES.has(priority)) {
      return res.status(400).json({ message: 'Invalid priority filter.' });
    }
    where.push(`t.priority = ${addValue(priority)}`);
  }

  if (req.query.categoryId) {
    const categoryId = positiveInteger(req.query.categoryId);
    if (!categoryId) {
      return res.status(400).json({ message: 'Invalid category filter.' });
    }
    where.push(`t.category_id = ${addValue(categoryId)}`);
  }

  if (req.query.search) {
    const search = String(req.query.search).trim();
    if (search) {
      const parameter = addValue('%' + search + '%');
      where.push(`(t.title ILIKE ${parameter} OR t.description ILIKE ${parameter})`);
    }
  }

  const clause = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const { rows } = await pool.query(
    `${ticketSelect()}${clause} ORDER BY t.created_at DESC, t.id DESC`,
    values,
  );

  res.json({ tickets: rows });
}

export async function getTicket(req, res) {
  const ticketId = positiveInteger(req.params.id);
  if (!ticketId) {
    return res.status(400).json({ message: 'Invalid ticket id.' });
  }

  const { rows } = await pool.query(
    `${ticketSelect()} WHERE t.id = $1`,
    [ticketId],
  );
  const ticket = rows[0];

  if (!ticket) {
    return res.status(404).json({ message: 'Ticket not found.' });
  }
  if (req.user.role === 'user' && ticket.user_id !== req.user.id) {
    return res.status(403).json({ message: 'You do not have permission to view this ticket.' });
  }

  res.json({ ticket });
}
