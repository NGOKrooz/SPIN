import React, { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, Save, User } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { api } from '../services/api';
import { useToast } from '../hooks/use-toast';

export default function InternForm({ intern, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    name: '',
  });

  const { toast } = useToast();

  // No initial unit assignment in create flow

  const createMutation = useMutation({
    mutationFn: (data) => {
      console.log('🔵 FORM: Submitting create intern request:', data);
      return api.createIntern(data);
    },
    onSuccess: (data) => {
      console.log('✅ FORM: Intern created successfully');
      console.log('   Response data:', data);
      console.log('   Response type:', typeof data);
      console.log('   Response keys:', Array.isArray(data) ? 'Array' : Object.keys(data));
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        console.log('   Intern ID:', data.id);
        console.log('   Intern name:', data.name);
      }
      toast({
        title: 'Success',
        description: 'Intern created successfully',
      });
      // Call onSuccess which should invalidate queries and close modal
      // Use setTimeout to ensure toast shows and then trigger refresh
      setTimeout(() => {
        if (onSuccess) {
          console.log('📤 FORM: Calling onSuccess callback');
          onSuccess();
        }
      }, 100);
    },
    onError: (error) => {
      console.error('❌ FORM: Error creating intern:', error);
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

    const submitData = {
      name: formData.name,
    };

    console.log('📤 FORM: Submitting data:', submitData);

    if (intern) {
      console.log('   Mode: UPDATE (ID: ' + intern.id + ')');
      updateMutation.mutate({ id: intern.id, data: submitData });
    } else {
      console.log('   Mode: CREATE (new intern)');
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
