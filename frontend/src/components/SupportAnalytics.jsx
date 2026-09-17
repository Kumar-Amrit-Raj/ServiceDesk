import { useEffect, useState } from 'react';
import { getApiError } from '../services/api.js';
import { fetchTicketAnalytics } from '../services/tickets.js';
import '../styles/support-analytics.css';

function metric(value, fallback = '—') {
  return value === null || value === undefined ? fallback : value;
}

export default function SupportAnalytics({ refreshKey = 0 }) {
  const [analytics, setAnalytics] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setError('');

    fetchTicketAnalytics()
      .then((data) => {
        if (active) setAnalytics(data);
      })
      .catch((requestError) => {
        if (active) setError(getApiError(requestError));
      });

    return () => {
      active = false;
    };
  }, [refreshKey]);

  if (error) {
    return <p className="desk-error" role="alert">{error}</p>;
  }

  if (!analytics) {
    return (
      <section className="support-analytics-panel">
        <p className="support-analytics-loading">Loading support analytics…</p>
      </section>
    );
  }

  const maxPriority = Math.max(1, ...analytics.priorities.map((item) => item.count));
  const maxCategory = Math.max(1, ...analytics.top_categories.map((item) => item.count));

  return (
    <section className="support-analytics-panel" aria-labelledby="support-analytics-title">
      <div className="support-analytics-heading">
        <div>
          <p className="desk-eyebrow">OPERATIONS</p>
          <h2 id="support-analytics-title">Support analytics</h2>
          <p>Live operational metrics across all ServiceDesk tickets.</p>
        </div>
      </div>

      <div className="support-analytics-metrics">
        <article>
          <span>TOTAL TICKETS</span>
          <strong>{analytics.total}</strong>
          <small>{analytics.open} open · {analytics.in_progress} in progress</small>
        </article>
        <article>
          <span>SLA COMPLIANCE</span>
          <strong>{metric(analytics.sla_compliance_percent, '—')}{analytics.sla_compliance_percent === null ? '' : '%'}</strong>
          <small>{analytics.sla_met} met · {analytics.sla_breached} breached</small>
        </article>
        <article>
          <span>AVG RESOLUTION</span>
          <strong>{metric(analytics.avg_resolution_hours)}{analytics.avg_resolution_hours === null ? '' : 'h'}</strong>
          <small>Across resolved tickets</small>
        </article>
        <article>
          <span>OVERDUE NOW</span>
          <strong>{analytics.overdue}</strong>
          <small>Open or in-progress past SLA</small>
        </article>
      </div>

      <div className="support-analytics-breakdowns">
        <section>
          <h3>Tickets by priority</h3>
          <div className="analytics-bars">
            {analytics.priorities.map((item) => (
              <div className="analytics-bar-row" key={item.priority}>
                <div>
                  <span>{item.priority}</span>
                  <strong>{item.count}</strong>
                </div>
                <div className="analytics-track">
                  <span style={{ width: `${Math.max(8, (item.count / maxPriority) * 100)}%` }} />
                </div>
              </div>
            ))}
            {analytics.priorities.length === 0 && <p>No ticket data yet.</p>}
          </div>
        </section>

        <section>
          <h3>Top categories</h3>
          <div className="analytics-bars">
            {analytics.top_categories.map((item) => (
              <div className="analytics-bar-row" key={item.id}>
                <div>
                  <span>{item.name}</span>
                  <strong>{item.count}</strong>
                </div>
                <div className="analytics-track">
                  <span style={{ width: `${Math.max(8, (item.count / maxCategory) * 100)}%` }} />
                </div>
              </div>
            ))}
            {analytics.top_categories.length === 0 && <p>No category data yet.</p>}
          </div>
        </section>
      </div>
    </section>
  );
}
