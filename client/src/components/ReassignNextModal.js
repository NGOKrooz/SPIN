import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, RotateCcw, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { api } from '../services/api';

const getUnitId = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return String(value._id || value.id || value.unitId || value.unit_id || '').trim() || null;
};

export default function ReassignNextModal({ confirmation, onClose, onSuccess }) {
  const [selectedUnitId, setSelectedUnitId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const eligibleUnitsQuery = useQuery({
    queryKey: ['eligibleReassignUnits', confirmation?.internId],
    queryFn: () => api.getEligibleReassignUnits(confirmation.internId),
    enabled: Boolean(confirmation?.internId),
  });

  const previewQuery = useQuery({
    queryKey: ['movementPreview', confirmation?.internId],
    queryFn: () => api.getMovementPreview(confirmation.internId),
    enabled: Boolean(confirmation?.internId),
  });

  const availableUnits = eligibleUnitsQuery.data?.data?.eligibleUnits || [];
  const selectedUnit = availableUnits.find((unit) => String(unit._id || unit.id) === String(selectedUnitId)) || null;
  const nextUnitLabel = previewQuery.data?.data?.nextUnit || 'Loading next unit...';

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedUnitId) {
      alert('Please select a unit to reassign to');
      return;
    }

    if (!selectedUnit) {
      alert('Please select a valid unit');
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await api.reassignNext(confirmation.internId, selectedUnitId);
      onSuccess(result);
      onClose();
    } catch (error) {
      console.error('Reassignment failed:', error);
      alert(`Failed to reassign: ${error.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLoading = eligibleUnitsQuery.isLoading || previewQuery.isLoading || isSubmitting;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="flex items-center space-x-2">
              <RotateCcw className="h-5 w-5 text-blue-600" />
              <span>Reassign Next Unit</span>
            </CardTitle>
            <CardDescription>
              Change {confirmation.internName}'s upcoming unit from {nextUnitLabel}
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="unit-select">Select New Unit</Label>
              <Select value={selectedUnitId} onValueChange={setSelectedUnitId} disabled={isLoading}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a unit..." />
                </SelectTrigger>
                <SelectContent>
                  {availableUnits.map((unit) => (
                    <SelectItem key={unit._id || unit.id} value={String(unit._id || unit.id)}>
                      {unit.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {eligibleUnitsQuery.isError && (
                <p className="text-sm text-red-600">Unable to load eligible units. Refresh and try again.</p>
              )}
              {availableUnits.length === 0 && !isLoading && (
                <p className="text-sm text-gray-500">No available units for reassignment.</p>
              )}
            </div>

            {selectedUnit && (
              <div className="p-3 bg-blue-50 rounded-md">
                <div className="text-sm">
                  <div className="font-medium text-blue-900">Selected: {selectedUnit.name}</div>
                  <div className="text-blue-700 mt-1">
                    Duration: {selectedUnit.duration_days || selectedUnit.durationDays || selectedUnit.duration || 'N/A'} days
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1"
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!selectedUnitId || isLoading}
                className="flex-1 bg-blue-600 hover:bg-blue-700"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                {isSubmitting ? 'Reassigning...' : 'Reassign'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
