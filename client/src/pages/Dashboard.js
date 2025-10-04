import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { 
  Users, 
  Building2, 
  Calendar, 
  AlertTriangle,
  TrendingUp,
  Clock,
  UserCheck,
  UserX
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { api } from '../services/api';
import { formatDate, getBatchColor, getWorkloadColor, getCoverageColor } from '../lib/utils';

export default function Dashboard() {
  const { data: interns, isLoading: internsLoading } = useQuery({
    queryKey: ['interns'],
    queryFn: api.getInterns,
  });

  const { data: units, isLoading: unitsLoading } = useQuery({
    queryKey: ['units'],
    queryFn: api.getUnits,
  });

  const { data: currentRotations, isLoading: rotationsLoading } = useQuery({
    queryKey: ['rotations', 'current'],
    queryFn: api.getCurrentRotations,
  });

  const { data: systemInfo } = useQuery({
    queryKey: ['settings', 'system-info'],
    queryFn: api.getSystemInfo,
  });

  if (internsLoading || unitsLoading || rotationsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const activeInterns = interns?.filter(intern => intern.status === 'Active') || [];
  const extendedInterns = interns?.filter(intern => intern.status === 'Extended') || [];
  const completedInterns = interns?.filter(intern => intern.status === 'Completed') || [];
  
  const batchAInterns = activeInterns.filter(intern => intern.batch === 'A');
  const batchBInterns = activeInterns.filter(intern => intern.batch === 'B');

  const criticalUnits = units?.filter(unit => unit.coverage_status === 'critical') || [];
  const warningUnits = units?.filter(unit => unit.coverage_status === 'warning') || [];

  const stats = [
    {
      title: 'Total Interns',
      value: interns?.length || 0,
      description: `${activeInterns.length} active, ${extendedInterns.length} extended`,
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      title: 'Active Units',
      value: units?.length || 0,
      description: `${criticalUnits.length} critical, ${warningUnits.length} warning`,
      icon: Building2,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      title: 'Current Rotations',
      value: currentRotations?.rotations?.length || 0,
      description: 'Active assignments',
      icon: Calendar,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
    {
      title: 'Coverage Issues',
      value: criticalUnits.length + warningUnits.length,
      description: `${criticalUnits.length} critical, ${warningUnits.length} warning`,
      icon: AlertTriangle,
      color: 'text-red-600',
      bgColor: 'bg-red-100',
    },
  ];

  const quickActions = [
    {
      title: 'Add New Intern',
      description: 'Register a new physiotherapy intern',
      href: '/interns',
      icon: UserCheck,
      color: 'hospital',
    },
    {
      title: 'Generate Rotations',
      description: 'Create automatic rotation schedule',
      href: '/rotations',
      icon: Calendar,
      color: 'batchA',
    },
    {
      title: 'Manual Assignment',
      description: 'Manually assign intern to unit',
      href: '/manual-assignment',
      icon: UserPlus,
      color: 'batchB',
    },
    {
      title: 'Generate Reports',
      description: 'Export schedules and summaries',
      href: '/reports',
      icon: FileText,
      color: 'secondary',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">
          Welcome to SPIN - Student Physiotherapy Internship Network
        </p>
        <p className="text-sm text-gray-500">
          Last updated: {formatDate(new Date())}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                {stat.title}
              </CardTitle>
              <div className={`rounded-lg p-2 ${stat.bgColor}`}>
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

      {/* Batch Distribution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Users className="h-5 w-5" />
              <span>Batch Distribution</span>
            </CardTitle>
            <CardDescription>
              Current distribution of active interns by batch
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-batch-a"></div>
                  <span className="text-sm font-medium">Batch A (Monday off)</span>
                </div>
                <span className="text-lg font-bold">{batchAInterns.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-batch-b"></div>
                  <span className="text-sm font-medium">Batch B (Wednesday off)</span>
                </div>
                <span className="text-lg font-bold">{batchBInterns.length}</span>
              </div>
            </div>
          </CardContent>
        </Card>

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
                    <span className="text-sm font-medium text-red-800">{unit.name}</span>
                    <span className="text-xs bg-red-200 text-red-800 px-2 py-1 rounded">Critical</span>
                  </div>
                ))}
                {warningUnits.map((unit) => (
                  <div key={unit.id} className="flex items-center justify-between p-2 bg-yellow-50 rounded-lg">
                    <span className="text-sm font-medium text-yellow-800">{unit.name}</span>
                    <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-1 rounded">Warning</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Common tasks and shortcuts for managing the internship program
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {quickActions.map((action) => (
              <Link key={action.title} to={action.href}>
                <div className="group relative overflow-hidden rounded-lg border border-gray-200 bg-white p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center space-x-3">
                    <div className={`rounded-lg p-2 ${action.color === 'hospital' ? 'hospital-gradient' : action.color === 'batchA' ? 'bg-batch-a' : action.color === 'batchB' ? 'bg-batch-b' : 'bg-gray-100'}`}>
                      <action.icon className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium text-gray-900 group-hover:text-blue-600">
                        {action.title}
                      </h3>
                      <p className="text-xs text-gray-500">{action.description}</p>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Rotations</CardTitle>
          <CardDescription>
            Latest rotation assignments and changes
          </CardDescription>
        </CardHeader>
        <CardContent>
          {currentRotations?.rotations?.length > 0 ? (
            <div className="space-y-3">
              {currentRotations.rotations.slice(0, 5).map((rotation) => (
                <div key={rotation.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className={`w-2 h-2 rounded-full ${getBatchColor(rotation.intern_batch)}`}></div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{rotation.intern_name}</p>
                      <p className="text-xs text-gray-500">{rotation.unit_name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">
                      {formatDate(rotation.start_date)} - {formatDate(rotation.end_date)}
                    </p>
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getWorkloadColor(rotation.unit_workload)}`}>
                      {rotation.unit_workload}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No current rotations found
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
