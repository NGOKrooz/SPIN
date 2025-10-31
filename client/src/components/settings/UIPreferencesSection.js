import React, { useState, useEffect } from 'react';
import { Palette, Save, Monitor, Sun, Moon, Layout } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { useToast } from '../../hooks/use-toast';

export default function UIPreferencesSection({ onSave, onUnsaved }) {
  const { toast } = useToast();
  const [preferences, setPreferences] = useState(() => {
    const saved = localStorage.getItem('uiPreferences');
    return saved ? JSON.parse(saved) : {
      theme: 'light',
      dashboardView: 'summary',
      dateFormat: 'YYYY-MM-DD',
      timeFormat: '24h',
      showTooltips: true,
      compactMode: false,
      refreshInterval: 30,
      showStatsInHeader: true,
    };
  });
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    // Apply theme immediately
    const root = document.documentElement;
    if (preferences.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [preferences.theme]);

  const handleChange = (field, value) => {
    setPreferences(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
    onUnsaved();
    
    // Auto-save theme changes immediately
    if (field === 'theme') {
      const newPrefs = { ...preferences, [field]: value };
      localStorage.setItem('uiPreferences', JSON.stringify(newPrefs));
      setHasChanges(false);
      toast({
        title: 'Theme Updated',
        description: 'Theme preference saved',
      });
    }
  };

  const handleSave = () => {
    localStorage.setItem('uiPreferences', JSON.stringify(preferences));
    setHasChanges(false);
    onSave();
    toast({
      title: 'Success',
      description: 'UI preferences saved successfully',
    });
  };

  const handleReset = () => {
    const defaults = {
      theme: 'light',
      dashboardView: 'summary',
      dateFormat: 'YYYY-MM-DD',
      timeFormat: '24h',
      showTooltips: true,
      compactMode: false,
      refreshInterval: 30,
      showStatsInHeader: true,
    };
    setPreferences(defaults);
    setHasChanges(true);
    toast({
      title: 'Reset',
      description: 'Preferences reset to defaults',
    });
  };

  return (
    <div className="space-y-6">
      {/* Theme Settings */}
      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Palette className="h-5 w-5" />
            <span>Theme Settings</span>
          </CardTitle>
          <CardDescription>
            Customize the appearance of the platform
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Theme Mode</Label>
            <Select 
              value={preferences.theme} 
              onValueChange={(v) => handleChange('theme', v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">
                  <div className="flex items-center space-x-2">
                    <Sun className="h-4 w-4" />
                    <span>Light</span>
                  </div>
                </SelectItem>
                <SelectItem value="dark">
                  <div className="flex items-center space-x-2">
                    <Moon className="h-4 w-4" />
                    <span>Dark</span>
                  </div>
                </SelectItem>
                <SelectItem value="auto">
                  <div className="flex items-center space-x-2">
                    <Monitor className="h-4 w-4" />
                    <span>Auto (System)</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 mt-1">
              {preferences.theme === 'auto' 
                ? 'Theme will match your system preferences'
                : `${preferences.theme.charAt(0).toUpperCase() + preferences.theme.slice(1)} theme is active`}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Dashboard Layout */}
      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Layout className="h-5 w-5" />
            <span>Dashboard Layout</span>
          </CardTitle>
          <CardDescription>
            Configure dashboard display preferences
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Default Dashboard View</Label>
            <Select 
              value={preferences.dashboardView} 
              onValueChange={(v) => handleChange('dashboardView', v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="summary">Summary View</SelectItem>
                <SelectItem value="detailed">Detailed View</SelectItem>
                <SelectItem value="compact">Compact View</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Auto-Refresh Interval (seconds)</Label>
            <input
              type="number"
              min="10"
              max="300"
              step="10"
              value={preferences.refreshInterval}
              onChange={(e) => handleChange('refreshInterval', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
            <p className="text-xs text-gray-500 mt-1">
              Dashboard will refresh every {preferences.refreshInterval} seconds
            </p>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex-1">
              <Label className="font-medium">Show Stats in Header</Label>
              <p className="text-sm text-gray-500 mt-1">
                Display summary statistics in the page header
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={preferences.showStatsInHeader}
                onChange={(e) => handleChange('showStatsInHeader', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Display Preferences */}
      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Palette className="h-5 w-5" />
            <span>Display Preferences</span>
          </CardTitle>
          <CardDescription>
            Customize how dates, times, and information are displayed
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Date Format</Label>
            <Select 
              value={preferences.dateFormat} 
              onValueChange={(v) => handleChange('dateFormat', v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="YYYY-MM-DD">YYYY-MM-DD (ISO)</SelectItem>
                <SelectItem value="MM/DD/YYYY">MM/DD/YYYY (US)</SelectItem>
                <SelectItem value="DD/MM/YYYY">DD/MM/YYYY (UK/EU)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Time Format</Label>
            <Select 
              value={preferences.timeFormat} 
              onValueChange={(v) => handleChange('timeFormat', v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">24-hour (14:30)</SelectItem>
                <SelectItem value="12h">12-hour (2:30 PM)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex-1">
              <Label className="font-medium">Show Tooltips</Label>
              <p className="text-sm text-gray-500 mt-1">
                Display helpful tooltips on hover
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={preferences.showTooltips}
                onChange={(e) => handleChange('showTooltips', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div className="flex-1">
              <Label className="font-medium">Compact Mode</Label>
              <p className="text-sm text-gray-500 mt-1">
                Reduce spacing and padding for a denser layout
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={preferences.compactMode}
                onChange={(e) => handleChange('compactMode', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <Card className="border-0 shadow-sm bg-white/70 backdrop-blur">
        <CardContent className="pt-6">
          <div className="flex items-center justify-end space-x-3">
            <Button variant="outline" onClick={handleReset}>
              <Palette className="h-4 w-4 mr-2" />
              Reset to Defaults
            </Button>
            <Button 
              onClick={handleSave}
              disabled={!hasChanges}
              className="hospital-gradient"
            >
              <Save className="h-4 w-4 mr-2" />
              Save Preferences
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

