import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, AlertTriangle, Edit, BarChart3, Eye } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { api } from '../services/api';
import { getWorkloadColor, getCoverageColor, getBatchColor } from '../lib/utils';
import { useToast } from '../hooks/use-toast';
import UnitForm from '../components/UnitForm';
import UnitViewModal from '../components/UnitViewModal';

export default function Units() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterWorkload, setFilterWorkload] = useState('ALL');
  const [filterCoverage, setFilterCoverage] = useState('ALL');
  const [showForm, setShowForm] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [showCompletedInterns, setShowCompletedInterns] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: units, isLoading } = useQuery({
    queryKey: ['units'],
    queryFn: api.getUnits,
  });

  const updateWorkloadMutation = useMutation({
    mutationFn: ({ id, data }) => api.updateUnitWorkload(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units'] });
      toast({
        title: 'Success',
        description: 'Unit workload updated successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update workload',
        variant: 'destructive',
      });
    },
  });


  const filteredUnits = units?.filter(unit => {
    const matchesSearch = unit.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesWorkload = filterWorkload === 'ALL' || unit.workload === filterWorkload;
    const matchesCoverage = filterCoverage === 'ALL' || unit.coverage_status === filterCoverage;
    return matchesSearch && matchesWorkload && matchesCoverage;
  }) || [];

  const handleWorkloadUpdate = (unitId, workload, notes = '') => {
    const weekStartDate = new Date().toISOString().split('T')[0];
    updateWorkloadMutation.mutate({
      id: unitId,
      data: {
        workload,
        week_start_date: weekStartDate,
        notes
      }
    });
  };

  const handleEdit = (unit) => {
    setEditingUnit(unit);
    setShowForm(true);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingUnit(null);
  };


  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const workloadStats = {
    low: units?.filter(u => u.workload === 'Low').length || 0,
    medium: units?.filter(u => u.workload === 'Medium').length || 0,
    high: units?.filter(u => u.workload === 'High').length || 0,
  };

  const coverageStats = {
    good: units?.filter(u => u.coverage_status === 'good').length || 0,
    warning: units?.filter(u => u.coverage_status === 'warning').length || 0,
    critical: units?.filter(u => u.coverage_status === 'critical').length || 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Units</h1>
          <p className="text-gray-600">Manage hospital units and their workload</p>
        </div>
        <div className="flex space-x-2">
          <Button onClick={() => setShowForm(true)} className="hospital-gradient">
            <Building2 className="h-4 w-4 mr-2" />
            Add Unit
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <Label htmlFor="search">Search</Label>
              <Input
                id="search"
                placeholder="Search units..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="workload">Workload</Label>
              <Select value={filterWorkload} onValueChange={setFilterWorkload}>
                <SelectTrigger>
                  <SelectValue placeholder="All workloads" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All workloads</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="coverage">Coverage</Label>
              <Select value={filterCoverage} onValueChange={setFilterCoverage}>
                <SelectTrigger>
                  <SelectValue placeholder="All coverage" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All coverage</SelectItem>
                  <SelectItem value="good">Good</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button 
                variant="outline" 
                onClick={() => {
                  setSearchTerm('');
                  setFilterWorkload('ALL');
                  setFilterCoverage('ALL');
                }}
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Building2 className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-gray-600">Total Units</p>
                <p className="text-2xl font-bold text-gray-900">{units?.length || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-workload-low"></div>
              <div>
                <p className="text-sm font-medium text-gray-600">Low Workload</p>
                <p className="text-2xl font-bold text-gray-900">{workloadStats.low}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-workload-medium"></div>
              <div>
                <p className="text-sm font-medium text-gray-600">Medium Workload</p>
                <p className="text-2xl font-bold text-gray-900">{workloadStats.medium}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-workload-high"></div>
              <div>
                <p className="text-sm font-medium text-gray-600">High Workload</p>
                <p className="text-2xl font-bold text-gray-900">{workloadStats.high}</p>
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
                <p className="text-2xl font-bold text-gray-900">{coverageStats.warning}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <div>
                <p className="text-sm font-medium text-gray-600">Critical (low coverage)</p>
                <p className="text-2xl font-bold text-gray-900">{coverageStats.critical}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Units Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {filteredUnits.map((unit) => (
          <Card key={unit.id} className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{unit.name}</CardTitle>
                <div className="flex items-center space-x-2">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getWorkloadColor(unit.workload)}`}>
                    {unit.workload}
                  </span>
                </div>
              </div>
              <CardDescription>
                Duration: {unit.duration_days} days
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Current Interns */}
              <div>
              <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-gray-700">Current Interns</h4>
                  <span className="text-sm text-gray-500">{unit.current_interns}</span>
                </div>
                {unit.intern_names && unit.intern_names.length > 0 ? (
                  <div className="space-y-1">
                    {unit.intern_names.map((name, index) => {
                      const batch = name.includes('(A)') ? 'A' : 'B';
                      return (
                        <div key={index} className="flex items-center space-x-2 text-sm">
                          <div className={`w-2 h-2 rounded-full ${getBatchColor(batch)}`}></div>
                          <span>{name.replace(' (A)', '').replace(' (B)', '')}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No interns assigned</p>
                )}
              </div>

              {/* Patient Count Information */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-gray-700">Patient Count</h4>
                  <span className="text-sm font-medium text-blue-600">{unit.patient_count || 0} patients</span>
                </div>
                <p className="text-xs text-gray-500">
                  Workload: <span className="font-medium">{unit.workload}</span> (Auto-calculated from patient count)
                </p>
                {(!unit.patient_count || unit.patient_count === 0) && (
                  <p className="text-xs text-yellow-600 mt-1">
                    ⚠️ No patient count set - edit unit to set patient count
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedUnit(unit);
                    setShowCompletedInterns(true);
                  }}
                >
                  <BarChart3 className="h-4 w-4 mr-1" />
                  History
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEdit(unit)}
                >
                  <Edit className="h-4 w-4 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedUnit(unit);
                    setShowCompletedInterns(false);
                  }}
                >
                  <Eye className="h-4 w-4 mr-1" />
                  View
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredUnits.length === 0 && (
        <Card>
          <CardContent className="text-center py-8">
            <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No units found</h3>
            <p className="text-gray-500">No units match your current filters</p>
          </CardContent>
        </Card>
      )}

      {/* View Unit Modal */}
      {selectedUnit && (
        <UnitViewModal 
          unit={selectedUnit} 
          onClose={() => {
            setSelectedUnit(null);
            setShowCompletedInterns(false);
          }}
          showCompletedInterns={showCompletedInterns}
        />
      )}

      {/* Unit Form Modal */}
      {showForm && (
        <UnitForm
          unit={editingUnit}
          onClose={handleFormClose}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['units'] });
            handleFormClose();
          }}
        />
      )}
    </div>
  );
}
