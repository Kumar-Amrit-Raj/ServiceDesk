import { useEffect, useMemo, useRef, useState } from 'react';
import { getApiError } from '../services/api.js';
import AdminUserManagement from '../components/AdminUserManagement.jsx';
import AdminCategoryManagement from '../components/AdminCategoryManagement.jsx';
import SupportAnalytics from '../components/SupportAnalytics.jsx';
import {
  checkDuplicateTickets,
  createTicket,
  createTicketComment,
  fetchCategories,
  fetchSolutionSuggestions,
  fetchSupportAgents,
  fetchTicket,
  fetchTicketComments,
  fetchTicketHistory,
  fetchTickets,
  updateTicket,
} from '../services/tickets.js';
import '../styles/dashboard.css';
import '../styles/sla.css';
import '../styles/duplicate-warning.css';
import '../styles/solution-suggestions.css';

const EMPTY_FORM = {
  title: '',
  description: '',
  categoryId: '',
  priority: 'medium',
};

const EMPTY_FILTERS = { status: '', priority: '', sla: '', search: '' };

function formatStatus(status) {
  return String(status ?? '').replace('_', ' ');
}

function formatSlaState(state) {
  return String(state ?? '').replace('_', ' ');
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

function formatSlaTime(minutes) {
  if (!Number.isFinite(Number(minutes))) return '';
  const absolute = Math.abs(Number(minutes));
  const hours = Math.floor(absolute / 60);
  const mins = absolute % 60;
  const duration = hours ? `${hours}h${mins ? ` ${mins}m` : ''}` : `${mins}m`;
  return Number(minutes) < 0 ? `${duration} overdue` : `${duration} remaining`;
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
  const [duplicateMatches, setDuplicateMatches] = useState([]);
  const [solutionSuggestions, setSolutionSuggestions] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);

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
    if (nextFilters.sla) params.sla = nextFilters.sla;
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

  const slaStats = useMemo(() => ({
    overdue: tickets.filter((ticket) => ticket.sla_state === 'overdue').length,
    dueSoon: tickets.filter((ticket) => ticket.sla_state === 'due_soon').length,
  }), [tickets]);

  function clearCreateSuggestions() {
    setDuplicateMatches([]);
    setSolutionSuggestions([]);
  }

  function updateCreateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    clearCreateSuggestions();
  }

  function currentTicketPayload() {
    return {
      title: form.title,
      description: form.description,
      categoryId: Number(form.categoryId),
      priority: form.priority,
    };
  }

  async function createCurrentTicket() {
    const ticket = await createTicket(currentTicketPayload());
    setTickets((current) => [ticket, ...current]);
    setForm(EMPTY_FORM);
    clearCreateSuggestions();
    setShowCreate(false);
  }

  async function handleCreate(event) {
    event.preventDefault();
    setCreating(true);
    setError('');
    try {
      const payload = currentTicketPayload();
      const [matches, suggestions] = await Promise.all([
        checkDuplicateTickets(payload),
        fetchSolutionSuggestions(payload),
      ]);
      setDuplicateMatches(matches);
      setSolutionSuggestions(suggestions);
      if (matches.length || suggestions.length) return;
      await createCurrentTicket();
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setCreating(false);
    }
  }

  async function createAfterReview() {
    setCreating(true);
    setError('');
    try {
      await createCurrentTicket();
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
    setFilters(EMPTY_FILTERS);
    setLoading(true);
    setError('');
    try {
      setTickets(await loadTickets(EMPTY_FILTERS));
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
          <button
            className="desk-primary"
            onClick={() => {
              setShowCreate((value) => !value);
              clearCreateSuggestions();
            }}
          >
            {showCreate ? 'CANCEL' : '+ NEW TICKET'}
          </button>
        </div>

        <section className="desk-stats" aria-label="Ticket summary">
          <article><span>OPEN</span><strong>{stats.open}</strong></article>
          <article><span>IN PROGRESS</span><strong>{stats.inProgress}</strong></article>
          <article><span>RESOLVED / CLOSED</span><strong>{stats.resolved}</strong></article>
          <article><span>TOTAL</span><strong>{tickets.length}</strong></article>
        </section>

        {isStaff && <SupportAnalytics refreshKey={tickets.map((ticket) => `${ticket.id}:${ticket.status}:${ticket.assigned_to ?? ''}`).join('|')} />}

        {user.role === 'admin' && (
          <>
            <AdminUserManagement currentUserId={user.id} />
            <AdminCategoryManagement
              onCategoriesChanged={async () => {
                setCategories(await fetchCategories());
              }}
            />
          </>
        )}

        {(slaStats.overdue > 0 || slaStats.dueSoon > 0) && (
          <section className="sla-watch" aria-label="SLA watch">
            <div>
              <span className="sla-watch-label">SLA WATCH</span>
              <strong>{slaStats.overdue} overdue</strong>
              <span>{slaStats.dueSoon} due soon</span>
            </div>
            <p>Due soon means the target resolution time is within the next 4 hours.</p>
          </section>
        )}

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
                  onChange={(event) => updateCreateField('title', event.target.value)}
                  placeholder="e.g. Unable to connect to campus Wi-Fi"
                />
              </label>
              <div className="ticket-form-row">
                <label>
                  Category
                  <select
                    required
                    value={form.categoryId}
                    onChange={(event) => updateCreateField('categoryId', event.target.value)}
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
                    onChange={(event) => updateCreateField('priority', event.target.value)}
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
                  onChange={(event) => updateCreateField('description', event.target.value)}
                  placeholder="Describe what happened, what you expected, and any troubleshooting already tried."
                />
              </label>

              {duplicateMatches.length > 0 && (
                <section className="duplicate-warning" aria-label="Potential duplicate tickets">
                  <div className="duplicate-warning-heading">
                    <div>
                      <span>POSSIBLE DUPLICATE</span>
                      <h3>Similar active tickets already exist</h3>
                    </div>
                    <strong>{duplicateMatches.length} match{duplicateMatches.length === 1 ? '' : 'es'}</strong>
                  </div>
                  <p className="duplicate-warning-copy">
                    Review the existing request before opening another ticket. Matching is based on category and shared keywords.
                  </p>
                  <div className="duplicate-match-list">
                    {duplicateMatches.map((match) => (
                      <article className="duplicate-match" key={match.id}>
                        <div>
                          <span>#{String(match.id).padStart(4, '0')} · {match.match_percent}% match</span>
                          <strong>{match.title}</strong>
                          <small>{formatStatus(match.status).toUpperCase()} · {match.category_name}</small>
                          {match.matched_keywords.length > 0 && (
                            <small>Shared keywords: {match.matched_keywords.join(', ')}</small>
                          )}
                        </div>
                        <button type="button" onClick={() => openTicket(match.id)}>VIEW</button>
                      </article>
                    ))}
                  </div>
                  <div className="duplicate-warning-actions">
                    <span>Create another ticket only if this is a separate issue.</span>
                    {solutionSuggestions.length === 0 && (
                      <button type="button" onClick={createAfterReview} disabled={creating}>
                        {creating ? 'CREATING…' : 'CREATE ANYWAY'}
                      </button>
                    )}
                  </div>
                </section>
              )}

              {solutionSuggestions.length > 0 && (
                <section className="solution-suggestions" aria-label="Previous resolved ticket suggestions">
                  <div className="solution-suggestions-heading">
                    <div>
                      <span>PREVIOUS SOLUTION</span>
                      <h3>Similar resolved tickets may help</h3>
                    </div>
                    <strong>{solutionSuggestions.length} suggestion{solutionSuggestions.length === 1 ? '' : 's'}</strong>
                  </div>
                  <p className="solution-suggestions-copy">
                    Review a previous resolution before opening a new request. Suggestions use the same category and shared keywords.
                  </p>
                  <div className="solution-suggestion-list">
                    {solutionSuggestions.map((suggestion) => (
                      <article className="solution-suggestion" key={suggestion.id}>
                        <div className="solution-suggestion-main">
                          <span>#{String(suggestion.id).padStart(4, '0')} · {suggestion.match_percent}% match</span>
                          <strong>{suggestion.title}</strong>
                          <small>{formatStatus(suggestion.status).toUpperCase()} · {suggestion.category_name}</small>
                          {suggestion.resolution_note && (
                            <div className="solution-note">
                              <span>LAST SUPPORT NOTE</span>
                              <p>{suggestion.resolution_note}</p>
                            </div>
                          )}
                          {suggestion.matched_keywords.length > 0 && (
                            <small>Shared keywords: {suggestion.matched_keywords.join(', ')}</small>
                          )}
                        </div>
                        <button type="button" onClick={() => openTicket(suggestion.id)}>VIEW</button>
                      </article>
                    ))}
                  </div>
                  <div className="solution-suggestions-actions">
                    <span>Try the previous resolution first if it applies. Create a new ticket if the issue remains.</span>
                    <button type="button" onClick={createAfterReview} disabled={creating}>
                      {creating ? 'CREATING…' : 'CREATE ANYWAY'}
                    </button>
                  </div>
                </section>
              )}

              <button className="desk-primary" type="submit" disabled={creating}>
                {creating ? 'CHECKING…' : 'CHECK & CREATE TICKET'}
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
              <select
                aria-label="Filter by SLA state"
                value={filters.sla}
                onChange={(event) => setFilters({ ...filters, sla: event.target.value })}
              >
                <option value="">All SLA states</option>
                <option value="on_track">On track</option>
                <option value="due_soon">Due soon</option>
                <option value="overdue">Overdue</option>
                <option value="met">Met</option>
                <option value="breached">Breached</option>
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
                  <th>TARGET / SLA</th>
                  <th>DETAIL</th>
                </tr>
              </thead>
              <tbody>
                {!loading && tickets.map((ticket) => (
                  <tr key={ticket.id} className={ticket.sla_state === 'overdue' ? 'ticket-row-overdue' : ''}>
                    <td className="ticket-id">#{String(ticket.id).padStart(4, '0')}</td>
                    <td>
                      <strong>{ticket.title}</strong>
                      {user.role !== 'user' && <span className="ticket-requester">{ticket.requester_name}</span>}
                    </td>
                    <td>{ticket.category_name}</td>
                    <td><span className={'priority priority-' + ticket.priority}>{ticket.priority}</span></td>
                    <td><span className={'ticket-status status-' + ticket.status}>{formatStatus(ticket.status)}</span></td>
                    <td>
                      <div className="sla-target-cell">
                        <span>{formatDate(ticket.target_resolution_at)}</span>
                        <div>
                          <span className={'sla-badge sla-' + ticket.sla_state}>{formatSlaState(ticket.sla_state)}</span>
                          <small>{formatSlaTime(ticket.sla_minutes_remaining)}</small>
                        </div>
                      </div>
                    </td>
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
              <article className="ticket-meta-sla">
                <span>TARGET / SLA</span>
                <strong>{formatDate(selectedTicket.target_resolution_at)}</strong>
                <div>
                  <span className={'sla-badge sla-' + selectedTicket.sla_state}>{formatSlaState(selectedTicket.sla_state)}</span>
                  <small>{formatSlaTime(selectedTicket.sla_minutes_remaining)}</small>
                </div>
              </article>
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
