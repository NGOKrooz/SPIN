import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

function parseDateInput(date) {
  if (!date) return null;
  if (date instanceof Date && !Number.isNaN(date.getTime())) return new Date(date.getTime());

  if (typeof date === 'string') {
    const dateOnlyMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
      const [, year, month, day] = dateOnlyMatch;
      const parsed = new Date(Number(year), Number(month) - 1, Number(day));
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
  }

  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function formatDate(date) {
  if (!date) return '';
  const d = parseDateInput(date);
  if (!d) return '';
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export function formatDateTime(date) {
  if (!date) return '';
  const d = parseDateInput(date);
  if (!d) return '';
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function getBatchColor(batch) {
  return batch === 'A' ? 'bg-batch-a' : 'bg-batch-b';
}

export function getWorkloadColor(workload) {
  switch (workload?.toLowerCase()) {
    case 'low':
      return 'bg-workload-low';
    case 'medium':
      return 'bg-workload-medium';
    case 'high':
      return 'bg-workload-high';
    default:
      return 'bg-gray-500';
  }
}

export function getCoverageColor(status) {
  switch (status) {
    case 'good':
      return 'bg-coverage-good';
    case 'warning':
      return 'bg-coverage-warning';
    case 'critical':
      return 'bg-coverage-critical';
    case 'low':
      return 'bg-coverage-low';
    default:
      return 'bg-gray-500';
  }
}

export function calculateDaysBetween(startDate, endDate) {
  const s = normalizeDate(startDate);
  const e = normalizeDate(endDate);
  return Math.floor((e - s) / (1000 * 60 * 60 * 24)) + 1; // +1 for inclusive days
}

export function addWeeksAccurate(startDate, durationInWeeks) {
  const base = parseDateInput(startDate);
  if (!base) return null;
  const weeks = Number(durationInWeeks) || 0;
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return new Date(base.getTime() + (weeks * 7 * millisecondsPerDay));
}

// Helper function to normalize date to start of day for proper date-only comparisons
export function normalizeDate(date) {
  const d = parseDateInput(date);
  if (!d) return new Date(NaN);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Helper function to compare dates (ignoring time component)
export function compareDates(date1, date2) {
  const d1 = normalizeDate(date1);
  const d2 = normalizeDate(date2);
  return d1.getTime() - d2.getTime();
}

// Check if a date is before today (date-only comparison)
// Uses string comparison to avoid timezone issues
export function isBeforeToday(date) {
  if (!date) return false;
  const parsed = normalizeDate(date);
  if (Number.isNaN(parsed.getTime())) return false;
  const today = normalizeDate(new Date());
  return parsed < today;
}

// Check if a date is after today (date-only comparison)
// Uses string comparison to avoid timezone issues
export function isAfterToday(date) {
  if (!date) return false;
  const parsed = normalizeDate(date);
  if (Number.isNaN(parsed.getTime())) return false;
  const today = normalizeDate(new Date());
  return parsed > today;
}

// Check if a date range includes today
// Uses string comparison to avoid timezone issues
export function includesToday(startDate, endDate) {
  if (!startDate || !endDate) return false;
  const parsedStart = normalizeDate(startDate);
  const parsedEnd = normalizeDate(endDate);
  if (Number.isNaN(parsedStart.getTime()) || Number.isNaN(parsedEnd.getTime())) return false;
  const today = normalizeDate(new Date());
  return parsedStart <= today && parsedEnd >= today;
}

export function getStatusColor(status) {
  switch (status?.toLowerCase()) {
    case 'active':
      return 'bg-green-100 text-green-800';
    case 'extended':
      return 'bg-yellow-100 text-yellow-800';
    case 'completed':
      return 'bg-blue-100 text-blue-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

// Export helpers
export function exportToCSV(filename, rows = [], headers = []) {
  try {
    const cols = headers.length ? headers : Object.keys(rows[0] || {});
    const csv = [cols.join(',')].concat(rows.map(r => cols.map(c => {
      const v = r[c] == null ? '' : String(r[c]).replace(/"/g, '""');
      return `"${v}"`;
    }).join(','))).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Export CSV failed', err);
    throw err;
  }
}

export function openPrintableWindow(title, htmlContent) {
  const w = window.open('', '_blank');
  if (!w) throw new Error('Unable to open print window');
  w.document.write(`<!doctype html><html><head><title>${title}</title><meta charset="utf-8"/><style>body{font-family:Arial,Helvetica,sans-serif;padding:20px;color:#111}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f3f4f6}</style></head><body><h2>${title}</h2>${htmlContent}</body></html>`);
  w.document.close();
  // Give browser a moment to render then open print dialog
  setTimeout(() => {
    w.print();
  }, 300);
  return w;
}
