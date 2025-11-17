import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Clock, UserPlus, Calendar, ArrowRight, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { api } from '../services/api';
import { formatDistanceToNow, format } from 'date-fns';

const activityIcons = {
  extension: Calendar,
  reassignment: ArrowRight,
  unit_change: ArrowRight,
  status_change: CheckCircle,
  new_intern: UserPlus,
  auto_advance: Clock,
  rotation_update: Calendar,
};

const activityColors = {
  extension: 'text-blue-600 bg-blue-50',
  reassignment: 'text-purple-600 bg-purple-50',
  unit_change: 'text-indigo-600 bg-indigo-50',
  status_change: 'text-green-600 bg-green-50',
  new_intern: 'text-emerald-600 bg-emerald-50',
  auto_advance: 'text-orange-600 bg-orange-50',
  rotation_update: 'text-cyan-600 bg-cyan-50',
};

const formatActivityMessage = (activity) => {
  const { activity_type, intern_name, unit_name, details } = activity;
  
  switch (activity_type) {
    case 'extension':
      return details || `${intern_name || 'An intern'}'s internship was extended`;
    case 'reassignment':
      return `${intern_name || 'An intern'} was reassigned${unit_name ? ` to ${unit_name}` : ''}`;
    case 'unit_change':
      return `${intern_name || 'An intern'} moved${unit_name ? ` to ${unit_name}` : ' to a new unit'}`;
    case 'status_change':
      return `${intern_name || 'An intern'}'s status was updated`;
    case 'new_intern':
      return details || `${intern_name || 'A new intern'} was added`;
    case 'auto_advance':
      return details || `${intern_name || 'An intern'} was auto-advanced to next unit`;
    case 'rotation_update':
      return details || `${intern_name || 'An intern'}'s rotation was updated`;
    default:
      return details || 'Activity occurred';
  }
};

export default function ActivityHistoryModal({ onClose }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['allActivities'],
    queryFn: () => api.getRecentActivities(1000), // Fetch a large number to get all activities
  });

  const activities = data?.activities || [];

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
                const Icon = activityIcons[activity.activity_type] || Clock;
                const colorClass = activityColors[activity.activity_type] || 'text-gray-600 bg-gray-50';
                const message = formatActivityMessage(activity);
                const timeAgo = activity.created_at 
                  ? formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })
                  : 'Recently';
                const fullDate = activity.created_at
                  ? format(new Date(activity.created_at), 'MMM d, yyyy h:mm a')
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
                      <p className="text-sm font-medium text-gray-900">{message}</p>
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

