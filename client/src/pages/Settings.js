import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings as SettingsIcon, Save, LogOut } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { useToast } from '../hooks/use-toast';
import { api } from '../services/api';

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    rotation_duration_weeks: 4,
    allow_reassignment: true,
    auto_log_activity: true,
  });
  const [hasChanges, setHasChanges] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['system-settings'],
    queryFn: api.getSystemSettings,
  });

  const updateMutation = useMutation({
    mutationFn: api.updateSystemSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-settings'] });
      toast({
        title: 'Success',
        description: 'System settings updated successfully',
      });
      setHasChanges(false);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update system settings',
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        rotation_duration_weeks: settings.rotation_duration_weeks ?? 4,
        allow_reassignment: settings.allow_reassignment ?? true,
        auto_log_activity: settings.auto_log_activity ?? true,
      });
      setHasChanges(false);
    }
  }, [settings]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    const payload = {
      rotation_duration_weeks: parseInt(formData.rotation_duration_weeks, 10),
      allow_reassignment: !!formData.allow_reassignment,
      auto_log_activity: !!formData.auto_log_activity,
    };

    updateMutation.mutate(payload);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm sm:text-base text-gray-600">Manage core system configuration</p>
      </div>

      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <SettingsIcon className="h-5 w-5" />
            <span>System Settings</span>
          </CardTitle>
          <CardDescription>Configure rotation management system</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label htmlFor="rotation_duration_weeks">Rotation Duration (Weeks)</Label>
            <Input
              id="rotation_duration_weeks"
              type="number"
              min="1"
              max="52"
              value={formData.rotation_duration_weeks}
              onChange={(e) => handleChange('rotation_duration_weeks', e.target.value)}
              placeholder="4"
            />
            <p className="text-xs text-gray-500 mt-1">Default rotation duration in weeks</p>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex-1">
              <Label className="font-medium">Allow Manual Reassignment</Label>
              <p className="text-sm text-gray-500 mt-1">
                Enable manual reassignment of interns between units
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formData.allow_reassignment}
                onChange={(e) => handleChange('allow_reassignment', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex-1">
              <Label className="font-medium">Auto Log Activity</Label>
              <p className="text-sm text-gray-500 mt-1">
                Automatically log system activities (unit/intern changes)
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formData.auto_log_activity}
                onChange={(e) => handleChange('auto_log_activity', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t">
            <Button
              onClick={handleSave}
              disabled={updateMutation.isPending || !hasChanges}
              className="hospital-gradient"
            >
              <Save className="h-4 w-4 mr-2" />
              {updateMutation.isPending ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <SettingsIcon className="h-5 w-5" />
            <span>Account</span>
          </CardTitle>
          <CardDescription>Sign in or sign out of the admin session</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Button
              variant="destructive"
              onClick={() => {
                localStorage.removeItem('adminKey');
                localStorage.removeItem('role');
                toast({
                  title: 'Signed out',
                  description: 'Admin session ended',
                });
                window.location.reload();
              }}
            >
              <LogOut className="h-4 w-4 mr-2" /> Sign Out
            </Button>
          </div>
          <div className="text-xs text-gray-500 sm:text-right">
            {localStorage.getItem('role') === 'admin' ? 'Authenticated as admin' : 'Not signed in'}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
