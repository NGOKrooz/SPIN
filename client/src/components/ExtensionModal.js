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
    extension_days: '',
    adjustment_days: '',
    reason: '',
    notes: '',
  });

  const { toast } = useToast();

  // Fetch schedule for this intern
  const { data: schedule } = useQuery({
    queryKey: ['intern-schedule', intern.id],
    queryFn: () => api.getInternSchedule(intern.id),
  });

  const scheduleRows = useMemo(() => (
    Array.isArray(schedule) ? schedule : (schedule?.rotations || [])
  ), [schedule]);
  
  // Find the most recent rotation (current or just completed within last 7 days)
  // This ensures we extend the correct unit even if the rotation just ended
  const activeUnits = useMemo(() => {
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
  
  const currentExtension = intern.extension_days || 0;
  const hasExtension = currentExtension > 0;

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

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const daysToUse = hasExtension ? formData.adjustment_days : formData.extension_days;
    
    if (!daysToUse || !formData.reason) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    const adjustmentValue = parseInt(daysToUse);
    
    // Calculate new total extension days
    const newTotalExtension = hasExtension ? currentExtension + adjustmentValue : adjustmentValue;
    
    if (newTotalExtension < 0) {
      toast({
        title: 'Error',
        description: 'Cannot reduce extension below 0 days',
        variant: 'destructive',
      });
      return;
    }

    if (newTotalExtension > 365) {
      toast({
        title: 'Error',
        description: 'Total extension cannot exceed 365 days',
        variant: 'destructive',
      });
      return;
    }

    const submitData = {
      extension_days: newTotalExtension,
      adjustment_days: hasExtension ? adjustmentValue : undefined,
      reason: formData.reason,
      notes: formData.notes || '',
      unit_id: activeUnits?.[0]?.unit_id || undefined,
    };

    extendMutation.mutate({ id: intern.id, data: submitData });
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const isLoading = extendMutation.isPending;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="flex items-center space-x-2">
              <Clock className="h-5 w-5" />
              <span>{hasExtension ? 'Update Extension' : 'Add Extension'}</span>
            </CardTitle>
            <CardDescription>
              {hasExtension 
                ? `Adjust ${intern.name}'s extension (Currently: ${currentExtension} days)`
                : `Extend ${intern.name}'s current unit assignment`
              }
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {hasExtension && (
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-sm font-medium text-blue-900">Current Extension: {currentExtension} days</div>
                <div className="text-xs text-blue-700 mt-1">
                  Intern status: {intern.status}
                </div>
              </div>
            )}
            
            {activeUnits && activeUnits.length > 0 ? (
              <div>
                <Label>Active Unit</Label>
                <div className="text-sm text-gray-700">
                  {activeUnits[0].unit_name}
                </div>
                <div className="text-xs text-gray-500">Extension will adjust days for this unit.</div>
              </div>
            ) : (
              <div className="text-sm text-gray-500">No active unit found for this intern.</div>
            )}
            
            {hasExtension ? (
              <div>
                <Label htmlFor="adjustment_days">Adjustment Days *</Label>
                <Input
                  id="adjustment_days"
                  type="number"
                  min={-currentExtension}
                  max="365"
                  value={formData.adjustment_days}
                  onChange={(e) => handleChange('adjustment_days', e.target.value)}
                  placeholder="Enter adjustment (e.g., 5 to add, -5 to reduce)"
                  required
                />
                <div className="text-xs text-gray-500 mt-1">
                  Use positive numbers to add days, negative to reduce. 
                  {formData.adjustment_days && ` New total: ${currentExtension + parseInt(formData.adjustment_days || 0)} days`}
                </div>
              </div>
            ) : (
              <div>
                <Label htmlFor="extension_days">Extension Days *</Label>
                <Input
                  id="extension_days"
                  type="number"
                  min="1"
                  max="365"
                  value={formData.extension_days}
                  onChange={(e) => handleChange('extension_days', e.target.value)}
                  placeholder="Enter number of days to extend"
                  required
                />
              </div>
            )}

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
                {isLoading ? 'Saving...' : (hasExtension ? 'Update Extension' : 'Save Extension')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
