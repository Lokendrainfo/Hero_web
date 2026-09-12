import api from './api';

export const authService = {
  login: async (username, password) => {
    return api.post('/auth/login/', { username, password });
  },
  getMe: async () => {
    return api.get('/auth/me/');
  },
  logout: async () => {
    const refreshToken = localStorage.getItem('refresh_token');
    return api.post('/auth/logout/', { refresh_token: refreshToken });
  },
  forgotPassword: async (email) => {
    return api.post('/auth/forgot-password/', { email });
  }
};
