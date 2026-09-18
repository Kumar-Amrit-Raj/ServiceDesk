import pool from '../database/pool.js';

const PRIORITIES = new Set(['low', 'medium', 'high']);
const STATUSES = new Set(['open', 'in_progress', 'resolved', 'closed']);
const SLA_STATES = new Set(['on_track', 'due_soon', 'overdue', 'met', 'breached']);
const RESOLUTION_HOURS = { high: 12, medium: 24, low: 48 };
const TICKET_SORTS = {
  newest: 't.created_at DESC, t.id DESC',
  oldest: 't.created_at ASC, t.id ASC',
  priority: `CASE t.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END ASC, t.created_at DESC, t.id DESC`,
  sla: 't.target_resolution_at ASC NULLS LAST, t.created_at DESC, t.id DESC',
  updated: 't.updated_at DESC, t.id DESC',
};

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
      t.updated_at,
      CASE
        WHEN t.status IN ('resolved', 'closed') THEN
          CASE
            WHEN t.resolved_at IS NOT NULL AND t.resolved_at <= t.target_resolution_at THEN 'met'
            ELSE 'breached'
          END
        WHEN t.target_resolution_at < CURRENT_TIMESTAMP THEN 'overdue'
        WHEN t.target_resolution_at <= CURRENT_TIMESTAMP + INTERVAL '4 hours' THEN 'due_soon'
        ELSE 'on_track'
      END AS sla_state,
      CASE
        WHEN t.status IN ('resolved', 'closed') AND t.resolved_at IS NOT NULL THEN
          CEIL(EXTRACT(EPOCH FROM (t.target_resolution_at - t.resolved_at)) / 60.0)::integer
        ELSE
          CEIL(EXTRACT(EPOCH FROM (t.target_resolution_at - CURRENT_TIMESTAMP)) / 60.0)::integer
      END AS sla_minutes_remaining
    FROM tickets t
    JOIN users requester ON requester.id = t.user_id
    JOIN categories c ON c.id = t.category_id
    LEFT JOIN users assignee ON assignee.id = t.assigned_to
  `;
}

async function loadTicket(ticketId, db = pool) {
  const { rows } = await db.query(`${ticketSelect()} WHERE t.id = $1`, [ticketId]);
  return rows[0] ?? null;
}

function canAccessTicket(user, ticket) {
  return user.role !== 'user' || ticket.user_id === user.id;
}

export async function listCategories(req, res) {
  const { rows } = await pool.query(
    'SELECT id, name FROM categories WHERE is_active = TRUE ORDER BY name ASC',
  );
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

  const category = await pool.query(
    'SELECT id FROM categories WHERE id = $1 AND is_active = TRUE',
    [categoryId],
  );
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

  const ticket = await loadTicket(inserted.rows[0].id);
  res.status(201).json({ ticket });
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

  if (req.query.assigneeId) {
    if (req.user.role === 'user') {
      return res.status(403).json({ message: 'Assignee filtering is available to support staff only.' });
    }

    const assigneeFilter = String(req.query.assigneeId).trim().toLowerCase();
    if (assigneeFilter === 'unassigned') {
      where.push('t.assigned_to IS NULL');
    } else {
      const assigneeId = positiveInteger(assigneeFilter);
      if (!assigneeId) {
        return res.status(400).json({ message: 'Invalid assignee filter.' });
      }

      const assignee = await pool.query(
        `SELECT id FROM users WHERE id = $1 AND role IN ('support', 'admin')`,
        [assigneeId],
      );
      if (!assignee.rows[0]) {
        return res.status(400).json({ message: 'Invalid assignee filter.' });
      }

      where.push(`t.assigned_to = ${addValue(assigneeId)}`);
    }
  }

  if (req.query.sla) {
    const sla = String(req.query.sla).trim().toLowerCase();
    if (!SLA_STATES.has(sla)) {
      return res.status(400).json({ message: 'Invalid SLA filter.' });
    }

    if (sla === 'overdue') {
      where.push(`t.status IN ('open', 'in_progress') AND t.target_resolution_at < CURRENT_TIMESTAMP`);
    } else if (sla === 'due_soon') {
      where.push(`t.status IN ('open', 'in_progress')
        AND t.target_resolution_at >= CURRENT_TIMESTAMP
        AND t.target_resolution_at <= CURRENT_TIMESTAMP + INTERVAL '4 hours'`);
    } else if (sla === 'on_track') {
      where.push(`t.status IN ('open', 'in_progress')
        AND t.target_resolution_at > CURRENT_TIMESTAMP + INTERVAL '4 hours'`);
    } else if (sla === 'met') {
      where.push(`t.status IN ('resolved', 'closed')
        AND t.resolved_at IS NOT NULL
        AND t.resolved_at <= t.target_resolution_at`);
    } else if (sla === 'breached') {
      where.push(`t.status IN ('resolved', 'closed')
        AND (t.resolved_at IS NULL OR t.resolved_at > t.target_resolution_at)`);
    }
  }

  if (req.query.search) {
    const search = String(req.query.search).trim();
    if (search) {
      const parameter = addValue('%' + search + '%');
      where.push(`(t.title ILIKE ${parameter} OR t.description ILIKE ${parameter})`);
    }
  }

  const sort = String(req.query.sort ?? 'newest').trim().toLowerCase();
  const orderBy = TICKET_SORTS[sort];
  if (!orderBy) {
    return res.status(400).json({ message: 'Invalid ticket sort option.' });
  }

  const clause = where.length ? ' WHERE ' + where.map((condition) => `(${condition})`).join(' AND ') : '';
  const { rows } = await pool.query(
    `${ticketSelect()}${clause} ORDER BY ${orderBy}`,
    values,
  );

  res.json({ tickets: rows });
}

export async function getTicket(req, res) {
  const ticketId = positiveInteger(req.params.id);
  if (!ticketId) {
    return res.status(400).json({ message: 'Invalid ticket id.' });
  }

  const ticket = await loadTicket(ticketId);
  if (!ticket) {
    return res.status(404).json({ message: 'Ticket not found.' });
  }
  if (!canAccessTicket(req.user, ticket)) {
    return res.status(403).json({ message: 'You do not have permission to view this ticket.' });
  }

  res.json({ ticket });
}

export async function listSupportAgents(req, res) {
  const { rows } = await pool.query(
    `SELECT id, name, email, role
     FROM users
     WHERE role IN ('support', 'admin')
     ORDER BY CASE WHEN role = 'support' THEN 0 ELSE 1 END, name ASC, id ASC`,
  );
  res.json({ agents: rows });
}

export async function updateTicket(req, res) {
  const ticketId = positiveInteger(req.params.id);
  if (!ticketId) {
    return res.status(400).json({ message: 'Invalid ticket id.' });
  }

  const body = req.body ?? {};
  const hasStatus = Object.prototype.hasOwnProperty.call(body, 'status');
  const hasAssignedTo = Object.prototype.hasOwnProperty.call(body, 'assignedTo');
  if (!hasStatus && !hasAssignedTo) {
    return res.status(400).json({ message: 'Provide a status or assignment update.' });
  }

  let requestedStatus;
  if (hasStatus) {
    requestedStatus = String(body.status ?? '').trim().toLowerCase();
    if (!STATUSES.has(requestedStatus)) {
      return res.status(400).json({ message: 'Status must be open, in_progress, resolved, or closed.' });
    }
  }

  let requestedAssignee;
  if (hasAssignedTo) {
    if (body.assignedTo === null || body.assignedTo === '') {
      requestedAssignee = null;
    } else {
      requestedAssignee = positiveInteger(body.assignedTo);
      if (!requestedAssignee) {
        return res.status(400).json({ message: 'Assigned agent must be a valid user id or null.' });
      }
      const { rows } = await pool.query(
        `SELECT id FROM users WHERE id = $1 AND role IN ('support', 'admin')`,
        [requestedAssignee],
      );
      if (!rows[0]) {
        return res.status(400).json({ message: 'Tickets can only be assigned to support or admin users.' });
      }
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, status, assigned_to, resolved_at FROM tickets WHERE id = $1 FOR UPDATE`,
      [ticketId],
    );
    const current = rows[0];
    if (!current) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Ticket not found.' });
    }

    const nextStatus = hasStatus ? requestedStatus : current.status;
    const nextAssignee = hasAssignedTo ? requestedAssignee : current.assigned_to;
    let nextResolvedAt = current.resolved_at;
    const history = [];

    if (nextStatus !== current.status) {
      history.push({ field: 'status', oldValue: current.status, newValue: nextStatus });
      if (nextStatus === 'resolved' || nextStatus === 'closed') {
        nextResolvedAt = current.resolved_at ?? new Date();
      } else {
        nextResolvedAt = null;
      }
    }

    if (nextAssignee !== current.assigned_to) {
      history.push({
        field: 'assigned_to',
        oldValue: current.assigned_to,
        newValue: nextAssignee,
      });
    }

    if (history.length) {
      await client.query(
        `UPDATE tickets
         SET status = $1,
             assigned_to = $2,
             resolved_at = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [nextStatus, nextAssignee, nextResolvedAt, ticketId],
      );

      for (const change of history) {
        await client.query(
          `INSERT INTO ticket_history (ticket_id, changed_by, field_name, old_value, new_value)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            ticketId,
            req.user.id,
            change.field,
            change.oldValue === null ? null : String(change.oldValue),
            change.newValue === null ? null : String(change.newValue),
          ],
        );
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const ticket = await loadTicket(ticketId);
  res.json({ ticket });
}

export async function listTicketComments(req, res) {
  const ticketId = positiveInteger(req.params.id);
  if (!ticketId) {
    return res.status(400).json({ message: 'Invalid ticket id.' });
  }

  const ticket = await loadTicket(ticketId);
  if (!ticket) {
    return res.status(404).json({ message: 'Ticket not found.' });
  }
  if (!canAccessTicket(req.user, ticket)) {
    return res.status(403).json({ message: 'You do not have permission to view this ticket.' });
  }

  const { rows } = await pool.query(
    `SELECT
       c.id,
       c.ticket_id,
       c.user_id,
       u.name AS author_name,
       u.role AS author_role,
       c.message,
       c.created_at
     FROM comments c
     JOIN users u ON u.id = c.user_id
     WHERE c.ticket_id = $1
     ORDER BY c.created_at ASC, c.id ASC`,
    [ticketId],
  );

  res.json({ comments: rows });
}

export async function createTicketComment(req, res) {
  const ticketId = positiveInteger(req.params.id);
  if (!ticketId) {
    return res.status(400).json({ message: 'Invalid ticket id.' });
  }

  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message || message.length > 2000) {
    return res.status(400).json({ message: 'Comment is required and must be 2000 characters or fewer.' });
  }

  const ticket = await loadTicket(ticketId);
  if (!ticket) {
    return res.status(404).json({ message: 'Ticket not found.' });
  }
  if (!canAccessTicket(req.user, ticket)) {
    return res.status(403).json({ message: 'You do not have permission to comment on this ticket.' });
  }

  const { rows } = await pool.query(
    `WITH inserted AS (
       INSERT INTO comments (ticket_id, user_id, message)
       VALUES ($1, $2, $3)
       RETURNING id, ticket_id, user_id, message, created_at
     )
     SELECT
       inserted.id,
       inserted.ticket_id,
       inserted.user_id,
       u.name AS author_name,
       u.role AS author_role,
       inserted.message,
       inserted.created_at
     FROM inserted
     JOIN users u ON u.id = inserted.user_id`,
    [ticketId, req.user.id, message],
  );

  res.status(201).json({ comment: rows[0] });
}

export async function listTicketHistory(req, res) {
  const ticketId = positiveInteger(req.params.id);
  if (!ticketId) {
    return res.status(400).json({ message: 'Invalid ticket id.' });
  }

  const ticket = await loadTicket(ticketId);
  if (!ticket) {
    return res.status(404).json({ message: 'Ticket not found.' });
  }
  if (!canAccessTicket(req.user, ticket)) {
    return res.status(403).json({ message: 'You do not have permission to view this ticket.' });
  }

  const { rows } = await pool.query(
    `SELECT
       h.id,
       h.ticket_id,
       h.changed_by,
       u.name AS changed_by_name,
       u.role AS changed_by_role,
       h.field_name,
       h.old_value,
       h.new_value,
       h.created_at
     FROM ticket_history h
     JOIN users u ON u.id = h.changed_by
     WHERE h.ticket_id = $1
     ORDER BY h.created_at DESC, h.id DESC`,
    [ticketId],
  );

  res.json({ history: rows });
}
