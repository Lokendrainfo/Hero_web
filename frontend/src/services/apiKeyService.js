import api from './api';

export const apiKeyService = {
  getApiKey: () => api.get('/auth/api-key/'),
  rotateApiKey: () => api.post('/auth/api-key/', { action: 'rotate' }),
  toggleApiKey: () => api.post('/auth/api-key/', { action: 'toggle' }),
  saveWebhook: (webhook_url, webhook_enabled) =>
    api.post('/auth/api-key/', { action: 'webhook_save', webhook_url, webhook_enabled }),
  rotateWebhookSecret: () => api.post('/auth/api-key/', { action: 'webhook_rotate_secret' }),
  testWebhook: (webhook_url) => api.post('/auth/api-key/', { action: 'webhook_test', webhook_url }),
};
