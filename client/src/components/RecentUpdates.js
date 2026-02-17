import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { 
  Clock, 
  UserPlus, 
  Building2, 
  ArrowRight,
  AlertCircle,
  Trash2
} from 'lucide-react';
import { api } from '../services/api';
import { formatDistanceToNow } from 'date-fns';

const activityIcons = {
  unit_created: Building2,
  unit_deleted: Trash2,
  intern_created: UserPlus,
  intern_moved: ArrowRight,
  default: Clock,
};

const activityColors = {
  unit_created: 'text-blue-600 bg-blue-50',
  unit_deleted: 'text-red-600 bg-red-50',
  intern_created: 'text-green-600 bg-green-50',
  intern_moved: 'text-purple-600 bg-purple-50',
  default: 'text-gray-600 bg-gray-50',
};

export default function RecentUpdates() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['recentActivities'],
    queryFn: () => api.getRecentActivities(10),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

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
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <span>Recent Updates</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-sm text-gray-500">
            Failed to load recent updates
          </div>
        </CardContent>
      </Card>
    );
  }

  const activities = data || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Clock className="h-5 w-5" />
          <span>Recent Updates</span>
        </CardTitle>
        <CardDescription>
          Latest activities in the system
        </CardDescription>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-500">
            No recent activity
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {activities.map((activity) => {
              const Icon = activityIcons[activity.action] || activityIcons.default;
              const colorClass = activityColors[activity.action] || activityColors.default;
              const timeAgo = activity.created_at 
                ? formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })
                : 'Recently';

              return (
                <div
                  key={activity.id}
                  className="flex items-start space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className={`rounded-lg p-2 ${colorClass} flex-shrink-0`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{activity.description}</p>
                    <p className="text-xs text-gray-500 mt-1">{timeAgo}</p>
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
