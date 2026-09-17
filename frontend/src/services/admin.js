import api from './api.js';

export async function fetchAdminUsers() {
  const { data } = await api.get('/admin/users');
  return data.users;
}

export async function updateAdminUserRole(userId, role) {
  const { data } = await api.patch(`/admin/users/${userId}/role`, { role });
  return data.user;
}


export async function fetchAdminCategories() {
  const { data } = await api.get('/admin/categories');
  return data.categories;
}

export async function createAdminCategory(name) {
  const { data } = await api.post('/admin/categories', { name });
  return data.category;
}

export async function updateAdminCategory(categoryId, payload) {
  const { data } = await api.patch(`/admin/categories/${categoryId}`, payload);
  return data.category;
}
