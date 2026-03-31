import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { X, Save, RotateCcw, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { api } from '../services/api';
import { useToast } from '../hooks/use-toast';
import { addDays, format, parseISO } from 'date-fns';

export default function ReassignModal({ intern, currentRotation, onClose, onSuccess }) {
  const [selectedUnitId, setSelectedUnitId] = useState('');

  const { toast } = useToast();

  // Get intern's schedule to find units they've done before
  const { data: internSchedule } = useQuery({
    queryKey: ['intern-schedule', intern.id],
    queryFn: () => api.getInternSchedule(intern.id),
  });

  const scheduleRows = React.useMemo(() => (
    Array.isArray(internSchedule) ? internSchedule : (internSchedule?.rotations || [])
  ), [internSchedule]);

  const upcomingFromPayload = React.useMemo(() => (
    Array.isArray(internSchedule?.upcoming)
      ? internSchedule.upcoming
      : (Array.isArray(internSchedule?.upcomingRotations) ? internSchedule.upcomingRotations : [])
  ), [internSchedule]);

  const availableUnits = React.useMemo(() => {
    const source = upcomingFromPayload.length > 0
      ? upcomingFromPayload
      : scheduleRows.filter((rotation) => String(rotation.status || '').toLowerCase() === 'upcoming');

    const seen = new Set();
    return source
      .map((rotation) => {
        const unitId = String(rotation.unit_id || rotation.unitId || rotation.unit?.id || rotation.unit?._id || '');
        const unitName = rotation.unit_name || rotation.unitName || rotation.unit?.name || null;
        const duration = Number(rotation.duration_days || rotation.duration || rotation.unit?.duration_days || rotation.unit?.durationDays || 0);

        if (!unitId || !unitName || seen.has(unitId)) return null;
        seen.add(unitId);
        return {
          id: unitId,
          name: unitName,
          duration_days: duration,
        };
      })
      .filter(Boolean);
  }, [scheduleRows, upcomingFromPayload]);

  // Calculate days spent in current rotation
  const daysInCurrentRotation = React.useMemo(() => {
    if (!currentRotation?.start_date) return 0;
    const startDate = parseISO(currentRotation.start_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    startDate.setHours(0, 0, 0, 0);
    // Calculate inclusive days from start to today
    const days = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return Math.max(0, days); // Ensure non-negative
  }, [currentRotation?.start_date]);

  const showWarning = daysInCurrentRotation > 1;

  const selectedUnit = React.useMemo(
    () => availableUnits.find((unit) => String(unit.id) === String(selectedUnitId)) || null,
    [availableUnits, selectedUnitId]
  );

  const preservedDuration = React.useMemo(() => {
    const duration = Number(currentRotation?.duration_days || currentRotation?.duration || 0);
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
  }, [currentRotation?.duration, currentRotation?.duration_days]);

  const preservedEndDate = React.useMemo(() => {
    if (!currentRotation?.start_date || preservedDuration <= 0) return '';
    return format(addDays(parseISO(currentRotation.start_date), preservedDuration - 1), 'yyyy-MM-dd');
  }, [currentRotation?.start_date, preservedDuration]);

  const reassignMutation = useMutation({
    mutationFn: ({ internId, unitId }) =>
      api.reassignIntern(internId, { unitId }),
    onSuccess: async () => {
      toast({
        title: 'Success',
        description: 'Rotation reassigned successfully',
      });
      // Force a refresh of the schedule before calling onSuccess
      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay to ensure backend has processed
      onSuccess();
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to reassign rotation',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!selectedUnitId) {
      toast({
        title: 'Error',
        description: 'Please select a unit to reassign to',
        variant: 'destructive',
      });
      return;
    }

    if (!selectedUnit) {
      toast({
        title: 'Error',
        description: 'Please select a valid upcoming unit',
        variant: 'destructive',
      });
      return;
    }

    if (showWarning) {
      const message = `⚠️ This intern has already spent ${daysInCurrentRotation} day(s) in ${currentRotation.unit_name}. Reassigning may disrupt the rotation schedule. Do you want to continue?`;
      const confirmed = window.confirm(message);
      if (!confirmed) {
        return;
      }
    }

    reassignMutation.mutate({
      internId: intern.id || intern._id,
      unitId: selectedUnitId,
    });
  };

  const isLoading = reassignMutation.isPending;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="flex items-center space-x-2">
              <RotateCcw className="h-5 w-5" />
              <span>Reassign Unit</span>
            </CardTitle>
            <CardDescription>
              Reassign {intern.name} from {currentRotation.unit_name}
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="unit">Select New Unit *</Label>
              <Select value={selectedUnitId} onValueChange={setSelectedUnitId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a unit to reassign to" />
                </SelectTrigger>
                <SelectContent>
                  {availableUnits.map((unit) => (
                    <SelectItem key={unit.id.toString()} value={unit.id.toString()}>
                      {unit.name} ({unit.duration_days} days)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedUnit && (
              <div className="bg-blue-50 p-3 rounded-lg">
                <div className="text-sm text-blue-800 space-y-1">
                  <p><strong>Current:</strong> {currentRotation.unit_name} ({preservedDuration} days)</p>
                  <p><strong>New:</strong> {selectedUnit.name} ({selectedUnit.duration_days} days nominal)</p>
                  <p><strong>Preserved Start Date:</strong> {currentRotation.start_date}</p>
                  <p><strong>Current Progress:</strong> {daysInCurrentRotation} / {preservedDuration} days</p>
                  <p><strong>Preserved End Date:</strong> {preservedEndDate}</p>
                </div>
              </div>
            )}

            {showWarning && (
              <div className="bg-orange-50 border border-orange-200 p-3 rounded-lg">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-orange-800">
                      Warning: Intern has spent {daysInCurrentRotation} day(s) in {currentRotation.unit_name}
                    </p>
                    <p className="text-xs text-orange-700 mt-1">
                      Reassigning after more than 1 day may affect rotation tracking. Proceed with caution.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {availableUnits.length === 0 && (
              <div className="bg-yellow-50 p-3 rounded-lg">
                <p className="text-sm text-yellow-800">
                  No upcoming units are available for reassignment.
                </p>
              </div>
            )}

            <div className="flex items-center justify-end space-x-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isLoading || availableUnits.length === 0} 
                className="hospital-gradient"
              >
                <Save className="h-4 w-4 mr-2" />
                {isLoading ? 'Reassigning...' : 'Reassign Unit'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

