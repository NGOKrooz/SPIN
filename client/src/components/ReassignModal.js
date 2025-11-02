import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { X, Save, RotateCcw } from 'lucide-react';
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

  // Get intern's schedule to find remaining units
  const { data: internSchedule } = useQuery({
    queryKey: ['intern-schedule', intern.id],
    queryFn: () => api.getInternSchedule(intern.id),
  });

  // Get remaining units (units not yet assigned to this intern)
  const assignedUnitIds = internSchedule?.map(r => r.unit_id) || [];
  const remainingUnits = units?.filter(unit => !assignedUnitIds.includes(unit.id)) || [];

  const reassignMutation = useMutation({
    mutationFn: ({ rotationId, unitId, startDate, endDate }) => 
      api.updateRotation(rotationId, { unit_id: unitId, start_date: startDate, end_date: endDate }),
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Rotation reassigned successfully',
      });
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
                  {remainingUnits.map((unit) => (
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

            {remainingUnits.length === 0 && (
              <div className="bg-yellow-50 p-3 rounded-lg">
                <p className="text-sm text-yellow-800">
                  No remaining units available for reassignment. All units have been assigned to this intern.
                </p>
              </div>
            )}

            <div className="flex items-center justify-end space-x-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isLoading || remainingUnits.length === 0} 
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

