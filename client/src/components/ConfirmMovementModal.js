import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

export default function ConfirmMovementModal({ movement, isPending = false, onClose, onConfirm }) {
  if (!movement) return null;
  const delayedDays = Math.max(0, -Number(movement.remainingDays || 0), Number(movement.overdueDays || 0));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Confirm Movement</CardTitle>
            <CardDescription>Review the movement details before execution.</CardDescription>
          </div>
          <button type="button" className="text-gray-500 hover:text-gray-700" onClick={onClose}>
            Close
          </button>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="text-sm text-gray-500">Intern</div>
              <div className="text-lg font-semibold text-gray-900">{movement.internName}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Move from</div>
              <div className="text-lg font-semibold text-gray-900">{movement.currentUnit}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">To</div>
              <div className="text-lg font-semibold text-gray-900">{movement.nextUnit || 'Next unit not assigned'}</div>
            </div>
            <div>
              <div className="text-sm text-gray-500">Delayed By</div>
              <div className="text-lg font-semibold text-gray-900">{delayedDays} day{delayedDays === 1 ? '' : 's'}</div>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => onConfirm?.(movement)}
                disabled={!(movement.isOverdue || movement.activeAssignment?.status === 'pending') || isPending}
              >
                Confirm Move
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
