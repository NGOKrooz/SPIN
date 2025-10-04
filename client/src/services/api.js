import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error.response?.data || error.message);
  }
);

// Interns API
export const internsAPI = {
  getAll: (params = {}) => api.get('/interns', { params }),
  getById: (id) => api.get(`/interns/${id}`),
  create: (data) => api.post('/interns', data),
  update: (id, data) => api.put(`/interns/${id}`, data),
  delete: (id) => api.delete(`/interns/${id}`),
  extend: (id, extensionDays) => api.post(`/interns/${id}/extend`, { extension_days: extensionDays }),
  getSchedule: (id) => api.get(`/interns/${id}/schedule`),
};

// Units API
export const unitsAPI = {
  getAll: (params = {}) => api.get('/units', { params }),
  getById: (id) => api.get(`/units/${id}`),
  create: (data) => api.post('/units', data),
  update: (id, data) => api.put(`/units/${id}`, data),
  delete: (id) => api.delete(`/units/${id}`),
  updateWorkload: (id, data) => api.post(`/units/${id}/workload`, data),
  getWorkloadHistory: (id, limit = 12) => api.get(`/units/${id}/workload-history`, { params: { limit } }),
};

// Rotations API
export const rotationsAPI = {
  getAll: (params = {}) => api.get('/rotations', { params }),
  getCurrent: () => api.get('/rotations/current'),
  create: (data) => api.post('/rotations', data),
  update: (id, data) => api.put(`/rotations/${id}`, data),
  delete: (id) => api.delete(`/rotations/${id}`),
  generate: (startDate) => api.post('/rotations/generate', { start_date: startDate }),
};

// Reports API
export const reportsAPI = {
  getSummary: (params = {}) => api.get('/reports/summary', { params }),
  getMonthlySchedule: (month, year) => api.get('/reports/monthly-schedule', { 
    params: { month, year } 
  }),
  getInternProgress: (params = {}) => api.get('/reports/intern-progress', { params }),
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
  getAll: () => api.get('/settings'),
  getByKey: (key) => api.get(`/settings/${key}`),
  update: (key, value) => api.put(`/settings/${key}`, { value }),
  create: (data) => api.post('/settings', data),
  delete: (key) => api.delete(`/settings/${key}`),
  getBatchSchedule: () => api.get('/settings/batch-schedule'),
  updateBatchSchedule: (data) => api.put('/settings/batch-schedule', data),
  getSystemInfo: () => api.get('/settings/system-info'),
};

// Health check
export const healthAPI = {
  check: () => api.get('/health'),
};

// Main API object with all endpoints
export const api = {
  // Interns
  getInterns: (params) => internsAPI.getAll(params),
  getIntern: (id) => internsAPI.getById(id),
  createIntern: (data) => internsAPI.create(data),
  updateIntern: (id, data) => internsAPI.update(id, data),
  deleteIntern: (id) => internsAPI.delete(id),
  extendInternship: (id, days) => internsAPI.extend(id, days),
  getInternSchedule: (id) => internsAPI.getSchedule(id),

  // Units
  getUnits: (params) => unitsAPI.getAll(params),
  getUnit: (id) => unitsAPI.getById(id),
  createUnit: (data) => unitsAPI.create(data),
  updateUnit: (id, data) => unitsAPI.update(id, data),
  deleteUnit: (id) => unitsAPI.delete(id),
  updateUnitWorkload: (id, data) => unitsAPI.updateWorkload(id, data),
  getUnitWorkloadHistory: (id, limit) => unitsAPI.getWorkloadHistory(id, limit),

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

  // Health
  healthCheck: () => healthAPI.check(),
};

export default api;
