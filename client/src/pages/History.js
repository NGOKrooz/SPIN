import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, UserPlus, ArrowRight, Building2, Trash2, RefreshCcw, PencilRuler, TimerReset } from 'lucide-react';
import { Card, CardContent } from '../components/ui/card';
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

export default function History() {
  const [currentTime, setCurrentTime] = React.useState(() => Date.now());
  const { data, isLoading, error } = useQuery({
    queryKey: ['allActivities'],
    queryFn: () => api.getRecentActivities('all'),
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
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Activity History</h1>
        <p className="text-gray-600">Complete history of all activities and changes in the system</p>
      </div>

      <Card>
        <CardContent className="p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-sm text-red-600">
              Error loading activities: {error.message}
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No activities found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {activities.map((activity) => {
                const IconComponent = activityIcons[activity.action_type] || activityIcons.default;
                const colorClass = activityColors[activity.action_type] || activityColors.default;
                const createdAt = activity.created_at || activity.createdAt;
                const timestamp = createdAt ? new Date(createdAt) : null;

                return (
                  <div key={activity._id || activity.id} className="flex items-start space-x-4 p-4 rounded-lg border bg-white hover:bg-gray-50 transition-colors">
                    <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${colorClass}`}>
                      <IconComponent className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900">
                          {activity.description || 'Activity'}
                        </p>
                        <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                          {timestamp ? getRelativeTimeLabel(timestamp, currentTime) : 'Unknown time'}
                        </span>
                      </div>
                      {activity.changes && activity.changes.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {activity.changes.map((change, index) => (
                            <div key={index} className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1">
                              <span className="font-medium">{change.field}:</span> {getChangeOldValue(change)} → {getChangeNewValue(change)}
                            </div>
                          ))}
                        </div>
                      )}
                      {timestamp && (
                        <p className="text-xs text-gray-400 mt-1">
                          {formatDateTime(timestamp)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}