import { useEffect, useMemo, useState } from 'react';
import { getApiError } from '../services/api.js';
import { createTicket, fetchCategories, fetchTickets } from '../services/tickets.js';

const EMPTY_FORM = {
  title: '',
  description: '',
  categoryId: '',
  priority: 'medium',
};

function formatStatus(status) {
  return status.replace('_', ' ');
}

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export default function HomePage({ user, onLogout }) {
  const [categories, setCategories] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [filters, setFilters] = useState({ status: '', priority: '', search: '' });

  async function loadTickets(nextFilters = filters) {
    const params = {};
    if (nextFilters.status) params.status = nextFilters.status;
    if (nextFilters.priority) params.priority = nextFilters.priority;
    if (nextFilters.search.trim()) params.search = nextFilters.search.trim();
    return fetchTickets(params);
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    Promise.all([fetchCategories(), fetchTickets()])
      .then(([categoryData, ticketData]) => {
        if (!active) return;
        setCategories(categoryData);
        setTickets(ticketData);
      })
      .catch((requestError) => {
        if (active) setError(getApiError(requestError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, []);

  const stats = useMemo(() => ({
    open: tickets.filter((ticket) => ticket.status === 'open').length,
    inProgress: tickets.filter((ticket) => ticket.status === 'in_progress').length,
    resolved: tickets.filter((ticket) => ['resolved', 'closed'].includes(ticket.status)).length,
  }), [tickets]);

  async function handleCreate(event) {
    event.preventDefault();
    setCreating(true);
    setError('');
    try {
      const ticket = await createTicket({
        title: form.title,
        description: form.description,
        categoryId: Number(form.categoryId),
        priority: form.priority,
      });
      setTickets((current) => [ticket, ...current]);
      setForm(EMPTY_FORM);
      setShowCreate(false);
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setCreating(false);
    }
  }

  async function applyFilters(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      setTickets(await loadTickets(filters));
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setLoading(false);
    }
  }

  async function clearFilters() {
    const cleared = { status: '', priority: '', search: '' };
    setFilters(cleared);
    setLoading(true);
    setError('');
    try {
      setTickets(await loadTickets(cleared));
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="desk-page">
      <header className="desk-header">
        <div className="desk-brand">
          <strong>ServiceDesk</strong>
          <span>IT SUPPORT WORKSPACE</span>
        </div>
        <div className="desk-user">
          <div>
            <strong>{user.name}</strong>
            <span>{user.role}</span>
          </div>
          <button className="desk-logout" onClick={onLogout}>LOG OUT</button>
        </div>
      </header>

      <section className="desk-content">
        <div className="desk-hero">
          <div>
            <p className="desk-eyebrow">REQUEST QUEUE</p>
            <h1>{user.role === 'user' ? 'My support tickets' : 'Support queue'}</h1>
            <p>Track requests, priorities and target resolution times from one workspace.</p>
          </div>
          <button className="desk-primary" onClick={() => setShowCreate((value) => !value)}>
            {showCreate ? 'CANCEL' : '+ NEW TICKET'}
          </button>
        </div>

        <section className="desk-stats" aria-label="Ticket summary">
          <article><span>OPEN</span><strong>{stats.open}</strong></article>
          <article><span>IN PROGRESS</span><strong>{stats.inProgress}</strong></article>
          <article><span>RESOLVED / CLOSED</span><strong>{stats.resolved}</strong></article>
          <article><span>TOTAL</span><strong>{tickets.length}</strong></article>
        </section>

        {error && <p className="desk-error" role="alert">{error}</p>}

        {showCreate && (
          <section className="ticket-create-panel">
            <div className="panel-heading">
              <div>
                <p className="desk-eyebrow">NEW REQUEST</p>
                <h2>Create support ticket</h2>
              </div>
              <span>High 12h · Medium 24h · Low 48h</span>
            </div>
            <form className="ticket-create-form" onSubmit={handleCreate}>
              <label>
                Subject
                <input
                  required
                  maxLength={200}
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  placeholder="e.g. Unable to connect to campus Wi-Fi"
                />
              </label>
              <div className="ticket-form-row">
                <label>
                  Category
                  <select
                    required
                    value={form.categoryId}
                    onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
                  >
                    <option value="">Choose category</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Priority
                  <select
                    value={form.priority}
                    onChange={(event) => setForm({ ...form, priority: event.target.value })}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </label>
              </div>
              <label>
                Description
                <textarea
                  required
                  rows={5}
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  placeholder="Describe what happened, what you expected, and any troubleshooting already tried."
                />
              </label>
              <button className="desk-primary" type="submit" disabled={creating}>
                {creating ? 'CREATING…' : 'CREATE TICKET'}
              </button>
            </form>
          </section>
        )}

        <section className="ticket-panel">
          <div className="ticket-panel-top">
            <div>
              <p className="desk-eyebrow">TICKETS</p>
              <h2>{user.role === 'user' ? 'Your requests' : 'All requests'}</h2>
            </div>
            <form className="ticket-filters" onSubmit={applyFilters}>
              <input
                aria-label="Search tickets"
                placeholder="Search tickets"
                value={filters.search}
                onChange={(event) => setFilters({ ...filters, search: event.target.value })}
              />
              <select
                aria-label="Filter by status"
                value={filters.status}
                onChange={(event) => setFilters({ ...filters, status: event.target.value })}
              >
                <option value="">All statuses</option>
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
              <select
                aria-label="Filter by priority"
                value={filters.priority}
                onChange={(event) => setFilters({ ...filters, priority: event.target.value })}
              >
                <option value="">All priorities</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <button type="submit">APPLY</button>
              <button type="button" className="filter-clear" onClick={clearFilters}>CLEAR</button>
            </form>
          </div>

          <div className="ticket-table-wrap">
            <table className="ticket-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>SUBJECT</th>
                  <th>CATEGORY</th>
                  <th>PRIORITY</th>
                  <th>STATUS</th>
                  <th>TARGET</th>
                </tr>
              </thead>
              <tbody>
                {!loading && tickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td className="ticket-id">#{String(ticket.id).padStart(4, '0')}</td>
                    <td>
                      <strong>{ticket.title}</strong>
                      {user.role !== 'user' && <span className="ticket-requester">{ticket.requester_name}</span>}
                    </td>
                    <td>{ticket.category_name}</td>
                    <td><span className={'priority priority-' + ticket.priority}>{ticket.priority}</span></td>
                    <td><span className={'ticket-status status-' + ticket.status}>{formatStatus(ticket.status)}</span></td>
                    <td>{formatDate(ticket.target_resolution_at)}</td>
                  </tr>
                ))}
                {!loading && tickets.length === 0 && (
                  <tr><td colSpan="6" className="empty-tickets">No tickets match this view.</td></tr>
                )}
                {loading && (
                  <tr><td colSpan="6" className="empty-tickets">Loading tickets…</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </main>
  );
}
