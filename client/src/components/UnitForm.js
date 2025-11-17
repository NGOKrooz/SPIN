import React, { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, Save, Building2, Clock, BarChart3 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { api } from '../services/api';
import { useToast } from '../hooks/use-toast';

export default function UnitForm({ unit, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    name: '',
    duration_days: '',
    description: '',
    patient_count: '',
  });

  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: api.createUnit,
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Unit created successfully',
      });
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create unit',
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.updateUnit(id, data),
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Unit updated successfully',
      });
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update unit',
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (unit) {
      console.log('Initializing form with unit data:', unit);
      setFormData({
        name: unit.name || '',
        duration_days: unit.duration_days || '',
        description: unit.description || '',
        patient_count: unit.patient_count || '',
      });
    }
  }, [unit]);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!formData.name || !formData.duration_days) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    const submitData = {
      ...formData,
      duration_days: parseInt(formData.duration_days),
      patient_count: parseInt(formData.patient_count) || 0,
    };

    console.log('Submitting unit data:', submitData);

    if (unit) {
      updateMutation.mutate({ id: unit.id, data: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="flex items-center space-x-2">
              <Building2 className="h-5 w-5" />
              <span>{unit ? 'Edit Unit' : 'Add New Unit'}</span>
            </CardTitle>
            <CardDescription>
              {unit ? 'Update unit information' : 'Add a new hospital unit'}
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="name">Unit Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="Enter unit name"
                required
              />
            </div>

            <div>
              <Label htmlFor="duration_days">Duration (Days) *</Label>
              <Input
                id="duration_days"
                type="number"
                min="1"
                max="365"
                value={formData.duration_days}
                onChange={(e) => handleChange('duration_days', e.target.value)}
                placeholder="Enter duration in days"
                required
              />
            </div>

            <div>
              <Label htmlFor="patient_count">Patient count (WorkLoad)</Label>
              <Input
                id="patient_count"
                type="number"
                min="0"
                value={formData.patient_count}
                onChange={(e) => {
                  const value = e.target.value;
                  console.log('Patient count changed:', value);
                  handleChange('patient_count', value);
                  // Auto-calculate workload based on patient count
                  if (value !== '' && !isNaN(value)) {
                    const count = parseInt(value);
                    let workload;
                    if (count <= 4) {
                      workload = 'Low';
                    } else if (count <= 8) {
                      workload = 'Medium';
                    } else {
                      workload = 'High';
                    }
                    console.log('Auto-calculated workload:', workload);
                    handleChange('workload', workload);
                  }
                }}
                placeholder="Enter patient count"
              />
            </div>


            <div>
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                placeholder="Enter unit description (optional)"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading} className="hospital-gradient">
                <Save className="h-4 w-4 mr-2" />
                {isLoading ? 'Saving...' : (unit ? 'Update' : 'Create')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
