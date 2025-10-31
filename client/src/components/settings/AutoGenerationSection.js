import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Save, Settings, AlertCircle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { api } from '../../services/api';
import { useToast } from '../../hooks/use-toast';

export default function AutoGenerationSection({ onSave, onUnsaved }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [localData, setLocalData] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: autoGen, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['auto-generation'],
    queryFn: async () => {
      try {
        return await api.getAutoGeneration();
      } catch (err) {
        return {
          auto_generate_on_create: false,
          auto_extend_on_extension: true,
          allow_overlap: false,
          conflict_resolution_mode: 'strict',
          auto_resolve_conflicts: false,
          notify_on_conflicts: true
        };
      }
    },
    retry: 1,
    retryDelay: 1000,
    staleTime: 30000,
  });

  const updateMutation = useMutation({
    mutationFn: api.updateAutoGeneration,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auto-generation'] });
      toast({
        title: 'Success',
        description: 'Auto-generation rules updated successfully',
      });
      setHasChanges(false);
      onSave();
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update auto-generation rules',
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (autoGen) {
      setLocalData(autoGen);
      setHasChanges(false);
    }
  }, [autoGen]);

  const handleChange = (field, value) => {
    setLocalData(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
    onUnsaved();
  };

  const handleSave = () => {
    if (!localData) return;
    updateMutation.mutate(localData);
  };

  const handleReset = () => {
    if (autoGen) {
      setLocalData(autoGen);
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
        <p className="text-sm text-gray-500">Loading auto-generation rules...</p>
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
              <h3 className="text-lg font-medium text-gray-900">Failed to load auto-generation rules</h3>
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
    const defaultData = {
      auto_generate_on_create: false,
      auto_extend_on_extension: true,
      allow_overlap: false,
      conflict_resolution_mode: 'strict',
      auto_resolve_conflicts: false,
      notify_on_conflicts: true
    };
    setLocalData(defaultData);
    return null;
  }

  return (
    <div className="space-y-6">
      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <RotateCcw className="h-5 w-5" />
            <span>Auto-Generation Rules</span>
          </CardTitle>
          <CardDescription>
            Configure automatic rotation generation and conflict handling
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Rotation Frequency Settings */}
          <div>
            <h3 className="text-lg font-medium mb-4">Rotation Frequency</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <Label className="font-medium">Auto-generate on intern creation</Label>
                  <p className="text-sm text-gray-500 mt-1">
                    Automatically create rotations when a new intern is added
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localData.auto_generate_on_create}
                    onChange={(e) => handleChange('auto_generate_on_create', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <Label className="font-medium">Auto-extend on internship extension</Label>
                  <p className="text-sm text-gray-500 mt-1">
                    Automatically extend current rotations when an internship is extended
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localData.auto_extend_on_extension}
                    onChange={(e) => handleChange('auto_extend_on_extension', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <Label className="font-medium">Allow rotation overlap</Label>
                  <p className="text-sm text-gray-500 mt-1">
                    Permit overlapping rotations for the same intern (manual assignments only)
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localData.allow_overlap}
                    onChange={(e) => handleChange('allow_overlap', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Conflict Resolution */}
          <div>
            <h3 className="text-lg font-medium mb-4">Conflict Resolution</h3>
            <div className="space-y-4">
              <div>
                <Label>Conflict Detection Mode</Label>
                <Select 
                  value={localData.conflict_resolution_mode} 
                  onValueChange={(v) => handleChange('conflict_resolution_mode', v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="strict">Strict - No overlaps allowed</SelectItem>
                    <SelectItem value="lenient">Lenient - Allow minor overlaps</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">
                  {localData.conflict_resolution_mode === 'strict' 
                    ? 'All overlapping rotations will be flagged as conflicts'
                    : 'Minor overlaps (1-2 days) may be allowed'}
                </p>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <Label className="font-medium">Auto-resolve conflicts</Label>
                  <p className="text-sm text-gray-500 mt-1">
                    Automatically adjust rotations to resolve conflicts
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localData.auto_resolve_conflicts}
                    onChange={(e) => handleChange('auto_resolve_conflicts', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <Label className="font-medium">Notify on conflicts</Label>
                  <p className="text-sm text-gray-500 mt-1">
                    Send notifications when rotation conflicts are detected
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={localData.notify_on_conflicts}
                    onChange={(e) => handleChange('notify_on_conflicts', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t">
            {hasChanges && (
              <Button variant="outline" onClick={handleReset}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            )}
            <Button 
              onClick={handleSave}
              disabled={updateMutation.isPending || !hasChanges}
              className="hospital-gradient"
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

