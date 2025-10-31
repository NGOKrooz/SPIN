import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Database, Download, Upload, Trash2, FileText, AlertTriangle, Save, AlertCircle, RotateCcw, Cloud, CloudOff, RefreshCw, Clock, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { api } from '../../services/api';
import { useToast } from '../../hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

export default function DataManagementSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [restoreFile, setRestoreFile] = useState(null);
  const [exportFormatLocal, setExportFormatLocal] = useState(null);
  const [exportFormatChanges, setExportFormatChanges] = useState(false);
  const [cloudConfig, setCloudConfig] = useState(null);

  const { data: exportFormat, isLoading: exportLoading, isError: exportError, error: exportErr, refetch: refetchExport } = useQuery({
    queryKey: ['export-format'],
    queryFn: async () => {
      try {
        return await api.getExportFormat();
      } catch (err) {
        return {
          default_format: 'Excel',
          include_images_pdf: false,
          date_format: 'YYYY-MM-DD',
          include_system_info: true
        };
      }
    },
    retry: 1,
    retryDelay: 1000,
    staleTime: 30000,
  });

  const { data: systemInfo, isLoading: systemInfoLoading, isError: systemInfoError } = useQuery({
    queryKey: ['system-info'],
    queryFn: api.getSystemInfo,
    retry: 1,
    retryDelay: 1000,
    staleTime: 60000,
  });

  const { data: cloudConfigData, isLoading: cloudConfigLoading, refetch: refetchCloudConfig } = useQuery({
    queryKey: ['cloud-config'],
    queryFn: api.getCloudConfig,
    retry: 1,
    retryDelay: 1000,
    staleTime: 60000,
  });

  const { data: cloudBackups, isLoading: cloudBackupsLoading, refetch: refetchCloudBackups } = useQuery({
    queryKey: ['cloud-backups'],
    queryFn: api.listCloudBackups,
    retry: 1,
    retryDelay: 1000,
    staleTime: 30000,
    enabled: cloudConfigData?.enabled === true && cloudConfigData?.configured === true,
  });

  useEffect(() => {
    if (cloudConfigData) {
      setCloudConfig(cloudConfigData);
    }
  }, [cloudConfigData]);

  const cloudBackupMutation = useMutation({
    mutationFn: () => api.backupToCloud('critical'),
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Backup uploaded to cloud successfully',
      });
      refetchCloudBackups();
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to upload backup to cloud',
        variant: 'destructive',
      });
    },
  });

  const autoRestoreMutation = useMutation({
    mutationFn: api.triggerAutoRestore,
    onSuccess: (data) => {
      if (data.performed) {
        toast({
          title: 'Auto-Restore Completed',
          description: `Restored from backup: ${data.backupFile}`,
        });
        queryClient.invalidateQueries();
        setTimeout(() => window.location.reload(), 2000);
      } else {
        toast({
          title: 'Auto-Restore Skipped',
          description: data.reason || 'No restore needed',
        });
      }
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to perform auto-restore',
        variant: 'destructive',
      });
    },
  });

  const backupMutation = useMutation({
    mutationFn: (type) => api.createBackup(type),
    onSuccess: (data) => {
      // Download the backup as JSON
      const blob = new Blob([JSON.stringify(data.backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `spin-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: 'Success',
        description: 'Backup created and downloaded successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create backup',
        variant: 'destructive',
      });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: ({ backup, tables }) => api.restoreBackup(backup, tables),
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast({
        title: 'Success',
        description: 'Backup restored successfully. Please refresh the page.',
      });
      setTimeout(() => window.location.reload(), 2000);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to restore backup',
        variant: 'destructive',
      });
    },
  });

  const updateExportFormatMutation = useMutation({
    mutationFn: api.updateExportFormat,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['export-format'] });
      toast({
        title: 'Success',
        description: 'Export format settings updated successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update export format',
        variant: 'destructive',
      });
    },
  });

  const handleBackup = (type) => {
    const typeLabel = type === 'critical' ? 'critical data (interns, rotations, settings)' : 'settings only';
    if (!window.confirm(`Create ${typeLabel} backup?`)) {
      return;
    }
    backupMutation.mutate(type);
  };

  const handleRestore = () => {
    if (!restoreFile) {
      toast({
        title: 'Error',
        description: 'Please select a backup file',
        variant: 'destructive',
      });
      return;
    }

    if (!window.confirm('WARNING: This will replace all existing data with the backup. This cannot be undone. Continue?')) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const backup = JSON.parse(e.target.result);
        if (!backup.metadata) {
          toast({
            title: 'Error',
            description: 'Invalid backup file format',
            variant: 'destructive',
          });
          return;
        }
        restoreMutation.mutate({ backup });
      } catch (err) {
        toast({
          title: 'Error',
          description: 'Failed to parse backup file',
          variant: 'destructive',
        });
      }
    };
    reader.readAsText(restoreFile);
  };

  useEffect(() => {
    if (exportFormat) {
      setExportFormatLocal(exportFormat);
    }
  }, [exportFormat]);

  const handleExportFormatChange = (field, value) => {
    if (!exportFormatLocal) return;
    const updated = { ...exportFormatLocal, [field]: value };
    setExportFormatLocal(updated);
    setExportFormatChanges(true);
  };

  const handleSaveExportFormat = () => {
    if (!exportFormatLocal) return;
    updateExportFormatMutation.mutate(exportFormatLocal);
    setExportFormatChanges(false);
  };

  if (exportLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="text-sm text-gray-500">Loading data management settings...</p>
      </div>
    );
  }

  if (exportError) {
    return (
      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center space-y-4 text-center">
            <AlertCircle className="h-12 w-12 text-red-500" />
            <div>
              <h3 className="text-lg font-medium text-gray-900">Failed to load export settings</h3>
              <p className="text-sm text-gray-500 mt-1">{exportErr?.message || 'Unknown error occurred'}</p>
            </div>
            <Button onClick={() => refetchExport()} variant="outline">
              <RotateCcw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!exportFormat || !exportFormatLocal) {
    const defaultExport = {
      default_format: 'Excel',
      include_images_pdf: false,
      date_format: 'YYYY-MM-DD',
      include_system_info: true
    };
    if (!exportFormatLocal) setExportFormatLocal(defaultExport);
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Backup & Restore */}
      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Database className="h-5 w-5" />
            <span>Backup & Restore</span>
          </CardTitle>
          <CardDescription>
            Create backups of your data or restore from previous backups
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Create Backup */}
          <div>
            <h3 className="text-lg font-medium mb-4">Create Backup</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Button
                variant="outline"
                onClick={() => handleBackup('critical')}
                disabled={backupMutation.isPending}
                className="w-full"
              >
                <Download className="h-4 w-4 mr-2" />
                {backupMutation.isPending ? 'Creating...' : 'Backup Critical Data'}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleBackup('settings')}
                disabled={backupMutation.isPending}
                className="w-full"
              >
                <Download className="h-4 w-4 mr-2" />
                {backupMutation.isPending ? 'Creating...' : 'Backup Settings Only'}
              </Button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Backups are downloaded as JSON files. Store them in a safe location.
            </p>
          </div>

          {/* Cloud Backup */}
          {cloudConfig && (
            <div>
              <h3 className="text-lg font-medium mb-4">Cloud Backup</h3>
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      {cloudConfig.enabled && cloudConfig.configured ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : (
                        <CloudOff className="h-5 w-5 text-gray-400" />
                      )}
                      <span className="font-medium">
                        {cloudConfig.provider === 'onedrive' ? 'OneDrive' : 'Google Drive'}
                      </span>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${cloudConfig.enabled && cloudConfig.configured ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                      {cloudConfig.enabled && cloudConfig.configured ? 'Connected' : 'Not Configured'}
                    </span>
                  </div>
                  {!cloudConfig.configured && (
                    <p className="text-xs text-gray-600 mt-2">
                      Configure cloud storage credentials in your .env file to enable cloud backups.
                    </p>
                  )}
                </div>

                {cloudConfig.enabled && cloudConfig.configured && (
                  <>
                    <Button
                      onClick={() => cloudBackupMutation.mutate()}
                      disabled={cloudBackupMutation.isPending}
                      className="w-full hospital-gradient"
                    >
                      <Cloud className="h-4 w-4 mr-2" />
                      {cloudBackupMutation.isPending ? 'Uploading...' : 'Backup to Cloud'}
                    </Button>

                    {cloudConfig.enabled && cloudConfig.configured && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <Label className="font-medium">Available Cloud Backups</Label>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => refetchCloudBackups()}
                            disabled={cloudBackupsLoading}
                          >
                            <RefreshCw className={`h-4 w-4 ${cloudBackupsLoading ? 'animate-spin' : ''}`} />
                          </Button>
                        </div>
                        {cloudBackupsLoading ? (
                          <p className="text-sm text-gray-500">Loading backups...</p>
                        ) : cloudBackups && cloudBackups.backups && cloudBackups.backups.length > 0 ? (
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {cloudBackups.backups.map((backup, idx) => (
                              <div key={idx} className="p-3 bg-gray-50 rounded-lg flex items-center justify-between">
                                <div className="flex-1">
                                  <p className="text-sm font-medium">{backup.name}</p>
                                  <p className="text-xs text-gray-500">
                                    {new Date(backup.modified).toLocaleString()}
                                  </p>
                                </div>
                                <div className="text-xs text-gray-400">
                                  {backup.size ? `${(backup.size / 1024).toFixed(1)} KB` : ''}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">No backups found in cloud storage.</p>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Automatic Restore */}
          <div>
            <h3 className="text-lg font-medium mb-4">Automatic Restore</h3>
            <div className="p-4 bg-purple-50 rounded-lg">
              <p className="text-sm text-purple-800 mb-3">
                Automatic restore runs on fresh deployments. It detects when the database is empty and 
                automatically restores the latest backup from cloud storage.
              </p>
              <Button
                variant="outline"
                onClick={() => autoRestoreMutation.mutate()}
                disabled={autoRestoreMutation.isPending}
                className="w-full"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${autoRestoreMutation.isPending ? 'animate-spin' : ''}`} />
                {autoRestoreMutation.isPending ? 'Checking...' : 'Trigger Auto-Restore Check'}
              </Button>
            </div>
          </div>

          {/* Restore Backup */}
          <div>
            <h3 className="text-lg font-medium mb-4">Restore Backup</h3>
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <div className="flex-1">
                  <Label>Select Backup File</Label>
                  <Input
                    type="file"
                    accept=".json"
                    onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
                  />
                </div>
              </div>
              
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start space-x-2">
                  <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5" />
                  <div className="text-sm text-red-800">
                    <strong>Warning:</strong> Restoring a backup will replace all existing data. 
                    Make sure you have a current backup before proceeding.
                  </div>
                </div>
              </div>

              <Button
                variant="destructive"
                onClick={handleRestore}
                disabled={!restoreFile || restoreMutation.isPending}
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                {restoreMutation.isPending ? 'Restoring...' : 'Restore Backup'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Export Format Settings */}
      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <FileText className="h-5 w-5" />
            <span>Export Format Preferences</span>
          </CardTitle>
          <CardDescription>
            Configure default export formats for reports and data exports
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Default Export Format</Label>
            <Select 
              value={exportFormatLocal.default_format} 
              onValueChange={(v) => handleExportFormatChange('default_format', v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Excel">Excel (.xlsx)</SelectItem>
                <SelectItem value="PDF">PDF</SelectItem>
                <SelectItem value="CSV">CSV</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Date Format</Label>
            <Select 
              value={exportFormatLocal.date_format} 
              onValueChange={(v) => handleExportFormatChange('date_format', v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex-1">
              <Label className="font-medium">Include Images in PDF</Label>
              <p className="text-sm text-gray-500 mt-1">
                Include charts and graphs in PDF exports
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={exportFormatLocal.include_images_pdf}
                onChange={(e) => handleExportFormatChange('include_images_pdf', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex-1">
              <Label className="font-medium">Include System Info in Exports</Label>
              <p className="text-sm text-gray-500 mt-1">
                Add system metadata to exported files
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={exportFormatLocal.include_system_info}
                onChange={(e) => handleExportFormatChange('include_system_info', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t">
            {exportFormatChanges && (
              <Button variant="outline" onClick={() => {
                setExportFormatLocal(exportFormat);
                setExportFormatChanges(false);
              }}>
                Reset
              </Button>
            )}
            <Button 
              onClick={handleSaveExportFormat}
              disabled={updateExportFormatMutation.isPending || !exportFormatChanges}
              className="hospital-gradient"
            >
              <Save className="h-4 w-4 mr-2" />
              {updateExportFormatMutation.isPending ? 'Saving...' : 'Save Export Format'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Database Statistics */}
      {systemInfo && (
        <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Database className="h-5 w-5" />
              <span>Database Statistics</span>
            </CardTitle>
            <CardDescription>
              Current database information and record counts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-600 font-medium">Total Interns</p>
                <p className="text-2xl font-bold text-blue-900">{systemInfo.total_interns || 0}</p>
              </div>
              <div className="p-3 bg-green-50 rounded-lg">
                <p className="text-sm text-green-600 font-medium">Active Units</p>
                <p className="text-2xl font-bold text-green-900">{systemInfo.total_units || 0}</p>
              </div>
              <div className="p-3 bg-purple-50 rounded-lg">
                <p className="text-sm text-purple-600 font-medium">Total Rotations</p>
                <p className="text-2xl font-bold text-purple-900">{systemInfo.total_rotations || 0}</p>
              </div>
              <div className="p-3 bg-orange-50 rounded-lg">
                <p className="text-sm text-orange-600 font-medium">Active Interns</p>
                <p className="text-2xl font-bold text-orange-900">{systemInfo.active_interns || 0}</p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t">
              <p className="text-xs text-gray-500">
                <strong>Database Path:</strong> {systemInfo.database_path}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                <strong>Last Updated:</strong> {new Date(systemInfo.last_updated).toLocaleString()}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

