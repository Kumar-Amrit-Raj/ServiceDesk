import axios from 'axios';

export const TOKEN_KEY = 'servicedesk_token';

const api = axios.create({ baseURL: '/api', timeout: 10000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = 'Bearer ' + token;
  return config;
});

export function getApiError(error) {
  return error.response?.data?.message || 'Unable to reach ServiceDesk. Please check your connection and try again.';
}

export default api;
