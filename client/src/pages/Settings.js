import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Settings as SettingsIcon, 
  Save, 
  Calendar, 
  Users, 
  Building2, 
  LogOut,
  RotateCcw,
  Mail,
  Database,
  Palette,
  Bell,
  AlertCircle,
  CheckCircle,
  Clock
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { useToast } from '../hooks/use-toast';
import { api } from '../services/api';

// Import section components (will create these)
import BatchScheduleSection from '../components/settings/BatchScheduleSection';
import AutoGenerationSection from '../components/settings/AutoGenerationSection';
import WorkloadSection from '../components/settings/WorkloadSection';
import NotificationSection from '../components/settings/NotificationSection';
import DataManagementSection from '../components/settings/DataManagementSection';
import UIPreferencesSection from '../components/settings/UIPreferencesSection';

const TABS = [
  { id: 'general', label: 'General', icon: Calendar },
  { id: 'rotations', label: 'Rotation Management', icon: RotateCcw },
  { id: 'workload', label: 'Workload & Coverage', icon: Building2 },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'data', label: 'Data Management', icon: Database },
  { id: 'appearance', label: 'Appearance', icon: Palette },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState('general');
  const [unsavedChanges, setUnsavedChanges] = useState({});
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const ActiveIcon = TABS.find(t => t.id === activeTab)?.icon || SettingsIcon;

  const markUnsaved = (section) => {
    setUnsavedChanges(prev => ({ ...prev, [section]: true }));
  };

  const markSaved = (section) => {
    setUnsavedChanges(prev => {
      const next = { ...prev };
      delete next[section];
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600">Configure your SPIN platform settings for maximum efficiency</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const hasUnsaved = unsavedChanges[tab.id];
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center space-x-2 whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium transition-colors
                  ${activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }
                `}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
                {hasUnsaved && (
                  <span className="ml-1 h-2 w-2 rounded-full bg-orange-500"></span>
                )}
              </button>
            );
          })}
        </nav>
          </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'general' && (
          <BatchScheduleSection 
            onSave={() => markSaved('general')}
            onUnsaved={() => markUnsaved('general')}
          />
        )}
        {activeTab === 'rotations' && (
          <AutoGenerationSection 
            onSave={() => markSaved('rotations')}
            onUnsaved={() => markUnsaved('rotations')}
          />
        )}
        {activeTab === 'workload' && (
          <WorkloadSection 
            onSave={() => markSaved('workload')}
            onUnsaved={() => markUnsaved('workload')}
          />
        )}
        {activeTab === 'notifications' && (
          <NotificationSection 
            onSave={() => markSaved('notifications')}
            onUnsaved={() => markUnsaved('notifications')}
          />
        )}
        {activeTab === 'data' && (
          <DataManagementSection />
        )}
        {activeTab === 'appearance' && (
          <UIPreferencesSection 
            onSave={() => markSaved('appearance')}
            onUnsaved={() => markUnsaved('appearance')}
          />
        )}
          </div>

      {/* Account Section - Always visible at bottom */}
      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <SettingsIcon className="h-5 w-5" />
            <span>Account</span>
          </CardTitle>
          <CardDescription>Sign in or sign out of the admin session</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div className="space-x-2">
            <Button
              variant="destructive"
              onClick={() => {
                localStorage.removeItem('adminKey');
                localStorage.removeItem('role');
                toast({ 
                  title: 'Signed out', 
                  description: 'Admin session ended' 
                });
                window.location.reload();
              }}
            >
              <LogOut className="h-4 w-4 mr-2" /> Sign Out
            </Button>
          </div>
          <div className="text-xs text-gray-500">
            {localStorage.getItem('role') === 'admin' ? 'Authenticated as admin' : 'Not signed in'}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
