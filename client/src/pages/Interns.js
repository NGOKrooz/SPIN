import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2, Calendar, Phone, User, Clock, Eye } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { api } from '../services/api';
import { formatDate, getBatchColor, getStatusColor } from '../lib/utils';
import { useToast } from '../hooks/use-toast';
import InternForm from '../components/InternForm';
import ExtensionModal from '../components/ExtensionModal';
import InternDashboard from '../components/InternDashboard';

export default function Interns() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBatch, setFilterBatch] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [showForm, setShowForm] = useState(false);
  const [editingIntern, setEditingIntern] = useState(null);
  const [viewingIntern, setViewingIntern] = useState(null);
  const [extendingIntern, setExtendingIntern] = useState(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: interns, isLoading } = useQuery({
    queryKey: ['interns', { batch: filterBatch, status: filterStatus }],
    queryFn: () => api.getInterns({
      batch: filterBatch === 'ALL' ? undefined : filterBatch,
      status: ['ALL', 'Inactive'].includes(filterStatus) ? undefined : filterStatus,
    }),
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteIntern,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interns'] });
      toast({
        title: 'Success',
        description: 'Intern deleted successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete intern',
        variant: 'destructive',
      });
    },
  });

  const extendMutation = useMutation({
    mutationFn: ({ id, days }) => api.extendInternship(id, days),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interns'] });
      toast({
        title: 'Success',
        description: 'Internship extended successfully',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to extend internship',
        variant: 'destructive',
      });
    },
  });

  // derive status on client: Completed if past planned duration (365 + extension_days), Extended if extension applied
  const mapWithDerivedStatus = (list) => (list || []).map((i) => {
    const total = i.total_duration_days ?? (365 + (i.extension_days || 0));
    const days = i.days_since_start ?? 0;
    let derived = 'Active';
    if ((i.extension_days || 0) > 0 && i.status === 'Extended') derived = 'Extended';
    if (days >= total) derived = 'Completed';
    return { ...i, derivedStatus: derived };
  });

  let derivedInterns = mapWithDerivedStatus(interns);
  // apply client-side filters for search and special Inactive keyword
  if (filterStatus === 'Inactive') {
    derivedInterns = derivedInterns.filter((i) => i.derivedStatus !== 'Active');
  }
  const filteredInterns = (derivedInterns || []).filter(intern => 
    intern.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    intern.phone_number?.includes(searchTerm)
  );

  const handleDelete = (id, name) => {
    if (window.confirm(`Are you sure you want to delete ${name}?`)) {
      deleteMutation.mutate(id);
    }
  };

  const handleExtend = (intern) => {
    setExtendingIntern(intern);
  };

  const handleEdit = (intern) => {
    setEditingIntern(intern);
    setShowForm(true);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditingIntern(null);
  };

  const handleExtensionClose = () => {
    setExtendingIntern(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Interns</h1>
          <p className="text-gray-600">Manage physiotherapy interns and their profiles</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="hospital-gradient">
          <Plus className="h-4 w-4 mr-2" />
          Add Intern
        </Button>
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <Label htmlFor="search">Search</Label>
              <Input
                id="search"
                placeholder="Search by name or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="batch">Batch</Label>
              <Select value={filterBatch} onValueChange={setFilterBatch}>
                <SelectTrigger>
                  <SelectValue placeholder="All batches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All batches</SelectItem>
                  <SelectItem value="A">Batch A</SelectItem>
                  <SelectItem value="B">Batch B</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All statuses</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Extended">Extended</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Inactive">Not Active (Inactive)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button 
                variant="outline" 
                onClick={() => {
                  setSearchTerm('');
                  setFilterBatch('ALL');
                  setFilterStatus('ALL');
                }}
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <User className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-gray-600">Total Interns</p>
                <p className="text-2xl font-bold text-gray-900">{interns?.length || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-batch-a"></div>
              <div>
                <p className="text-sm font-medium text-gray-600">Batch A</p>
                <p className="text-2xl font-bold text-gray-900">
                  {interns?.filter(i => i.batch === 'A').length || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-batch-b"></div>
              <div>
                <p className="text-sm font-medium text-gray-600">Batch B</p>
                <p className="text-2xl font-bold text-gray-900">
                  {interns?.filter(i => i.batch === 'B').length || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Clock className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-sm font-medium text-gray-600">Extended</p>
                <p className="text-2xl font-bold text-gray-900">
                  {interns?.filter(i => i.status === 'Extended').length || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Interns List */}
      <Card>
        <CardHeader>
          <CardTitle>Interns ({filteredInterns.length})</CardTitle>
          <CardDescription>
            List of all registered physiotherapy interns
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredInterns.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No interns found matching your criteria
            </div>
          ) : (
            <div className="space-y-4">
              {filteredInterns.map((intern) => (
                <div key={intern.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow overflow-hidden">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center space-x-4 min-w-0">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold ${getBatchColor(intern.batch)}`}>
                        {intern.batch}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold text-gray-900">{intern.name}</h3>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                          <span className="flex items-center space-x-1">
                            <User className="h-4 w-4" />
                            <span>{intern.gender}</span>
                          </span>
                          <span className="flex items-center space-x-1">
                            <Calendar className="h-4 w-4" />
                            <span>Started: {formatDate(intern.start_date)}</span>
                          </span>
                          {intern.phone_number && (
                            <span className="flex items-center space-x-1">
                              <Phone className="h-4 w-4" />
                              <span className="break-all">{intern.phone_number}</span>
                            </span>
                          )}
                        </div>
                        <div className="mt-1">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(intern.derivedStatus || intern.status)}`}>
                            {intern.derivedStatus || intern.status}
                          </span>
                          {(intern.derivedStatus === 'Extended' || intern.status === 'Extended') && intern.extension_days > 0 && (
                            <span className="ml-2 text-xs text-yellow-600">
                              +{intern.extension_days} days
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setViewingIntern(intern)}
                        title="View Dashboard"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(intern)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      {intern.status === 'Active' && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleExtend(intern)}
                          title="Extension"
                        >
                          <Clock className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(intern.id, intern.name)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">Days in internship:</span>
                        <span className="ml-2 font-medium">{intern.days_since_start || 0}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Batch:</span>
                        <span className="ml-2 font-medium">{intern.batch}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Start date:</span>
                        <span className="ml-2 font-medium">{formatDate(intern.start_date)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Current units:</span>
                        <span className="ml-2 font-medium">
                          {intern.current_units?.length > 0 ? intern.current_units.join(', ') : 'None'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Intern Form Modal */}
      {showForm && (
        <InternForm
          intern={editingIntern}
          onClose={handleFormClose}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['interns'] });
            handleFormClose();
          }}
        />
      )}

      {/* Extension Modal */}
      {extendingIntern && (
        <ExtensionModal
          intern={extendingIntern}
          onClose={handleExtensionClose}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['interns'] });
            handleExtensionClose();
          }}
        />
      )}

      {/* Intern Dashboard Modal */}
      {viewingIntern && (
        <InternDashboard
          intern={viewingIntern}
          onClose={() => setViewingIntern(null)}
        />
      )}
    </div>
  );
}
