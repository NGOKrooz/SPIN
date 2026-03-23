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

export default function InternForm({ intern, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    name: '',
    gender: '',
    startDate: '',
    phone: '',
    batch: '',
  });
  const [submitError, setSubmitError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const { toast } = useToast();

  // No initial unit assignment in create flow

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
        startDate: intern.startDate ? String(intern.startDate).slice(0, 10) : '',
        phone: intern.phone || intern.phone_number || '',
        batch: intern.batch || '',
      });
    }
  }, [intern]);

  // Removed initial unit end-date preview

  const handleSubmit = (e) => {
    e.preventDefault();
    
    console.log('🔵 FORM: handleSubmit called');
    console.log('   Form data:', formData);
    console.log('   Is editing?:', !!intern);

    if (!formData.name) {
      toast({
        title: 'Error',
        description: 'Please enter a name',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.gender) {
      toast({
        title: 'Error',
        description: 'Please select a gender',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.startDate) {
      toast({
        title: 'Error',
        description: 'Please choose a start date',
        variant: 'destructive',
      });
      return;
    }

    if (!formData.batch) {
      toast({
        title: 'Error',
        description: 'Please select a batch',
        variant: 'destructive',
      });
      return;
    }

    const submitData = {
      name: formData.name,
      gender: formData.gender,
      startDate: formData.startDate,
      phone: formData.phone,
      batch: formData.batch,
    };

    console.log('📤 FORM: Submitting data:', submitData);
    setSubmitError('');

    if (intern) {
      const internId = intern.id || intern._id;
      console.log('   Mode: UPDATE (ID: ' + internId + ')');
      updateMutation.mutate({ id: internId, data: submitData });
    } else {
      console.log('   Mode: CREATE (new intern)');
      setIsCreating(true);
      const token = localStorage.getItem('token');
      console.log('TOKEN SENT:', token);
      fetch('/api/interns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || ''}`,
        },
        body: JSON.stringify(submitData),
      })
        .then(async (res) => {
          const data = await res.json();
          console.log('CREATE RESPONSE:', data);

          if (!res.ok) {
            throw new Error(data?.error || data?.details || 'Failed to create intern');
          }

          setFormData({
            name: '',
            gender: '',
            startDate: '',
            phone: '',
            batch: '',
          });

          toast({
            title: 'Success',
            description: 'Intern created successfully',
          });

          if (onSuccess) {
            onSuccess();
          }
        })
        .catch((error) => {
          console.error(error);
          setSubmitError(error.message || 'Failed to create intern');
          toast({
            title: 'Error',
            description: error.message || 'Failed to create intern',
            variant: 'destructive',
          });
        })
        .finally(() => {
          setIsCreating(false);
        });
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const isLoading = isCreating || updateMutation.isPending;

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
                <SelectTrigger id="gender">
                  <SelectValue placeholder="Select gender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="startDate">Start Date *</Label>
              <Input
                id="startDate"
                type="date"
                value={formData.startDate}
                onChange={(e) => handleChange('startDate', e.target.value)}
                required
              />
            </div>

            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                placeholder="Optional phone number"
              />
            </div>

            <div>
              <Label htmlFor="batch">Batch *</Label>
              <Select value={formData.batch} onValueChange={(value) => handleChange('batch', value)}>
                <SelectTrigger id="batch">
                  <SelectValue placeholder="Select batch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">Batch A</SelectItem>
                  <SelectItem value="B">Batch B</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {submitError ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {submitError}
              </div>
            ) : null}

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
