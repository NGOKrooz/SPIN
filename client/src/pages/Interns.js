import React, { useMemo, useState, useCallback } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Plus, Edit, Trash2, Calendar, Clock, Eye, User } from 'lucide-react';
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

export default function Interns() {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortByDate, setSortByDate] = useState(() => localStorage.getItem('internsSortByDate') || 'newest');
  const [showForm, setShowForm] = useState(false);
  const [editingIntern, setEditingIntern] = useState(null);
  const [viewingIntern, setViewingIntern] = useState(null);
  const [extendingIntern, setExtendingIntern] = useState(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: interns, isLoading, refetch } = useQuery({
    queryKey: ['interns', { sort: sortByDate }],
    queryFn: () => {
      console.log('🔵 FRONTEND: Fetching interns with sort:', sortByDate);
      return api.getInterns({
        sort: sortByDate,
      }).then((data) => {
        console.log('✅ FRONTEND: Fetched interns data:', data);
        console.log('   Type:', Array.isArray(data) ? 'Array' : typeof data);
        console.log('   Length:', Array.isArray(data) ? data.length : 'N/A');
        if (Array.isArray(data) && data.length > 0) {
          console.log('   First item structure:', Object.keys(data[0]));
          console.log('   First item:', data[0]);
        }
        return data;
      })
    },
  });

  React.useEffect(() => {
    localStorage.setItem('internsSortByDate', sortByDate);
  }, [sortByDate]);

  // Debug: Log when interns data changes
  React.useEffect(() => {
    console.log('📊 EFFECT: interns data changed');
    console.log('   interns:', interns);
    console.log('   isLoading:', isLoading);
  }, [interns, isLoading]);

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
      currentUnitName: i.currentUnit?.name || 'Not Assigned',
      upcomingUnitName: i.upcomingUnit?.name || null,
      remainingUnitsCount: Array.isArray(i.remainingUnits) ? i.remainingUnits.length : 0,
      derivedStatus: derived,
    };
  });

  const derivedInterns = mapWithDerivedStatus(interns);
  console.log('📊 FRONTEND: Derived interns:', derivedInterns);
  
  const filteredInterns = (derivedInterns || []).filter(intern => 
    intern.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  console.log('🔎 FRONTEND: Filtered interns (search term: "' + searchTerm + '"):', filteredInterns.length, 'results');

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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
            <div className="flex items-end">
              <Button 
                variant="outline" 
                onClick={() => {
                  setSearchTerm('');
                  setSortByDate('newest');
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
              {(() => {
                console.log('🎨 FRONTEND: Rendering', filteredInterns.length, 'interns');
                return filteredInterns.map((intern) => {
                  console.log('   Rendering intern:', intern.id, intern.name);
                  return (
                <div key={intern.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow overflow-hidden">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center space-x-4 min-w-0">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold bg-blue-600">
                        {intern.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold text-gray-900">{intern.name}</h3>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                          <span className="flex items-center space-x-1">
                            <Calendar className="h-4 w-4" />
                            <span>Started: {formatDate(intern.startDate)}</span>
                          </span>
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
                        <span className="text-gray-500">Batch:</span>
                        <span className="ml-2 font-medium">{intern.batch}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Start date:</span>
                        <span className="ml-2 font-medium">{formatDate(intern.startDate)}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Current unit:</span>
                        <span className="ml-2 font-medium">{intern.currentUnitName || 'Not Assigned'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Upcoming unit:</span>
                        <span className="ml-2 font-medium">{intern.upcomingUnitName || 'None'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Remaining units:</span>
                        <span className="ml-2 font-medium">{intern.remainingUnitsCount}</span>
                      </div>
                    </div>
                  </div>
                </div>
                  );
                });
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Intern Form Modal */}
      {showForm && (
        <InternForm
          intern={editingIntern}
          onClose={() => {
            console.log('🔵 INTERNS: Form closed');
            handleFormClose();
          }}
          onSuccess={async () => {
            console.log('🔵 INTERNS: onSuccess callback triggered');
            // Close modal first
            handleFormClose();
            // Then invalidate and refetch to ensure fresh data
            console.log('📤 INTERNS: Invalidating interns query');
            queryClient.invalidateQueries({ queryKey: ['interns'] });
            // Use setTimeout to ensure modal closes before refetch
            setTimeout(() => {
              console.log('🔄 INTERNS: Refetching interns');
              refetch().then((result) => {
                console.log('✅ INTERNS: Refetch complete, data:', result.data);
              }).catch((err) => {
                console.error('❌ INTERNS: Refetch failed:', err);
              });
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
            queryClient.invalidateQueries({ queryKey: ['intern', extendingIntern.id] });
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
