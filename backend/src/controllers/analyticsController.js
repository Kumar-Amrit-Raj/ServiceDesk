import pool from '../database/pool.js';

export async function getTicketAnalytics(req, res) {
  const [summaryResult, priorityResult, categoryResult] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)::integer AS total,
         COUNT(*) FILTER (WHERE status = 'open')::integer AS open,
         COUNT(*) FILTER (WHERE status = 'in_progress')::integer AS in_progress,
         COUNT(*) FILTER (WHERE status IN ('resolved', 'closed'))::integer AS resolved_closed,
         COUNT(*) FILTER (
           WHERE status IN ('open', 'in_progress')
             AND target_resolution_at < CURRENT_TIMESTAMP
         )::integer AS overdue,
         COUNT(*) FILTER (
           WHERE status IN ('resolved', 'closed')
             AND resolved_at IS NOT NULL
             AND resolved_at <= target_resolution_at
         )::integer AS sla_met,
         COUNT(*) FILTER (
           WHERE status IN ('resolved', 'closed')
             AND (resolved_at IS NULL OR resolved_at > target_resolution_at)
         )::integer AS sla_breached,
         ROUND(
           AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600.0)
             FILTER (WHERE resolved_at IS NOT NULL)::numeric,
           1
         ) AS avg_resolution_hours
       FROM tickets`,
    ),
    pool.query(
      `SELECT priority, COUNT(*)::integer AS count
       FROM tickets
       GROUP BY priority
       ORDER BY CASE priority
         WHEN 'high' THEN 1
         WHEN 'medium' THEN 2
         WHEN 'low' THEN 3
         ELSE 4
       END`,
    ),
    pool.query(
      `SELECT c.id, c.name, COUNT(t.id)::integer AS count
       FROM categories c
       LEFT JOIN tickets t ON t.category_id = c.id
       GROUP BY c.id, c.name
       HAVING COUNT(t.id) > 0
       ORDER BY COUNT(t.id) DESC, c.name ASC
       LIMIT 5`,
    ),
  ]);

  const summary = summaryResult.rows[0];
  const completedWithSla = summary.sla_met + summary.sla_breached;
  const slaCompliancePercent = completedWithSla
    ? Math.round((summary.sla_met / completedWithSla) * 100)
    : null;

  res.json({
    analytics: {
      ...summary,
      avg_resolution_hours: summary.avg_resolution_hours === null
        ? null
        : Number(summary.avg_resolution_hours),
      sla_compliance_percent: slaCompliancePercent,
      priorities: priorityResult.rows,
      top_categories: categoryResult.rows,
    },
  });
}
