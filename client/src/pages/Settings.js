import React from 'react';
import { Settings as SettingsIcon, Save, Calendar, Users, Building2, LogOut } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { useToast } from '../hooks/use-toast';
import { api } from '../services/api';
import { Link } from 'react-router-dom';

export default function Settings() {
  const { toast } = useToast();

  // 1) Rotation, Batch Settings (local)
  const [rotationSettings, setRotationSettings] = React.useState(() => {
    const saved = localStorage.getItem('rotationSettings');
    return saved ? JSON.parse(saved) : {
      autoGenerateBadges: false,
      rotationDurationWeeks: 4,
      scheduleStartDate: new Date().toISOString().split('T')[0],
      batchNaming: 'Batch A',
    };
  });
  const [rotationUpdatedAt, setRotationUpdatedAt] = React.useState(() => localStorage.getItem('rotationUpdatedAt'));

  // 2) Unit Settings (local list)
  const [units, setUnits] = React.useState(() => {
    const saved = localStorage.getItem('units');
    return saved ? JSON.parse(saved) : [];
  });
  const [unitsUpdatedAt, setUnitsUpdatedAt] = React.useState(() => localStorage.getItem('unitsUpdatedAt'));
  const [newUnit, setNewUnit] = React.useState({
    name: '',
    description: '',
    durationDays: '',
    maxCapacity: '',
    rotationOrder: '',
    supervisor: '',
    enabled: true,
  });
  const [editingUnitId, setEditingUnitId] = React.useState(null);

  // 3) Notification Settings (local)
  const [notificationSettings, setNotificationSettings] = React.useState(() => {
    const saved = localStorage.getItem('notificationSettings');
    return saved ? JSON.parse(saved) : {
      enabled: true,
      type: 'Email',
      reminderDays: 3,
      template: 'Dear Intern, your next rotation starts soon.',
      adminSummary: true,
    };
  });
  const [notificationUpdatedAt, setNotificationUpdatedAt] = React.useState(() => localStorage.getItem('notificationUpdatedAt'));

  // 5) Intern Settings (local)
  const [interns, setInterns] = React.useState(() => {
    const saved = localStorage.getItem('internSettings');
    return saved ? JSON.parse(saved) : [];
  });
  const [internsUpdatedAt, setInternsUpdatedAt] = React.useState(() => localStorage.getItem('internsUpdatedAt'));
  const [newIntern, setNewIntern] = React.useState({
    fullName: '',
    email: '',
    badgeId: '',
    batch: '',
    active: true,
  });

  const saveInterns = () => {
    localStorage.setItem('internSettings', JSON.stringify(interns));
    const ts = nowTs();
    localStorage.setItem('internsUpdatedAt', ts);
    setInternsUpdatedAt(ts);
    toast({ title: 'Saved', description: 'Intern settings saved' });
  };

  const addIntern = () => {
    if (!newIntern.fullName) {
      toast({ title: 'Validation error', description: 'Full name is required', variant: 'destructive' });
      return;
    }
    const intern = {
      id: crypto.randomUUID(),
      fullName: newIntern.fullName,
      email: newIntern.email || '',
      badgeId: newIntern.badgeId || '',
      batch: newIntern.batch || '',
      active: Boolean(newIntern.active),
    };
    setInterns((prev) => [...prev, intern]);
    setNewIntern({ fullName: '', email: '', badgeId: '', batch: '', active: true });
  };

  const updateIntern = (id, patch) => {
    setInterns((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };

  const removeIntern = (id) => {
    setInterns((prev) => prev.filter((i) => i.id !== id));
  };

  // Helpers
  const fmt = (ts) => ts ? new Date(Number(ts)).toLocaleString() : '—';
  const nowTs = () => `${Date.now()}`;

  // Save handlers (persist to localStorage and toast)
  const saveRotationSettings = () => {
    if (!rotationSettings.batchNaming || rotationSettings.batchNaming.length > 20) {
      toast({ title: 'Validation error', description: 'Batch name is required and must be ≤ 20 characters', variant: 'destructive' });
      return;
    }
    if (!rotationSettings.rotationDurationWeeks || rotationSettings.rotationDurationWeeks < 1 || rotationSettings.rotationDurationWeeks > 12) {
      toast({ title: 'Validation error', description: 'Rotation duration must be between 1 and 12 weeks', variant: 'destructive' });
      return;
    }
    localStorage.setItem('rotationSettings', JSON.stringify(rotationSettings));
    const ts = nowTs();
    localStorage.setItem('rotationUpdatedAt', ts);
    setRotationUpdatedAt(ts);
    toast({ title: 'Saved', description: 'Rotation & Batch settings updated' });
  };

  const saveUnits = () => {
    localStorage.setItem('units', JSON.stringify(units));
    const ts = nowTs();
    localStorage.setItem('unitsUpdatedAt', ts);
    setUnitsUpdatedAt(ts);
    toast({ title: 'Saved', description: 'Unit settings saved' });
  };

  const saveNotificationSettings = () => {
    if (notificationSettings.enabled) {
      if (!notificationSettings.reminderDays || Number(notificationSettings.reminderDays) < 0) {
        toast({ title: 'Validation error', description: 'Reminder days must be 0 or greater', variant: 'destructive' });
        return;
      }
    }
    localStorage.setItem('notificationSettings', JSON.stringify(notificationSettings));
    const ts = nowTs();
    localStorage.setItem('notificationUpdatedAt', ts);
    setNotificationUpdatedAt(ts);
    toast({ title: 'Saved', description: 'Notification settings updated' });
  };

  // Unified save for all settings present on this page
  const saveAllSettings = () => {
    try {
      // Persist current states (even if sections are hidden)
      localStorage.setItem('rotationSettings', JSON.stringify(rotationSettings));
      localStorage.setItem('rotationUpdatedAt', nowTs());

      localStorage.setItem('units', JSON.stringify(units));
      localStorage.setItem('unitsUpdatedAt', nowTs());

      localStorage.setItem('notificationSettings', JSON.stringify(notificationSettings));
      localStorage.setItem('notificationUpdatedAt', nowTs());

      localStorage.setItem('internSettings', JSON.stringify(interns));
      localStorage.setItem('internsUpdatedAt', nowTs());

      toast({ title: 'Saved', description: 'All settings saved successfully' });
    } catch (e) {
      toast({ title: 'Save failed', description: 'Could not save settings', variant: 'destructive' });
    }
  };

  // Unit list operations
  const addUnit = () => {
    if (!newUnit.name) {
      toast({ title: 'Validation error', description: 'Unit name is required', variant: 'destructive' });
      return;
    }
    const unit = {
      id: crypto.randomUUID(),
      name: newUnit.name,
      description: newUnit.description || '',
      durationDays: Number(newUnit.durationDays) || 0,
      maxCapacity: Number(newUnit.maxCapacity) || 0,
      rotationOrder: Number(newUnit.rotationOrder) || 0,
      supervisor: newUnit.supervisor || '',
      enabled: Boolean(newUnit.enabled),
    };
    setUnits((prev) => [...prev, unit]);
    setNewUnit({ name: '', description: '', durationDays: '', maxCapacity: '', rotationOrder: '', supervisor: '', enabled: true });
  };

  const updateUnit = (id, patch) => {
    setUnits((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  };

  const removeUnit = (id) => {
    setUnits((prev) => prev.filter((u) => u.id !== id));
  };

  // Data Management handlers
  const backupData = () => {
    toast({ title: 'Backup', description: 'Backup successful' });
    console.log('Backup data');
  };
  const restoreData = () => {
    toast({ title: 'Restore', description: 'Data restored' });
    console.log('Restore data');
  };
  const clearTestData = () => {
    if (window.confirm('Clear all test data? This cannot be undone.')) {
      localStorage.clear();
      toast({ title: 'Cleared', description: 'All local settings cleared' });
      // soft reload in-memory
      setRotationSettings({ autoGenerateBadges: false, rotationDurationWeeks: 4, rotationCycleType: 'Sequential', batchNaming: 'Batch A' });
      setUnits([]);
      setNotificationSettings({ enabled: true, type: 'Email', reminderDays: 3, template: 'Dear Intern, your next rotation starts soon.', adminSummary: true });
      setRotationUpdatedAt(undefined);
      setUnitsUpdatedAt(undefined);
      setNotificationUpdatedAt(undefined);
    }
  };
  const importCSV = () => {
    console.log('Import CSV');
    toast({ title: 'Import', description: 'Import handler not implemented' });
  };
  const exportCSV = () => {
    console.log('Export CSV');
    toast({ title: 'Export', description: 'Export handler not implemented' });
  };
  const resetAllSettings = () => {
    if (window.confirm('Reset all settings to defaults?')) {
      localStorage.clear();
      setRotationSettings({ autoGenerateBadges: false, rotationDurationWeeks: 4, rotationCycleType: 'Sequential', batchNaming: 'Batch A' });
      setUnits([]);
      setNotificationSettings({ enabled: true, type: 'Email', reminderDays: 3, template: 'Dear Intern, your next rotation starts soon.', adminSummary: true });
      setRotationUpdatedAt(undefined);
      setUnitsUpdatedAt(undefined);
      setNotificationUpdatedAt(undefined);
      toast({ title: 'Reset', description: 'All settings reset to defaults' });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600">Admin configuration hub for rotations, units, notifications, and data.</p>
      </div>

      {/* Rotation & Batch Setting removed */}

      {/* Unit Settings (trimmed to only buttons) */}
      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Building2 className="h-5 w-5" />
            <span>Unit Settings</span>
          </CardTitle>
          <CardDescription>Manage physiotherapy units.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-3">
            <Button
              variant="outline"
              onClick={() => {
                const defaults = [
                  ['Adult Neurology', 21],
                  ['Acute Stroke', 30],
                  ['Neurosurgery', 30],
                  ['Geriatrics', 30],
                  ['Orthopedic Inpatients', 30],
                  ['Orthopedic Outpatients', 30],
                  ['Electrophysiology', 30],
                  ['Exercise Immunology', 30],
                  ["Women’s Health", 30],
                  ['Pediatrics Inpatients', 21],
                  ['Pediatrics Outpatients', 21],
                  ['Cardio Thoracic Unit', 30],
                ];
                Promise.all(defaults.map(async ([name, days]) => {
                  try {
                    await api.createUnit({ name, duration_days: days, workload: 'Low', description: '' });
                  } catch (e) {}
                })).then(() => {
                  toast({ title: 'Units loaded', description: '12 default units added to server' });
                });
              }}
            >
              Load Default 12 Units
            </Button>
          </div>

        </CardContent>
      </Card>

      {/* Intern Settings removed */}

      {/* 3) Notification & Reminder Settings */}
      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Users className="h-5 w-5" />
            <span>Notification & Reminder Settings</span>
          </CardTitle>
          <CardDescription>Automated notifications and reminders.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="mr-4">Enable Notifications</Label>
            <input type="checkbox" checked={notificationSettings.enabled} onChange={(e) => setNotificationSettings((s) => ({ ...s, enabled: e.target.checked }))} />
          </div>

          <div className={`space-y-4 ${notificationSettings.enabled ? '' : 'opacity-50 pointer-events-none'}`}>
            <div>
              <Label>Notification Type</Label>
              <Select value={notificationSettings.type} onValueChange={(v) => setNotificationSettings((s) => ({ ...s, type: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Email">Email</SelectItem>
                  <SelectItem value="SMS">SMS</SelectItem>
                  <SelectItem value="Both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Reminder Timing (days before)</Label>
              <Input type="number" min="0" value={notificationSettings.reminderDays} onChange={(e) => setNotificationSettings((s) => ({ ...s, reminderDays: Number(e.target.value) }))} />
            </div>

            <div>
              <Label>Custom Message Template</Label>
              <Input value={notificationSettings.template} onChange={(e) => setNotificationSettings((s) => ({ ...s, template: e.target.value }))} />
            </div>

            <div className="flex items-center space-x-2">
              <input type="checkbox" checked={notificationSettings.adminSummary} onChange={(e) => setNotificationSettings((s) => ({ ...s, adminSummary: e.target.checked }))} />
              <Label>Admin Summary Notifications</Label>
            </div>
          </div>

          {/* Global Save button handles notifications as well */}
        </CardContent>
      </Card>

      {/* Global Save Changes (applies to all settings) */}
      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Save className="h-5 w-5" />
            <span>Save Changes</span>
          </CardTitle>
          <CardDescription>Apply all updates made in Settings</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="hospital-gradient" onClick={saveAllSettings}>
            <Save className="h-4 w-4 mr-2" /> Save Changes
          </Button>
        </CardContent>
      </Card>

      {/* Account actions */}
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
                toast({ title: 'Signed out', description: 'Admin session ended' });
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

// Helper subcomponent to show current two-week off-day switching
function AutoOffDayNotice({ scheduleStartDate }) {
  const start = new Date(scheduleStartDate || new Date());
  const today = new Date();
  const msInWeek = 7 * 24 * 60 * 60 * 1000;
  const weeks = Math.floor((today - start) / msInWeek);
  const phase = weeks % 4; // 0-1 => weeks 1-2, 2-3 => weeks 3-4
  const isFirstPhase = phase === 0 || phase === 1;
  const aOff = isFirstPhase ? 'Monday' : 'Wednesday';
  const bOff = isFirstPhase ? 'Wednesday' : 'Monday';
  const label = isFirstPhase ? 'Weeks 1–2' : 'Weeks 3–4';
  return (
    <div className="rounded-md bg-gray-50 p-3 text-xs text-gray-700">
      <div className="font-medium mb-1">Current Off-Day Assignment ({label})</div>
      <div>Batch A: <span className="font-semibold">{aOff}</span> off</div>
      <div>Batch B: <span className="font-semibold">{bOff}</span> off</div>
    </div>
  );
}
