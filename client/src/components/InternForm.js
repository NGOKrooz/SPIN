import React, { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, Save, User } from 'lucide-react';
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
  });

  const { toast } = useToast();

  // No initial unit assignment in create flow

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
      console.error('Error creating intern:', error);
      const errorMessage = error?.message || error?.response?.data?.error || 'Failed to create intern';
      toast({
        title: 'Error',
        description: errorMessage,
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
      console.error('Error updating intern:', error);
      const errorMessage = error?.message || error?.response?.data?.error || 'Failed to update intern';
      toast({
        title: 'Error',
        description: errorMessage,
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
      });
    }
  }, [intern]);

  // Removed initial unit end-date preview

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
                    <SelectItem value="A">A</SelectItem>
                    <SelectItem value="B">B</SelectItem>
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
              
            </div>

            

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
