import pool from '../database/pool.js';

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'has', 'had', 'are', 'was', 'were',
  'but', 'not', 'you', 'your', 'our', 'can', 'cannot', 'cant', 'issue', 'problem', 'request', 'please',
  'after', 'before', 'when', 'where', 'what', 'how', 'into', 'onto', 'still', 'need', 'needs', 'using',
]);

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function keywords(...parts) {
  const normalized = parts
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/([a-z0-9])[-_]+([a-z0-9])/g, '$1$2');

  const words = normalized.match(/[a-z0-9]+/g) ?? [];
  return new Set(words.filter((word) => word.length >= 3 && !STOP_WORDS.has(word)));
}

function similarity(inputWords, candidateWords) {
  if (!inputWords.size || !candidateWords.size) return { score: 0, shared: [] };
  const shared = [...inputWords].filter((word) => candidateWords.has(word));
  const score = shared.length / Math.min(inputWords.size, candidateWords.size);
  return { score, shared };
}

function normalizeTitle(value) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function suggestResolvedTickets(req, res) {
  const title = String(req.body?.title ?? '').trim();
  const description = String(req.body?.description ?? '').trim();
  const categoryId = positiveInteger(req.body?.categoryId);

  if (!title || title.length > 200) {
    return res.status(400).json({ message: 'Title is required and must be 200 characters or fewer.' });
  }
  if (!description) {
    return res.status(400).json({ message: 'Description is required.' });
  }
  if (!categoryId) {
    return res.status(400).json({ message: 'Please choose a valid category.' });
  }

  const category = await pool.query('SELECT id FROM categories WHERE id = $1', [categoryId]);
  if (!category.rows[0]) {
    return res.status(400).json({ message: 'Please choose a valid category.' });
  }

  const values = [categoryId];
  let ownershipClause = '';
  if (req.user.role === 'user') {
    values.push(req.user.id);
    ownershipClause = 'AND t.user_id = $2';
  }

  const { rows } = await pool.query(
    `SELECT
       t.id,
       t.user_id,
       t.title,
       t.description,
       t.priority,
       t.status,
       t.resolved_at,
       c.name AS category_name,
       (
         SELECT comment.message
         FROM comments comment
         JOIN users author ON author.id = comment.user_id
         WHERE comment.ticket_id = t.id
           AND author.role IN ('support', 'admin')
         ORDER BY comment.created_at DESC, comment.id DESC
         LIMIT 1
       ) AS resolution_note
     FROM tickets t
     JOIN categories c ON c.id = t.category_id
     WHERE t.category_id = $1
       AND t.status IN ('resolved', 'closed')
       ${ownershipClause}
     ORDER BY t.resolved_at DESC NULLS LAST, t.id DESC
     LIMIT 50`,
    values,
  );

  const inputWords = keywords(title, description);
  const normalizedInputTitle = normalizeTitle(title);

  const suggestions = rows
    .map((ticket) => {
      const candidateWords = keywords(ticket.title, ticket.description);
      const { score, shared } = similarity(inputWords, candidateWords);
      const exactTitle = normalizeTitle(ticket.title) === normalizedInputTitle;
      const qualifies = exactTitle || (shared.length >= 2 && score >= 0.4);

      if (!qualifies) return null;
      return {
        id: ticket.id,
        title: ticket.title,
        priority: ticket.priority,
        status: ticket.status,
        category_name: ticket.category_name,
        resolved_at: ticket.resolved_at,
        resolution_note: ticket.resolution_note,
        match_percent: exactTitle ? 100 : Math.round(score * 100),
        matched_keywords: shared.slice(0, 6),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.match_percent - a.match_percent || b.id - a.id)
    .slice(0, 3);

  res.json({ suggestions });
}
