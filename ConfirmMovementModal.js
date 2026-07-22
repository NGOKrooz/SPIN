import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { api } from '../services/api';

export default function ConfirmMovementModal({ movement, isPending = false, onClose, onConfirm }) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState(null);

  const previewQuery = useQuery({
    queryKey: ['movementPreview', movement?.internId],
    queryFn: () => api.getMovementPreview(movement.internId),
    enabled: Boolean(movement?.internId),
  });

  if (!movement) return null;

  const delayedDays = movement.overdueDays ?? Math.max(0, -Number(movement.remainingDays || 0));
  // FIX (issue 2a): the axios response interceptor in services/api.js already
  // unwraps to response.data, so previewQuery.data IS the backend payload
  // directly ({currentUnit, nextUnit, ...}). Reading .data.data was always
  // undefined, so canConfirm was always false and this button never unlocked
  // even after the preview successfully loaded — it looked like infinite
  // loading forever.
  const previewData = previewQuery.data;
  const nextUnitLabel = previewData?.nextUnit || 'Loading next unit...';
  const canConfirm = !previewQuery.isLoading && !!previewData?.nextUnit;

  // FIX (issue 2c): this modal previously had no local submitting/error state
  // at all — it relied entirely on the parent closing it. If the accept call
  // ever failed, the parent's catch block only logged to console and never
  // closed the modal, so it looked permanently stuck with no feedback. Now it
  // manages and always resolves its own submitting state, and shows the error.
  const handleConfirmClick = async () => {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      await onConfirm?.(movement);
    } catch (error) {
      setSubmitError(error?.message || 'Failed to confirm movement. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

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
              <div className="text-lg font-semibold text-gray-900">{previewQuery.isLoading ? 'Loading...' : nextUnitLabel}</div>
            </div>
            {previewQuery.isError && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                Unable to load movement preview. Please refresh and try again.
              </div>
            )}
            {submitError && (
              <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                {submitError}
              </div>
            )}
            <div>
              <div className="text-sm text-gray-500">Delayed By</div>
              <div className="text-lg font-semibold text-gray-900">{delayedDays} day{delayedDays === 1 ? '' : 's'}</div>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleConfirmClick}
                disabled={!canConfirm || isPending || isSubmitting}
              >
                {isSubmitting ? 'Confirming...' : 'Confirm Move'}
              </button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
