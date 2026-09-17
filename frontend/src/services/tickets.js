import api from './api.js';

export async function fetchCategories() {
  const { data } = await api.get('/categories');
  return data.categories;
}

export async function fetchTickets(params = {}) {
  const { data } = await api.get('/tickets', { params });
  return data.tickets;
}

export async function createTicket(payload) {
  const { data } = await api.post('/tickets', payload);
  return data.ticket;
}
