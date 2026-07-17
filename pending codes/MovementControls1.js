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
  // FIX: buttons must stay visible-but-disabled during the <=5-day "Next
  // Assignment" preview window, and only become clickable once the intern has
  // actually gone into the extra day (overdue / pending), e.g. 22/21 or 31/30.
  // Previously any of hasUpcomingRotation / remainingDays<=5 would enable them
  // early, which let HR click Accept/Reassign before the intern was truly due.
  const isOverdue = Boolean(item?.isOverdue);
  const enabled = isOverdue;

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
