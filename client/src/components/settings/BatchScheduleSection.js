import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Save, RotateCcw, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { api } from '../../services/api';
import { useToast } from '../../hooks/use-toast';

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function BatchScheduleSection({ onSave, onUnsaved }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [localData, setLocalData] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: batchSchedule, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['batch-schedule'],
    queryFn: async () => {
      try {
        return await api.getBatchSchedule();
      } catch (err) {
        // Return default data on error
        return {
          batch_a_off_day_week1: 'Monday',
          batch_b_off_day_week1: 'Wednesday',
          batch_a_off_day_week3: 'Wednesday',
          batch_b_off_day_week3: 'Monday',
          schedule_start_date: '2024-01-01',
          internship_duration_months: 12,
          rotation_buffer_days: 2
        };
      }
    },
    retry: 1,
    retryDelay: 1000,
    staleTime: 30000,
  });

  const updateMutation = useMutation({
    mutationFn: api.updateBatchSchedule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batch-schedule'] });
      toast({
        title: 'Success',
        description: 'Batch schedule updated successfully',
      });
      setHasChanges(false);
      onSave();
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update batch schedule',
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (batchSchedule) {
      setLocalData(batchSchedule);
      setHasChanges(false);
    }
  }, [batchSchedule]);

  const handleChange = (field, value) => {
    setLocalData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
    onUnsaved();
  };

  const handleSave = () => {
    if (!localData) return;
    
    // Validation
    if (localData.batch_a_off_day_week1 === localData.batch_b_off_day_week1) {
      toast({
        title: 'Validation Error',
        description: 'Batch A and Batch B cannot have the same off day in weeks 1&2',
        variant: 'destructive',
      });
      return;
    }

    if (localData.batch_a_off_day_week3 === localData.batch_b_off_day_week3) {
      toast({
        title: 'Validation Error',
        description: 'Batch A and Batch B cannot have the same off day in weeks 3&4',
        variant: 'destructive',
      });
      return;
    }

    updateMutation.mutate(localData);
  };

  const handleReset = () => {
    if (batchSchedule) {
      setLocalData(batchSchedule);
      setHasChanges(false);
      toast({
        title: 'Reset',
        description: 'Changes discarded',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="text-sm text-gray-500">Loading batch schedule...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center space-y-4 text-center">
            <AlertCircle className="h-12 w-12 text-red-500" />
            <div>
              <h3 className="text-lg font-medium text-gray-900">Failed to load batch schedule</h3>
              <p className="text-sm text-gray-500 mt-1">{error?.message || 'Unknown error occurred'}</p>
            </div>
            <Button onClick={() => refetch()} variant="outline">
              <RotateCcw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!localData) {
    // Default data if API returns null
    const defaultData = {
      batch_a_off_day_week1: 'Monday',
      batch_b_off_day_week1: 'Wednesday',
      batch_a_off_day_week3: 'Wednesday',
      batch_b_off_day_week3: 'Monday',
      schedule_start_date: '2024-01-01',
      internship_duration_months: 12,
      rotation_buffer_days: 2
    };
    setLocalData(defaultData);
    return null;
  }

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2 text-lg sm:text-xl">
            <Calendar className="h-5 w-5" />
            <span>Batch Schedule Configuration</span>
          </CardTitle>
          <CardDescription>
            Configure off days and rotation schedule settings for Batch A and Batch B
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Batch A Off Days */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label>Batch A - Weeks 1 & 2 Off Day</Label>
              <Select 
                value={localData.batch_a_off_day_week1} 
                onValueChange={(v) => handleChange('batch_a_off_day_week1', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_OF_WEEK.map(day => (
                    <SelectItem key={day} value={day}>{day}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Batch A - Weeks 3 & 4 Off Day</Label>
              <Select 
                value={localData.batch_a_off_day_week3} 
                onValueChange={(v) => handleChange('batch_a_off_day_week3', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_OF_WEEK.map(day => (
                    <SelectItem key={day} value={day}>{day}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Batch B - Weeks 1 & 2 Off Day</Label>
              <Select 
                value={localData.batch_b_off_day_week1} 
                onValueChange={(v) => handleChange('batch_b_off_day_week1', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_OF_WEEK.map(day => (
                    <SelectItem key={day} value={day}>{day}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Batch B - Weeks 3 & 4 Off Day</Label>
              <Select 
                value={localData.batch_b_off_day_week3} 
                onValueChange={(v) => handleChange('batch_b_off_day_week3', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_OF_WEEK.map(day => (
                    <SelectItem key={day} value={day}>{day}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Schedule Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Schedule Start Date</Label>
              <Input
                type="date"
                value={localData.schedule_start_date}
                onChange={(e) => handleChange('schedule_start_date', e.target.value)}
              />
            </div>

            <div>
              <Label>Internship Duration (months)</Label>
              <Input
                type="number"
                min="6"
                max="24"
                value={localData.internship_duration_months}
                onChange={(e) => handleChange('internship_duration_months', parseInt(e.target.value))}
              />
            </div>

            <div>
              <Label>Rotation Buffer Days</Label>
              <Input
                type="number"
                min="0"
                max="7"
                value={localData.rotation_buffer_days}
                onChange={(e) => handleChange('rotation_buffer_days', parseInt(e.target.value))}
              />
            </div>
          </div>

          {/* Calendar Preview */}
          <div className="p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">Current Off-Day Pattern</h4>
            <div className="text-sm text-blue-800 space-y-2">
              <div className="break-words"><strong>Weeks 1-2:</strong> Batch A off on {localData.batch_a_off_day_week1}, Batch B off on {localData.batch_b_off_day_week1}</div>
              <div className="break-words"><strong>Weeks 3-4:</strong> Batch A off on {localData.batch_a_off_day_week3}, Batch B off on {localData.batch_b_off_day_week3}</div>
            </div>
          </div>

          {/* Validation Warnings */}
          {localData.batch_a_off_day_week1 === localData.batch_b_off_day_week1 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-2">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
              <div className="text-sm text-red-800">
                <strong>Warning:</strong> Batch A and Batch B have the same off day in weeks 1&2. This must be different.
              </div>
            </div>
          )}

          {localData.batch_a_off_day_week3 === localData.batch_b_off_day_week3 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-2">
              <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
              <div className="text-sm text-red-800">
                <strong>Warning:</strong> Batch A and Batch B have the same off day in weeks 3&4. This must be different.
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-3 pt-4 border-t">
            {hasChanges && (
              <Button variant="outline" onClick={handleReset} className="w-full sm:w-auto">
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            )}
            <Button 
              onClick={handleSave}
              disabled={updateMutation.isPending || !hasChanges || 
                localData.batch_a_off_day_week1 === localData.batch_b_off_day_week1 ||
                localData.batch_a_off_day_week3 === localData.batch_b_off_day_week3}
              className="hospital-gradient w-full sm:w-auto"
            >
              <Save className="h-4 w-4 mr-2" />
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

