import axios from 'axios';

// Force production to use same-origin relative path
// NEVER use localhost in production - always use /api
const getApiBaseUrl = () => {
  // In production (when not on localhost), always use /api
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  
  if (!isLocalhost) {
    // Production: always use same-origin relative path
    return '/api';
  }
  
  // Development: check env var, but default to /api
  if (process.env.REACT_APP_API_URL && !process.env.REACT_APP_API_URL.includes('localhost')) {
    return process.env.REACT_APP_API_URL;
  }
  
  // Default to /api even in development (proxy will handle it)
  return '/api';
};

let API_BASE_URL = getApiBaseUrl();

// Safety check: NEVER allow localhost in production builds
if (API_BASE_URL.includes('localhost') && window.location.hostname !== 'localhost') {
  console.error('ERROR: localhost API URL detected in production! Forcing /api');
  API_BASE_URL = '/api';
}

console.log('API Base URL configured:', API_BASE_URL, '(hostname:', window.location.hostname + ')');

const http = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
http.interceptors.request.use(
  (config) => {
    // Attach admin key for write operations when in admin mode
    try {
      const role = localStorage.getItem('role');
      const adminKey = localStorage.getItem('adminKey');
      const isWrite = (config.method || '').toUpperCase() === 'POST' || (config.method || '').toUpperCase() === 'PUT' || (config.method || '').toUpperCase() === 'DELETE';
      if (role === 'admin' && adminKey && isWrite) {
        config.headers['x-admin-key'] = adminKey;
      }
    } catch (_) {}
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
http.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const data = error.response?.data;
    let message = error.message;
    if (data) {
      if (typeof data === 'string') message = data;
      else if (data.error) message = data.error;
      else if (Array.isArray(data.errors)) message = data.errors.map(e => e.msg).join('; ');
      else message = JSON.stringify(data);
    }
    console.error('API Error:', message);
    return Promise.reject({ message });
  }
);

// Interns API
export const internsAPI = {
  getAll: (params = {}) => http.get('/interns', { params }),
  getById: (id) => http.get(`/interns/${id}`),
  create: (data) => http.post('/interns', data),
  update: (id, data) => http.put(`/interns/${id}`, data),
  delete: (id) => http.delete(`/interns/${id}`),
  extend: (id, data) => http.post(`/interns/${id}/extend`, data),
  getSchedule: (id) => http.get(`/interns/${id}/schedule`),
};

// Units API
export const unitsAPI = {
  getAll: (params = {}) => http.get('/units', { params }),
  getById: (id) => http.get(`/units/${id}`),
  create: (data) => http.post('/units', data),
  update: (id, data) => http.put(`/units/${id}`, data),
  delete: (id) => http.delete(`/units/${id}`),
  updateWorkload: (id, data) => http.post(`/units/${id}/workload`, data),
  updatePatientCount: (id, data) => http.post(`/units/${id}/patient-count`, data),
  getWorkloadHistory: (id, limit = 12) => http.get(`/units/${id}/workload-history`, { params: { limit } }),
};

// Rotations API
export const rotationsAPI = {
  getAll: (params = {}) => http.get('/rotations', { params }),
  getCurrent: () => http.get('/rotations/current'),
  create: (data) => http.post('/rotations', data),
  update: (id, data) => http.put(`/rotations/${id}`, data),
  delete: (id) => http.delete(`/rotations/${id}`),
  generate: (startDate) => http.post('/rotations/generate', { start_date: startDate }),
};

// Reports API
export const reportsAPI = {
  getSummary: (params = {}) => http.get('/reports/summary', { params }),
  getMonthlySchedule: (month, year) => http.get('/reports/monthly-schedule', { 
    params: { month, year } 
  }),
  getInternProgress: (params = {}) => http.get('/reports/intern-progress', { params }),
  exportExcel: (type, params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    const url = `${API_BASE_URL}/reports/export/excel?type=${type}&${queryString}`;
    window.open(url, '_blank');
  },
  exportPDF: (type, params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    const url = `${API_BASE_URL}/reports/export/pdf?type=${type}&${queryString}`;
    window.open(url, '_blank');
  },
};

// Settings API
export const settingsAPI = {
  getAll: () => http.get('/settings'),
  getByKey: (key) => http.get(`/settings/${key}`),
  update: (key, value) => http.put(`/settings/${key}`, { value }),
  create: (data) => http.post('/settings', data),
  delete: (key) => http.delete(`/settings/${key}`),
  getBatchSchedule: () => http.get('/settings/batch-schedule'),
  updateBatchSchedule: (data) => http.put('/settings/batch-schedule', data),
  getSystemInfo: () => http.get('/settings/system-info'),
  getWorkloadThresholds: () => http.get('/settings/workload-thresholds'),
  updateWorkloadThresholds: (data) => http.put('/settings/workload-thresholds', data),
  getCoverageRules: () => http.get('/settings/coverage-rules'),
  updateCoverageRules: (data) => http.put('/settings/coverage-rules', data),
  getAutoGeneration: () => http.get('/settings/auto-generation'),
  updateAutoGeneration: (data) => http.put('/settings/auto-generation', data),
  getNotifications: () => http.get('/settings/notifications'),
  updateNotifications: (data) => http.put('/settings/notifications', data),
  getNotificationTemplates: () => http.get('/settings/notification-templates'),
  updateNotificationTemplates: (data) => http.put('/settings/notification-templates', data),
  getExportFormat: () => http.get('/settings/export-format'),
  updateExportFormat: (data) => http.put('/settings/export-format', data),
  createBackup: (type = 'full') => http.post('/settings/backup', { type }),
  restoreBackup: (backup, tables = []) => http.post('/settings/restore', { backup, tables, confirm: 'true' }),
  getCloudConfig: () => http.get('/settings/backup/cloud-config'),
  updateCloudConfig: (data) => http.put('/settings/backup/cloud-config', data),
  backupToCloud: (type = 'critical') => http.post('/settings/backup/cloud', { type }),
  listCloudBackups: () => http.get('/settings/backup/cloud/list'),
  triggerAutoRestore: () => http.post('/settings/auto-restore'),
};

// Health check
export const healthAPI = {
  check: () => http.get('/health'),
};

// Auth helpers
export const authAPI = {
  verifyAdmin: (key) => http.get('/auth/verify-admin', { headers: { 'x-admin-key': key } }),
};

// Main API object with all endpoints
export const api = {
  // Interns
  getInterns: (params) => internsAPI.getAll(params),
  getIntern: (id) => internsAPI.getById(id),
  createIntern: (data) => internsAPI.create(data),
  updateIntern: (id, data) => internsAPI.update(id, data),
  deleteIntern: (id) => internsAPI.delete(id),
  extendInternship: (id, data) => internsAPI.extend(id, data),
  getInternSchedule: (id) => internsAPI.getSchedule(id),

  // Units
  getUnits: (params) => unitsAPI.getAll(params),
  getUnit: (id) => unitsAPI.getById(id),
  createUnit: (data) => unitsAPI.create(data),
  updateUnit: (id, data) => unitsAPI.update(id, data),
  deleteUnit: (id) => unitsAPI.delete(id),
  updateUnitWorkload: (id, data) => unitsAPI.updateWorkload(id, data),
  updateUnitPatientCount: (id, data) => unitsAPI.updatePatientCount(id, data),
  getUnitWorkloadHistory: (id, limit) => unitsAPI.getWorkloadHistory(id, limit),
  testPatientCount: (id, data) => http.post(`/units/${id}/test-patient-count`, data),
  getUnitsSchema: () => http.get('/units/schema'),

  // Rotations
  getRotations: (params) => rotationsAPI.getAll(params),
  getCurrentRotations: () => rotationsAPI.getCurrent(),
  createRotation: (data) => rotationsAPI.create(data),
  updateRotation: (id, data) => rotationsAPI.update(id, data),
  deleteRotation: (id) => rotationsAPI.delete(id),
  generateRotations: (startDate) => rotationsAPI.generate(startDate),

  // Reports
  getSummaryReport: (params) => reportsAPI.getSummary(params),
  getMonthlySchedule: (month, year) => reportsAPI.getMonthlySchedule(month, year),
  getInternProgress: (params) => reportsAPI.getInternProgress(params),
  exportExcel: (type, params) => reportsAPI.exportExcel(type, params),
  exportPDF: (type, params) => reportsAPI.exportPDF(type, params),

  // Settings
  getSettings: () => settingsAPI.getAll(),
  getSetting: (key) => settingsAPI.getByKey(key),
  updateSetting: (key, value) => settingsAPI.update(key, value),
  createSetting: (data) => settingsAPI.create(data),
  deleteSetting: (key) => settingsAPI.delete(key),
  getBatchSchedule: () => settingsAPI.getBatchSchedule(),
  updateBatchSchedule: (data) => settingsAPI.updateBatchSchedule(data),
  getSystemInfo: () => settingsAPI.getSystemInfo(),
  getWorkloadThresholds: () => settingsAPI.getWorkloadThresholds(),
  updateWorkloadThresholds: (data) => settingsAPI.updateWorkloadThresholds(data),
  getCoverageRules: () => settingsAPI.getCoverageRules(),
  updateCoverageRules: (data) => settingsAPI.updateCoverageRules(data),
  getAutoGeneration: () => settingsAPI.getAutoGeneration(),
  updateAutoGeneration: (data) => settingsAPI.updateAutoGeneration(data),
  getNotifications: () => settingsAPI.getNotifications(),
  updateNotifications: (data) => settingsAPI.updateNotifications(data),
  getNotificationTemplates: () => settingsAPI.getNotificationTemplates(),
  updateNotificationTemplates: (data) => settingsAPI.updateNotificationTemplates(data),
  getExportFormat: () => settingsAPI.getExportFormat(),
  updateExportFormat: (data) => settingsAPI.updateExportFormat(data),
  createBackup: (type) => settingsAPI.createBackup(type),
  restoreBackup: (backup, tables) => settingsAPI.restoreBackup(backup, tables),
  getCloudConfig: () => settingsAPI.getCloudConfig(),
  updateCloudConfig: (data) => settingsAPI.updateCloudConfig(data),
  backupToCloud: (type) => settingsAPI.backupToCloud(type),
  listCloudBackups: () => settingsAPI.listCloudBackups(),
  triggerAutoRestore: () => settingsAPI.triggerAutoRestore(),

  // Health
  healthCheck: () => healthAPI.check(),
  verifyAdmin: (key) => authAPI.verifyAdmin(key),
};

export default api;
