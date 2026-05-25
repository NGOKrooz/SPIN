import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Clock, UserPlus, Calendar, ArrowRight, CheckCircle, Building2, Trash2, RefreshCcw, PencilRuler, TimerReset } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { api } from '../services/api';
import { formatDateTime, getRelativeTimeLabel } from '../lib/utils';

const activityIcons = {
  unit_update: PencilRuler,
  intern_update: PencilRuler,
  intern_created: UserPlus,
  intern_deleted: Trash2,
  intern_extension_added: TimerReset,
  intern_extension_removed: TimerReset,
  intern_reassigned: RefreshCcw,
  rotation_moved: ArrowRight,
  unit_created: Building2,
  unit_updated: PencilRuler,
  unit_deleted: Trash2,
  default: Clock,
};

const activityColors = {
  unit_update: 'text-cyan-600 bg-cyan-50',
  intern_update: 'text-sky-700 bg-sky-50',
  intern_created: 'text-emerald-600 bg-emerald-50',
  intern_deleted: 'text-red-600 bg-red-50',
  intern_extension_added: 'text-blue-600 bg-blue-50',
  intern_extension_removed: 'text-orange-600 bg-orange-50',
  intern_reassigned: 'text-purple-600 bg-purple-50',
  rotation_moved: 'text-indigo-600 bg-indigo-50',
  unit_created: 'text-sky-600 bg-sky-50',
  unit_updated: 'text-cyan-600 bg-cyan-50',
  unit_deleted: 'text-red-600 bg-red-50',
  default: 'text-gray-600 bg-gray-50',
};

function getChangeOldValue(change) {
  return change?.oldDisplayValue ?? change?.oldValue ?? 'none';
}

function getChangeNewValue(change) {
  return change?.newDisplayValue ?? change?.newValue ?? 'none';
}

export default function ActivityHistoryModal({ onClose }) {
  const [currentTime, setCurrentTime] = React.useState(() => Date.now());
  const { data, isLoading, error } = useQuery({
    queryKey: ['allActivities'],
    queryFn: () => api.getRecentActivities(1000), // Fetch a large number to get all activities
    refetchInterval: 30000,
  });

  React.useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, []);

  const activities = React.useMemo(() => {
    const source = Array.isArray(data)
      ? data
      : (Array.isArray(data?.data) ? data.data : []);

    return source
      .slice()
      .sort((left, right) => {
        const leftTime = left?.created_at || left?.createdAt ? new Date(left.created_at || left.createdAt).getTime() : 0;
        const rightTime = right?.created_at || right?.createdAt ? new Date(right.created_at || right.createdAt).getTime() : 0;
        return rightTime - leftTime;
      });
  }, [data]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 flex-shrink-0">
          <div>
            <CardTitle className="flex items-center space-x-2">
              <Clock className="h-5 w-5" />
              <span>Activity History</span>
            </CardTitle>
            <CardDescription>
              Complete history of all activities and changes in the system
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-sm text-red-600">
              Failed to load activity history
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-12 text-sm text-gray-500">
              No activity history found
            </div>
          ) : (
            <div className="space-y-3">
              {activities.map((activity) => {
                const activityType = activity.type || activity.action || 'activity';
                const Icon = activityIcons[activityType] || activityIcons.default;
                const colorClass = activityColors[activityType] || activityColors.default;
                const message = activity.message || activity.description || 'Activity occurred';
                const createdAt = activity.created_at || activity.createdAt || null;
                const timeAgo = createdAt
                  ? getRelativeTimeLabel(createdAt, currentTime)
                  : 'Recently';
                const fullDate = createdAt
                  ? formatDateTime(createdAt)
                  : '';

                return (
                  <div
                    key={activity.id}
                    className="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors border border-gray-100"
                  >
                    <div className={`rounded-lg p-2 ${colorClass} flex-shrink-0`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 break-words">{message}</p>
                      {Array.isArray(activity?.metadata?.changes) && activity.metadata.changes.length > 0 ? (
                        <div className="mt-2 space-y-1">
                          {activity.metadata.changes.map((change, index) => (
                            <p key={`${activity.id || activity._id || 'activity'}-change-${index}`} className="text-xs text-gray-700 break-words">
                              <span className="text-gray-500">{change.label || change.field}:</span>{' '}
                              <span className="text-gray-500">{String(getChangeOldValue(change))}</span>{' '}
                              <span className="text-gray-400">→</span>{' '}
                              <span className="font-semibold text-gray-900">{String(getChangeNewValue(change))}</span>
                            </p>
                          ))}
                        </div>
                      ) : null}
                      <div className="flex items-center space-x-2 mt-1">
                        <p className="text-xs text-gray-500">{timeAgo}</p>
                        {fullDate && (
                          <>
                            <span className="text-xs text-gray-300">•</span>
                            <p className="text-xs text-gray-500">{fullDate}</p>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
        <div className="flex items-center justify-end space-x-3 pt-4 border-t px-6 pb-6 flex-shrink-0">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </Card>
    </div>
  );
}

