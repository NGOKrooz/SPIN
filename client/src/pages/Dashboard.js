import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Users, 
  Building2, 
  AlertTriangle
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { api } from '../services/api';
import RecentUpdates from '../components/RecentUpdates';
import { buildUpcomingMovements, PREDICTIVE_WINDOW_DAYS } from '../lib/predictivePlanning';

export default function Dashboard() {
  const { data: interns, isLoading: internsLoading } = useQuery({
    queryKey: ['interns'],
    queryFn: api.getInterns,
  });

  const { data: units, isLoading: unitsLoading } = useQuery({
    queryKey: ['units'],
    queryFn: api.getUnits,
  });

  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // removed unused systemInfo

  if (internsLoading || unitsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const activeInterns = interns?.filter(intern => intern.currentUnit) || [];
  const unassignedInterns = interns?.filter(intern => !intern.currentUnit) || [];

  const criticalUnits = units?.filter(unit => unit?.status === 'critical') || [];
  const warningUnits = units?.filter(unit => unit?.status === 'warning') || [];
  const upcomingMovements = buildUpcomingMovements(interns || [], units || [], {
    movementWindowDays: PREDICTIVE_WINDOW_DAYS,
    leavingSoonDays: PREDICTIVE_WINDOW_DAYS,
  });

  const stats = [
    {
      title: 'Total Interns',
      value: interns?.length || 0,
      description: `${activeInterns.length} assigned, ${unassignedInterns.length} unassigned`,
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      title: 'Active Units',
      value: units?.length || 0,
      description: 'Available units',
      icon: Building2,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
  ];

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-gray-200 bg-white/70 p-5 shadow-sm backdrop-blur sm:p-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Internship Scheduler</h1>
          </div>
        </div>

        <div>
          <h3 className="text-2xl font-bold text-gray-900 sm:text-3xl">Dashboard</h3>
          <p className="text-sm text-gray-600 sm:text-base">{todayLabel}</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="border-0 shadow-sm bg-white/70 backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                {stat.title}
              </CardTitle>
              <div className={`rounded-lg p-2 ${stat.bgColor} shadow-inner`}> 
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
              <p className="text-xs text-gray-500">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-6">
        <RecentUpdates />

        <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
          <CardHeader>
            <CardTitle>Upcoming Movements (Next 5 Days)</CardTitle>
            <CardDescription>Preview-only movement board based on global batch-balanced assignment</CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingMovements.length === 0 ? (
              <div className="text-sm text-gray-500">No movements expected in the next 5 days.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="py-2 pr-4">Intern</th>
                      <th className="py-2 pr-4">From</th>
                      <th className="py-2 pr-4">To</th>
                      <th className="py-2">Move Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcomingMovements.map((movement) => (
                      <tr key={`${movement.internId || movement.internName}-${movement.moveDateLabel}`} className="border-b last:border-b-0">
                        <td className="py-2 pr-4 font-medium text-gray-900">{movement.internName}</td>
                        <td className="py-2 pr-4 text-gray-700">{movement.fromUnit}</td>
                        <td className="py-2 pr-4 text-gray-700">{movement.toUnit}</td>
                        <td className="py-2 text-gray-600">{movement.moveDateLabel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5" />
              <span>Coverage Alerts</span>
            </CardTitle>
            <CardDescription>
              Units requiring immediate attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            {criticalUnits.length === 0 && warningUnits.length === 0 ? (
              <div className="text-center py-4">
                <div className="text-green-600 text-sm">All units have adequate coverage</div>
              </div>
            ) : (
              <div className="space-y-2">
                {criticalUnits.map((unit) => (
                  <div key={unit.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-red-800 break-words">{unit.name}</span>
                      <div className="text-xs text-red-600 mt-1 break-words">
                        {unit.reason} • Batch A: {unit.byBatch.A}, Batch B: {unit.byBatch.B}
                      </div>
                    </div>
                    <span className="text-xs bg-red-200 text-red-800 px-2 py-1 rounded ml-2">Critical</span>
                  </div>
                ))}
                {warningUnits.map((unit) => (
                  <div key={unit.id} className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-yellow-800 break-words">{unit.name}</span>
                      <div className="text-xs text-yellow-600 mt-1 break-words">
                        {unit.reason} • Batch A: {unit.byBatch.A}, Batch B: {unit.byBatch.B}
                      </div>
                    </div>
                    <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-1 rounded ml-2">Warning</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {/* Removed Recent Rotations per requirements */}
    </div>
  );
}
