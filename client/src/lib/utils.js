import { clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export function formatDateTime(date) {
  if (!date) return '';
  const d = new Date(date);
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
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
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
