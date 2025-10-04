import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings as SettingsIcon, Save, RefreshCw, Database, Calendar, Users, Building2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { api } from '../services/api';
import { formatDate } from '../lib/utils';
import { useToast } from '../hooks/use-toast';

export default function Settings() {
  const [batchSchedule, setBatchSchedule] = useState({
    batch_a_off_day: 'Monday',
    batch_b_off_day: 'Wednesday',
    internship_duration_months: 12,
    rotation_buffer_days: 2,
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: api.getSettings,
  });

  const { data: batchScheduleData, isLoading: batchLoading } = useQuery({
    queryKey: ['settings', 'batch-schedule'],
    queryFn: api.getBatchSchedule,
  });

  const { data: systemInfo, isLoading: systemLoading } = useQuery({
    queryKey: ['settings', 'system-info'],
    queryFn: api.getSystemInfo,
  });

  const updateBatchScheduleMutation = useMutation({
    mutationFn: api.updateBatchSchedule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast({
        title: 'Success',
        description: 'Batch schedule updated successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update batch schedule',
        variant: 'destructive',
      });
    },
  });

  const updateSettingMutation = useMutation({
    mutationFn: ({ key, value }) => api.updateSetting(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast({
        title: 'Success',
        description: 'Setting updated successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update setting',
        variant: 'destructive',
      });
    },
  });

  React.useEffect(() => {
    if (batchScheduleData) {
      setBatchSchedule(batchScheduleData);
    }
  }, [batchScheduleData]);

  const handleBatchScheduleUpdate = () => {
    updateBatchScheduleMutation.mutate(batchSchedule);
  };

  const handleSettingUpdate = (key, value) => {
    updateSettingMutation.mutate({ key, value });
  };

  const daysOfWeek = [
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
  ];

  if (settingsLoading || batchLoading || systemLoading) {
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
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600">Configure system settings and preferences</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Batch Schedule Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Calendar className="h-5 w-5" />
              <span>Batch Schedule Configuration</span>
            </CardTitle>
            <CardDescription>
              Configure batch off-days and rotation parameters
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label htmlFor="batch-a-off">Batch A Off Day</Label>
              <Select 
                value={batchSchedule.batch_a_off_day} 
                onValueChange={(value) => setBatchSchedule(prev => ({ ...prev, batch_a_off_day: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select day" />
                </SelectTrigger>
                <SelectContent>
                  {daysOfWeek.map((day) => (
                    <SelectItem key={day} value={day}>
                      {day}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="batch-b-off">Batch B Off Day</Label>
              <Select 
                value={batchSchedule.batch_b_off_day} 
                onValueChange={(value) => setBatchSchedule(prev => ({ ...prev, batch_b_off_day: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select day" />
                </SelectTrigger>
                <SelectContent>
                  {daysOfWeek.map((day) => (
                    <SelectItem key={day} value={day}>
                      {day}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="internship-duration">Internship Duration (Months)</Label>
              <Input
                id="internship-duration"
                type="number"
                min="6"
                max="24"
                value={batchSchedule.internship_duration_months}
                onChange={(e) => setBatchSchedule(prev => ({ 
                  ...prev, 
                  internship_duration_months: parseInt(e.target.value) 
                }))}
              />
            </div>

            <div>
              <Label htmlFor="buffer-days">Rotation Buffer Days</Label>
              <Input
                id="buffer-days"
                type="number"
                min="0"
                max="7"
                value={batchSchedule.rotation_buffer_days}
                onChange={(e) => setBatchSchedule(prev => ({ 
                  ...prev, 
                  rotation_buffer_days: parseInt(e.target.value) 
                }))}
              />
            </div>

            <Button 
              onClick={handleBatchScheduleUpdate}
              disabled={updateBatchScheduleMutation.isPending}
              className="hospital-gradient w-full"
            >
              {updateBatchScheduleMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Update Batch Schedule
            </Button>
          </CardContent>
        </Card>

        {/* System Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Database className="h-5 w-5" />
              <span>System Information</span>
            </CardTitle>
            <CardDescription>
              Current system status and statistics
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{systemInfo?.total_interns || 0}</div>
                <div className="text-sm text-blue-600">Total Interns</div>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{systemInfo?.total_units || 0}</div>
                <div className="text-sm text-green-600">Total Units</div>
              </div>
              <div className="text-center p-3 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">{systemInfo?.total_rotations || 0}</div>
                <div className="text-sm text-purple-600">Total Rotations</div>
              </div>
              <div className="text-center p-3 bg-yellow-50 rounded-lg">
                <div className="text-2xl font-bold text-yellow-600">{systemInfo?.active_interns || 0}</div>
                <div className="text-sm text-yellow-600">Active Interns</div>
              </div>
            </div>

            <div className="space-y-2 pt-4 border-t">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Server Version:</span>
                <span className="font-medium">{systemInfo?.server_version || '1.0.0'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Database Path:</span>
                <span className="font-medium text-xs">{systemInfo?.database_path || 'N/A'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Last Updated:</span>
                <span className="font-medium">{formatDate(systemInfo?.last_updated)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <SettingsIcon className="h-5 w-5" />
            <span>System Settings</span>
          </CardTitle>
          <CardDescription>
            Configure various system parameters
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {settings && Object.entries(settings).map(([key, setting]) => (
              <div key={key} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900 capitalize">
                    {key.replace(/_/g, ' ')}
                  </h4>
                  <p className="text-sm text-gray-500">{setting.description}</p>
                </div>
                <div className="flex items-center space-x-3">
                  <Input
                    value={setting.value}
                    onChange={(e) => handleSettingUpdate(key, e.target.value)}
                    className="w-32"
                  />
                  <Button
                    size="sm"
                    onClick={() => handleSettingUpdate(key, setting.value)}
                    disabled={updateSettingMutation.isPending}
                  >
                    <Save className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Batch Status Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Users className="h-5 w-5" />
            <span>Current Batch Configuration</span>
          </CardTitle>
          <CardDescription>
            Overview of current batch settings and their impact
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="p-4 bg-blue-50 rounded-lg">
              <h4 className="font-medium text-blue-900 mb-2">Batch A Configuration</h4>
              <div className="space-y-1 text-sm text-blue-700">
                <div>Off Day: <span className="font-medium">{batchSchedule.batch_a_off_day}</span></div>
                <div>Coverage: <span className="font-medium">Tuesday - Sunday</span></div>
                <div>Total Days: <span className="font-medium">6 days/week</span></div>
              </div>
            </div>
            <div className="p-4 bg-green-50 rounded-lg">
              <h4 className="font-medium text-green-900 mb-2">Batch B Configuration</h4>
              <div className="space-y-1 text-sm text-green-700">
                <div>Off Day: <span className="font-medium">{batchSchedule.batch_b_off_day}</span></div>
                <div>Coverage: <span className="font-medium">Monday, Tuesday, Thursday - Sunday</span></div>
                <div>Total Days: <span className="font-medium">6 days/week</span></div>
              </div>
            </div>
          </div>
          
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-2">Coverage Analysis</h4>
            <div className="text-sm text-gray-600">
              <p>• Both batches provide 6 days of coverage per week</p>
              <p>• Continuous coverage maintained across all units</p>
              <p>• Internship duration: {batchSchedule.internship_duration_months} months</p>
              <p>• Buffer between rotations: {batchSchedule.rotation_buffer_days} days</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
