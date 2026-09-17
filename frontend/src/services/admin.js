import api from './api.js';

export async function fetchAdminUsers() {
  const { data } = await api.get('/admin/users');
  return data.users;
}

export async function updateAdminUserRole(userId, role) {
  const { data } = await api.patch(`/admin/users/${userId}/role`, { role });
  return data.user;
}
