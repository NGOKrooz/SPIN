import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, AlertTriangle, Edit, Eye, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { api } from '../services/api';
import { getBatchColor, cn } from '../lib/utils';
import { useToast } from '../hooks/use-toast';
import UnitForm from '../components/UnitForm';
import UnitViewModal from '../components/UnitViewModal';
import UnitOrderModal from '../components/UnitOrderModal';

const getWorkloadTone = (value) => {
  switch (String(value || '').toLowerCase()) {
    case 'low':
      return 'bg-emerald-100 text-emerald-700 ring-emerald-200 hover:bg-emerald-200';
    case 'medium':
      return 'bg-amber-100 text-amber-700 ring-amber-200 hover:bg-amber-200';
    case 'high':
      return 'bg-rose-100 text-rose-700 ring-rose-200 hover:bg-rose-200';
    default:
      return 'bg-gray-100 text-gray-700 ring-gray-200 hover:bg-gray-200';
  }
};

export default function Units() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCoverage, setFilterCoverage] = useState('ALL');
  const [showForm, setShowForm] = useState(false);
  const [editingUnit, setEditingUnit] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [showOrderEditor, setShowOrderEditor] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const invalidateUnitDependentQueries = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['units'] });
    queryClient.invalidateQueries({ queryKey: ['rotations'] });
    queryClient.invalidateQueries({ queryKey: ['recentActivities'] });
    queryClient.invalidateQueries({
      predicate: (query) => Array.isArray(query.queryKey)
        && (
          query.queryKey[0] === 'interns'
          || query.queryKey[0] === 'intern'
          || query.queryKey[0] === 'intern-schedule'
        ),
    });
  }, [queryClient]);

  const { data: units, isLoading, isError, error } = useQuery({
    queryKey: ['units'],
    queryFn: api.getUnits,
  });

  const getUnitInterns = React.useCallback((unit) => {
    if (Array.isArray(unit?.interns) && unit.interns.length > 0) {
      return unit.interns;
    }

    if (Array.isArray(unit?.current_rotations) && unit.current_rotations.length > 0) {
      return unit.current_rotations
        .filter((rotation) => rotation?.is_current)
        .map((rotation) => ({
          id: rotation.intern_id || rotation.internId,
          name: rotation.intern_name,
          batch: rotation.intern_batch,
        }))
        .filter((intern) => intern.name);
    }

    if (Array.isArray(unit?.intern_names) && unit.intern_names.length > 0) {
      return unit.intern_names.map((name, index) => {
        const hasBatch = name.endsWith(' (A)') || name.endsWith(' (B)');
        return {
          id: `${unit.id || unit._id || 'unit'}-${index}`,
          name: name.replace(' (A)', '').replace(' (B)', ''),
          batch: hasBatch ? name.slice(-2, -1) : null,
        };
      });
    }

    return [];
  }, []);

  const filteredUnits = units?.filter(unit => {
    const matchesSearch = unit.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCoverage = filterCoverage === 'ALL' || unit.coverage_status === filterCoverage;
      return matchesSearch && matchesCoverage;
  }) || [];

  const getPatientCount = React.useCallback((unit) => {
    return Number(unit?.patient_count ?? unit?.patientCount ?? 0);
  }, []);

  const getWorkloadLabel = React.useCallback((unit) => {
    const patientCount = getPatientCount(unit);
    if (patientCount >= 16) return 'High';
    if (patientCount >= 8) return 'Medium';
    return 'Low';
  }, [getPatientCount]);

  const openUnitDetails = React.useCallback((unitId) => {
    const match = (units || []).find((unit) => String(unit.id || unit._id) === String(unitId));
    if (!match) {
      toast({
        title: 'Unit not found',
        description: 'Unable to open the selected unit details.',
        variant: 'destructive',
      });
      return;
    }

    setSelectedUnit(match);
  }, [toast, units]);


  const handleEdit = (unit) => {
    setEditingUnit(unit);
    setShowForm(true);
  };

  const handleDelete = async (unit) => {
    if (!window.confirm(`Are you sure you want to delete "${unit.name}"?\n\nThis action cannot be undone.`)) {
      return;
    }

    try {
      await api.deleteUnit(unit.id);
      invalidateUnitDependentQueries();
      toast({
        title: 'Unit Deleted',
        description: `${unit.name} has been deleted successfully.`,
      });
    } catch (error) {
      toast({
        title: 'Delete Failed',
        description: error.response?.data?.error || error.message || 'Failed to delete unit',
        variant: 'destructive',
      });
    }
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

  if (isError) {
    return (
      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardContent className="py-8 text-center">
          <AlertTriangle className="h-10 w-10 text-red-500 mx-auto" />
          <h2 className="text-lg font-semibold text-gray-900 mt-3">Unable to load units</h2>
          <p className="text-sm text-gray-600 mt-1">{error?.message || 'Please retry.'}</p>
        </CardContent>
      </Card>
    );
  }

  const coverageStats = {
    good: units?.filter(u => u.coverage_status === 'good').length || 0,
    warning: units?.filter(u => u.coverage_status === 'warning').length || 0,
    critical: units?.filter(u => u.coverage_status === 'critical').length || 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Units</h1>
            <p className="text-sm sm:text-base text-gray-600">Manage hospital units and coverage</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:space-x-2">
          <Button onClick={() => setShowForm(true)} className="hospital-gradient w-full sm:w-auto">
            <Building2 className="h-4 w-4 mr-2" />
            Add Unit
          </Button>
          <Button onClick={() => setShowOrderEditor(true)} variant="outline" className="w-full sm:w-auto">
            Reorder Units
          </Button>
        </div>
      </div>

      {(!units || units.length === 0) && (
        <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
          <CardContent className="py-8 text-center">
            <AlertTriangle className="h-10 w-10 text-yellow-500 mx-auto" />
            <h2 className="text-lg font-semibold text-gray-900 mt-3">No units available. Please create a unit.</h2>
          </CardContent>
        </Card>
      )}

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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
      <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {filteredUnits.map((unit) => {
          const assignedInterns = getUnitInterns(unit);
          const currentInternCount = unit.current_interns ?? unit.currentInterns ?? assignedInterns.length;
          const patientCount = getPatientCount(unit);
          const workloadLabel = getWorkloadLabel(unit);

          return (
          <Card key={unit.id} className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-lg break-words pr-2">{unit.name}</CardTitle>
                <button
                  type="button"
                  onClick={() => openUnitDetails(unit.id || unit._id)}
                  className={cn(
                    'inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 cursor-pointer pointer-events-auto',
                    getWorkloadTone(workloadLabel)
                  )}
                  title={`Open ${unit.name} details`}
                  aria-label={`Open ${unit.name} details from ${workloadLabel} workload badge`}
                >
                  {workloadLabel}
                </button>
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
                  <span className="text-sm text-gray-500">{currentInternCount}</span>
                </div>
                {assignedInterns.length > 0 ? (
                  <div className="space-y-1">
                    {assignedInterns.map((intern, index) => {
                      const batch = intern.batch;
                      return (
                        <div key={intern.id || index} className="flex items-center space-x-2 text-sm min-w-0">
                          <div className={`w-2 h-2 rounded-full ${getBatchColor(batch || 'A')}`}></div>
                          <span className="break-words">{intern.name}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No interns assigned</p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-gray-700">Patients</h4>
                  <span className="text-sm font-medium text-blue-600">{patientCount}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-gray-500 mt-1">
                    Active patients currently assigned to this unit.
                  </p>
                  <button
                    type="button"
                    onClick={() => openUnitDetails(unit.id || unit._id)}
                    className="text-xs font-medium text-blue-600 transition-colors hover:text-blue-700 focus:outline-none focus:underline cursor-pointer pointer-events-auto"
                    title={`View ${unit.name} intern summary`}
                  >
                    View details
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 min-w-[100px]"
                  onClick={() => handleEdit(unit)}
                >
                  <Edit className="h-4 w-4 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 min-w-[100px] text-red-600 hover:text-red-700 hover:border-red-300"
                  onClick={() => handleDelete(unit)}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 min-w-[100px]"
                  onClick={() => {
                    openUnitDetails(unit.id || unit._id);
                  }}
                >
                  <Eye className="h-4 w-4 mr-1" />
                  View
                </Button>
              </div>
            </CardContent>
          </Card>
        );})}
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
          }}
        />
      )}

      {showOrderEditor && (
        <UnitOrderModal
          units={units}
          onClose={() => setShowOrderEditor(false)}
          onSaved={() => {
            invalidateUnitDependentQueries();
          }}
        />
      )}

      {/* Unit Form Modal */}
      {showForm && (
        <UnitForm
          unit={editingUnit}
          onClose={handleFormClose}
          onSuccess={() => {
            invalidateUnitDependentQueries();
            handleFormClose();
          }}
        />
      )}
    </div>
  );
}
