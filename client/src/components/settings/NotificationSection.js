import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Save, RotateCcw, Mail, FileText, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { api } from '../../services/api';
import { useToast } from '../../hooks/use-toast';

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function NotificationSection({ onSave, onUnsaved }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [notificationSettings, setNotificationSettings] = useState(null);
  const [templates, setTemplates] = useState(null);
  const [settingsChanges, setSettingsChanges] = useState(false);
  const [templatesChanges, setTemplatesChanges] = useState(false);

  const { data: notifSettings, isLoading: settingsLoading, isError: settingsError, error: settingsErr, refetch: refetchSettings } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      try {
        return await api.getNotifications();
      } catch (err) {
        return {
          enabled: true,
          email_enabled: true,
          sms_enabled: false,
          in_app_enabled: true,
          reminder_days_start: 3,
          reminder_days_end: 1,
          weekly_summary_enabled: true,
          weekly_summary_day: 'Monday',
          email_recipients: ''
        };
      }
    },
    retry: 1,
    retryDelay: 1000,
    staleTime: 30000,
  });

  const { data: notifTemplates, isLoading: templatesLoading, isError: templatesError, error: templatesErr, refetch: refetchTemplates } = useQuery({
    queryKey: ['notification-templates'],
    queryFn: async () => {
      try {
        return await api.getNotificationTemplates();
      } catch (err) {
        return {
          rotation_start: 'Dear {intern_name}, your rotation at {unit_name} starts on {start_date}.',
          rotation_end: 'Dear {intern_name}, your rotation at {unit_name} ends on {end_date}.',
          coverage_alert: 'Alert: {unit_name} has insufficient coverage. Current interns: {current_count}, Required: {required_count}.'
        };
      }
    },
    retry: 1,
    retryDelay: 1000,
    staleTime: 30000,
  });

  const updateSettingsMutation = useMutation({
    mutationFn: api.updateNotifications,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast({
        title: 'Success',
        description: 'Notification settings updated successfully',
      });
      setSettingsChanges(false);
      onSave();
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update notification settings',
        variant: 'destructive',
      });
    },
  });

  const updateTemplatesMutation = useMutation({
    mutationFn: api.updateNotificationTemplates,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-templates'] });
      toast({
        title: 'Success',
        description: 'Notification templates updated successfully',
      });
      setTemplatesChanges(false);
      onSave();
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update templates',
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (notifSettings) {
      setNotificationSettings(notifSettings);
    }
  }, [notifSettings]);

  useEffect(() => {
    if (notifTemplates) {
      setTemplates(notifTemplates);
    }
  }, [notifTemplates]);

  const handleSettingsChange = (field, value) => {
    setNotificationSettings(prev => ({ ...prev, [field]: value }));
    setSettingsChanges(true);
    onUnsaved();
  };

  const handleTemplateChange = (field, value) => {
    setTemplates(prev => ({ ...prev, [field]: value }));
    setTemplatesChanges(true);
    onUnsaved();
  };

  const handleSaveSettings = () => {
    if (!notificationSettings) return;
    updateSettingsMutation.mutate(notificationSettings);
  };

  const handleSaveTemplates = () => {
    if (!templates) return;
    updateTemplatesMutation.mutate(templates);
  };

  const previewTemplate = (template, type) => {
    const vars = {
      intern_name: 'John Doe',
      unit_name: 'Cardio Thoracic Unit',
      start_date: '2024-11-15',
      end_date: '2024-12-15',
      current_count: '1',
      required_count: '2'
    };

    let preview = template;
    Object.entries(vars).forEach(([key, value]) => {
      preview = preview.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    });

    return preview;
  };

  if (settingsLoading || templatesLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="text-sm text-gray-500">Loading notification settings...</p>
      </div>
    );
  }

  if (settingsError || templatesError) {
    return (
      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center space-y-4 text-center">
            <AlertCircle className="h-12 w-12 text-red-500" />
            <div>
              <h3 className="text-lg font-medium text-gray-900">Failed to load notification settings</h3>
              <p className="text-sm text-gray-500 mt-1">
                {settingsErr?.message || templatesErr?.message || 'Unknown error occurred'}
              </p>
            </div>
            <div className="flex space-x-3">
              {settingsError && (
                <Button onClick={() => refetchSettings()} variant="outline">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Retry Settings
                </Button>
              )}
              {templatesError && (
                <Button onClick={() => refetchTemplates()} variant="outline">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Retry Templates
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!notificationSettings || !templates) {
    const defaultSettings = {
      enabled: true,
      email_enabled: true,
      sms_enabled: false,
      in_app_enabled: true,
      reminder_days_start: 3,
      reminder_days_end: 1,
      weekly_summary_enabled: true,
      weekly_summary_day: 'Monday',
      email_recipients: ''
    };
    const defaultTemplates = {
      rotation_start: 'Dear {intern_name}, your rotation at {unit_name} starts on {start_date}.',
      rotation_end: 'Dear {intern_name}, your rotation at {unit_name} ends on {end_date}.',
      coverage_alert: 'Alert: {unit_name} has insufficient coverage. Current interns: {current_count}, Required: {required_count}.'
    };
    if (!notificationSettings) setNotificationSettings(defaultSettings);
    if (!templates) setTemplates(defaultTemplates);
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Notification Settings */}
      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Bell className="h-5 w-5" />
            <span>Notification Settings</span>
          </CardTitle>
          <CardDescription>
            Configure notification channels and reminder schedules
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enable/Disable */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex-1">
              <Label className="font-medium">Enable Notifications</Label>
              <p className="text-sm text-gray-500 mt-1">
                Master toggle for all notification features
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={notificationSettings.enabled}
                onChange={(e) => handleSettingsChange('enabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {notificationSettings.enabled && (
            <>
              {/* Channels */}
              <div>
                <h3 className="text-lg font-medium mb-4">Notification Channels</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <Label className="font-medium">Email Notifications</Label>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notificationSettings.email_enabled}
                        onChange={(e) => handleSettingsChange('email_enabled', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <Label className="font-medium">SMS Notifications</Label>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notificationSettings.sms_enabled || false}
                        onChange={(e) => handleSettingsChange('sms_enabled', e.target.checked)}
                        disabled
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-300 rounded-full cursor-not-allowed"></div>
                      <span className="ml-2 text-xs text-gray-500">Coming soon</span>
                    </label>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <Label className="font-medium">In-App Notifications</Label>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notificationSettings.in_app_enabled}
                        onChange={(e) => handleSettingsChange('in_app_enabled', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Reminder Scheduling */}
              <div>
                <h3 className="text-lg font-medium mb-4">Reminder Scheduling</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Days Before Rotation Start</Label>
                    <Input
                      type="number"
                      min="0"
                      value={notificationSettings.reminder_days_start}
                      onChange={(e) => handleSettingsChange('reminder_days_start', parseInt(e.target.value))}
                    />
                    <p className="text-xs text-gray-500 mt-1">Send reminder X days before rotation starts</p>
                  </div>

                  <div>
                    <Label>Days Before Rotation End</Label>
                    <Input
                      type="number"
                      min="0"
                      value={notificationSettings.reminder_days_end}
                      onChange={(e) => handleSettingsChange('reminder_days_end', parseInt(e.target.value))}
                    />
                    <p className="text-xs text-gray-500 mt-1">Send reminder X days before rotation ends</p>
                  </div>
                </div>
              </div>

              {/* Weekly Summary */}
              <div>
                <h3 className="text-lg font-medium mb-4">Weekly Admin Summary</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <Label className="font-medium">Enable Weekly Summary</Label>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notificationSettings.weekly_summary_enabled}
                        onChange={(e) => handleSettingsChange('weekly_summary_enabled', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                  </div>

                  {notificationSettings.weekly_summary_enabled && (
                    <div>
                      <Label>Summary Day</Label>
                      <Select 
                        value={notificationSettings.weekly_summary_day} 
                        onValueChange={(v) => handleSettingsChange('weekly_summary_day', v)}
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
                  )}
                </div>
              </div>

                  {notificationSettings.email_enabled && (
                    <div>
                      <Label>Email Recipients (comma-separated)</Label>
                      <Input
                        type="text"
                        value={notificationSettings.email_recipients || ''}
                        onChange={(e) => handleSettingsChange('email_recipients', e.target.value)}
                        placeholder="admin@hospital.com, supervisor@hospital.com"
                      />
                      <p className="text-xs text-gray-500 mt-1">Email addresses for notifications</p>
                    </div>
                  )}
            </>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t">
            {settingsChanges && (
              <Button variant="outline" onClick={() => {
                setNotificationSettings(notifSettings);
                setSettingsChanges(false);
              }}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            )}
            <Button 
              onClick={handleSaveSettings}
              disabled={updateSettingsMutation.isPending || !settingsChanges}
              className="hospital-gradient"
            >
              <Save className="h-4 w-4 mr-2" />
              {updateSettingsMutation.isPending ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Email Templates */}
      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <FileText className="h-5 w-5" />
            <span>Email Templates</span>
          </CardTitle>
          <CardDescription>
            Customize email notification templates with variables
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-3 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Available variables:</strong> {'{intern_name}'}, {'{unit_name}'}, {'{start_date}'}, {'{end_date}'}, {'{current_count}'}, {'{required_count}'}
            </p>
          </div>

          <div>
            <Label>Rotation Start Reminder Template</Label>
            <Textarea
              value={templates.rotation_start}
              onChange={(e) => handleTemplateChange('rotation_start', e.target.value)}
              rows={3}
              placeholder="Dear {intern_name}, your rotation at {unit_name} starts on {start_date}."
            />
            <div className="mt-2 p-3 bg-gray-50 rounded-lg">
              <p className="text-xs font-medium text-gray-700 mb-1">Preview:</p>
              <p className="text-sm text-gray-600">{previewTemplate(templates.rotation_start, 'start')}</p>
            </div>
          </div>

          <div>
            <Label>Rotation End Reminder Template</Label>
            <Textarea
              value={templates.rotation_end}
              onChange={(e) => handleTemplateChange('rotation_end', e.target.value)}
              rows={3}
              placeholder="Dear {intern_name}, your rotation at {unit_name} ends on {end_date}."
            />
            <div className="mt-2 p-3 bg-gray-50 rounded-lg">
              <p className="text-xs font-medium text-gray-700 mb-1">Preview:</p>
              <p className="text-sm text-gray-600">{previewTemplate(templates.rotation_end, 'end')}</p>
            </div>
          </div>

          <div>
            <Label>Coverage Alert Template</Label>
            <Textarea
              value={templates.coverage_alert}
              onChange={(e) => handleTemplateChange('coverage_alert', e.target.value)}
              rows={3}
              placeholder="Alert: {unit_name} has insufficient coverage. Current interns: {current_count}, Required: {required_count}."
            />
            <div className="mt-2 p-3 bg-gray-50 rounded-lg">
              <p className="text-xs font-medium text-gray-700 mb-1">Preview:</p>
              <p className="text-sm text-gray-600">{previewTemplate(templates.coverage_alert, 'alert')}</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t">
            {templatesChanges && (
              <Button variant="outline" onClick={() => {
                setTemplates(notifTemplates);
                setTemplatesChanges(false);
              }}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            )}
            <Button 
              onClick={handleSaveTemplates}
              disabled={updateTemplatesMutation.isPending || !templatesChanges}
              className="hospital-gradient"
            >
              <Save className="h-4 w-4 mr-2" />
              {updateTemplatesMutation.isPending ? 'Saving...' : 'Save Templates'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

