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

export default function ExtensionModal({ intern, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    extension_days: '',
    reason: '',
    notes: '',
  });
  const [selectedUnitId, setSelectedUnitId] = useState(undefined);

  const { toast } = useToast();

  // Fetch active units for this intern (current rotations)
  const { data: schedule } = useQuery({
    queryKey: ['intern-schedule', intern.id],
    queryFn: () => api.getInternSchedule(intern.id),
  });
  const activeUnits = useMemo(() => (schedule || []).filter(r => new Date(r.start_date) <= new Date() && new Date(r.end_date) >= new Date()), [schedule]);
  React.useEffect(() => {
    if (activeUnits && activeUnits.length > 0) {
      setSelectedUnitId(activeUnits[0].unit_id);
    }
  }, [activeUnits]);

  const extendMutation = useMutation({
    mutationFn: ({ id, data }) => api.extendInternship(id, data),
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Internship extended successfully',
      });
      onSuccess();
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
    
    if (!formData.extension_days || !formData.reason) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    const submitData = {
      extension_days: parseInt(formData.extension_days),
      reason: formData.reason,
      notes: formData.notes || '',
      unit_id: selectedUnitId,
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
              <span>Extension</span>
            </CardTitle>
            <CardDescription>
              Extend {intern.name}'s current unit assignment
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {activeUnits && activeUnits.length > 0 ? (
              <div>
                <Label>Active Unit</Label>
                <Select value={selectedUnitId?.toString()} onValueChange={(v) => setSelectedUnitId(parseInt(v))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select active unit" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeUnits.map(u => (
                      <SelectItem key={u.unit_id} value={u.unit_id.toString()}>{u.unit_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="text-xs text-gray-500 mt-1">Extension will add days to the selected active unit.</div>
              </div>
            ) : (
              <div className="text-sm text-gray-500">No active unit found for this intern.</div>
            )}
            <div>
              <Label htmlFor="extension_days">Extension Days *</Label>
              <Input
                id="extension_days"
                type="number"
                min="1"
                max="365"
                value={formData.extension_days}
                onChange={(e) => handleChange('extension_days', e.target.value)}
                placeholder="Enter number of days"
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
        </CardContent>
      </Card>
    </div>
  );
}
