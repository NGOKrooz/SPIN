import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Play, RefreshCw, Users, Building2, Clock, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { api } from '../services/api';
import { formatDate, getBatchColor, getWorkloadColor, getCoverageColor } from '../lib/utils';
import { useToast } from '../hooks/use-toast';

export default function Rotations() {
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterBatch, setFilterBatch] = useState('ALL');
  const [filterUnit, setFilterUnit] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: currentRotations, isLoading: currentLoading } = useQuery({
    queryKey: ['rotations', 'current'],
    queryFn: api.getCurrentRotations,
  });

  const { data: allRotations, isLoading: allLoading } = useQuery({
    queryKey: ['rotations', { batch: filterBatch, unit_id: filterUnit, status: filterStatus }],
    queryFn: () => api.getRotations({
      batch: filterBatch === 'ALL' ? undefined : filterBatch,
      unit_id: filterUnit === 'ALL' ? undefined : filterUnit,
      status: filterStatus === 'ALL' ? undefined : filterStatus,
    }),
  });

  const { data: interns } = useQuery({
    queryKey: ['interns'],
    queryFn: api.getInterns,
  });

  const { data: units } = useQuery({
    queryKey: ['units'],
    queryFn: api.getUnits,
  });

  const generateMutation = useMutation({
    mutationFn: (startDate) => api.generateRotations(startDate),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['rotations'] });
      toast({
        title: 'Success',
        description: `Generated ${data.count} rotations successfully`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate rotations',
        variant: 'destructive',
      });
    },
  });

  const handleGenerateRotations = () => {
    if (window.confirm('This will generate new rotations for all active interns. Continue?')) {
      generateMutation.mutate(startDate);
    }
  };

  if (currentLoading || allLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const unitCoverage = currentRotations?.unit_coverage || {};
  const criticalUnits = Object.values(unitCoverage).filter(unit => unit.coverage_status === 'critical');
  const warningUnits = Object.values(unitCoverage).filter(unit => unit.coverage_status === 'warning');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Rotations</h1>
          <p className="text-gray-600">Manage intern rotation schedules and coverage</p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <Label htmlFor="start-date">Start Date:</Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-40"
            />
          </div>
          <Button 
            onClick={handleGenerateRotations}
            disabled={generateMutation.isPending}
            className="hospital-gradient"
          >
            {generateMutation.isPending ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-2" />
            )}
            Generate Rotations
          </Button>
        </div>
      </div>

      {/* Coverage Alerts */}
      {(criticalUnits.length > 0 || warningUnits.length > 0) && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-red-800">
              <AlertTriangle className="h-5 w-5" />
              <span>Coverage Alerts</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {criticalUnits.map((unit, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-red-100 rounded-lg">
                  <span className="text-sm font-medium text-red-800">{unit.unit_name}</span>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs bg-red-200 text-red-800 px-2 py-1 rounded">Critical</span>
                    <span className="text-xs text-red-600">
                      Batch A: {unit.batch_a.length}, Batch B: {unit.batch_b.length}
                    </span>
                  </div>
                </div>
              ))}
              {warningUnits.map((unit, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-yellow-100 rounded-lg">
                  <span className="text-sm font-medium text-yellow-800">{unit.unit_name}</span>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-1 rounded">Warning</span>
                    <span className="text-xs text-yellow-600">
                      Batch A: {unit.batch_a.length}, Batch B: {unit.batch_b.length}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Calendar className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-gray-600">Active Rotations</p>
                <p className="text-2xl font-bold text-gray-900">{currentRotations?.rotations?.length || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-gray-600">Units Covered</p>
                <p className="text-2xl font-bold text-gray-900">{Object.keys(unitCoverage).length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-sm font-medium text-gray-600">Warnings</p>
                <p className="text-2xl font-bold text-gray-900">{warningUnits.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <div>
                <p className="text-sm font-medium text-gray-600">Critical</p>
                <p className="text-2xl font-bold text-gray-900">{criticalUnits.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <Label htmlFor="batch">Batch</Label>
              <Select value={filterBatch} onValueChange={setFilterBatch}>
                <SelectTrigger>
                  <SelectValue placeholder="All batches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All batches</SelectItem>
                  <SelectItem value="A">Batch A</SelectItem>
                  <SelectItem value="B">Batch B</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="unit">Unit</Label>
              <Select value={filterUnit} onValueChange={setFilterUnit}>
                <SelectTrigger>
                  <SelectValue placeholder="All units" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All units</SelectItem>
                  {units?.map((unit) => (
                    <SelectItem key={unit.id} value={unit.id.toString()}>
                      {unit.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All statuses</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Extended">Extended</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button 
                variant="outline" 
                onClick={() => {
                  setFilterBatch('ALL');
                  setFilterUnit('ALL');
                  setFilterStatus('ALL');
                }}
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current Rotations */}
      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle>Current Rotations</CardTitle>
          <CardDescription>
            Active rotation assignments across all units
          </CardDescription>
        </CardHeader>
        <CardContent>
          {currentRotations?.rotations?.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No current rotations found
            </div>
          ) : (
            <div className="space-y-4">
              {currentRotations?.rotations?.map((rotation) => (
                <div key={rotation.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold ${getBatchColor(rotation.intern_batch)}`}>
                        {rotation.intern_batch}
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">{rotation.intern_name}</h3>
                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          <span className="flex items-center space-x-1">
                            <Building2 className="h-4 w-4" />
                            <span>{rotation.unit_name}</span>
                          </span>
                          <span className="flex items-center space-x-1">
                            <Clock className="h-4 w-4" />
                            <span>{formatDate(rotation.start_date)} - {formatDate(rotation.end_date)}</span>
                          </span>
                        </div>
                        <div className="mt-1">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getWorkloadColor(rotation.unit_workload)}`}>
                            {rotation.unit_workload} Workload
                          </span>
                          {rotation.is_manual_assignment && (
                            <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              Manual Assignment
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-500">
                        {Math.ceil((new Date(rotation.end_date) - new Date()) / (1000 * 60 * 60 * 24))} days remaining
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* All Rotations */}
      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle>All Rotations</CardTitle>
          <CardDescription>
            Complete rotation history and future assignments
          </CardDescription>
        </CardHeader>
        <CardContent>
          {allRotations?.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No rotations found matching your criteria
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Intern
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Batch
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Unit
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Start Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      End Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Workload
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {allRotations?.map((rotation) => (
                    <tr key={rotation.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {rotation.intern_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-white ${getBatchColor(rotation.intern_batch)}`}>
                          {rotation.intern_batch}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {rotation.unit_name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(rotation.start_date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(rotation.end_date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium text-white ${getWorkloadColor(rotation.unit_workload)}`}>
                          {rotation.unit_workload}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {rotation.is_manual_assignment ? 'Manual' : 'Automatic'}
                      </td>
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
