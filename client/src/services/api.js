import axios from 'axios';

// API Base URL configuration
// Production: Use Render backend URL
// Development: Use localhost proxy or Render backend
const getApiBaseUrl = () => {
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  
  // Production (Vercel): Use Render backend
  if (!isLocalhost) {
    return 'https://spin-j3qw.onrender.com/api';
  }
  
  // Development: Check env var first, then default to localhost proxy
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  
  // Development default: use localhost proxy
  return '/api';
};

let API_BASE_URL = getApiBaseUrl();

console.log('API Base URL configured:', API_BASE_URL, '(hostname:', window.location.hostname + ')');

const http = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

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
  getAll: (params = {}) => {
    console.log('🔗 API: GET /interns with params:', params);
    return http.get('/interns', { params }).then((data) => {
      console.log('🔗 API: GET /interns response:', data);
      return data;
    });
  },
  getById: (id) => http.get(`/interns/${id}`),
  create: (data) => {
    console.log('🔗 API: POST /interns with data:', data);
    return http.post('/interns', data).then((response) => {
      console.log('🔗 API: POST /interns response:', response);
      return response;
    });
  },
  update: (id, data) => http.put(`/interns/${id}`, data),
  delete: (id) => http.delete(`/interns/${id}`),
  reassign: (id, data) => http.post(`/interns/${id}/reassign`, data),
  extend: (id, data) => http.post(`/interns/${id}/extend`, data),
  removeExtension: (id, data) => http.post(`/interns/${id}/remove-extension`, data),
  getSchedule: (id) => http.get(`/interns/${id}/schedule`),
  getRecentActivities: (limit = 20) => http.get('/interns/activities/recent', { params: { limit } }),
};

// Units API
export const unitsAPI = {
  getAll: (params = {}) => http.get('/units', { params }),
  getById: (id) => http.get(`/units/${id}`),
  create: (data) => http.post('/units', data),
  update: (id, data) => http.put(`/units/${id}`, data),
  delete: (id) => http.delete(`/units/${id}`),
  getCompletedInterns: (id) => http.get(`/units/${id}/completed-interns`),
  updateOrder: (order) => http.put('/units/reorder', order),
};

export const patientsAPI = {
  getAll: (params = {}) => http.get('/patients', { params }),
  create: (data) => http.post('/patients', data),
  update: (id, data) => http.put(`/patients/${id}`, data),
  reassign: (id, data) => http.post(`/patients/${id}/reassign`, data),
  delete: (id) => http.delete(`/patients/${id}`),
};

  // Rotations API
export const rotationsAPI = {
  getAll: (params = {}) => http.get('/rotations', { params }),
  getCurrent: () => http.get('/rotations/current'),
  getUpcoming: () => http.get('/rotations/upcoming'),
  create: (data) => http.post('/rotations', data),
  update: (id, data) => http.put(`/rotations/${id}`, data),
  delete: (id) => http.delete(`/rotations/${id}`),
  generate: (startDate) => http.post('/rotations/generate', { start_date: startDate }),
  fixEndDates: () => http.post('/rotations/fix-end-dates'),
  autoAdvance: () => http.post('/rotations/auto-advance'),
  acceptPending: (rotationId) => http.post(`/rotations/${rotationId}/accept`),
  refreshUpcoming: () => http.post('/rotations/refresh-upcoming'),
};

// Auto-advance API for specific intern
export const autoAdvanceAPI = {
  triggerForIntern: (internId) => http.post(`/interns/${internId}/auto-advance`),
};

// Activity logs API
export const activityAPI = {
  getRecent: (limit = 10) => http.get('/activity/recent', { params: { limit } }),
  clear: () => http.delete('/activity/clear'),
};

export const spunAPI = {
  getSummary: (limit = 25) => http.get('/spun', { params: { limit } }),
};

// Settings API
export const settingsAPI = {
  getSystem: () => http.get('/settings/system'),
  updateSystem: (data) => http.put('/settings/system', data),
};

// Health check
export const healthAPI = {
  check: () => http.get('/health'),
};

// Auth helpers
export const authAPI = {
  verifyAdmin: (adminPassword) => http.post('/auth/login', { adminPassword }),
};

// Main API object with all endpoints
export const api = {
  // Interns
  getInterns: (params) => internsAPI.getAll(params),
  getIntern: (id) => internsAPI.getById(id),
  createIntern: (data) => internsAPI.create(data),
  updateIntern: (id, data) => internsAPI.update(id, data),
  deleteIntern: (id) => internsAPI.delete(id),
  reassignIntern: (id, data) => internsAPI.reassign(id, data),
  extendInternship: (id, data) => internsAPI.extend(id, data),
  removeExtension: (id, data) => internsAPI.removeExtension(id, data),
  getInternSchedule: (id) => internsAPI.getSchedule(id),

  // Units
  getUnits: (params) => unitsAPI.getAll(params),
  getUnit: (id) => unitsAPI.getById(id),
  createUnit: (data) => unitsAPI.create(data),
  updateUnit: (id, data) => unitsAPI.update(id, data),
  deleteUnit: (id) => unitsAPI.delete(id),
  updateUnitOrder: (order) => unitsAPI.updateOrder(order),
  getCompletedInterns: (id) => unitsAPI.getCompletedInterns(id),
  getPatients: (params) => patientsAPI.getAll(params),
  createPatient: (data) => patientsAPI.create(data),
  updatePatient: (id, data) => patientsAPI.update(id, data),
  reassignPatient: (id, data) => patientsAPI.reassign(id, data),
  deletePatient: (id) => patientsAPI.delete(id),
  getUnitsSchema: () => http.get('/units/schema'),

  // Rotations
  getRotations: (params) => rotationsAPI.getAll(params),
  getCurrentRotations: () => rotationsAPI.getCurrent(),
  getUpcomingRotations: () => rotationsAPI.getUpcoming(),
  createRotation: (data) => rotationsAPI.create(data),
  updateRotation: (id, data) => rotationsAPI.update(id, data),
  deleteRotation: (id) => rotationsAPI.delete(id),
  generateRotations: (startDate) => rotationsAPI.generate(startDate),
  autoAdvanceRotations: () => rotationsAPI.autoAdvance(),
  acceptPendingRotation: (rotationId) => rotationsAPI.acceptPending(rotationId),
  refreshUpcomingRotations: () => rotationsAPI.refreshUpcoming(),

  // Activity
  getRecentActivities: (limit) => activityAPI.getRecent(limit),
  clearRecentActivities: () => activityAPI.clear(),

  // Spun
  getSpunHistory: (limit) => spunAPI.getSummary(limit),

  // Settings
  getSystemSettings: () => settingsAPI.getSystem(),
  updateSystemSettings: (data) => settingsAPI.updateSystem(data),

  // Health
  healthCheck: () => healthAPI.check(),
  verifyAdmin: (key) => authAPI.verifyAdmin(key),
};

export default api;
