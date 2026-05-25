import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { 
  Clock, 
  UserPlus, 
  Building2, 
  ArrowRight,
  AlertCircle,
  RefreshCcw,
  Trash2,
  TimerReset,
  PencilRuler
} from 'lucide-react';
import { api } from '../services/api';
import { formatDateTime, getRelativeTimeLabel } from '../lib/utils';

const activityIcons = {
  unit_update: PencilRuler,
  intern_update: PencilRuler,
  unit_created: Building2,
  unit_deleted: Trash2,
  intern_created: UserPlus,
  intern_deleted: Trash2,
  intern_reassigned: RefreshCcw,
  rotation_moved: ArrowRight,
  intern_extension_added: TimerReset,
  intern_extension_removed: TimerReset,
  unit_updated: PencilRuler,
  default: Clock,
};

const activityColors = {
  unit_update: 'text-sky-700 bg-sky-50',
  intern_update: 'text-sky-700 bg-sky-50',
  unit_created: 'text-blue-600 bg-blue-50',
  unit_deleted: 'text-red-600 bg-red-50',
  intern_created: 'text-green-600 bg-green-50',
  intern_deleted: 'text-red-600 bg-red-50',
  intern_reassigned: 'text-purple-600 bg-purple-50',
  rotation_moved: 'text-indigo-600 bg-indigo-50',
  intern_extension_added: 'text-amber-700 bg-amber-50',
  intern_extension_removed: 'text-orange-700 bg-orange-50',
  unit_updated: 'text-sky-700 bg-sky-50',
  default: 'text-gray-600 bg-gray-50',
};

function getChangeOldValue(change) {
  return change?.oldDisplayValue ?? change?.oldValue ?? 'none';
}

function getChangeNewValue(change) {
  return change?.newDisplayValue ?? change?.newValue ?? 'none';
}

export default function RecentUpdates() {
  const queryClient = useQueryClient();
  const [currentTime, setCurrentTime] = React.useState(() => Date.now());
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['recentActivities'],
    queryFn: () => api.getRecentActivities(10),
    refetchInterval: 30000, // Refetch every 30 seconds
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
      : (Array.isArray(data?.activities)
        ? data.activities
        : (Array.isArray(data?.data) ? data.data : []));

    return source
      .map((activity) => {
        const type = activity?.type || activity?.action || 'activity';
        const description = activity?.message || activity?.description || activity?.messageText || String(type).replace(/_/g, ' ');
        const createdAt = activity?.created_at || activity?.createdAt || null;

        return {
          id: activity?.id || activity?._id || `${String(type)}-${String(createdAt || '')}`,
          type,
          description,
          createdAt,
          metadata: activity?.metadata || null,
        };
      })
      .filter((activity) => Boolean(activity.id) && Boolean(activity.description))
      .sort((left, right) => {
        const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
        const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
        return rightTime - leftTime;
      });
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Clock className="h-5 w-5" />
            <span>Recent Updates</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    console.error(error);

    return (
      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <span>Recent Updates</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-center py-4 text-sm text-gray-500">
            <p>Unable to load updates. Please retry.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? 'Retrying...' : 'Retry'}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const handleClear = async () => {
    const confirmed = window.confirm('Clear all recent updates? This action cannot be undone.');
    if (!confirmed) return;

    try {
      await api.clearRecentActivities();
      queryClient.invalidateQueries({ queryKey: ['recentActivities'] });
    } catch (err) {
      alert(err.message || 'Failed to clear updates');
    }
  };

  return (
    <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center space-x-2">
              <Clock className="h-5 w-5" />
              <span>Recent Updates</span>
            </CardTitle>
            <CardDescription>
              Latest activities in the system
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleClear}>
            Clear Updates
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-500">
            No recent activity yet
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {activities.map((activity) => {
              const Icon = activityIcons[activity.type] || activityIcons.default;
              const colorClass = activityColors[activity.type] || activityColors.default;
              const timeAgo = activity.createdAt
                ? getRelativeTimeLabel(activity.createdAt, currentTime)
                : 'Recently';
              const fullDate = activity.createdAt
                ? formatDateTime(activity.createdAt)
                : '';

              return (
                <div
                  key={activity.id}
                  className="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className={`rounded-lg p-2 ${colorClass} flex-shrink-0`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 break-words">{activity.description}</p>
                    {Array.isArray(activity?.metadata?.changes) && activity.metadata.changes.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {activity.metadata.changes.map((change, index) => (
                          <p key={`${activity.id}-change-${index}`} className="text-xs text-gray-700 break-words">
                            <span className="text-gray-500">{change.label || change.field}:</span>{' '}
                            <span className="text-gray-500">{String(getChangeOldValue(change))}</span>{' '}
                            <span className="text-gray-400">→</span>{' '}
                            <span className="font-semibold text-gray-900">{String(getChangeNewValue(change))}</span>
                          </p>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                      <span>{timeAgo}</span>
                      {fullDate ? <span className="text-gray-300">•</span> : null}
                      {fullDate ? <span>{fullDate}</span> : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
