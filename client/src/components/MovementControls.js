import React from 'react';
import { CheckCircle2, RefreshCw } from 'lucide-react';

export default function MovementControls({
  item,
  onAccept,
  onReassign,
  acceptPending = false,
  reassignPending = false,
  className = '',
}) {
  // Enable buttons whenever:
  // 1. Next upcoming rotation exists, OR
  // 2. Current rotation is overdue, OR  
  // 3. Remaining days <= 5
  // This follows the Movement Queue eligibility criteria
  const hasUpcomingRotation = Boolean(item?.hasUpcomingRotation);
  const isOverdue = Boolean(item?.isOverdue);
  const remainingDaysShort = item?.remainingDays !== null && item?.remainingDays <= 5;
  const enabled = hasUpcomingRotation || isOverdue || remainingDaysShort;

  return (
    <div className={`flex gap-2 ${className}`}>
      <button
        className="flex items-center justify-center gap-2 flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Accept movement to next unit"
        onClick={() => enabled && onAccept?.(item)}
        disabled={!enabled || acceptPending}
      >
        <CheckCircle2 className="h-4 w-4" />
        {acceptPending ? 'Accepting...' : 'Accept'}
      </button>
      <button
        className="flex items-center justify-center gap-2 flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Reassign to different unit before movement"
        onClick={() => enabled && onReassign?.(item)}
        disabled={!enabled || reassignPending}
      >
        <RefreshCw className="h-4 w-4" />
        {reassignPending ? 'Reassigning...' : 'Reassign'}
      </button>
    </div>
  );
}
