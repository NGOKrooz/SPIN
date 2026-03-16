import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Save, RotateCcw, Users, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { api } from '../../services/api';
import { useToast } from '../../hooks/use-toast';

export default function WorkloadSection({ onSave, onUnsaved }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [workloadData, setWorkloadData] = useState(null);
  const [coverageData, setCoverageData] = useState(null);
  const [workloadChanges, setWorkloadChanges] = useState(false);
  const [coverageChanges, setCoverageChanges] = useState(false);

  const { data: thresholds, isLoading: thresholdsLoading, isError: thresholdsError, error: thresholdsErr, refetch: refetchThresholds } = useQuery({
    queryKey: ['workload-thresholds'],
    queryFn: async () => {
      try {
        return await api.getWorkloadThresholds();
      } catch (err) {
        return { low_max: 4, medium_min: 5, medium_max: 8, high_min: 9 };
      }
    },
    retry: 1,
    retryDelay: 1000,
    staleTime: 30000,
  });

  const { data: coverageRules, isLoading: coverageLoading, isError: coverageError, error: coverageErr, refetch: refetchCoverage } = useQuery({
    queryKey: ['coverage-rules'],
    queryFn: async () => {
      try {
        return await api.getCoverageRules();
      } catch (err) {
        return {
          min_interns_low: 1,
          min_interns_medium: 2,
          min_interns_high: 2,
          batch_balance_enabled: true,
          batch_balance_threshold: 30,
          critical_coverage_days: 0
        };
      }
    },
    retry: 1,
    retryDelay: 1000,
    staleTime: 30000,
  });

  const updateThresholdsMutation = useMutation({
    mutationFn: api.updateWorkloadThresholds,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workload-thresholds'] });
      toast({
        title: 'Success',
        description: 'Workload thresholds updated successfully',
      });
      setWorkloadChanges(false);
      onSave();
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update workload thresholds',
        variant: 'destructive',
      });
    },
  });

  const updateCoverageMutation = useMutation({
    mutationFn: api.updateCoverageRules,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coverage-rules'] });
      toast({
        title: 'Success',
        description: 'Coverage rules updated successfully',
      });
      setCoverageChanges(false);
      onSave();
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update coverage rules',
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (thresholds) {
      setWorkloadData(thresholds);
    }
  }, [thresholds]);

  useEffect(() => {
    if (coverageRules) {
      setCoverageData(coverageRules);
    }
  }, [coverageRules]);

  const handleWorkloadChange = (field, value) => {
    setWorkloadData(prev => ({ ...prev, [field]: parseInt(value) || 0 }));
    setWorkloadChanges(true);
    onUnsaved();
  };

  const handleCoverageChange = (field, value) => {
    const newValue = typeof value === 'boolean' ? value : (typeof value === 'string' ? parseFloat(value) : value);
    setCoverageData(prev => ({ ...prev, [field]: newValue }));
    setCoverageChanges(true);
    onUnsaved();
  };

  const handleSaveThresholds = () => {
    if (!workloadData) return;
    
    // Validate thresholds are in order
    if (workloadData.low_max >= workloadData.medium_min || 
        workloadData.medium_max >= workloadData.high_min) {
      toast({
        title: 'Validation Error',
        description: 'Thresholds must be in ascending order (Low < Medium < High)',
        variant: 'destructive',
      });
      return;
    }

    updateThresholdsMutation.mutate(workloadData);
  };

  const handleSaveCoverage = () => {
    if (!coverageData) return;
    updateCoverageMutation.mutate(coverageData);
  };

  if (thresholdsLoading || coverageLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <p className="text-sm text-gray-500">Loading workload settings...</p>
      </div>
    );
  }

  if (thresholdsError || coverageError) {
    return (
      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center space-y-4 text-center">
            <AlertCircle className="h-12 w-12 text-red-500" />
            <div>
              <h3 className="text-lg font-medium text-gray-900">Failed to load workload settings</h3>
              <p className="text-sm text-gray-500 mt-1">
                {thresholdsErr?.message || coverageErr?.message || 'Unknown error occurred'}
              </p>
            </div>
            <div className="flex space-x-3">
              {thresholdsError && (
                <Button onClick={() => refetchThresholds()} variant="outline">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Retry Thresholds
                </Button>
              )}
              {coverageError && (
                <Button onClick={() => refetchCoverage()} variant="outline">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Retry Coverage
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!workloadData || !coverageData) {
    const defaultWorkload = {
      low_max: 4,
      medium_min: 5,
      medium_max: 8,
      high_min: 9
    };
    const defaultCoverage = {
      min_interns_low: 1,
      min_interns_medium: 2,
      min_interns_high: 2,
      batch_balance_enabled: true,
      batch_balance_threshold: 30,
      critical_coverage_days: 0
    };
    if (!workloadData) setWorkloadData(defaultWorkload);
    if (!coverageData) setCoverageData(defaultCoverage);
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Workload Thresholds */}
      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Building2 className="h-5 w-5" />
            <span>Patient Count Thresholds</span>
          </CardTitle>
          <CardDescription>
            Configure patient count ranges for workload classification (Low, Medium, High)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label>Low Workload Max</Label>
              <Input
                type="number"
                min="0"
                value={workloadData.low_max}
                onChange={(e) => handleWorkloadChange('low_max', e.target.value)}
                placeholder="4"
              />
              <p className="text-xs text-gray-500 mt-1">0 to {workloadData.low_max} patients = Low</p>
            </div>

            <div>
              <Label>Medium Workload Min</Label>
              <Input
                type="number"
                min="0"
                value={workloadData.medium_min}
                onChange={(e) => handleWorkloadChange('medium_min', e.target.value)}
                placeholder="5"
              />
              <p className="text-xs text-gray-500 mt-1">Minimum for Medium</p>
            </div>

            <div>
              <Label>Medium Workload Max</Label>
              <Input
                type="number"
                min="0"
                value={workloadData.medium_max}
                onChange={(e) => handleWorkloadChange('medium_max', e.target.value)}
                placeholder="8"
              />
              <p className="text-xs text-gray-500 mt-1">{workloadData.medium_min} to {workloadData.medium_max} patients = Medium</p>
            </div>

            <div>
              <Label>High Workload Min</Label>
              <Input
                type="number"
                min="0"
                value={workloadData.high_min}
                onChange={(e) => handleWorkloadChange('high_min', e.target.value)}
                placeholder="9"
              />
              <p className="text-xs text-gray-500 mt-1">{workloadData.high_min}+ patients = High</p>
            </div>
          </div>

          {/* Summary */}
          <div className="p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">Workload Classification</h4>
            <div className="text-sm text-blue-800 space-y-1">
              <div><strong>Low:</strong> 0 - {workloadData.low_max} patients</div>
              <div><strong>Medium:</strong> {workloadData.medium_min} - {workloadData.medium_max} patients</div>
              <div><strong>High:</strong> {workloadData.high_min}+ patients</div>
            </div>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4 border-t">
            {workloadChanges && (
              <Button variant="outline" onClick={() => {
                setWorkloadData(thresholds);
                setWorkloadChanges(false);
              }}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            )}
            <Button 
              onClick={handleSaveThresholds}
              disabled={updateThresholdsMutation.isPending || !workloadChanges}
              className="hospital-gradient"
            >
              <Save className="h-4 w-4 mr-2" />
              {updateThresholdsMutation.isPending ? 'Saving...' : 'Save Thresholds'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Coverage Rules */}
      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Users className="h-5 w-5" />
            <span>Coverage Rules</span>
          </CardTitle>
          <CardDescription>
            Define minimum intern requirements and batch balance rules for unit coverage
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Minimum Interns by Workload */}
          <div>
            <h3 className="text-lg font-medium mb-4">Minimum Interns per Unit</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Low Workload Units</Label>
                <Input
                  type="number"
                  min="0"
                  value={coverageData.min_interns_low}
                  onChange={(e) => handleCoverageChange('min_interns_low', e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-1">Minimum interns required</p>
              </div>

              <div>
                <Label>Medium Workload Units</Label>
                <Input
                  type="number"
                  min="0"
                  value={coverageData.min_interns_medium}
                  onChange={(e) => handleCoverageChange('min_interns_medium', e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-1">Minimum interns required</p>
              </div>

              <div>
                <Label>High Workload Units</Label>
                <Input
                  type="number"
                  min="0"
                  value={coverageData.min_interns_high}
                  onChange={(e) => handleCoverageChange('min_interns_high', e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-1">Minimum interns required</p>
              </div>
            </div>
          </div>

          {/* Batch Balance */}
          <div>
            <h3 className="text-lg font-medium mb-4">Batch Balance</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex-1">
                  <Label className="font-medium">Require Batch Balance</Label>
                  <p className="text-sm text-gray-500 mt-1">
                    Ensure units have interns from both Batch A and Batch B
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={coverageData.batch_balance_enabled}
                    onChange={(e) => handleCoverageChange('batch_balance_enabled', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {coverageData.batch_balance_enabled && (
                <div>
                  <Label>Batch Balance Threshold (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="5"
                    value={coverageData.batch_balance_threshold}
                    onChange={(e) => handleCoverageChange('batch_balance_threshold', e.target.value)}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Maximum percentage difference allowed between batches before warning
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Critical Coverage */}
          <div>
            <Label>Critical Coverage Threshold (days)</Label>
            <Input
              type="number"
              min="0"
              value={coverageData.critical_coverage_days}
              onChange={(e) => handleCoverageChange('critical_coverage_days', e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">
              Units without interns for this many days will be marked as critical
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t">
            {coverageChanges && (
              <Button variant="outline" onClick={() => {
                setCoverageData(coverageRules);
                setCoverageChanges(false);
              }}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            )}
            <Button 
              onClick={handleSaveCoverage}
              disabled={updateCoverageMutation.isPending || !coverageChanges}
              className="hospital-gradient"
            >
              <Save className="h-4 w-4 mr-2" />
              {updateCoverageMutation.isPending ? 'Saving...' : 'Save Coverage Rules'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

