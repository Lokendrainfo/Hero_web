import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export const extractErrorMessage = (errorData) => {
  if (!errorData) return 'An unexpected error occurred. Please try again.';
  if (typeof errorData === 'string') return errorData;
  if (typeof errorData.message === 'string') return errorData.message;
  if (typeof errorData.detail === 'string') return errorData.detail;
  if (errorData.detail && typeof errorData.detail === 'object') {
    if (typeof errorData.detail.string === 'string') return errorData.detail.string;
    if (typeof errorData.detail.message === 'string') return errorData.detail.message;
  }
  if (errorData.messages && Array.isArray(errorData.messages) && errorData.messages.length > 0) {
    const msgObj = errorData.messages[0];
    if (typeof msgObj.message === 'string') return msgObj.message;
  }
  if (typeof errorData.error === 'string') return errorData.error;
  return 'Invalid credentials or request failed.';
};

api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalRequest = error.config;
    const isAuthEndpoint = originalRequest?.url?.includes('/auth/login') || originalRequest?.url?.includes('/auth/refresh-token');

    if (error.response?.status === 401) {
      if (!originalRequest._retry && !isAuthEndpoint) {
        originalRequest._retry = true;
        const refreshToken = localStorage.getItem('refresh_token');
        if (refreshToken) {
          try {
            const res = await axios.post(`${API_BASE_URL}/auth/refresh-token/`, { refresh: refreshToken });
            if (res.data?.access) {
              localStorage.setItem('access_token', res.data.access);
              originalRequest.headers['Authorization'] = `Bearer ${res.data.access}`;
              return api(originalRequest);
            }
          } catch (err) {
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            window.location.href = '/login';
          }
        } else {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
        }
      } else if (isAuthEndpoint) {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
      }
    }

    const errData = error.response?.data || error;
    const cleanMsg = extractErrorMessage(errData);
    if (typeof errData === 'object' && errData !== null) {
      errData.message = cleanMsg;
    }
    return Promise.reject(errData);
  }
);

export default api;
