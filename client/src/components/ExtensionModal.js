import React, { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { X, Save, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Textarea } from './ui/textarea';
import { api } from '../services/api';
import { useToast } from '../hooks/use-toast';
import { normalizeDate } from '../lib/utils';

export default function ExtensionModal({ intern, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    days: '',
    reason: '',
    notes: '',
  });

  const [removeFormData, setRemoveFormData] = useState({
    days: '',
    reason: '',
  });

  const currentExtensionDays = Number(intern?.extensionDays ?? intern?.extension_days) || 0;

  const { toast } = useToast();

  // Fetch schedule for this intern
  const { data: schedule } = useQuery({
    queryKey: ['intern-schedule', intern.id],
    queryFn: () => api.getInternSchedule(intern.id),
  });

  const scheduleRows = useMemo(() => (
    Array.isArray(schedule) ? schedule : (schedule?.rotations || [])
  ), [schedule]);
  
  // Prefer current rotation; fallback to latest completed for completed interns.
  const extendTargetUnits = useMemo(() => {
    if (!scheduleRows || scheduleRows.length === 0) return [];
    
    const now = normalizeDate(new Date());
    const sevenDaysAgo = now - (7 * 24 * 60 * 60 * 1000);
    
    // First, try to find an active rotation (today is between start and end)
    const current = scheduleRows.find(r => {
      const start = normalizeDate(r.start_date);
      const end = normalizeDate(r.end_date);
      return start <= now && end >= now;
    });
    
    if (current) return [current];
    
    // If no active rotation, find the most recent rotation (by end_date)
    // that ended within the last 7 days
    const recent = scheduleRows
      .filter(r => {
        const end = normalizeDate(r.end_date);
        return end >= sevenDaysAgo && end <= now;
      })
      .sort((a, b) => {
        const endA = normalizeDate(a.end_date);
        const endB = normalizeDate(b.end_date);
        return endB - endA; // Most recent first
      })[0];
    
    return recent ? [recent] : [];
  }, [scheduleRows]);

  const extendMutation = useMutation({
    mutationFn: ({ id, data }) => api.extendInternship(id, data),
    onSuccess: (result) => {
      toast({
        title: 'Success',
        description: 'Internship extended successfully',
      });
      onSuccess(result);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to extend internship',
        variant: 'destructive',
      });
    },
  });

  const removeExtensionMutation = useMutation({
    mutationFn: ({ id, data }) => api.removeExtension(id, data),
    onSuccess: (result) => {
      toast({
        title: 'Success',
        description: `Removed ${result?.removedDays ?? ''} extension day(s) successfully`,
      });
      onSuccess(result);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove extension',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();

    if (formData.days === '' || formData.days === null || formData.days === undefined || !formData.reason) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    const days = Number(formData.days);
    if (!Number.isFinite(days) || Number.isNaN(days) || days <= 0) {
      toast({
        title: 'Error',
        description: 'Please enter a valid positive number of days',
        variant: 'destructive',
      });
      return;
    }

    if (days > 365) {
      toast({
        title: 'Error',
        description: 'Extension cannot exceed 365 days',
        variant: 'destructive',
      });
      return;
    }

    const submitData = {
      days,
      reason: formData.reason,
      notes: formData.notes || '',
      unit_id: extendTargetUnits?.[0]?.unit_id || undefined,
    };

    extendMutation.mutate({ id: intern.id, data: submitData });
  };

  const handleRemove = (e) => {
    e.preventDefault();

    if (removeFormData.days === '' || removeFormData.days === null || removeFormData.days === undefined) {
      toast({
        title: 'Error',
        description: 'Please enter the number of days to remove',
        variant: 'destructive',
      });
      return;
    }

    const days = Number(removeFormData.days);
    if (!Number.isFinite(days) || Number.isNaN(days) || days <= 0) {
      toast({
        title: 'Error',
        description: 'Please enter a valid positive number of days',
        variant: 'destructive',
      });
      return;
    }

    removeExtensionMutation.mutate({
      id: intern.id,
      data: { days, reason: removeFormData.reason || 'Extension removed' },
    });
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleRemoveChange = (field, value) => {
    setRemoveFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const isLoading = extendMutation.isPending;
  const isRemoving = removeExtensionMutation.isPending;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="flex items-center space-x-2">
              <Clock className="h-5 w-5" />
              <span>Add Extension</span>
            </CardTitle>
            <CardDescription>
              {`Extend ${intern.name}'s current timeline`}
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {extendTargetUnits && extendTargetUnits.length > 0 ? (
              <div>
                <Label>Target Unit</Label>
                <div className="text-sm text-gray-700">
                  {extendTargetUnits[0].unit_name}
                </div>
                <div className="text-xs text-gray-500">Extension will adjust days for this unit.</div>
              </div>
            ) : (
              <div className="text-sm text-gray-500">No current unit found for this intern.</div>
            )}

            <div>
              <Label htmlFor="days">Extension Days *</Label>
              <Input
                id="days"
                type="number"
                min="1"
                max="365"
                value={formData.days}
                onChange={(e) => handleChange('days', e.target.value)}
                placeholder="Enter number of days to extend"
                required
              />
            </div>

            <div>
              <Label htmlFor="reason">Extension Reason *</Label>
              <Select value={formData.reason} onValueChange={(value) => handleChange('reason', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="presentation">Presentation</SelectItem>
                  <SelectItem value="internal query">Internal Query</SelectItem>
                  <SelectItem value="leave">Leave</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => handleChange('notes', e.target.value)}
                placeholder="Additional notes about the extension"
                rows={3}
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading} className="hospital-gradient">
                <Save className="h-4 w-4 mr-2" />
                {isLoading ? 'Saving...' : 'Save Extension'}
              </Button>
            </div>
          </form>

          {/* Remove Extension section — only shown when intern has active extension days */}
          {currentExtensionDays > 0 && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm font-medium text-gray-700 mb-3">
                Current Extension: <span className="text-yellow-600 font-bold">+{currentExtensionDays} days</span>
              </p>
              <form onSubmit={handleRemove} className="space-y-3">
                <div>
                  <Label htmlFor="remove-days">Days to Remove</Label>
                  <Input
                    id="remove-days"
                    type="number"
                    min="1"
                    max={currentExtensionDays}
                    value={removeFormData.days}
                    onChange={(e) => handleRemoveChange('days', e.target.value)}
                    placeholder={`1 – ${currentExtensionDays}`}
                  />
                </div>
                <div>
                  <Label htmlFor="remove-reason">Reason (Optional)</Label>
                  <Select value={removeFormData.reason} onValueChange={(value) => handleRemoveChange('reason', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select reason" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="error correction">Error Correction</SelectItem>
                      <SelectItem value="early completion">Early Completion</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    variant="outline"
                    disabled={isRemoving}
                    className="text-red-600 border-red-300 hover:bg-red-50"
                  >
                    {isRemoving ? 'Removing...' : 'Remove Extension Days'}
                  </Button>
                </div>
              </form>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
