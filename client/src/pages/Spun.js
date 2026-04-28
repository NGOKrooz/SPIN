import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Repeat } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { api } from '../services/api';

export default function Spun() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['spun'],
    queryFn: () => api.getSpunHistory(25),
  });

  const totalSpins = data?.totalSpins ?? 0;
  const internSpins = data?.internSpins ?? [];

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 px-4 sm:px-6 lg:px-8">
      <div className="rounded-2xl border border-gray-200 bg-white/70 p-5 shadow-sm backdrop-blur sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Spun</h1>
            <p className="mt-1 text-sm text-gray-600">Track rotation completions across all interns.</p>
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
    </div>
  );
}
