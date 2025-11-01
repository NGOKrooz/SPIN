import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Calendar, User, Clock, MapPin, Award, Building2 } from 'lucide-react';
import ExtensionModal from './ExtensionModal';
import ReassignModal from './ReassignModal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { api } from '../services/api';
import { formatDate, getBatchColor, getStatusColor, getWorkloadColor } from '../lib/utils';

export default function InternDashboard({ intern, onClose }) {
  const [showExtend, setShowExtend] = React.useState(false);
  const [showReassign, setShowReassign] = React.useState(false);
  const [activeRotation, setActiveRotation] = React.useState(null);
  const { data: internSchedule } = useQuery({
    queryKey: ['intern-schedule', intern.id],
    queryFn: () => api.getInternSchedule(intern.id),
  });

  const { data: units } = useQuery({
    queryKey: ['units'],
    queryFn: api.getUnits,
  });

  // Separate completed and upcoming rotations
  const completedRotations = internSchedule?.filter(rotation => 
    new Date(rotation.end_date) < new Date()
  ) || [];
  
  const currentRotations = internSchedule?.filter(rotation => 
    new Date(rotation.start_date) <= new Date() && new Date(rotation.end_date) >= new Date()
  ) || [];
  
  const upcomingRotations = internSchedule?.filter(rotation => 
    new Date(rotation.start_date) > new Date()
  ) || [];

  // Get units not yet assigned to this intern
  const assignedUnitIds = internSchedule?.map(r => r.unit_id) || [];
  const remainingUnits = units?.filter(unit => !assignedUnitIds.includes(unit.id)) || [];

  const totalDaysCompleted = completedRotations.reduce((total, rotation) => {
    return total + rotation.duration_days;
  }, 0);

  const currentUnitDays = currentRotations.reduce((total, rotation) => {
    const startDate = new Date(rotation.start_date);
    const currentDate = new Date();
    const daysInCurrentUnit = Math.max(0, Math.floor((currentDate - startDate) / (1000 * 60 * 60 * 24)));
    return total + daysInCurrentUnit;
  }, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-6xl max-h-[90vh] overflow-y-auto">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle className="flex items-center space-x-2">
                <User className="h-5 w-5" />
                <span>{intern.name}'s Dashboard</span>
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
            </div>
            {/* Intern Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <div className={`w-3 h-3 rounded-full ${getBatchColor(intern.batch)}`}></div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Batch</p>
                      <p className="text-xl font-bold text-gray-900">{intern.batch}</p>
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
                      <p className="text-xl font-bold text-gray-900">{formatDate(intern.start_date)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <Clock className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="text-sm font-medium text-gray-600">Days Completed</p>
                      <p className="text-xl font-bold text-gray-900">{totalDaysCompleted + currentUnitDays}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <span className={`w-3 h-3 rounded-full ${getStatusColor(intern.status)}`}></span>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Status</p>
                      <p className="text-xl font-bold text-gray-900">{intern.status}</p>
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
                            {Math.max(0, Math.floor((new Date() - new Date(rotation.start_date)) / (1000 * 60 * 60 * 24)))} / {rotation.duration_days || Math.max(0, Math.floor((new Date(rotation.end_date) - new Date(rotation.start_date)) / (1000 * 60 * 60 * 24)) + 1)} days
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

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
                            {rotation.duration_days || Math.max(0, Math.floor((new Date(rotation.end_date) - new Date(rotation.start_date)) / (1000 * 60 * 60 * 24)) + 1)} days completed
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

            {/* Upcoming Rotations */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Calendar className="h-5 w-5" />
                  <span>Upcoming Rotations ({upcomingRotations.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {upcomingRotations.length > 0 ? (
                  <div className="space-y-2">
                    {upcomingRotations.map((rotation) => (
                      <div key={rotation.id} className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                        <div>
                          <h4 className="font-medium">{rotation.unit_name}</h4>
                          <p className="text-sm text-gray-600">
                            {formatDate(rotation.start_date)} - {formatDate(rotation.end_date)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-yellow-600">
                            {rotation.duration_days || Math.max(0, Math.floor((new Date(rotation.end_date) - new Date(rotation.start_date)) / (1000 * 60 * 60 * 24)) + 1)} days
                          </p>
                          <span className="text-xs text-gray-500">
                            {rotation.workload} workload
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-4">No upcoming rotations scheduled</p>
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
                          <p className="text-sm text-gray-600">{unit.duration_days} days</p>
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
            intern={intern}
            onClose={() => setShowExtend(false)}
            onSuccess={() => setShowExtend(false)}
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
            onSuccess={() => {
              setShowReassign(false);
              setActiveRotation(null);
              // Refresh the schedule data
              window.location.reload();
            }}
          />
        )}
      </div>
    </div>
  );
}
