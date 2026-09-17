import api from './api.js';

export async function fetchCategories() {
  const { data } = await api.get('/categories');
  return data.categories;
}

export async function fetchTickets(params = {}) {
  const { data } = await api.get('/tickets', { params });
  return data.tickets;
}

export async function checkDuplicateTickets(payload) {
  const { data } = await api.post('/tickets/duplicate-check', payload);
  return data.matches;
}

export async function fetchSolutionSuggestions(payload) {
  const { data } = await api.post('/tickets/solution-suggestions', payload);
  return data.suggestions;
}

export async function createTicket(payload) {
  const { data } = await api.post('/tickets', payload);
  return data.ticket;
}

export async function fetchTicket(ticketId) {
  const { data } = await api.get(`/tickets/${ticketId}`);
  return data.ticket;
}

export async function fetchTicketComments(ticketId) {
  const { data } = await api.get(`/tickets/${ticketId}/comments`);
  return data.comments;
}

export async function createTicketComment(ticketId, message) {
  const { data } = await api.post(`/tickets/${ticketId}/comments`, { message });
  return data.comment;
}

export async function fetchTicketHistory(ticketId) {
  const { data } = await api.get(`/tickets/${ticketId}/history`);
  return data.history;
}

export async function fetchSupportAgents() {
  const { data } = await api.get('/tickets/support-agents');
  return data.agents;
}

export async function updateTicket(ticketId, payload) {
  const { data } = await api.patch(`/tickets/${ticketId}`, payload);
  return data.ticket;
}


export async function fetchTicketAnalytics() {
  const { data } = await api.get('/tickets/analytics');
  return data.analytics;
}
