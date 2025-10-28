import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Toaster } from './components/ui/toaster';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Interns from './pages/Interns';
import Units from './pages/Units';
import ManualAssignment from './pages/ManualAssignment';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

function App() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="interns" element={<Interns />} />
          <Route path="units" element={<Units />} />
          {/* Rotations route removed */}
          <Route path="manual-assignment" element={<ManualAssignment />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
      <Toaster />
    </div>
  );
}

export default App;
