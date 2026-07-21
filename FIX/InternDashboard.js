import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Calendar, User, Clock, MapPin, Award, Building2 } from 'lucide-react';
import ExtensionModal from './ExtensionModal';
import ReassignModal from './ReassignModal';
import MovementControls from './MovementControls';
import ConfirmMovementModal from './ConfirmMovementModal';
import ReassignNextModal from './ReassignNextModal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { exportToCSV, openPrintableWindow, formatDate, getBatchColor, getStatusColor, normalizeDate, calculateDaysBetween } from '../lib/utils';
import { previewNextUnitForIntern, PREDICTIVE_WINDOW_DAYS } from '../lib/predictivePlanning';
import { api } from '../services/api';

const DAY_IN_MS = 1000 * 60 * 60 * 24;

function parseDateValue(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function calculateElapsedDays(startDateValue, durationValue, currentTimeValue) {
  const startDate = parseDateValue(startDateValue);
  if (!startDate) return 0;

  const now = new Date(currentTimeValue);
  if (now < startDate) return 0;

  const elapsedDays = Math.floor((now.getTime() - startDate.getTime()) / DAY_IN_MS) + 1;
  const duration = Number(durationValue);

  if (Number.isFinite(duration) && duration > 0) {
    return Math.max(0, Math.min(duration, elapsedDays));
  }

  return Math.max(0, elapsedDays);
}

function getUnitEndDate(startDateValue, durationValue) {
  const startDate = parseDateValue(startDateValue);
  const duration = Number(durationValue);

  if (!startDate || !Number.isFinite(duration) || duration <= 0) return null;

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + duration - 1);
  return endDate;
}

function getTotalDuration(rotation) {
  const baseDuration = Number(rotation?.baseDuration ?? rotation?.base_duration);
  const extensionDays = Number(rotation?.extensionDays ?? rotation?.extension_days ?? 0);

  if (Number.isFinite(baseDuration) && baseDuration > 0) {
    return Math.max(0, baseDuration + (Number.isFinite(extensionDays) ? extensionDays : 0));
  }

  const duration = Number(rotation?.duration_days ?? rotation?.duration);
  if (Number.isFinite(duration) && duration > 0) {
    return duration;
  }

  if (rotation?.start_date && rotation?.end_date) {
    return calculateDaysBetween(rotation.start_date, rotation.end_date);
  }

  return 0;
}

function getCurrentUnitProgressDisplay(rotation, currentTimeValue) {
  // FIX: this used to recompute endDate as start_date + duration_days, but
  // duration_days on the schedule payload is the ORIGINAL duration and is never
  // updated when extension days are added. Once the intern went past that stale
  // duration (e.g. into day 22 of a 20+2 extended rotation), isCurrentUnit fell
  // out of range and the whole progress line went blank. We now read the real
  // start_date/end_date the backend already computed (which DOES reflect
  // extensions), and derive the display duration from those actual dates.
  const startDate = parseDateValue(rotation?.start_date);
  const endDate = parseDateValue(rotation?.end_date);
  if (!startDate || !endDate) return null;

  const now = new Date(currentTimeValue);
  const isCurrentUnit = now >= startDate && now <= endDate;
  if (!isCurrentUnit) return null;

  const totalDuration = calculateDaysBetween(startDate, endDate) + 1;
  const elapsedDays = calculateElapsedDays(rotation.start_date, totalDuration, currentTimeValue);
  return `${elapsedDays} / ${totalDuration} days`;
}

export default function InternDashboard({ intern, onClose, onInternUpdated }) {
  const queryClient = useQueryClient();
  const [showExtend, setShowExtend] = React.useState(false);
  const [showReassign, setShowReassign] = React.useState(false);
  const [activeRotation, setActiveRotation] = React.useState(null);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [internState, setInternState] = React.useState(intern);
  const [currentTime, setCurrentTime] = React.useState(() => Date.now());
  // NEW: Accept/Reassign confirmation state for the Next Assignment card.
  const [confirmMovement, setConfirmMovement] = React.useState(null);
  const [reassignNextConfirmation, setReassignNextConfirmation] = React.useState(null);

  React.useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000);

    return () => window.clearInterval(intervalId);
  }, []);

  const { data: internDetails } = useQuery({
    queryKey: ['intern', intern.id],
    queryFn: () => api.getIntern(intern.id),
    initialData: intern,
  });

  React.useEffect(() => {
    setInternState(intern);
  }, [intern]);

  React.useEffect(() => {
    if (internDetails) {
      setInternState(prev => ({
        ...prev,
        ...internDetails,
      }));
    }
  }, [internDetails]);

  const currentIntern = internState || intern;
  const extensionDays = Number(currentIntern?.extension_days) || 0;
  // FIX (status model): 'Extended' removed — only active, pending, completed
  // exist now. Extension days are shown separately as a number, not a status.
  const derivedStatus = React.useMemo(() => {
    if (!currentIntern) return 'Active';
    return currentIntern.status || 'Active';
  }, [currentIntern]);

  const { data: internSchedule } = useQuery({
    queryKey: ['intern-schedule', intern.id],
    queryFn: () => {
      console.log('[InternDashboard] Fetching schedule for intern', intern.id);
      return api.getInternSchedule(intern.id);
    },
    staleTime: 0, // Always refetch fresh data
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  const { data: units } = useQuery({
    queryKey: ['units'],
    queryFn: () => api.getUnits(),
  });

  const { data: interns } = useQuery({
    queryKey: ['interns'],
    queryFn: () => api.getInterns(),
  });

  const { data: systemSettings } = useQuery({
    queryKey: ['system-settings'],
    queryFn: api.getSystemSettings,
  });

  const rotationDurationWeeks = Number(systemSettings?.rotation_duration_weeks) || 4;
  const rotationDurationDays = rotationDurationWeeks * 7;

  // Debug logging
  React.useEffect(() => {
    if (internSchedule) {
      console.log('[InternDashboard] Schedule data:', internSchedule);
      console.log('[InternDashboard] Today:', normalizeDate(new Date()));
      const rotationRows = Array.isArray(internSchedule) ? internSchedule : (internSchedule?.rotations || []);
      rotationRows.forEach(r => {
        console.log(`[InternDashboard] Rotation: ${r.unit_name} ${r.start_date}-${r.end_date}, is_manual=${r.is_manual_assignment}`);
      });
    }
  }, [internSchedule]);

  const schedulePayload = React.useMemo(
    () => (Array.isArray(internSchedule) ? null : internSchedule),
    [internSchedule]
  );

  const scheduleRows = React.useMemo(
    () => (Array.isArray(internSchedule) ? internSchedule : (internSchedule?.rotations || [])),
    [internSchedule]
  );

  // Separate completed and upcoming rotations using normalized dates to handle extensions correctly
  const completedRotations = React.useMemo(() => {
    if (schedulePayload?.completed) return schedulePayload.completed;
    return scheduleRows.filter(r => normalizeDate(r.end_date) < normalizeDate(new Date()));
  }, [schedulePayload, scheduleRows]);

  const currentRotations = React.useMemo(() => {
    if (schedulePayload?.current) return [schedulePayload.current];
    return scheduleRows.filter(r => {
      const start = normalizeDate(r.start_date);
      const end = normalizeDate(r.end_date);
      const today = normalizeDate(new Date());
      return start <= today && end >= today;
    });
  }, [schedulePayload, scheduleRows]);

  const upcomingRotations = React.useMemo(() => {
    if (Array.isArray(schedulePayload?.upcomingRotations) && schedulePayload.upcomingRotations.length > 0) {
      return schedulePayload.upcomingRotations;
    }
    if (schedulePayload?.upcoming) return schedulePayload.upcoming;
    return scheduleRows.filter(r => normalizeDate(r.start_date) > normalizeDate(new Date()));
  }, [schedulePayload, scheduleRows]);

  // Debug logging for filtered results
  React.useEffect(() => {
    console.log('[InternDashboard] Completed:', completedRotations.length);
    console.log('[InternDashboard] Current:', currentRotations.length);
    console.log('[InternDashboard] Upcoming:', upcomingRotations.length);
  }, [completedRotations.length, currentRotations.length, upcomingRotations.length]);

  const orderedUnits = React.useMemo(() => {
    return [...(units || [])].sort((a, b) => {
      const leftOrder = Number(a.order ?? a.position ?? 0);
      const rightOrder = Number(b.order ?? b.position ?? 0);
      return leftOrder - rightOrder;
    });
  }, [units]);

  const completedUnitIds = React.useMemo(() => {
    return new Set(
      (completedRotations || [])
        .map((rotation) => String(rotation.unit_id || rotation.unitId || rotation.unit?.id || ''))
        .filter(Boolean)
    );
  }, [completedRotations]);

  const currentUnitId = React.useMemo(() => {
    const currentRotation = currentRotations[0] || null;
    return (
      currentRotation?.unit_id
      || currentRotation?.unitId
      || currentIntern?.currentUnit?.id
      || currentIntern?.currentUnit?._id
      || null
    );
  }, [currentIntern, currentRotations]);

  const remainingUnits = React.useMemo(() => {
    return orderedUnits.filter((unit) => {
      const unitId = String(unit.id || unit._id || '');
      if (!unitId) return false;
      if (currentUnitId && unitId === String(currentUnitId)) return false;
      return !completedUnitIds.has(unitId);
    });
  }, [orderedUnits, currentUnitId, completedUnitIds]);

  const currentRotation = currentRotations[0] || null;

  // FIX: this previously ALWAYS ran an independent client-side "predicted
  // assignment" simulation (previewNextUnitForIntern), even once the intern was
  // actually overdue and the backend had already staged a real next unit. Right
  // at that transition (unit just completed / gone overdue), the simulation could
  // momentarily find no match and show "Pending Assignment / No eligible unit
  // available for preview" — unrelated to what the backend actually had staged —
  // then "correct" itself on the next refetch, which is the flashing behaviour
  // you saw. Now: if the backend has a real staged rotation (status
  // 'awaiting_confirmation', requires the /schedule route fix below), we show
  // that directly. The simulation is now only used as a preview during the
  // pre-overdue 5-day window, before anything is staged yet by design.
  const nextAssignmentPreview = React.useMemo(() => {
    const staged = (upcomingRotations || []).find((r) => r.status === 'awaiting_confirmation')
      || (upcomingRotations || [])[0]
      || null;

    if (staged) {
      return {
        status: 'preview',
        reason: null,
        unit: { name: staged.unit_name },
        startsOnLabel: staged.start_date ? formatDate(staged.start_date) : 'TBD',
        shouldPreview: true,
      };
    }

    if (!currentRotation || !currentIntern) {
      return { status: 'pending', reason: 'Pending Assignment', unit: null, shouldPreview: false };
    }

    const internForPreview = {
      ...currentIntern,
      currentUnit: {
        ...(currentIntern.currentUnit || {}),
        id: currentRotation.unit_id || currentRotation.unitId || currentIntern?.currentUnit?.id,
        _id: currentRotation.unit_id || currentRotation.unitId || currentIntern?.currentUnit?._id,
        name: currentRotation.unit_name || currentIntern?.currentUnit?.name,
        startDate: currentRotation.start_date,
        start_date: currentRotation.start_date,
        endDate: currentRotation.end_date,
        end_date: currentRotation.end_date,
        duration: getTotalDuration(currentRotation),
        duration_days: getTotalDuration(currentRotation),
      },
      completedUnits: completedRotations,
    };

    return previewNextUnitForIntern(internForPreview, {
      interns: Array.isArray(interns) ? interns : [],
      units: orderedUnits,
      referenceDate: new Date(currentTime),
      leavingSoonDays: PREDICTIVE_WINDOW_DAYS,
    });
  }, [completedRotations, currentIntern, currentRotation, currentTime, interns, orderedUnits, upcomingRotations]);

  // NEW: drives the Accept/Reassign controls on the Next Assignment card.
  // Same eligibility rule as the Dashboard's Movement Queue: visible (but
  // disabled) once <=5 days remain, only clickable once actually overdue
  // (e.g. 22/21 or 31/30).
  const movementStatus = React.useMemo(() => {
    if (!currentRotation) {
      return { isEligible: false, isOverdue: false, remainingDays: null, overdueDays: 0 };
    }

    const startDate = parseDateValue(currentRotation.start_date);
    const endDate = parseDateValue(currentRotation.end_date);
    if (!startDate || !endDate) {
      return { isEligible: false, isOverdue: false, remainingDays: null, overdueDays: 0 };
    }

    const now = new Date(currentTime);
    now.setHours(0, 0, 0, 0);
    const remainingDays = Math.floor((endDate.getTime() - now.getTime()) / DAY_IN_MS);
    const isOverdue = remainingDays < 0;
    const overdueDays = isOverdue ? Math.abs(remainingDays) : 0;
    const hasStaged = (upcomingRotations || []).some((r) => r.status === 'awaiting_confirmation');
    const isEligible = remainingDays <= 5 || isOverdue || hasStaged;

    return { isEligible, isOverdue, remainingDays, overdueDays };
  }, [currentRotation, currentTime, upcomingRotations]);

  const stagedNextRotation = React.useMemo(
    () => (upcomingRotations || []).find((r) => r.status === 'awaiting_confirmation') || null,
    [upcomingRotations]
  );

  const handleAcceptNextClick = () => {
    setConfirmMovement({
      internId: currentIntern?.id || currentIntern?._id || intern.id,
      internName: currentIntern?.name || intern.name,
      currentUnit: currentRotation?.unit_name || 'Current Unit',
      isOverdue: movementStatus.isOverdue,
      remainingDays: movementStatus.remainingDays,
      overdueDays: movementStatus.overdueDays,
    });
  };

  const handleReassignNextClick = () => {
    setReassignNextConfirmation({
      internId: currentIntern?.id || currentIntern?._id || intern.id,
      internName: currentIntern?.name || intern.name,
      currentUnitId: currentRotation?.unit_id || currentRotation?.unitId,
      activeAssignment: currentRotation,
      intern: currentIntern,
    });
  };

  const handleConfirmAcceptNext = async (movement) => {
    try {
      await api.acceptMovement?.(movement.internId);
      await queryClient.invalidateQueries({ queryKey: ['intern-schedule', intern.id] });
      await queryClient.invalidateQueries({ queryKey: ['interns'] });
      setConfirmMovement(null);
    } catch (error) {
      console.error('[InternDashboard] Failed to accept movement:', error);
      // FIX: rethrow so ConfirmMovementModal's own error handling can show
      // this to the user instead of leaving the modal with no feedback.
      throw error;
    }
  };

  const handleReassignNextSuccess = async () => {
    await queryClient.invalidateQueries({ queryKey: ['intern-schedule', intern.id] });
    await queryClient.invalidateQueries({ queryKey: ['interns'] });
    setReassignNextConfirmation(null);
  };

  const getRotationDuration = React.useCallback((rotation) => {
    // NEVER use rotation.duration_days - backend doesn't update it after extension
    // Always calculate from actual dates
    if (!rotation?.start_date || !rotation?.end_date) {
      return 0;
    }
    try {
      return calculateDaysBetween(rotation.start_date, rotation.end_date);
    } catch (err) {
      console.error('[InternDashboard] Failed to calculate rotation duration:', err);
      return 0;
    }
  }, []);

  // Global internship days always come from the original internship start date.
  const totalDaysInInternship = React.useMemo(() => {
    const internshipStartDate = currentIntern?.start_date || currentIntern?.startDate || null;
    return calculateElapsedDays(internshipStartDate, null, currentTime);
  }, [currentIntern?.startDate, currentIntern?.start_date, currentTime]);

  const invalidateInternLists = React.useCallback(() => {
    queryClient.invalidateQueries({
      predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'interns',
    });
  }, [queryClient]);

  const handleExtensionSuccess = React.useCallback(async (result) => {
    setShowExtend(false);
    if (result) {
      // FIX (status model): fallback default is now 'Active' since 'Extended'
      // no longer exists as a status (extension days are tracked separately).
      const updatedStatus = result.status ?? 'Active';
      const updatedExtensionDays = typeof result.extension_days === 'number'
        ? result.extension_days
        : Number(internState?.extension_days) || 0;

      setInternState(prev => ({
        ...prev,
        status: updatedStatus,
        extension_days: updatedExtensionDays,
      }));

      if (typeof onInternUpdated === 'function') {
        onInternUpdated({
          id: intern.id,
          status: updatedStatus,
          extension_days: updatedExtensionDays,
        });
      }
    }

    // Force immediate refresh of schedule data - this is critical for showing updated rotation days
    // Use exact: true and type: 'all' to guarantee a fresh refetch
    await queryClient.invalidateQueries({ 
      queryKey: ['intern-schedule', intern.id],
      exact: true
    });
    await queryClient.refetchQueries({ 
      queryKey: ['intern-schedule', intern.id],
      exact: true,
      type: 'all' // Force refetch all queries matching this key
    });
    
    // Also invalidate and refetch intern details
    await queryClient.invalidateQueries({ 
      queryKey: ['intern', intern.id],
      exact: true
    });
    await queryClient.refetchQueries({ 
      queryKey: ['intern', intern.id],
      exact: true,
      type: 'all'
    });

    await queryClient.invalidateQueries({ queryKey: ['units'] });
    await queryClient.refetchQueries({ queryKey: ['units'], type: 'all' });

    await queryClient.invalidateQueries({ queryKey: ['rotations', 'current'] });
    await queryClient.refetchQueries({ queryKey: ['rotations', 'current'], type: 'all' });

    await queryClient.invalidateQueries({ queryKey: ['recentActivities'] });
    await queryClient.refetchQueries({ queryKey: ['recentActivities'], type: 'all' });
    
    // Invalidate intern lists
    invalidateInternLists();
    await queryClient.refetchQueries({
      predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'interns',
      type: 'all'
    });
  }, [intern.id, internState?.extension_days, invalidateInternLists, onInternUpdated, queryClient]);

  const handleReassign = React.useCallback(() => {
    const current = currentRotations[0] || {
      id: 'fallback-current-rotation',
      unit_name: currentIntern?.currentUnit?.name || 'Current Unit',
      start_date: currentIntern?.start_date || currentIntern?.startDate || new Date().toISOString(),
      end_date: null,
    };
    setActiveRotation(current);
    setShowReassign(true);
  }, [currentIntern?.currentUnit?.name, currentIntern?.startDate, currentIntern?.start_date, currentRotations]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:space-y-0 pb-4">
            <div>
              <CardTitle className="flex items-center space-x-2">
                <User className="h-5 w-5" />
                <span className="break-words">{currentIntern?.name}'s Dashboard</span>
              </CardTitle>
              <CardDescription>
                Complete internship overview and rotation details
              </CardDescription>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Actions */}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={() => handleReassign(intern._id || intern.id)}
                title="Reassign current unit"
              >
                Reassign
              </Button>
              <Button className="hospital-gradient" onClick={() => setShowExtend(true)}>Extension</Button>
              <Button variant="outline" onClick={() => {
                try {
                  const rows = (scheduleRows || []).map(r => ({ unit: r.unit_name, start_date: r.start_date, end_date: r.end_date, duration_days: r.start_date && r.end_date ? calculateDaysBetween(r.start_date, r.end_date) : '' }));
                  exportToCSV(`${currentIntern?.name}-rotations`, rows, ['unit','start_date','end_date','duration_days']);
                } catch (err) { alert('Export failed: ' + err.message); }
              }}>Export CSV</Button>
              <Button variant="outline" onClick={() => {
                try {
                  const completedRows = completedRotations.map(r => `
                    <tr>
                      <td>${r.unit_name}</td>
                      <td>${formatDate(r.start_date)}</td>
                      <td>${formatDate(r.end_date)}</td>
                      <td>${calculateDaysBetween(r.start_date, r.end_date)} days</td>
                    </tr>
                  `).join('');

                  const remainingRows = remainingUnits.map(u => `
                    <tr>
                      <td>${u.name}</td>
                      <td>${rotationDurationDays} days</td>
                    </tr>
                  `).join('');

                  const html = `
                    <h2>${currentIntern?.name}</h2>
                    <p><em>Next unit will be assigned automatically based on availability and load balance.</em></p>
                    <h3>1. Completed Units</h3>
                    <table>
                      <thead>
                        <tr>
                          <th>Unit Name</th>
                          <th>Start Date</th>
                          <th>End Date</th>
                          <th>Total Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${completedRows || '<tr><td colspan="4">No completed units</td></tr>'}
                      </tbody>
                    </table>
                    <h3>2. Remaining Units (Eligible)</h3>
                    <table>
                      <thead>
                        <tr>
                          <th>Unit Name</th>
                          <th>Estimated Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${remainingRows || '<tr><td colspan="2">No remaining units</td></tr>'}
                      </tbody>
                    </table>
                  `;

                  openPrintableWindow(`${currentIntern?.name} - Rotations`, html);
                } catch (err) { alert('PDF export failed: ' + err.message); }
              }}>Download PDF</Button>
            </div>
            {/* Intern Overview */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${getBatchColor(currentIntern?.batch)}`}></div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Batch</p>
                      <p className="text-xl font-bold text-gray-900">{currentIntern?.batch}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <Calendar className="h-5 w-5 text-blue-600" />
                    <div>
                      <p className="text-sm font-medium text-gray-600">Start Date</p>
                      <p className="text-xl font-bold text-gray-900">{formatDate(currentIntern?.start_date)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <Clock className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="text-sm font-medium text-gray-600">Days in Internship</p>
                      <p className="text-xl font-bold text-gray-900">{totalDaysInInternship} days</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <span className={`w-3 h-3 rounded-full ${getStatusColor(derivedStatus)}`}></span>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Status</p>
                      <p className="text-xl font-bold text-gray-900">
                        {derivedStatus}
                        {extensionDays > 0 && (
                          <span className="ml-2 text-sm text-yellow-600">+{extensionDays} days</span>
                        )}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Current Units */}
            {currentRotations.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <MapPin className="h-5 w-5" />
                    <span>Current Units</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {currentRotations.map((rotation) => {
                      const progressDisplay = getCurrentUnitProgressDisplay(rotation, currentTime);

                      return (
                        <div key={rotation.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 bg-blue-50 rounded-lg">
                          <div>
                            <h4 className="font-medium">{rotation.unit_name}</h4>
                            <p className="text-sm text-gray-600">
                              {formatDate(rotation.start_date)} - {formatDate(rotation.end_date)}
                            </p>
                          </div>
                          <div className="text-right">
                            {progressDisplay && (
                              <p className="text-sm font-medium text-blue-600">
                                {progressDisplay}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Next Assignment */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center space-x-2">
                    <Calendar className="h-5 w-5" />
                    <span>Next Assignment (5-Day Preview)</span>
                  </CardTitle>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isRefreshing}
                    onClick={async (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsRefreshing(true);
                      try {
                        await queryClient.invalidateQueries({ queryKey: ['intern-schedule', intern.id] });
                        await queryClient.refetchQueries({ queryKey: ['intern-schedule', intern.id] });
                      } catch (error) {
                        console.error('[InternDashboard] Error refreshing schedule:', error);
                        alert('Error refreshing schedule. Check console for details.');
                      } finally {
                        setIsRefreshing(false);
                      }
                    }}
                  >
                    {isRefreshing ? 'Refreshing...' : 'Refresh'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {!currentRotation ? (
                  <p className="text-center py-4 text-gray-500">No active unit assignment</p>
                ) : !nextAssignmentPreview.shouldPreview && !movementStatus.isEligible ? (
                  <div className="text-center py-4 text-gray-500">
                    Preview appears when current unit has 5 days or less remaining
                  </div>
                ) : nextAssignmentPreview.status === 'rotation-complete' && !movementStatus.isEligible ? (
                  <div className="text-center py-4">
                    <p className="font-medium text-green-700">Rotation Complete</p>
                    <p className="text-xs text-gray-500 mt-1">All units have been completed.</p>
                  </div>
                ) : (
                  <div
                    className={`rounded-lg border p-4 ${
                      movementStatus.isOverdue ? 'border-amber-200 bg-amber-50' : 'border-blue-100 bg-blue-50'
                    }`}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className={`text-sm font-medium ${movementStatus.isOverdue ? 'text-amber-700' : 'text-blue-700'}`}>
                          {movementStatus.isOverdue
                            ? `Pending Approval (${movementStatus.overdueDays} day${movementStatus.overdueDays === 1 ? '' : 's'} overdue)`
                            : 'Next Assignment (in <=5 days)'}
                        </p>
                        <p className="text-lg font-semibold text-gray-900 mt-1">
                          {stagedNextRotation?.unit_name || nextAssignmentPreview?.unit?.name || 'Pending Assignment'}
                        </p>
                        <p className="text-sm text-gray-600 mt-1">
                          Starts: {stagedNextRotation?.start_date
                            ? formatDate(stagedNextRotation.start_date)
                            : (nextAssignmentPreview?.startsOnLabel || 'TBD')}
                        </p>
                      </div>
                      {/* NEW: visible in the 5-day window, disabled until actually overdue */}
                      <MovementControls
                        item={{
                          isOverdue: movementStatus.isOverdue,
                          remainingDays: movementStatus.remainingDays,
                          hasUpcomingRotation: Boolean(stagedNextRotation),
                        }}
                        onAccept={handleAcceptNextClick}
                        onReassign={handleReassignNextClick}
                        className="gap-1 shrink-0"
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Completed Rotations */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Award className="h-5 w-5" />
                  <span>Completed Rotations ({completedRotations.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {completedRotations.length > 0 ? (
                  <div className="space-y-2">
                    {completedRotations.map((rotation) => (
                      <div key={rotation.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 bg-green-50 rounded-lg">
                        <div>
                          <h4 className="font-medium">{rotation.unit_name}</h4>
                          <p className="text-sm text-gray-600">
                            {formatDate(rotation.start_date)} - {formatDate(rotation.end_date)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-green-600">
                            {getRotationDuration(rotation)} days completed
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-4">No completed rotations yet</p>
                )}
              </CardContent>
            </Card>

            {/* Remaining Units */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Building2 className="h-5 w-5" />
                  <span>Remaining Units ({remainingUnits.length})</span>
                </CardTitle>
                <CardDescription>
                  Units not yet assigned to this intern
                </CardDescription>
              </CardHeader>
              <CardContent>
                {remainingUnits.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {remainingUnits.map((unit) => (
                      <div key={unit.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 border rounded-lg">
                        <div>
                          <h4 className="font-medium">{unit.name}</h4>
                          <p className="text-sm text-gray-600">{unit.duration_days || unit.duration || rotationDurationDays} days</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-4">All units have been assigned</p>
                )}
              </CardContent>
            </Card>
          </CardContent>
        </Card>
        {showExtend && (
          <ExtensionModal
            intern={currentIntern}
            onClose={() => setShowExtend(false)}
            onSuccess={handleExtensionSuccess}
          />
        )}
        {confirmMovement && (
          <ConfirmMovementModal
            movement={confirmMovement}
            isPending={false}
            onClose={() => setConfirmMovement(null)}
            onConfirm={handleConfirmAcceptNext}
          />
        )}
        {reassignNextConfirmation && (
          <ReassignNextModal
            confirmation={reassignNextConfirmation}
            onClose={() => setReassignNextConfirmation(null)}
            onSuccess={handleReassignNextSuccess}
          />
        )}
        {showReassign && activeRotation && (
          <ReassignModal
            intern={intern}
            currentRotation={activeRotation}
            onClose={() => {
              setShowReassign(false);
              setActiveRotation(null);
            }}
            onSuccess={async () => {
              setShowReassign(false);
              setActiveRotation(null);
              // Force a complete refresh of the schedule data
              await queryClient.invalidateQueries({ 
                queryKey: ['intern-schedule', intern.id],
                exact: true
              });
              await queryClient.refetchQueries({ 
                queryKey: ['intern-schedule', intern.id],
                exact: true,
                type: 'all'
              });
              // Also invalidate rotations and intern lists
              await queryClient.invalidateQueries({ queryKey: ['units'] });
              await queryClient.invalidateQueries({ queryKey: ['rotations', 'current'] });
              await queryClient.invalidateQueries({ 
                predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'interns',
              });
            }}
          />
        )}
      </div>
    </div>
  );
}
