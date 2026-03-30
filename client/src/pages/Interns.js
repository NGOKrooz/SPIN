import React, { useMemo, useState, useCallback } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Plus, Edit, Trash2, Clock, Eye, User } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { api } from '../services/api';
import { formatDate, getStatusColor } from '../lib/utils';
import { useToast } from '../hooks/use-toast';
import InternForm from '../components/InternForm';
import ExtensionModal from '../components/ExtensionModal';
import InternDashboard from '../components/InternDashboard';

const DAY_IN_MS = 1000 * 60 * 60 * 24;

const parseDateValue = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export default function Interns() {
  const [searchTerm, setSearchTerm] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [sortByDate, setSortByDate] = useState(() => localStorage.getItem('internsSortByDate') || 'newest');
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [showForm, setShowForm] = useState(false);
  const [editingIntern, setEditingIntern] = useState(null);
  const [viewingIntern, setViewingIntern] = useState(null);
  const [extendingIntern, setExtendingIntern] = useState(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: interns, isLoading, refetch } = useQuery({
    queryKey: ['interns', { sort: sortByDate }],
    queryFn: () => api.getInterns({ sort: sortByDate }),
  });

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000);

    return () => window.clearInterval(timer);
  }, []);

  React.useEffect(() => {
    localStorage.setItem('internsSortByDate', sortByDate);
  }, [sortByDate]);

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

  const invalidateInternLists = useCallback(() => {
    queryClient.invalidateQueries({
      predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'interns',
    });
  }, [queryClient]);

  // Derive status on client: trust backend status, but force Extended when extension days exist
  const mapWithDerivedStatus = (list) => (list || []).map((i) => {
    const extensionDays = Number(i.extensionDays ?? i.extension_days) || 0;

    let derived = i.status || 'Active';

    if (derived !== 'Completed' && extensionDays > 0) {
      derived = 'Extended';
    }

    return {
      ...i,
      id: i.id || i._id,
      startDate: i.startDate || i.start_date,
      extensionDays,
      derivedStatus: derived,
      internshipDays: i.internshipDays,
    };
  });

  const getInternshipDays = useCallback((intern) => {
    if (Number.isFinite(Number(intern?.internshipDays))) {
      return Math.max(0, Number(intern.internshipDays));
    }

    const startDate = parseDateValue(intern?.startDate || intern?.start_date);
    if (!startDate) return 0;

    const now = new Date(currentTime);
    if (now < startDate) return 0;

    return Math.max(0, Math.floor((now.getTime() - startDate.getTime()) / DAY_IN_MS));
  }, [currentTime]);

  const derivedInterns = mapWithDerivedStatus(interns);
  
  const filteredInterns = (derivedInterns || []).filter((intern) => {
    const nameMatches = intern.name.toLowerCase().includes(searchTerm.toLowerCase());
    const batchMatches = !batchFilter || intern.batch === batchFilter;
    return nameMatches && batchMatches;
  });

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

  const extendedCount = useMemo(() => {
    return (derivedInterns || []).filter((i) => i.derivedStatus === 'Extended').length;
  }, [derivedInterns]);

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
                placeholder="Search by name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="sort-date">Sort by Date</Label>
              <Select value={sortByDate} onValueChange={setSortByDate}>
                <SelectTrigger>
                  <SelectValue placeholder="Newest first" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="oldest">Oldest</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="batch-filter">Batch</Label>
              <Select value={batchFilter || 'all'} onValueChange={(value) => setBatchFilter(value === 'all' ? '' : value)}>
                <SelectTrigger id="batch-filter">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="A">Batch A</SelectItem>
                  <SelectItem value="B">Batch B</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button 
                variant="outline" 
                onClick={() => {
                  setSearchTerm('');
                  setSortByDate('newest');
                  setBatchFilter('');
                }}
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
              <Clock className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-sm font-medium text-gray-600">Extended</p>
                <p className="text-2xl font-bold text-gray-900">{extendedCount}</p>
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
              ❌ No interns found {searchTerm ? `matching "${searchTerm}"` : ''}
              {interns && interns.length > 0 && searchTerm && (
                <p className="text-xs mt-2">
                  (DB has {interns.length} interns total, but none match your search)
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredInterns.map((intern) => (
                <div key={intern.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow overflow-hidden">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center space-x-4 min-w-0">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold bg-blue-600">
                        {intern.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold text-gray-900">{intern.name}</h3>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                          <span>Current unit: {intern.currentUnit?.name || 'Not Assigned'}</span>
                        </div>
                        <div className="mt-1">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(intern.derivedStatus || intern.status)}`}>
                            {intern.derivedStatus || intern.status}
                          </span>
                          {(intern.derivedStatus === 'Extended' || intern.status === 'Extended') && intern.extensionDays > 0 && (
                            <span className="ml-2 text-xs text-yellow-600">
                              +{intern.extensionDays} days
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
                      {String(intern.derivedStatus || intern.status || '').toLowerCase() !== 'inactive' && (
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
                    <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                      <div>
                        <span className="text-gray-500">Start date:</span>
                        <span className="ml-2 font-medium">{formatDate(intern.startDate)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Days in internship:</span>
                        <span className="ml-2 font-medium">{getInternshipDays(intern)}</span>
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
          onClose={() => {
            handleFormClose();
          }}
          onSuccess={async () => {
            handleFormClose();
            queryClient.invalidateQueries({ queryKey: ['interns'] });
            setTimeout(() => {
              refetch().catch(() => {});
            }, 100);
          }}
        />
      )}

      {/* Extension Modal */}
      {extendingIntern && (
        <ExtensionModal
          intern={extendingIntern}
          onClose={handleExtensionClose}
          onSuccess={() => {
            invalidateInternLists();
            queryClient.invalidateQueries({ queryKey: ['units'] });
            queryClient.invalidateQueries({ queryKey: ['intern', extendingIntern.id] });
            queryClient.invalidateQueries({ queryKey: ['intern-schedule', extendingIntern.id] });
            queryClient.invalidateQueries({ queryKey: ['rotations', 'current'] });
            queryClient.invalidateQueries({ queryKey: ['recentActivities'] });
            handleExtensionClose();
            setTimeout(() => {
              queryClient.refetchQueries({
                predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === 'interns',
              });
            }, 0);
          }}
        />
      )}

      {/* Intern Dashboard Modal */}
      {viewingIntern && (
        <InternDashboard
          intern={viewingIntern}
          onClose={() => setViewingIntern(null)}
          onInternUpdated={(updated) => {
            if (!updated) return;
            setViewingIntern(prev => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
            invalidateInternLists();
          }}
        />
      )}
    </div>
  );
}
