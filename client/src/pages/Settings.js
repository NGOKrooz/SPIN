import React from 'react';
import { Settings as SettingsIcon, Save, Calendar, Users, Building2, LogOut } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { useToast } from '../hooks/use-toast';
import { api } from '../services/api';

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

      {/* 1) Rotation & Batch Setting */}
      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Calendar className="h-5 w-5" />
            <span>Rotation & Batch Setting</span>
          </CardTitle>
          <CardDescription>Controls how interns are identified, grouped, and rotated.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="mr-4">Auto-Generate Badges</Label>
            <input
              type="checkbox"
              checked={rotationSettings.autoGenerateBadges}
              onChange={(e) => setRotationSettings((s) => ({ ...s, autoGenerateBadges: e.target.checked }))}
            />
          </div>

          <div>
            <Label>Rotation Duration (weeks)</Label>
            <Input
              type="number"
              min="1"
              max="12"
              value={rotationSettings.rotationDurationWeeks}
              onChange={(e) => setRotationSettings((s) => ({ ...s, rotationDurationWeeks: Number(e.target.value) }))}
            />
          </div>

          
          <div>
            <Label>Schedule Start Date</Label>
            <Input
              type="date"
              value={rotationSettings.scheduleStartDate}
              onChange={(e) => setRotationSettings((s) => ({ ...s, scheduleStartDate: e.target.value }))}
            />
            <p className="text-xs text-gray-500 mt-1">Off-days auto-switch every two weeks from this date.</p>
          </div>

          <div>
            <Label>Batch Naming Convention</Label>
            <Input
              placeholder="e.g. Batch A"
              value={rotationSettings.batchNaming}
              onChange={(e) => setRotationSettings((s) => ({ ...s, batchNaming: e.target.value }))}
            />
            <p className="text-xs text-gray-500 mt-1">Required; ≤ 20 characters.</p>
          </div>

          {/* Auto off-day display */}
          <AutoOffDayNotice scheduleStartDate={rotationSettings.scheduleStartDate} />

          <div className="flex items-center justify-between">
            <Button className="hospital-gradient" onClick={saveRotationSettings}>
              <Save className="h-4 w-4 mr-2" /> Save Changes
            </Button>
            <span className="text-xs text-gray-500">Last Updated: {fmt(rotationUpdatedAt)}</span>
          </div>
        </CardContent>
      </Card>

      {/* 2) Unit Settings */}
      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Building2 className="h-5 w-5" />
            <span>Unit Settings</span>
          </CardTitle>
          <CardDescription>Manage physiotherapy units.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add Unit Form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Unit Name</Label>
              <Input value={newUnit.name} onChange={(e) => setNewUnit((u) => ({ ...u, name: e.target.value }))} />
            </div>
            <div>
              <Label>Assigned Supervisor</Label>
              <Input value={newUnit.supervisor} onChange={(e) => setNewUnit((u) => ({ ...u, supervisor: e.target.value }))} />
            </div>
            <div>
              <Label>Duration (days)</Label>
              <Input type="number" value={newUnit.durationDays} onChange={(e) => setNewUnit((u) => ({ ...u, durationDays: e.target.value }))} />
            </div>
            <div>
              <Label>Max Capacity</Label>
              <Input type="number" value={newUnit.maxCapacity} onChange={(e) => setNewUnit((u) => ({ ...u, maxCapacity: e.target.value }))} />
            </div>
            <div>
              <Label>Rotation Order</Label>
              <Input type="number" value={newUnit.rotationOrder} onChange={(e) => setNewUnit((u) => ({ ...u, rotationOrder: e.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <Label>Description (optional)</Label>
              <Input value={newUnit.description} onChange={(e) => setNewUnit((u) => ({ ...u, description: e.target.value }))} />
            </div>
            <div className="flex items-center space-x-2">
              <input type="checkbox" checked={newUnit.enabled} onChange={(e) => setNewUnit((u) => ({ ...u, enabled: e.target.checked }))} />
              <Label>Enable Unit</Label>
            </div>
          </div>
          <div className="flex justify-between">
            <Button variant="secondary" onClick={addUnit}>Add Unit</Button>
            <div className="flex items-center space-x-4">
              <Button className="hospital-gradient" onClick={saveUnits}><Save className="h-4 w-4 mr-2" /> Save Changes</Button>
              <span className="text-xs text-gray-500">Last Updated: {fmt(unitsUpdatedAt)}</span>
            </div>
          </div>

          {/* Seed default 12 units */}
          <div>
            <Button
              variant="outline"
              onClick={() => {
                if (units.length > 0 && !window.confirm('Overwrite existing units with defaults?')) return;
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
                const seeded = defaults.map(([name, days], idx) => ({
                  id: crypto.randomUUID(),
                  name,
                  description: '',
                  durationDays: days,
                  maxCapacity: 10,
                  rotationOrder: idx + 1,
                  supervisor: '',
                  enabled: true,
                }));
                setUnits(seeded);
                // Persist to backend so Units page (server-driven) sees them
                Promise.all(defaults.map(async ([name, days]) => {
                  try {
                    await api.createUnit({ name, duration_days: days, workload: 'Low', description: '' });
                  } catch (e) {
                    // ignore duplicates or validation errors silently
                  }
                })).then(() => {
                  toast({ title: 'Units loaded', description: '12 default units added to server' });
                });
              }}
            >
              Load Default 12 Units
            </Button>
          </div>

          {/* Units Table */}
          <div className="overflow-x-auto border rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-2">Name</th>
                  <th className="text-left p-2">Duration</th>
                  <th className="text-left p-2">Supervisor</th>
                  <th className="text-left p-2">Max</th>
                  <th className="text-left p-2">Order</th>
                  <th className="text-left p-2">Enabled</th>
                  <th className="text-left p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {units.length === 0 && (
                  <tr>
                    <td className="p-3 text-gray-500" colSpan={6}>No units added yet.</td>
                  </tr>
                )}
                {units.map((u) => (
                  <tr key={u.id} className="border-t">
                    <td className="p-2">
                      <Input value={u.name} disabled={editingUnitId !== u.id} onChange={(e) => updateUnit(u.id, { name: e.target.value })} />
                    </td>
                    <td className="p-2">
                      <Input type="number" value={u.durationDays ?? 0} disabled={editingUnitId !== u.id} onChange={(e) => updateUnit(u.id, { durationDays: Number(e.target.value) })} />
                    </td>
                    <td className="p-2">
                      <Input value={u.supervisor} disabled={editingUnitId !== u.id} onChange={(e) => updateUnit(u.id, { supervisor: e.target.value })} />
                    </td>
                    <td className="p-2">
                      <Input type="number" value={u.maxCapacity} disabled={editingUnitId !== u.id} onChange={(e) => updateUnit(u.id, { maxCapacity: Number(e.target.value) })} />
                    </td>
                    <td className="p-2">
                      <Input type="number" value={u.rotationOrder} disabled={editingUnitId !== u.id} onChange={(e) => updateUnit(u.id, { rotationOrder: Number(e.target.value) })} />
                    </td>
                    <td className="p-2">
                      <input type="checkbox" checked={u.enabled} disabled={editingUnitId !== u.id} onChange={(e) => updateUnit(u.id, { enabled: e.target.checked })} />
                    </td>
                    <td className="p-2 space-x-2">
                      {editingUnitId === u.id ? (
                        <Button size="sm" onClick={() => setEditingUnitId(null)}>Save</Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setEditingUnitId(u.id)}>Edit</Button>
                      )}
                      <Button size="sm" variant="destructive" onClick={() => removeUnit(u.id)}>Delete</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 2b) Intern Settings */}
      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Users className="h-5 w-5" />
            <span>Intern Settings</span>
          </CardTitle>
          <CardDescription>Manage interns (local-only for MVP).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add Intern Form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Full Name</Label>
              <Input value={newIntern.fullName} onChange={(e) => setNewIntern((v) => ({ ...v, fullName: e.target.value }))} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={newIntern.email} onChange={(e) => setNewIntern((v) => ({ ...v, email: e.target.value }))} />
            </div>
            <div>
              <Label>Badge ID</Label>
              <Input value={newIntern.badgeId} onChange={(e) => setNewIntern((v) => ({ ...v, badgeId: e.target.value }))} />
            </div>
            <div>
              <Label>Batch</Label>
              <Input placeholder="e.g. Batch A" value={newIntern.batch} onChange={(e) => setNewIntern((v) => ({ ...v, batch: e.target.value }))} />
            </div>
            <div className="flex items-center space-x-2">
              <input type="checkbox" checked={newIntern.active} onChange={(e) => setNewIntern((v) => ({ ...v, active: e.target.checked }))} />
              <Label>Active</Label>
            </div>
          </div>
          <div className="flex justify-between">
            <Button variant="secondary" onClick={addIntern}>Add Intern</Button>
            <div className="flex items-center space-x-4">
              <Button className="hospital-gradient" onClick={saveInterns}><Save className="h-4 w-4 mr-2" /> Save Changes</Button>
              <span className="text-xs text-gray-500">Last Updated: {fmt(internsUpdatedAt)}</span>
            </div>
          </div>

          {/* Interns Table */}
          <div className="overflow-x-auto border rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-2">Full Name</th>
                  <th className="text-left p-2">Email</th>
                  <th className="text-left p-2">Badge ID</th>
                  <th className="text-left p-2">Batch</th>
                  <th className="text-left p-2">Active</th>
                  <th className="text-left p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {interns.length === 0 && (
                  <tr>
                    <td className="p-3 text-gray-500" colSpan={6}>No interns added yet.</td>
                  </tr>
                )}
                {interns.map((i) => (
                  <tr key={i.id} className="border-t">
                    <td className="p-2">
                      <Input value={i.fullName} onChange={(e) => updateIntern(i.id, { fullName: e.target.value })} />
                    </td>
                    <td className="p-2">
                      <Input type="email" value={i.email} onChange={(e) => updateIntern(i.id, { email: e.target.value })} />
                    </td>
                    <td className="p-2">
                      <Input value={i.badgeId} onChange={(e) => updateIntern(i.id, { badgeId: e.target.value })} />
                    </td>
                    <td className="p-2">
                      <Input value={i.batch} onChange={(e) => updateIntern(i.id, { batch: e.target.value })} />
                    </td>
                    <td className="p-2">
                      <input type="checkbox" checked={i.active} onChange={(e) => updateIntern(i.id, { active: e.target.checked })} />
                    </td>
                    <td className="p-2 space-x-2">
                      <Button size="sm" variant="destructive" onClick={() => removeIntern(i.id)}>Remove</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

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

          <div className="flex items-center justify-between">
            <Button className="hospital-gradient" onClick={saveNotificationSettings}>
              <Save className="h-4 w-4 mr-2" /> Save Changes
            </Button>
            <span className="text-xs text-gray-500">Last Updated: {fmt(notificationUpdatedAt)}</span>
          </div>
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
