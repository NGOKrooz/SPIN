import React from 'react';

export default function Interns() {
  return (
    <div className="p-6 space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-gray-900">Interns</h1>
        <p className="mt-2 text-sm text-gray-600">Intern roster overview.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Active</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">12</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Pending</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">3</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Completed</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">8</p>
        </div>
      </div>
    </div>
  );
}
