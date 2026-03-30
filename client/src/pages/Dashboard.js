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

export default function Dashboard() {
  const { data: interns, isLoading: internsLoading } = useQuery({
    queryKey: ['interns'],
    queryFn: api.getInterns,
  });

  const { data: units, isLoading: unitsLoading } = useQuery({
    queryKey: ['units'],
    queryFn: api.getUnits,
  });

  const { isLoading: rotationsLoading } = useQuery({
    queryKey: ['rotations', 'current'],
    queryFn: api.getCurrentRotations,
  });

  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // removed unused systemInfo

  if (internsLoading || unitsLoading || rotationsLoading) {
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
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-4">
        <div className="rounded-2xl border border-gray-200 bg-white/70 p-5 shadow-sm backdrop-blur sm:p-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Internship Scheduler</h1>
            <h2 className="text-base font-semibold text-gray-700 sm:text-lg">UNTH Ituku Ozalla</h2>
            <p className="text-sm text-gray-500 sm:text-base">Physiotherapy Department</p>
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

      {/* Recent Updates and Coverage */}
      <div className="grid grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-2">
        <RecentUpdates />

        <Card>
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
                  <div key={unit.id} className="flex items-center justify-between p-2 bg-red-50 rounded-lg">
                    <div className="flex-1">
                      <span className="text-sm font-medium text-red-800">{unit.name}</span>
                      <div className="text-xs text-red-600 mt-1">
                        {unit.reason} • Batch A: {unit.byBatch.A}, Batch B: {unit.byBatch.B}
                      </div>
                    </div>
                    <span className="text-xs bg-red-200 text-red-800 px-2 py-1 rounded">Critical</span>
                  </div>
                ))}
                {warningUnits.map((unit) => (
                  <div key={unit.id} className="flex items-center justify-between p-2 bg-yellow-50 rounded-lg">
                    <div className="flex-1">
                      <span className="text-sm font-medium text-yellow-800">{unit.name}</span>
                      <div className="text-xs text-yellow-600 mt-1">
                        {unit.reason} • Batch A: {unit.byBatch.A}, Batch B: {unit.byBatch.B}
                      </div>
                    </div>
                    <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-1 rounded">Warning</span>
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
