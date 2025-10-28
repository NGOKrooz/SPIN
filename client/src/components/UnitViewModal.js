import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { X, Users, Calendar, User } from 'lucide-react';
import { api } from '../services/api';
import { getBatchColor } from '../lib/utils';

export default function UnitViewModal({ unit, onClose, showCompletedInterns = false }) {
  const { data: completedInterns, isLoading, error } = useQuery({
    queryKey: ['completed-interns', unit?.id],
    queryFn: () => api.getCompletedInterns(unit.id),
    enabled: !!unit && showCompletedInterns,
  });

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Active':
        return 'text-green-600 bg-green-100';
      case 'Extended':
        return 'text-blue-600 bg-blue-100';
      case 'Completed':
        return 'text-gray-600 bg-gray-100';
      default:
        return 'text-gray-600 bg-gray-100';
    }
  };

  const internCount = unit.current_interns || 0;
  let computedWorkload = 'Low';
  if (internCount >= 10) computedWorkload = 'High';
  else if (internCount >= 5) computedWorkload = 'Medium';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="flex items-center space-x-2">
            <Users className="h-5 w-5" />
            <span>{showCompletedInterns ? `Completed Interns - ${unit.name}` : 'Unit Overview'}</span>
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {showCompletedInterns ? (
            <div>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : error ? (
                <div className="text-center py-8">
                  <div className="text-red-600 mb-2">Error loading completed interns</div>
                  <div className="text-sm text-gray-500">{error.message}</div>
                </div>
              ) : completedInterns && completedInterns.length > 0 ? (
                <div className="space-y-4">
                  <div className="text-sm text-gray-600 mb-4">
                    Total completed: {completedInterns.length} intern{completedInterns.length !== 1 ? 's' : ''}
                  </div>
                  
                  <div className="grid gap-4">
                    {completedInterns.map((intern) => (
                      <Card key={intern.rotation_id} className="border-l-4 border-l-blue-500">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className="p-2 bg-blue-100 rounded-full">
                                <User className="h-4 w-4 text-blue-600" />
                              </div>
                              <div>
                                <h3 className="font-medium text-gray-900">{intern.intern_name}</h3>
                                <div className="flex items-center space-x-2 text-sm text-gray-600">
                                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getBatchColor(intern.intern_batch)}`}>
                                    Batch {intern.intern_batch}
                                  </span>
                                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(intern.intern_status)}`}>
                                    {intern.intern_status}
                                  </span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="text-right text-sm text-gray-600">
                              <div className="flex items-center space-x-1 mb-1">
                                <Calendar className="h-4 w-4" />
                                <span>Completed: {formatDate(intern.end_date)}</span>
                              </div>
                              <div className="text-xs">
                                Duration: {formatDate(intern.start_date)} - {formatDate(intern.end_date)}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Completed Interns</h3>
                  <p className="text-gray-600">
                    No interns have completed their rotation in {unit.name} yet.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-lg font-semibold text-gray-900">{unit.name}</div>
              <div className="text-sm text-gray-600">Configured workload: {unit.workload}</div>
              <div className="flex items-center space-x-2 text-sm">
                <Users className="h-4 w-4" />
                <div>Current interns: <span className="font-medium">{internCount}</span></div>
              </div>
              <div className="text-sm">Computed workload (by intern count): <span className="font-medium">{computedWorkload}</span> <span className="text-xs text-gray-500">Low(1-4), Medium(5-9), High(≥10)</span></div>
              <div className="pt-3 border-t">
                <div className="text-sm font-medium text-gray-700 mb-1">Interns</div>
                {unit.intern_names && unit.intern_names.length > 0 ? (
                  <ul className="list-disc pl-5 text-sm text-gray-800">
                    {unit.intern_names.map((n, idx) => (
                      <li key={idx}>{n}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-sm text-gray-500">No interns assigned</div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
