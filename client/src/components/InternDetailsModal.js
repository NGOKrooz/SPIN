import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { X } from 'lucide-react';
import { api } from '../services/api';
import { formatDate } from '../lib/utils';

export default function InternDetailsModal({ intern, onClose }) {
  const [schedule, setSchedule] = useState({ rotations: [], completed: [], current: null, upcoming: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await api.getInternSchedule(intern.id);
        if (mounted) {
          if (Array.isArray(data)) {
            setSchedule({ rotations: data, completed: [], current: null, upcoming: [] });
          } else {
            setSchedule({ rotations: [], completed: [], current: null, upcoming: [], ...(data || {}) });
          }
        }
      } catch (e) {
        setSchedule({ rotations: [], completed: [], current: null, upcoming: [] });
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [intern.id]);

  const allRotations = schedule.rotations || [];
  const completedUnits = (schedule.completed && schedule.completed.length > 0)
    ? schedule.completed
    : allRotations.filter((r) => new Date(r.end_date) < new Date());
  const currentUnits = schedule.current
    ? [schedule.current]
    : allRotations.filter((r) => new Date(r.start_date) <= new Date() && new Date(r.end_date) >= new Date());
  const remainingUnits = (schedule.upcoming && schedule.upcoming.length > 0)
    ? schedule.upcoming
    : allRotations.filter((r) => new Date(r.start_date) > new Date());

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle>Intern Overview</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <div className="text-lg font-semibold text-gray-900">{intern.name}</div>
            <div className="text-sm text-gray-600">Batch {intern.batch} • Started {formatDate(intern.start_date)}</div>
          </div>

          {loading ? (
            <div className="text-sm text-gray-500">Loading schedule...</div>
          ) : (
            <div className="space-y-4">
              <Section title="Current Units" items={currentUnits} empty="No current units" />
              <Section title="Completed Units" items={completedUnits} empty="No completed units" />
              <Section title="Remaining Units" items={remainingUnits} empty="No remaining units" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Section({ title, items, empty }) {
  return (
    <div>
      <div className="text-sm font-medium text-gray-700 mb-1">{title}</div>
      {items.length === 0 ? (
        <div className="text-sm text-gray-500">{empty}</div>
      ) : (
        <div className="space-y-2">
          {items.map((r) => (
            <div key={`${r.unit_id}-${r.start_date}`} className="flex items-center justify-between p-2 bg-gray-50 rounded">
              <div className="text-sm text-gray-900">{r.unit_name}</div>
              <div className="text-xs text-gray-600">{formatDate(r.start_date)} - {formatDate(r.end_date)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
