import React, { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { X, Save, User, Calendar } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { api } from '../services/api';
import { useToast } from '../hooks/use-toast';
import { addDays, format } from 'date-fns';

export default function InternForm({ intern, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    name: '',
    gender: '',
    batch: '',
    start_date: '',
    phone_number: '',
    extension_days: 0,
    initial_unit_id: '',
  });

  const { toast } = useToast();

  // Fetch units for dropdown
  const { data: units } = useQuery({
    queryKey: ['units'],
    queryFn: api.getUnits,
  });

  const createMutation = useMutation({
    mutationFn: api.createIntern,
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Intern created successfully',
      });
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create intern',
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => api.updateIntern(id, data),
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Intern updated successfully',
      });
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update intern',
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (intern) {
      setFormData({
        name: intern.name || '',
        gender: intern.gender || '',
        batch: intern.batch || '',
        start_date: intern.start_date || '',
        phone_number: intern.phone_number || '',
        extension_days: intern.extension_days || 0,
        initial_unit_id: intern.initial_unit_id || '',
      });
    }
  }, [intern]);

  // Calculate end date based on selected unit and start date
  const getCalculatedEndDate = () => {
    if (!formData.start_date || !formData.initial_unit_id) return '';
    const selectedUnit = units?.find(unit => unit.id === parseInt(formData.initial_unit_id));
    if (selectedUnit) {
      return format(addDays(new Date(formData.start_date), selectedUnit.duration_days), 'yyyy-MM-dd');
    }
    return '';
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!formData.name || !formData.gender || !formData.batch || !formData.start_date) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    const submitData = {
      ...formData,
      extension_days: parseInt(formData.extension_days) || 0,
    };

    if (intern) {
      updateMutation.mutate({ id: intern.id, data: submitData });
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
              <User className="h-5 w-5" />
              <span>{intern ? 'Edit Intern' : 'Add New Intern'}</span>
            </CardTitle>
            <CardDescription>
              {intern ? 'Update intern information' : 'Register a new physiotherapy intern'}
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="Enter full name"
                  required
                />
              </div>
              <div>
                <Label htmlFor="gender">Gender *</Label>
                <Select value={formData.gender} onValueChange={(value) => handleChange('gender', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="batch">Batch *</Label>
                <Select value={formData.batch} onValueChange={(value) => handleChange('batch', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select batch" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">Batch A (Monday off)</SelectItem>
                    <SelectItem value="B">Batch B (Wednesday off)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="start_date">Start Date *</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => handleChange('start_date', e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="phone_number">Phone Number</Label>
                <Input
                  id="phone_number"
                  value={formData.phone_number}
                  onChange={(e) => handleChange('phone_number', e.target.value)}
                  placeholder="Enter phone number"
                />
              </div>
              {!intern && (
                <div>
                  <Label htmlFor="initial_unit">Initial Unit Assignment</Label>
                  <Select 
                    value={formData.initial_unit_id} 
                    onValueChange={(value) => handleChange('initial_unit_id', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select initial unit" />
                    </SelectTrigger>
                    <SelectContent>
                      {units?.map((unit) => (
                        <SelectItem key={unit.id} value={unit.id.toString()}>
                          {unit.name} ({unit.duration_days} days)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Show calculated end date if unit and start date are selected */}
            {!intern && formData.start_date && formData.initial_unit_id && (
              <div className="bg-blue-50 p-3 rounded-lg">
                <div className="flex items-center space-x-2 text-sm">
                  <Calendar className="h-4 w-4 text-blue-600" />
                  <span className="text-blue-800">
                    Calculated end date: <strong>{getCalculatedEndDate()}</strong>
                  </span>
                </div>
                <p className="text-xs text-blue-600 mt-1">
                  Based on {units?.find(u => u.id === parseInt(formData.initial_unit_id))?.name} duration
                </p>
              </div>
            )}

            {formData.status === 'Extended' && (
              <div>
                <Label htmlFor="extension_days">Extension Days</Label>
                <Input
                  id="extension_days"
                  type="number"
                  min="1"
                  max="365"
                  value={formData.extension_days}
                  onChange={(e) => handleChange('extension_days', e.target.value)}
                  placeholder="Enter extension days"
                />
              </div>
            )}

            <div className="flex items-center justify-end space-x-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading} className="hospital-gradient">
                <Save className="h-4 w-4 mr-2" />
                {isLoading ? 'Saving...' : (intern ? 'Update' : 'Create')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
