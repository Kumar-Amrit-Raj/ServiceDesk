import { useEffect, useMemo, useRef, useState } from 'react';
import { getApiError } from '../services/api.js';
import {
  createTicket,
  createTicketComment,
  fetchCategories,
  fetchSupportAgents,
  fetchTicket,
  fetchTicketComments,
  fetchTicketHistory,
  fetchTickets,
  updateTicket,
} from '../services/tickets.js';
import '../styles/dashboard.css';

const EMPTY_FORM = {
  title: '',
  description: '',
  categoryId: '',
  priority: 'medium',
};

function formatStatus(status) {
  return String(status ?? '').replace('_', ' ');
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

function historyAgentLabel(value, agents) {
  if (!value) return 'Unassigned';
  const agent = agents.find((candidate) => String(candidate.id) === String(value));
  return agent ? agent.name : `agent #${value}`;
}

function historyMessage(item, agents) {
  if (item.field_name === 'status') {
    const oldStatus = formatStatus(item.old_value).toUpperCase();
    const newStatus = formatStatus(item.new_value).toUpperCase();
    return `Status changed from ${oldStatus} to ${newStatus}.`;
  }
  if (item.field_name === 'assigned_to') {
    const oldLabel = historyAgentLabel(item.old_value, agents);
    const newLabel = historyAgentLabel(item.new_value, agents);
    if (!item.old_value && item.new_value) return `Ticket assigned to ${newLabel}.`;
    if (item.old_value && !item.new_value) return `Ticket assignment cleared from ${oldLabel}.`;
    return `Assignment changed from ${oldLabel} to ${newLabel}.`;
  }
  return `${item.field_name} updated.`;
}

export default function HomePage({ user, onLogout }) {
  const isStaff = user.role === 'support' || user.role === 'admin';
  const ticketDetailRef = useRef(null);
  const [categories, setCategories] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [filters, setFilters] = useState({ status: '', priority: '', search: '' });

  const [selectedTicket, setSelectedTicket] = useState(null);
  const [comments, setComments] = useState([]);
  const [history, setHistory] = useState([]);
  const [agents, setAgents] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [workflowForm, setWorkflowForm] = useState({ status: 'open', assignedTo: '' });

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

  useEffect(() => {
    if (!detailLoading && !selectedTicket) return;

    const frame = requestAnimationFrame(() => {
      ticketDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    return () => cancelAnimationFrame(frame);
  }, [detailLoading, selectedTicket?.id]);

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

  async function openTicket(ticketId) {
    setDetailLoading(true);
    setError('');
    setCommentText('');
    try {
      const requests = [
        fetchTicket(ticketId),
        fetchTicketComments(ticketId),
        fetchTicketHistory(ticketId),
      ];
      if (isStaff) requests.push(fetchSupportAgents());

      const [ticket, ticketComments, ticketHistory, supportAgents = []] = await Promise.all(requests);
      setSelectedTicket(ticket);
      setComments(ticketComments);
      setHistory(ticketHistory);
      setAgents(supportAgents);
      setWorkflowForm({
        status: ticket.status,
        assignedTo: ticket.assigned_to ? String(ticket.assigned_to) : '',
      });
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setDetailLoading(false);
    }
  }

  function closeTicket() {
    setSelectedTicket(null);
    setComments([]);
    setHistory([]);
    setAgents([]);
    setCommentText('');
  }

  async function handleComment(event) {
    event.preventDefault();
    if (!selectedTicket || !commentText.trim()) return;
    setCommentBusy(true);
    setError('');
    try {
      const comment = await createTicketComment(selectedTicket.id, commentText.trim());
      setComments((current) => [...current, comment]);
      setCommentText('');
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setCommentBusy(false);
    }
  }

  async function handleWorkflowUpdate(event) {
    event.preventDefault();
    if (!selectedTicket || !isStaff) return;
    setWorkflowBusy(true);
    setError('');
    try {
      const ticket = await updateTicket(selectedTicket.id, {
        status: workflowForm.status,
        assignedTo: workflowForm.assignedTo ? Number(workflowForm.assignedTo) : null,
      });
      setSelectedTicket(ticket);
      setWorkflowForm({
        status: ticket.status,
        assignedTo: ticket.assigned_to ? String(ticket.assigned_to) : '',
      });
      const [ticketHistory, refreshedTickets] = await Promise.all([
        fetchTicketHistory(ticket.id),
        loadTickets(filters),
      ]);
      setHistory(ticketHistory);
      setTickets(refreshedTickets);
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setWorkflowBusy(false);
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
                  <th>DETAIL</th>
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
                    <td>
                      <button className="ticket-view" type="button" onClick={() => openTicket(ticket.id)}>
                        VIEW
                      </button>
                    </td>
                  </tr>
                ))}
                {!loading && tickets.length === 0 && (
                  <tr><td colSpan="7" className="empty-tickets">No tickets match this view.</td></tr>
                )}
                {loading && (
                  <tr><td colSpan="7" className="empty-tickets">Loading tickets…</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {detailLoading && (
          <section className="ticket-detail-panel" ref={ticketDetailRef}>
            <p className="detail-loading">Loading ticket workspace…</p>
          </section>
        )}

        {!detailLoading && selectedTicket && (
          <section className="ticket-detail-panel" ref={ticketDetailRef}>
            <div className="ticket-detail-header">
              <div>
                <p className="desk-eyebrow">TICKET #{String(selectedTicket.id).padStart(4, '0')}</p>
                <h2>{selectedTicket.title}</h2>
              </div>
              <button className="detail-close" type="button" onClick={closeTicket}>CLOSE VIEW</button>
            </div>

            <div className="ticket-meta-grid">
              <article><span>REQUESTER</span><strong>{selectedTicket.requester_name}</strong></article>
              <article><span>CATEGORY</span><strong>{selectedTicket.category_name}</strong></article>
              <article><span>PRIORITY</span><strong className={'priority priority-' + selectedTicket.priority}>{selectedTicket.priority}</strong></article>
              <article><span>STATUS</span><strong className={'ticket-status status-' + selectedTicket.status}>{formatStatus(selectedTicket.status)}</strong></article>
              <article><span>ASSIGNEE</span><strong>{selectedTicket.assigned_to_name || 'Unassigned'}</strong></article>
              <article><span>TARGET</span><strong>{formatDate(selectedTicket.target_resolution_at)}</strong></article>
            </div>

            <div className="ticket-description-block">
              <span>DESCRIPTION</span>
              <p>{selectedTicket.description}</p>
            </div>

            {isStaff && (
              <form className="workflow-controls" onSubmit={handleWorkflowUpdate}>
                <div className="workflow-controls-heading">
                  <div>
                    <p className="desk-eyebrow">SUPPORT ACTIONS</p>
                    <h3>Manage workflow</h3>
                  </div>
                  <span>Changes are recorded in ticket history.</span>
                </div>
                <div className="workflow-fields">
                  <label>
                    Status
                    <select
                      value={workflowForm.status}
                      onChange={(event) => setWorkflowForm({ ...workflowForm, status: event.target.value })}
                    >
                      <option value="open">Open</option>
                      <option value="in_progress">In progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                  </label>
                  <label>
                    Assign to
                    <select
                      value={workflowForm.assignedTo}
                      onChange={(event) => setWorkflowForm({ ...workflowForm, assignedTo: event.target.value })}
                    >
                      <option value="">Unassigned</option>
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>{agent.name} · {agent.role}</option>
                      ))}
                    </select>
                  </label>
                  <button className="desk-primary" type="submit" disabled={workflowBusy}>
                    {workflowBusy ? 'SAVING…' : 'SAVE CHANGES'}
                  </button>
                </div>
              </form>
            )}

            <div className="ticket-detail-columns">
              <section className="comments-panel">
                <div className="detail-section-heading">
                  <div>
                    <p className="desk-eyebrow">CONVERSATION</p>
                    <h3>Comments</h3>
                  </div>
                  <span>{comments.length}</span>
                </div>

                <div className="comment-list">
                  {comments.length === 0 && <p className="detail-empty">No comments yet.</p>}
                  {comments.map((comment) => (
                    <article className="comment-item" key={comment.id}>
                      <div>
                        <strong>{comment.author_name}</strong>
                        <span>{comment.author_role} · {formatDate(comment.created_at)}</span>
                      </div>
                      <p>{comment.message}</p>
                    </article>
                  ))}
                </div>

                <form className="comment-form" onSubmit={handleComment}>
                  <textarea
                    required
                    maxLength={2000}
                    rows={3}
                    value={commentText}
                    onChange={(event) => setCommentText(event.target.value)}
                    placeholder="Add a useful update or troubleshooting note…"
                  />
                  <button className="desk-primary" type="submit" disabled={commentBusy || !commentText.trim()}>
                    {commentBusy ? 'POSTING…' : 'ADD COMMENT'}
                  </button>
                </form>
              </section>

              <section className="history-panel">
                <div className="detail-section-heading">
                  <div>
                    <p className="desk-eyebrow">ACTIVITY</p>
                    <h3>Ticket history</h3>
                  </div>
                  <span>{history.length}</span>
                </div>
                <div className="history-list">
                  {history.length === 0 && <p className="detail-empty">No workflow changes yet.</p>}
                  {history.map((item) => (
                    <article className="history-item" key={item.id}>
                      <span className="history-mark" aria-hidden="true" />
                      <div>
                        <strong>{historyMessage(item, agents)}</strong>
                        <span>{item.changed_by_name} · {formatDate(item.created_at)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
