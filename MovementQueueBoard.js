import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { api } from '../services/api';
import MovementControls from './MovementControls';
import ConfirmMovementModal from './ConfirmMovementModal';
import ReassignNextModal from './ReassignNextModal';

const DAY_IN_MS = 1000 * 60 * 60 * 24;

const normalizeDay = (dateLike) => {
  const value = new Date(dateLike);
  if (Number.isNaN(value.getTime())) return null;
  value.setHours(0, 0, 0, 0);
  return value;
};

const calculateDaysBetween = (startDate, endDate) => {
  const start = normalizeDay(startDate);
  const end = normalizeDay(endDate);
  if (!start || !end) return 0;
  return Math.round((end.getTime() - start.getTime()) / DAY_IN_MS);
};

const getRemainingDays = (startDate, endDate, today = new Date()) => {
  const todayNorm = normalizeDay(today);
  const endNorm = normalizeDay(endDate);
  if (!todayNorm || !endNorm) return null;
  return Math.floor((endNorm.getTime() - todayNorm.getTime()) / DAY_IN_MS);
};

const getElapsedDays = (startDate, today = new Date()) => {
  const startNorm = normalizeDay(startDate);
  const todayNorm = normalizeDay(today);
  if (!startNorm || !todayNorm) return 0;
  if (todayNorm < startNorm) return 0;
  return Math.floor((todayNorm.getTime() - startNorm.getTime()) / DAY_IN_MS) + 1;
};

const getTotalDuration = (rotation) => {
  const baseDuration = Number(rotation?.baseDuration ?? rotation?.base_duration);
  const extensionDays = Number(rotation?.extensionDays ?? rotation?.extension_days ?? 0);
  if (Number.isFinite(baseDuration) && baseDuration > 0) {
    return baseDuration + extensionDays;
  }
  if (rotation?.start_date && rotation?.end_date) {
    return calculateDaysBetween(rotation.start_date, rotation.end_date) + 1;
  }
  return 0;
};

const getStatusDisplay = (remainingDays, isOverdue, overdueDays) => {
  if (isOverdue && overdueDays > 0) {
    return `${overdueDays} day${overdueDays === 1 ? '' : 's'} overdue`;
  }
  if (remainingDays === 0) return 'Due today';
  if (remainingDays === 1) return '1 day remaining';
  if (remainingDays > 0) return `${remainingDays} days remaining`;
  return 'Overdue';
};

const buildMovementQueue = (interns = []) => {
  const today = normalizeDay();
  const queue = [];

  for (const intern of interns) {
    if (!intern?._id) continue;

    // Get current active rotation
    const rotations = Array.isArray(intern.rotations) ? intern.rotations : [];
    const activeRotation = rotations.find((r) => r?.status === 'active');

    if (!activeRotation) continue;

    const remainingDays = getRemainingDays(activeRotation.end_date, activeRotation.end_date, today);
    const elapsedDays = getElapsedDays(activeRotation.start_date, today);
    const totalDuration = getTotalDuration(activeRotation);

    // Check eligibility: remainingDays <= 5 OR overdue OR has next upcoming rotation
    const isOverdue = elapsedDays > totalDuration;
    const hasUpcomingRotation = rotations.some((r) => r?.status === 'upcoming');
    const remainingDaysValid = remainingDays !== null && remainingDays <= 5;

    const isEligible = remainingDaysValid || isOverdue || hasUpcomingRotation;

    if (!isEligible) continue;

    const overdueDays = isOverdue ? Math.max(0, elapsedDays - totalDuration) : 0;
    const upcomingRotation = rotations.find((r) => r?.status === 'upcoming') || null;

    queue.push({
      internId: intern._id,
      internName: intern.name || 'Unnamed',
      currentUnit: activeRotation.unit?.name || activeRotation.unit_name || 'Current Unit',
      currentUnitId: activeRotation.unit?._id || activeRotation.unit_id,
      duration: totalDuration,
      remainingDays: remainingDays !== null ? remainingDays : 0,
      elapsedDays,
      isOverdue,
      overdueDays,
      status: getStatusDisplay(remainingDays, isOverdue, overdueDays),
      requiresMovementConfirmation: Boolean(upcomingRotation),
      isOverdue: isOverdue && remainingDays !== null ? remainingDays < 0 : false,
      activeRotation,
      upcomingRotation,
      intern,
    });
  }

  return queue.sort((a, b) => {
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;
    return a.remainingDays - b.remainingDays;
  });
};

export default function MovementQueueBoard() {
  const [confirmMovement, setConfirmMovement] = useState(null);
  const [reassignConfirmation, setReassignConfirmation] = useState(null);
  const queryClient = useQueryClient();

  const { data: interns = [], isLoading: internsLoading } = useQuery({
    queryKey: ['interns'],
    queryFn: () => api.getInterns(),
  });

  const movementQueue = useMemo(() => buildMovementQueue(interns), [interns]);

  const handleAccept = (queueItem) => {
    setConfirmMovement({
      internId: queueItem.internId,
      internName: queueItem.internName,
      currentUnit: queueItem.currentUnit,
      isOverdue: queueItem.isOverdue,
      remainingDays: queueItem.remainingDays,
      overdueDays: queueItem.overdueDays,
    });
  };

  const handleReassign = (queueItem) => {
    setReassignConfirmation({
      internId: queueItem.internId,
      internName: queueItem.internName,
      currentUnitId: queueItem.currentUnitId,
      activeAssignment: queueItem.activeRotation,
      intern: queueItem.intern,
    });
  };

  const handleConfirmAccept = async (movement) => {
    try {
      await api.acceptMovement?.(movement.internId);
      await queryClient.invalidateQueries({ queryKey: ['interns'] });
      setConfirmMovement(null);
    } catch (error) {
      console.error('Failed to accept movement:', error);
    }
  };

  const handleReassignSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ['interns'] });
    setReassignConfirmation(null);
  };

  if (internsLoading) {
    return (
      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle>Movement Queue</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <RotateCcw className="h-5 w-5 text-blue-600" />
            <span>Movement Queue</span>
          </CardTitle>
          <CardDescription>
            Interns nearing completion or awaiting confirmation for movement
          </CardDescription>
        </CardHeader>
        <CardContent>
          {movementQueue.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No interns requiring movement at this time
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500">
                    <th className="py-2 pr-4 font-medium">Intern</th>
                    <th className="py-2 pr-4 font-medium">Current Unit</th>
                    <th className="py-2 pr-4 font-medium text-center">Duration</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Next Unit</th>
                    <th className="py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {movementQueue.map((item) => (
                    <tr
                      key={item.internId}
                      className={`border-b last:border-b-0 ${
                        item.overdueDays > 0 ? 'bg-red-50' : item.remainingDays <= 2 ? 'bg-yellow-50' : ''
                      }`}
                    >
                      <td className="py-3 pr-4 font-medium text-gray-900">{item.internName}</td>
                      <td className="py-3 pr-4 text-gray-700">{item.currentUnit}</td>
                      <td className="py-3 pr-4 text-center text-gray-600">{item.duration} days</td>
                      <td className="py-3 pr-4">
                        <span
                          className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                            item.overdueDays > 0
                              ? 'bg-red-100 text-red-800'
                              : item.remainingDays <= 2
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-gray-700">Backend preview on confirm</td>
                      <td className="py-3">
                        <MovementControls
                          item={{
                            isOverdue: item.overdueDays > 0 || (item.remainingDays !== null && item.remainingDays <= 0),
                            remainingDays: item.remainingDays,
                            hasUpcomingRotation: Boolean(item.upcomingRotation),
                          }}
                          onAccept={() => handleAccept(item)}
                          onReassign={() => handleReassign(item)}
                          className="gap-1"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {confirmMovement && (
        <ConfirmMovementModal
          movement={confirmMovement}
          isPending={false}
          onClose={() => setConfirmMovement(null)}
          onConfirm={handleConfirmAccept}
        />
      )}

      {reassignConfirmation && (
        <ReassignNextModal
          confirmation={reassignConfirmation}
          onClose={() => setReassignConfirmation(null)}
          onSuccess={handleReassignSuccess}
        />
      )}
    </>
  );
}
