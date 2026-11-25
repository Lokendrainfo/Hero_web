import axios from 'axios';
import { extractErrorMessage } from './api';

const HERO_API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';
export const PM_API_BASE_URL = import.meta.env.VITE_PM_API_BASE_URL || '/pm-api/v1';

const pmApi = axios.create({
  baseURL: PM_API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

pmApi.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

pmApi.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken) {
        try {
          const res = await axios.post(`${HERO_API_BASE_URL}/auth/refresh-token/`, { refresh: refreshToken });
          if (res.data?.access) {
            localStorage.setItem('access_token', res.data.access);
            originalRequest.headers['Authorization'] = `Bearer ${res.data.access}`;
            return pmApi(originalRequest);
          }
        } catch (err) {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          window.location.href = '/login';
        }
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

/**
 * Resolves a protected photo view URL (e.g. "/api/v1/pm/photos/12/view/") into an authenticated Blob Object URL.
 */
export const fetchProtectedPhotoBlobUrl = async (viewUrl) => {
  if (!viewUrl) return '';
  if (viewUrl.startsWith('blob:') || viewUrl.startsWith('data:')) return viewUrl;
  const relPath = viewUrl.replace(/^\/?api\/v1/, '');
  const blob = await pmApi.get(relPath, { responseType: 'blob' });
  return URL.createObjectURL(blob);
};

export default pmApi;

