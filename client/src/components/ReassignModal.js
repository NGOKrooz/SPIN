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

  // Get all units
  const { data: units } = useQuery({
    queryKey: ['units'],
    queryFn: api.getUnits,
  });

  // Get intern's schedule to find units they've done before
  const { data: internSchedule } = useQuery({
    queryKey: ['intern-schedule', intern.id],
    queryFn: () => api.getInternSchedule(intern.id),
  });

  // Get units the intern has done in the PAST (exclude current and future rotations)
  // IMPORTANT: When reassigning FROM a unit, that unit should become available again
  // So we DON'T exclude the current unit - reassigning from it makes it available for future rotations
  const today = format(new Date(), 'yyyy-MM-dd');
  const pastRotations = internSchedule?.filter(r => {
    const endDate = r.end_date ? format(parseISO(r.end_date), 'yyyy-MM-dd') : null;
    const rotationId = r.id;
    const currentRotationId = currentRotation?.id;
    // Exclude the current rotation from past rotations (even if it ended in the past)
    // because reassigning from it makes that unit available again
    return endDate && endDate < today && rotationId !== currentRotationId;
  }) || [];
  
  const pastUnitIds = pastRotations.map(r => r.unit_id);
  
  // Available units: exclude ONLY past units (not current unit)
  // When reassigning FROM the current unit, that unit becomes available again for future rotations
  const availableUnits = units?.filter(unit => 
    !pastUnitIds.includes(unit.id)
  ) || [];

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

  const reassignMutation = useMutation({
    mutationFn: ({ rotationId, unitId, startDate, endDate }) => 
      api.updateRotation(rotationId, { unit_id: unitId, start_date: startDate, end_date: endDate }),
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

    const selectedUnit = units?.find(unit => unit.id === parseInt(selectedUnitId));
    if (!selectedUnit) {
      toast({
        title: 'Error',
        description: 'Invalid unit selected',
        variant: 'destructive',
      });
      return;
    }

    // Calculate new end date based on selected unit duration
    // End date = start date + (duration_days - 1) since duration includes the start day
    const startDateParsed = parseISO(currentRotation.start_date);
    const newEndDate = addDays(startDateParsed, selectedUnit.duration_days - 1);
    
    reassignMutation.mutate({
      rotationId: currentRotation.id,
      unitId: parseInt(selectedUnitId),
      startDate: currentRotation.start_date,
      endDate: format(newEndDate, 'yyyy-MM-dd')
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
                    <SelectItem key={unit.id} value={unit.id.toString()}>
                      {unit.name} ({unit.duration_days} days)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedUnitId && (
              <div className="bg-blue-50 p-3 rounded-lg">
                <div className="text-sm text-blue-800">
                  <p><strong>Current:</strong> {currentRotation.unit_name} ({currentRotation.duration_days} days)</p>
                  <p><strong>New:</strong> {units?.find(u => u.id === parseInt(selectedUnitId))?.name} ({units?.find(u => u.id === parseInt(selectedUnitId))?.duration_days} days)</p>
                  <p><strong>Start Date:</strong> {currentRotation.start_date}</p>
                  <p><strong>New End Date:</strong> {selectedUnitId ? format(addDays(parseISO(currentRotation.start_date), (units?.find(u => u.id === parseInt(selectedUnitId))?.duration_days || 0) - 1), 'yyyy-MM-dd') : ''}</p>
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
                  No available units for reassignment. All remaining units have already been completed by this intern.
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

