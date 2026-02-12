import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { X, ArrowUp, ArrowDown, Save } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../hooks/use-toast';

export default function UnitOrderModal({ units = [], onClose, onSaved }) {
  const [items, setItems] = useState([]);
  const { toast } = useToast();

  useEffect(() => {
    setItems(units.map(u => ({ id: u.id, name: u.name })));
  }, [units]);

  const move = (index, dir) => {
    const copy = [...items];
    const i = index;
    const j = dir === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= copy.length) return;
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
    setItems(copy);
  };

  const handleSave = async () => {
    try {
      await api.updateOrder(items.map(i => i.id));
      toast({ title: 'Saved', description: 'Unit order updated' });
      if (typeof onSaved === 'function') onSaved();
      onClose();
    } catch (err) {
      toast({ title: 'Error', description: err.message || 'Failed to save order', variant: 'destructive' });
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="flex items-center space-x-2">
            <span>Reorder Units</span>
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={it.id} className="flex items-center justify-between p-2 border rounded">
                <div className="truncate">{idx + 1}. {it.name}</div>
                <div className="flex items-center space-x-2">
                  <Button size="sm" variant="outline" onClick={() => move(idx, 'up')}><ArrowUp className="h-4 w-4" /></Button>
                  <Button size="sm" variant="outline" onClick={() => move(idx, 'down')}><ArrowDown className="h-4 w-4" /></Button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-end mt-4 space-x-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button className="hospital-gradient" onClick={handleSave}><Save className="h-4 w-4 mr-2" />Save</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
