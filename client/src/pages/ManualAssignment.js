import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Calendar, Building2, Users, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { api } from '../services/api';
import { formatDate, getBatchColor, getWorkloadColor } from '../lib/utils';
import { useToast } from '../hooks/use-toast';

export default function ManualAssignment() {
  const [formData, setFormData] = useState({
    intern_id: '',
    unit_id: '',
    start_date: '',
    end_date: '',
  });
  const [conflicts, setConflicts] = useState([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: interns, isLoading: internsLoading } = useQuery({
    queryKey: ['interns'],
    queryFn: api.getInterns,
  });

  const { data: units, isLoading: unitsLoading } = useQuery({
    queryKey: ['units'],
    queryFn: api.getUnits,
  });

  const { data: rotations, isLoading: rotationsLoading } = useQuery({
    queryKey: ['rotations'],
    queryFn: api.getRotations,
  });

  const createMutation = useMutation({
    mutationFn: api.createRotation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rotations'] });
      queryClient.invalidateQueries({ queryKey: ['units'] });
      queryClient.invalidateQueries({ queryKey: ['interns'] });
      toast({
        title: 'Success',
        description: 'Manual assignment created successfully',
      });
      setFormData({
        intern_id: '',
        unit_id: '',
        start_date: '',
        end_date: '',
      });
      setConflicts([]);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create manual assignment',
        variant: 'destructive',
      });
    },
  });

  const checkConflicts = () => {
    if (!formData.intern_id || !formData.start_date || !formData.end_date) {
      setConflicts([]);
      return;
    }

    const internRotations = rotations?.filter(rotation => 
      rotation.intern_id === parseInt(formData.intern_id)
    ) || [];

    const newStartDate = new Date(formData.start_date);
    const newEndDate = new Date(formData.end_date);

    const foundConflicts = internRotations.filter(rotation => {
      const existingStart = new Date(rotation.start_date);
      const existingEnd = new Date(rotation.end_date);

      return (
        (newStartDate >= existingStart && newStartDate <= existingEnd) ||
        (newEndDate >= existingStart && newEndDate <= existingEnd) ||
        (newStartDate <= existingStart && newEndDate >= existingEnd)
      );
    });

    setConflicts(foundConflicts);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!formData.intern_id || !formData.unit_id || !formData.start_date || !formData.end_date) {
      toast({
        title: 'Error',
        description: 'Please fill in all fields',
        variant: 'destructive',
      });
      return;
    }

    // Validate that assignment start date is not before intern's start date
    if (selectedIntern && new Date(formData.start_date) < new Date(selectedIntern.start_date)) {
      toast({
        title: 'Error',
        description: `Assignment cannot start before intern's start date (${formatDate(selectedIntern.start_date)})`,
        variant: 'destructive',
      });
      return;
    }

    if (new Date(formData.start_date) >= new Date(formData.end_date)) {
      toast({
        title: 'Error',
        description: 'End date must be after start date',
        variant: 'destructive',
      });
      return;
    }

    if (conflicts.length > 0) {
      toast({
        title: 'Error',
        description: 'Cannot assign due to conflicting rotations',
        variant: 'destructive',
      });
      return;
    }

    createMutation.mutate({
      ...formData,
      intern_id: parseInt(formData.intern_id),
      unit_id: parseInt(formData.unit_id),
      is_manual_assignment: true,
    });
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Check conflicts when relevant fields change
    if (field === 'intern_id' || field === 'start_date' || field === 'end_date') {
      setTimeout(checkConflicts, 100);
    }
  };

  const selectedIntern = interns?.find(intern => intern.id === parseInt(formData.intern_id));
  const selectedUnit = units?.find(unit => unit.id === parseInt(formData.unit_id));

  // Filter out interns who currently have active units (current rotations)
  const availableInterns = interns?.filter(intern => {
    // Exclude interns who have current_units (meaning they're actively in a unit)
    return intern.status === 'Active' && (!intern.current_units || intern.current_units.length === 0);
  }) || [];

  if (internsLoading || unitsLoading || rotationsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Manual Assignment</h1>
        <p className="text-gray-600">Manually assign interns to units for special cases</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Assignment Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <UserPlus className="h-5 w-5" />
              <span>Create Manual Assignment</span>
            </CardTitle>
            <CardDescription>
              Assign an intern to a unit outside of the normal rotation schedule
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Label htmlFor="intern_id">Select Intern *</Label>
                <Select value={formData.intern_id} onValueChange={(value) => handleChange('intern_id', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose an intern" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableInterns.length === 0 ? (
                      <div className="px-2 py-1 text-sm text-gray-500">No available interns (all are currently in active units)</div>
                    ) : (
                      availableInterns.map((intern) => (
                        <SelectItem key={intern.id} value={intern.id.toString()}>
                          <div className="flex items-center space-x-2">
                            <span>{intern.name}</span>
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium text-white ${getBatchColor(intern.batch)}`}>
                              {intern.batch}
                            </span>
                          </div>
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {availableInterns.length === 0 && (
                  <p className="text-xs text-yellow-600 mt-1">
                    All active interns are currently assigned to units. Only interns without active assignments can be manually assigned.
                  </p>
                )}
              </div>

              <div>
                <Label htmlFor="unit_id">Select Unit *</Label>
                <Select value={formData.unit_id} onValueChange={(value) => handleChange('unit_id', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {units?.map((unit) => (
                      <SelectItem key={unit.id} value={unit.id.toString()}>
                        <div className="flex items-center justify-between w-full">
                          <span>{unit.name}</span>
                          <span className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium text-white ${getWorkloadColor(unit.workload)}`}>
                            {unit.workload}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="start_date">Start Date *</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={formData.start_date}
                    min={selectedIntern?.start_date || undefined}
                    onChange={(e) => handleChange('start_date', e.target.value)}
                    required
                  />
                  {selectedIntern && (
                    <p className="text-xs text-gray-500 mt-1">
                      Intern started on: {formatDate(selectedIntern.start_date)}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="end_date">End Date *</Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => handleChange('end_date', e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Conflicts Warning */}
              {conflicts.length > 0 && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center space-x-2 text-red-800">
                    <AlertCircle className="h-5 w-5" />
                    <span className="font-medium">Conflicting Rotations Found</span>
                  </div>
                  <div className="mt-2 space-y-1">
                    {conflicts.map((conflict, index) => (
                      <div key={index} className="text-sm text-red-700">
                        {conflict.unit_name}: {formatDate(conflict.start_date)} - {formatDate(conflict.end_date)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button 
                type="submit" 
                disabled={createMutation.isPending || conflicts.length > 0}
                className="hospital-gradient w-full"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Assignment'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Assignment Preview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Calendar className="h-5 w-5" />
              <span>Assignment Preview</span>
            </CardTitle>
            <CardDescription>
              Review the assignment details before creating
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedIntern && selectedUnit ? (
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-2">Intern Details</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center space-x-2">
                      <Users className="h-4 w-4 text-gray-500" />
                      <span>{selectedIntern.name}</span>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium text-white ${getBatchColor(selectedIntern.batch)}`}>
                        Batch {selectedIntern.batch}
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-gray-500">Status:</span>
                      <span className="font-medium">{selectedIntern.status}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-gray-500">Started:</span>
                      <span className="font-medium">{formatDate(selectedIntern.start_date)}</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-gray-900 mb-2">Unit Details</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center space-x-2">
                      <Building2 className="h-4 w-4 text-gray-500" />
                      <span>{selectedUnit.name}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-gray-500">Duration:</span>
                      <span className="font-medium">{selectedUnit.duration_days} days</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-gray-500">Workload:</span>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium text-white ${getWorkloadColor(selectedUnit.workload)}`}>
                        {selectedUnit.workload}
                      </span>
                    </div>
                  </div>
                </div>

                {formData.start_date && formData.end_date && (
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <h4 className="font-medium text-gray-900 mb-2">Assignment Period</h4>
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4 text-gray-500" />
                        <span>Start: {formatDate(formData.start_date)}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4 text-gray-500" />
                        <span>End: {formatDate(formData.end_date)}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-gray-500">Duration:</span>
                        <span className="font-medium">
                          {Math.ceil((new Date(formData.end_date) - new Date(formData.start_date)) / (1000 * 60 * 60 * 24)) + 1} days
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <UserPlus className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <p>Select an intern and unit to see assignment preview</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Manual Assignments */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Manual Assignments</CardTitle>
          <CardDescription>
            Latest manual assignments created outside normal rotation
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rotations?.filter(rotation => rotation.is_manual_assignment).length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No manual assignments found
            </div>
          ) : (
            <div className="space-y-3">
              {rotations
                ?.filter(rotation => rotation.is_manual_assignment)
                .slice(0, 5)
                .map((rotation) => {
                  const isActiveRotation = new Date(rotation.start_date) <= new Date() && new Date(rotation.end_date) >= new Date();
                  
                  return (
                    <div key={rotation.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm ${getBatchColor(rotation.intern_batch)}`}>
                          {rotation.intern_batch}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{rotation.intern_name}</p>
                          <p className="text-xs text-gray-500">{rotation.unit_name}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">
                          {formatDate(rotation.start_date)} - {formatDate(rotation.end_date)}
                        </p>
                        <div className="flex items-center space-x-1 mt-1">
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                            Manual
                          </span>
                          {isActiveRotation && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Active
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
