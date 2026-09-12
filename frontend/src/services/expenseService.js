import api from './api';

export const expenseService = {
  getAll: (params) => api.get('/expenses/', { params }),
  getById: (id) => api.get(`/expenses/${id}/`),
  create: (data) => {
    if (data instanceof FormData) {
      return api.post('/expenses/', data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    }
    return api.post('/expenses/', data);
  },
  update: (id, data) => {
    if (data instanceof FormData) {
      return api.patch(`/expenses/${id}/`, data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    }
    return api.patch(`/expenses/${id}/`, data);
  },
  delete: (id) => api.delete(`/expenses/${id}/`),
  getCategories: (params) => api.get('/expenses/categories/', { params: { page_size: 200, all: 'true', ...params } }),
  createCategory: (data) => api.post('/expenses/categories/', data),
  updateCategory: (id, data) => api.patch(`/expenses/categories/${id}/`, data),
  deleteCategory: (id) => api.delete(`/expenses/categories/${id}/`),
  getSubcategories: (params) => api.get('/expenses/subcategories/', { params: { page_size: 300, all: 'true', ...params } }),
  createSubcategory: (data) => api.post('/expenses/subcategories/', data),
  updateSubcategory: (id, data) => api.patch(`/expenses/subcategories/${id}/`, data),
  deleteSubcategory: (id) => api.delete(`/expenses/subcategories/${id}/`),
  getDashboardStats: (params) => api.get('/expenses/dashboard_stats/', { params }),
  submit: (id) => api.post(`/expenses/${id}/submit/`),
  approve: (id) => api.post(`/expenses/${id}/approve/`),
  reject: (id, reason) => api.post(`/expenses/${id}/reject/`, { reason }),
  pay: (id, paymentData) => api.post(`/expenses/${id}/pay/`, paymentData),
  exportExpenses: (params) => api.get('/expenses/export/', { params, responseType: 'blob' }),
};
