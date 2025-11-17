import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { 
  Clock, 
  UserPlus, 
  Calendar, 
  ArrowRight,
  CheckCircle,
  AlertCircle,
  ExternalLink
} from 'lucide-react';
import { api } from '../services/api';
import { formatDistanceToNow } from 'date-fns';
import ActivityHistoryModal from './ActivityHistoryModal';

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
      // Use details if available (includes intern name and unit), otherwise construct message
      if (details) {
        return details;
      }
      return `${intern_name || 'An intern'}'s rotation${unit_name ? ` in ${unit_name}` : ''} was extended`;
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

export default function RecentUpdates() {
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  
  const { data, isLoading, error } = useQuery({
    queryKey: ['recentActivities'],
    queryFn: () => api.getRecentActivities(15),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const activities = data?.activities || [];

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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center space-x-2">
              <Clock className="h-5 w-5" />
              <span>Recent Updates</span>
            </CardTitle>
            <CardDescription>
              Latest activities and changes in the system
            </CardDescription>
          </div>
          {activities.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHistoryModal(true)}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              View More
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="text-center py-8 text-sm text-gray-500">
            No recent activity
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {activities.map((activity) => {
              const Icon = activityIcons[activity.activity_type] || Clock;
              const colorClass = activityColors[activity.activity_type] || 'text-gray-600 bg-gray-50';
              const message = formatActivityMessage(activity);
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
                    <p className="text-sm font-medium text-gray-900">{message}</p>
                    <p className="text-xs text-gray-500 mt-1">{timeAgo}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
      {showHistoryModal && (
        <ActivityHistoryModal onClose={() => setShowHistoryModal(false)} />
      )}
    </Card>
  );
}

