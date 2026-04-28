import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Repeat } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { api } from '../services/api';
import { formatDateTime } from '../lib/utils';

export default function Spun() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['spun'],
    queryFn: () => api.getSpunHistory(25),
  });

  const totalSpins = data?.totalSpins ?? 0;
  const internSpins = data?.internSpins ?? [];
  const recentSpins = data?.recent ?? [];

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 px-4 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-gray-200 bg-white/70 p-5 shadow-sm backdrop-blur sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Spun</h1>
            <p className="mt-1 text-sm text-gray-600">Track rotation completions and review recent spins.</p>
          </div>
          <div className="inline-flex items-center rounded-2xl border border-gray-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 shadow-sm">
            <Repeat className="mr-2 h-4 w-4" />
            Total Spins: {totalSpins}
          </div>
        </div>
      </div>

      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle>Rotations by Intern</CardTitle>
          <CardDescription>Completed rotation counts for every intern</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex min-h-[150px] items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : isError ? (
            <div className="text-sm text-red-600">Unable to load intern spin counts.</div>
          ) : internSpins.length === 0 ? (
            <div className="text-sm text-gray-500">No intern rotation data available yet.</div>
          ) : (
            <ul className="space-y-3">
              {internSpins.map((item) => (
                <li key={item.intern.id} className="rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3">
                  <div className="font-medium text-gray-900">{item.intern.name}</div>
                  <div className="text-sm text-gray-600">
                    {item.count} completed rotation{item.count === 1 ? '' : 's'}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle>Recent Spins</CardTitle>
          <CardDescription>Latest completed rotations across all interns</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex min-h-[150px] items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : isError ? (
            <div className="text-sm text-red-600">Unable to load spun history.</div>
          ) : recentSpins.length === 0 ? (
            <div className="text-sm text-gray-500">No spins have been recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-2 pr-4">Intern</th>
                    <th className="py-2 pr-4">Completed Unit</th>
                    <th className="py-2 pr-4">Next Unit</th>
                    <th className="py-2 pr-4">Description</th>
                    <th className="py-2">Completed At</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSpins.map((spin) => (
                    <tr key={spin.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-4 font-medium text-gray-900">
                        {spin.intern?.name || 'Unknown intern'}
                      </td>
                      <td className="py-2 pr-4 text-gray-700">{spin.unit?.name || 'Unknown unit'}</td>
                      <td className="py-2 pr-4 text-gray-700">{spin.nextUnit?.name || 'Final rotation'}</td>
                      <td className="py-2 pr-4 text-gray-700 break-words">{spin.description}</td>
                      <td className="py-2 text-gray-600">{formatDateTime(spin.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
