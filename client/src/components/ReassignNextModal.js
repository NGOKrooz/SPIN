import React, { useState, useMemo } from 'react';
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

  const { data: units, isLoading: unitsLoading } = useQuery({
    queryKey: ['units'],
    queryFn: api.getUnits,
  });

  // PHASE 3: Show only valid units for reassignment
  // Exclude: current unit, completed units
  // Only show units intern has not rotated through
  const availableUnits = useMemo(() => {
    if (!units) return [];

    console.log(`[PHASE 3] 📋 Building available units for reassignment`);
    console.log(`[PHASE 3]    Current unit ID: ${confirmation.currentUnitId}`);
    console.log(`[PHASE 3]    Next unit ID (will be replaced): ${confirmation.nextUnitId}`);
    console.log(`[PHASE 3]    Total units available: ${units.length}`);

    const currentUnitId = getUnitId(confirmation.currentUnitId)
      || getUnitId(confirmation.activeAssignment?.unit)
      || getUnitId(confirmation.activeAssignment?.unitId)
      || getUnitId(confirmation.activeAssignment?.unit_id)
      || getUnitId(confirmation.intern?.currentUnit);

    const completedUnitIds = new Set();
    const completedSources = [
      ...(confirmation.intern?.rotations || []),
      ...(confirmation.intern?.completedUnits || []),
    ];

    completedSources.forEach((assignment) => {
      if (assignment?.status && assignment.status !== 'completed') return;
      const unitId = getUnitId(assignment?.unit)
        || getUnitId(assignment?.unitId)
        || getUnitId(assignment?.unit_id);
      if (unitId) completedUnitIds.add(unitId);
    });

    // Filter units: exclude current unit and units already completed by this intern.
    const filtered = units.filter(unit => {
      const unitId = String(unit._id || unit.id || '');
      const isCurrentUnit = unitId === currentUnitId;
      const isCompletedUnit = completedUnitIds.has(unitId);
      
      if (isCurrentUnit) {
        console.log(`[PHASE 3]    ❌ Excluding current unit: ${unit.name} (${unitId})`);
        return false;
      }

      if (isCompletedUnit) {
        console.log(`[PHASE 3]    ❌ Excluding completed unit: ${unit.name} (${unitId})`);
        return false;
      }
      
      console.log(`[PHASE 3]    ✅ Including unit: ${unit.name} (${unitId})`);
      return true;
    });

    console.log(`[PHASE 3] 🎯 Available units for reassignment: ${filtered.length}`);
    return filtered;
  }, [units, confirmation]);

  const selectedUnit = useMemo(
    () => availableUnits.find((unit) => String(unit._id || unit.id) === String(selectedUnitId)) || null,
    [availableUnits, selectedUnitId]
  );

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
      
      console.log(`[PHASE 3] 🔄 Submitting reassignment`);
      console.log(`[PHASE 3]    Intern ID: ${confirmation.internId}`);
      console.log(`[PHASE 3]    From unit: ${confirmation.nextUnit}`);
      console.log(`[PHASE 3]    To unit: ${selectedUnit.name}`);
      console.log(`[PHASE 3]    New unit ID: ${selectedUnitId}`);
      
      const result = await api.reassignNext(confirmation.internId, selectedUnitId);
      
      console.log(`[PHASE 3] ✅ Reassignment API response:`, result);
      
      onSuccess(result);
      onClose();
    } catch (error) {
      console.error('[PHASE 3] ❌ Reassignment failed:', error);
      alert(`Failed to reassign: ${error.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLoading = unitsLoading || isSubmitting;

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
              Change {confirmation.internName}'s upcoming unit from {confirmation.nextUnit}
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
              {availableUnits.length === 0 && !isLoading && (
                <p className="text-sm text-gray-500">No available units for reassignment</p>
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
