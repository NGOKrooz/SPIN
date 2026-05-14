import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Users, 
  Building2,
  AlertCircle,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { api } from '../services/api';
import RecentUpdates from '../components/RecentUpdates';
import ReassignNextModal from '../components/ReassignNextModal';
import { buildMovementQueue, PREDICTIVE_WINDOW_DAYS } from '../lib/predictivePlanning';

export default function Dashboard() {
  const queryClient = useQueryClient();
  
  const { data: interns, isLoading: internsLoading } = useQuery({
    queryKey: ['interns'],
    queryFn: api.getInterns,
  });

  const { data: units, isLoading: unitsLoading } = useQuery({
    queryKey: ['units'],
    queryFn: api.getUnits,
  });

  // PHASE 2: Accept movement mutation
  const acceptMovementMutation = useMutation({
    mutationFn: (internId) => api.acceptMovement(internId),
    onSuccess: (data, internId) => {
      console.log('[PHASE 2] Movement accepted successfully:', data);
      // Refresh interns data to update the dashboard
      queryClient.invalidateQueries({ queryKey: ['interns'] });
      // Show success feedback (could be enhanced with toast notifications)
      alert(`✅ Movement accepted! ${data.data.internName} moved to ${data.data.toUnit}`);
    },
    onError: (error, internId) => {
      console.error('[PHASE 2] Failed to accept movement:', error);
      alert(`❌ Failed to accept movement: ${error.message || 'Unknown error'}`);
    },
  });

  // PHASE 3: Reassign next unit mutation
  const reassignNextMutation = useMutation({
    mutationFn: ({ internId, newUnitId }) => api.reassignNext(internId, newUnitId),
    onSuccess: (data) => {
      console.log('[PHASE 3] Reassignment successful:', data);
      // Refresh interns data to update the dashboard immediately
      queryClient.invalidateQueries({ queryKey: ['interns'] });
      // Close modal and show success feedback
      setReassignModalData(null);
      alert(`✅ Reassigned! ${data.data.internName}'s next unit changed to ${data.data.newUnit}`);
    },
    onError: (error) => {
      console.error('[PHASE 3] Failed to reassign:', error);
      alert(`❌ Failed to reassign: ${error.message || 'Unknown error'}`);
    },
  });

  // PHASE 3: Modal state
  const [reassignModalData, setReassignModalData] = useState(null);

  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  // removed unused systemInfo

  if (internsLoading || unitsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const activeInterns = interns?.filter(intern => intern.currentUnit) || [];
  const unassignedInterns = interns?.filter(intern => !intern.currentUnit) || [];

  const movementQueue = buildMovementQueue(interns || []);
  const nearingCompletionInterns = movementQueue.filter((item) => item.status === 'nearing_completion');
  const awaitingConfirmationInterns = movementQueue.filter((item) => item.status === 'awaiting_confirmation');

  console.log('[PHASE 1] Movement Queue count:', movementQueue.length);
  console.log('[PHASE 1] Nearing completion interns:', nearingCompletionInterns.map((item) => item.internName));
  console.log('[PHASE 1] Awaiting confirmation interns:', awaitingConfirmationInterns.map((item) => item.internName));

  const stats = [
    {
      title: 'Total Interns',
      value: interns?.length || 0,
      description: `${activeInterns.length} assigned, ${unassignedInterns.length} unassigned`,
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      title: 'Active Units',
      value: units?.length || 0,
      description: 'Available units',
      icon: Building2,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      title: 'Movement Queue',
      value: movementQueue.length,
      description: 'Interns nearing movement or awaiting confirmation',
      icon: AlertCircle,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
    },
  ];

  return (
    <div className="mx-auto w-full max-w-[1200px] space-y-6 px-4 sm:px-6 lg:px-8">
      {/* Header Card */}
      <div className="rounded-2xl border border-gray-200 bg-white/70 p-5 shadow-sm backdrop-blur sm:p-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">Internship Scheduler</h1>
          <h2 className="text-xl font-semibold text-gray-700 sm:text-2xl">Dashboard</h2>
          <p className="text-sm text-gray-600 sm:text-base">{todayLabel}</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title} className="border-0 shadow-sm bg-white/70 backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-600">
                {stat.title}
              </CardTitle>
              <div className={`rounded-lg p-2 ${stat.bgColor} shadow-inner`}> 
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
              <p className="text-xs text-gray-500">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-6">
        <RecentUpdates />

        <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-600" />
              Movement Queue
            </CardTitle>
            <CardDescription>
              Interns nearing completion or already awaiting confirmation for movement
            </CardDescription>
          </CardHeader>
          <CardContent>
            {movementQueue.length === 0 ? (
              <div className="text-sm text-gray-500">No interns in the movement queue at this time.</div>
            ) : (
              <div className="space-y-4">
                {movementQueue.map((item) => (
                  <div 
                    key={item.internId}
                    className={`border rounded-lg p-4 transition-colors ${item.status === 'awaiting_confirmation' ? 'border-orange-200 bg-orange-50/50 hover:bg-orange-100/50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <div>
                          <div className="text-sm text-gray-500 font-medium">Intern Name</div>
                          <div className="text-lg font-semibold text-gray-900">
                            {item.internName}
                          </div>
                        </div>

                        <div>
                          <div className="text-sm text-gray-500 font-medium">Current Unit</div>
                          <div className="text-base text-gray-900 font-medium">
                            {item.currentUnit}
                          </div>
                        </div>

                        <div>
                          <div className="text-sm text-gray-500 font-medium">Duration</div>
                          <div className="text-base text-gray-900 font-semibold">
                            {item.durationLabel}
                          </div>
                        </div>

                        {item.status === 'nearing_completion' ? (
                          <div>
                            <div className="text-sm text-gray-500 font-medium">Status</div>
                            <div className="text-base text-blue-700 font-semibold">Upcoming Movement</div>
                            <div className="text-xs text-gray-600 mt-1">
                              {item.remainingDays} day{item.remainingDays === 1 ? '' : 's'} remaining
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="text-sm text-gray-500 font-medium">Status</div>
                            <div className="text-base text-orange-700 font-semibold">Awaiting Confirmation</div>
                            <div className="text-xs text-orange-600 mt-1">
                              OVERDUE: {Math.max(0, item.elapsedDays - item.plannedDuration)} day{Math.max(0, item.elapsedDays - item.plannedDuration) === 1 ? '' : 's'}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="space-y-3">
                        {item.status === 'awaiting_confirmation' && (
                          <>
                            <div>
                              <div className="text-sm text-gray-500 font-medium">Next Unit</div>
                              <div className="text-lg font-semibold text-gray-900">
                                {item.nextUnit || 'Pending Assignment'}
                              </div>
                            </div>

                            <div className="flex gap-2 pt-2">
                              <button
                                className="flex items-center gap-2 flex-1 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Accept movement to next unit"
                                onClick={() => acceptMovementMutation.mutate(item.internId)}
                                disabled={acceptMovementMutation.isPending}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                                {acceptMovementMutation.isPending ? 'Accepting...' : 'Accept'}
                              </button>
                              <button
                                className="flex items-center gap-2 flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Reassign to different unit before movement"
                                onClick={() => setReassignModalData(item)}
                                disabled={reassignNextMutation.isPending}
                              >
                                <RefreshCw className="h-4 w-4" />
                                {reassignNextMutation.isPending ? 'Reassigning...' : 'Reassign'}
                              </button>
                            </div>
                            <div className="text-xs text-gray-500">
                              Accept movement to activate next unit
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {/* Removed Recent Rotations and Upcoming Movements per Phase 1 requirements */}

      {/* PHASE 3: Reassign Next Unit Modal */}
      {reassignModalData && (
        <ReassignNextModal
          confirmation={reassignModalData}
          onClose={() => setReassignModalData(null)}
          onSuccess={() => {
            console.log('[PHASE 3] ✅ Reassignment successful, modal closing');
            setReassignModalData(null);
          }}
        />
      )}
    </div>
  );
}
