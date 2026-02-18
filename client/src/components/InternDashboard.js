import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Calendar, User, Clock, MapPin, Award, Building2 } from 'lucide-react';
import ExtensionModal from './ExtensionModal';
import ReassignModal from './ReassignModal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { exportToCSV, openPrintableWindow, formatDate, getBatchColor, getStatusColor, getWorkloadColor, normalizeDate, calculateDaysBetween } from '../lib/utils';
import { api } from '../services/api';

export default function InternDashboard({ intern, onClose, onInternUpdated }) {
  const queryClient = useQueryClient();
  const [showExtend, setShowExtend] = React.useState(false);
  const [showReassign, setShowReassign] = React.useState(false);
  const [activeRotation, setActiveRotation] = React.useState(null);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [internState, setInternState] = React.useState(intern);

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
  const derivedStatus = React.useMemo(() => {
    if (!currentIntern) return 'Active';
    if (currentIntern.status === 'Completed') return 'Completed';
    if (currentIntern.status === 'Extended') return 'Extended';
    if (extensionDays > 0) return 'Extended';
    return currentIntern.status || 'Active';
  }, [currentIntern, extensionDays]);

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
    queryFn: api.getUnits,
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
    if (schedulePayload?.upcoming) return schedulePayload.upcoming;
    return scheduleRows.filter(r => normalizeDate(r.start_date) > normalizeDate(new Date()));
  }, [schedulePayload, scheduleRows]);

  // Debug logging for filtered results
  React.useEffect(() => {
    console.log('[InternDashboard] Completed:', completedRotations.length);
    console.log('[InternDashboard] Current:', currentRotations.length);
    console.log('[InternDashboard] Upcoming:', upcomingRotations.length);
  }, [completedRotations.length, currentRotations.length, upcomingRotations.length]);

  // Get units not yet assigned to this intern
  // Exclude units that are in completed, current, OR upcoming rotations
  // Units in upcoming rotations should NOT appear in remaining units
  const assignedUnitIds = [
    ...completedRotations.map(r => r.unit_id),
    ...currentRotations.map(r => r.unit_id),
    ...upcomingRotations.map(r => r.unit_id)
  ];
  const remainingUnits = units?.filter(unit => 
    !assignedUnitIds.includes(unit.id)
  ) || [];

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

  // Calculate total days completed in rotations (completed rotations only)
  const totalDaysCompleted = completedRotations.reduce((total, rotation) => {
    const days = getRotationDuration(rotation);
    return total + days;
  }, 0);

  // Calculate days in current rotation (capped at rotation duration)
  const currentUnitDays = currentRotations.reduce((total, rotation) => {
    const startDate = normalizeDate(rotation.start_date);
    const endDate = normalizeDate(rotation.end_date);
    const currentDate = normalizeDate(new Date());
    // Always calculate from actual dates to account for extensions
    const rotationDuration = Math.max(0, Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1);
    const daysElapsed = Math.max(0, Math.floor((currentDate - startDate) / (1000 * 60 * 60 * 24)) + 1);
    // Cap days at rotation duration (prevents showing 3/2 days)
    const daysInCurrentUnit = Math.min(daysElapsed, rotationDuration);
    return total + daysInCurrentUnit;
  }, 0);

  // Calculate total days in internship (from start_date to today)
  const totalDaysInInternship = React.useMemo(() => {
    if (!currentIntern?.start_date) return 0;
    const startDate = normalizeDate(currentIntern.start_date);
    const currentDate = normalizeDate(new Date());
    return Math.max(0, Math.floor((currentDate - startDate) / (1000 * 60 * 60 * 24)) + 1);
  }, [currentIntern?.start_date]);

  const invalidateInternLists = React.useCallback(() => {
    queryClient.invalidateQueries({
      predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'interns',
    });
  }, [queryClient]);

  const handleExtensionSuccess = React.useCallback(async (result) => {
    setShowExtend(false);
    if (result) {
      const updatedStatus = result.status ?? 'Extended';
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
    
    // Invalidate intern lists
    invalidateInternLists();
    await queryClient.refetchQueries({
      predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'interns',
      type: 'all'
    });
  }, [intern.id, internState?.extension_days, invalidateInternLists, onInternUpdated, queryClient]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle className="flex items-center space-x-2">
                <User className="h-5 w-5" />
                <span>{currentIntern?.name}'s Dashboard</span>
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
            <div className="flex items-center justify-end space-x-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  // Use the first current rotation (interns typically have one active unit at a time)
                  if (currentRotations.length > 0) {
                    setActiveRotation(currentRotations[0]);
                    setShowReassign(true);
                  }
                }}
                disabled={currentRotations.length === 0}
                title={currentRotations.length === 0 ? "No active unit to reassign" : "Reassign current unit"}
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
                  const upcomingRows = upcomingRotations.map(r => `
                    <tr>
                      <td>${r.unit_name}</td>
                      <td>${r.start_date ? formatDate(r.start_date) : 'Pending'}</td>
                      <td>${r.start_date && r.end_date ? `${calculateDaysBetween(r.start_date, r.end_date)} days` : `${r.duration_days || rotationDurationDays} days`}</td>
                    </tr>
                  `).join('');

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
                    <h3>1. Upcoming Units</h3>
                    <table>
                      <thead>
                        <tr>
                          <th>Unit Name</th>
                          <th>Start Date</th>
                          <th>Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${upcomingRows || '<tr><td colspan="3">No upcoming units</td></tr>'}
                      </tbody>
                    </table>
                    <h3>2. Completed Units</h3>
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
                    <h3>3. Remaining Units</h3>
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
                      <p className="text-xl font-bold text-gray-900">{totalDaysInInternship}</p>
                      <p className="text-xs text-gray-500 mt-1">Rotations: {totalDaysCompleted + currentUnitDays} days</p>
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
                    {currentRotations.map((rotation) => (
                      <div key={rotation.id} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                        <div>
                          <h4 className="font-medium">{rotation.unit_name}</h4>
                          <p className="text-sm text-gray-600">
                            {formatDate(rotation.start_date)} - {formatDate(rotation.end_date)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-blue-600">
                            {(() => {
                              const startDate = normalizeDate(rotation.start_date);
                              const currentDate = normalizeDate(new Date());
                              // Always calculate from actual dates to account for extensions
                              // Use calculateDaysBetween for consistent inclusive day calculation
                              const totalDays = calculateDaysBetween(rotation.start_date, rotation.end_date);
                              const daysElapsed = Math.max(0, Math.floor((currentDate - startDate) / (1000 * 60 * 60 * 24)) + 1);
                              // Cap at total days to prevent showing 3/2 days
                              const cappedDays = Math.min(daysElapsed, totalDays);
                              return `${cappedDays} / ${totalDays} days`;
                            })()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Upcoming Rotations */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center space-x-2">
                    <Calendar className="h-5 w-5" />
                    <span>Upcoming Rotations ({upcomingRotations.length})</span>
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
                        console.log('[InternDashboard] Refreshing rotations...');
                        // Invalidate and refetch schedule - this will trigger auto-advance on server
                        await queryClient.invalidateQueries({ queryKey: ['intern-schedule', intern.id] });
                        await queryClient.refetchQueries({ queryKey: ['intern-schedule', intern.id] });
                        console.log('[InternDashboard] Rotations refreshed successfully');
                      } catch (error) {
                        console.error('[InternDashboard] Error refreshing rotations:', error);
                        alert('Error refreshing rotations. Check console for details.');
                      } finally {
                        setIsRefreshing(false);
                      }
                    }}
                  >
                    {isRefreshing ? 'Refreshing...' : 'Refresh Rotations'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {upcomingRotations.length > 0 ? (
                  <div className="space-y-2">
                    {upcomingRotations.map((rotation) => (
                      <div key={rotation.id || `upcoming-${rotation.unit_id}`} className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                        <div>
                          <h4 className="font-medium">{rotation.unit_name}</h4>
                          <p className="text-sm text-gray-600">
                            {rotation.start_date && rotation.end_date
                              ? `${formatDate(rotation.start_date)} - ${formatDate(rotation.end_date)}`
                              : 'Pending scheduling'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-yellow-600">
                            {rotation.start_date && rotation.end_date
                              ? `${getRotationDuration(rotation)} days`
                              : `${rotation.duration_days || rotationDurationDays} days`}
                          </p>
                          <span className="text-xs text-gray-500">
                            {(rotation.workload || 'N/A')} workload
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center py-4 text-gray-500">No upcoming rotations scheduled</p>
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
                      <div key={rotation.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
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
                          <span className="text-xs text-gray-500">
                            {rotation.workload} workload
                          </span>
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
                      <div key={unit.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <h4 className="font-medium">{unit.name}</h4>
                          <p className="text-sm text-gray-600">{rotationDurationDays} days</p>
                        </div>
                        <div className="text-right">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getWorkloadColor(unit.workload)}`}>
                            {unit.workload}
                          </span>
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
