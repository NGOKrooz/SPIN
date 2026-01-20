import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { 
  Users, 
  Building2, 
  AlertTriangle,
  UserCheck,
  UserPlus,
  FileText
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { api } from '../services/api';
import { formatDate } from '../lib/utils';
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

  const { data: currentRotations, isLoading: rotationsLoading } = useQuery({
    queryKey: ['rotations', 'current'],
    queryFn: api.getCurrentRotations,
  });

  // removed unused systemInfo

  if (internsLoading || unitsLoading || rotationsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const activeInterns = interns?.filter(intern => intern.status === 'Active') || [];
  const extendedInterns = interns?.filter(intern => intern.status === 'Extended') || [];
  // removed unused completedInterns
  
  // Batch distribution includes all interns (active + extended)
  const allActiveInterns = [...activeInterns, ...extendedInterns];
  const batchAInterns = allActiveInterns.filter(intern => intern.batch === 'A');
  const batchBInterns = allActiveInterns.filter(intern => intern.batch === 'B');

  // Compute coverage issues from current rotations by unit and batch
  const rotationList = currentRotations?.rotations || [];
  const unitCoverageData = currentRotations?.unit_coverage || {};
  
  const criticalUnits = [];
  const warningUnits = [];
  
  // Process coverage data from the API
  Object.values(unitCoverageData).forEach(unit => {
    const hasBatchA = unit.batch_a.length > 0;
    const hasBatchB = unit.batch_b.length > 0;
    const totalInterns = unit.batch_a.length + unit.batch_b.length;
    
    if (unit.coverage_status === 'critical') {
      criticalUnits.push({ 
        id: unit.unit_name, 
        name: unit.unit_name, 
        byBatch: { A: unit.batch_a.length, B: unit.batch_b.length }, 
        total: totalInterns,
        reason: !hasBatchA && !hasBatchB ? 'No interns assigned' : 'Insufficient coverage'
      });
    } else if (unit.coverage_status === 'warning') {
      warningUnits.push({ 
        id: unit.unit_name, 
        name: unit.unit_name, 
        byBatch: { A: unit.batch_a.length, B: unit.batch_b.length }, 
        total: totalInterns,
        reason: 'Imbalanced coverage'
      });
    }
  });

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
    // Removed Current Rotations stat per requirements
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
    // Removed Generate Rotations quick action per requirements
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
          Welcome to SPIN - Smart Physiotherapy Internship Network
        </p>
        <p className="text-sm text-gray-500">
          Last updated: {formatDate(new Date())}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
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

      {/* Batch Distribution */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
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
                  <span className="text-sm font-medium">Batch A</span>
                </div>
                <span className="text-lg font-bold">{batchAInterns.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 rounded-full bg-batch-b"></div>
                  <span className="text-sm font-medium">Batch B</span>
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

      {/* Quick Actions and Recent Updates */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>
            Common tasks and shortcuts for managing the internship program
          </CardDescription>
        </CardHeader>
        <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

        <RecentUpdates />
      </div>
      {/* Removed Recent Rotations per requirements */}
    </div>
  );
}
