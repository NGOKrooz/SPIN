import React, { useMemo, useState } from 'react';
import api from '../services/api';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  Building2, 
  UserPlus, 
  FileText, 
  Settings,
  Stethoscope
} from 'lucide-react';
import { cn } from '../lib/utils';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Interns', href: '/interns', icon: Users },
  { name: 'Units', href: '/units', icon: Building2 },
  { name: 'Manual Assignment', href: '/manual-assignment', icon: UserPlus },
  { name: 'Reports', href: '/reports', icon: FileText },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export default function Layout() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const role = useMemo(() => localStorage.getItem('role') || '', []);

  // Simple gate overlay if no role selected yet
  if (!role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow">
          <h2 className="mb-1 text-lg font-semibold text-gray-900">Welcome to SPIN</h2>
          <p className="mb-4 text-sm text-gray-600">Choose how you want to continue:</p>
          <div className="space-y-3">
            <button
              className="w-full rounded-md bg-gray-900 px-4 py-2 text-white hover:bg-gray-800"
              onClick={() => {
                const key = window.prompt('Enter admin password');
                const trimmed = (key || '').trim();
                if (!trimmed) return;
                api.verifyAdmin(trimmed)
                  .then(() => {
                    localStorage.setItem('role', 'admin');
                    localStorage.setItem('adminKey', trimmed);
                    window.location.reload();
                  })
                  .catch((err) => {
                    const msg = err?.message || 'Wrong password';
                    window.alert(msg);
                  });
              }}
            >
              Sign in as Admin
            </button>
            <button
              className="w-full rounded-md border border-gray-300 px-4 py-2 text-gray-800 hover:bg-gray-50"
              onClick={() => {
                localStorage.setItem('role', 'guest');
                window.location.reload();
              }}
            >
              View as Guest
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen app-bg">
      {/* Mobile top bar */}
      <div className="md:hidden sticky top-0 z-50 flex h-14 items-center justify-between bg-white/90 px-4 shadow-sm backdrop-blur-md">
        <button
          aria-label="Open sidebar"
          className="inline-flex items-center rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          onClick={() => setSidebarOpen(true)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
          </svg>
        </button>
        <div className="flex items-center space-x-2">
          <div className="hospital-gradient rounded-lg p-1.5">
            <Stethoscope className="h-5 w-5 text-white" />
          </div>
          <span className="text-sm font-semibold text-gray-900">SPIN</span>
        </div>
        <span className="w-9" />
      </div>

      {/* Sidebar */}
      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm md:hidden"
        />
      )}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-white/90 backdrop-blur-md shadow-xl transform transition-transform duration-200 ease-in-out",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
          "md:translate-x-0"
        )}
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="hidden h-16 items-center justify-center glass-header md:flex">
            <div className="flex items-center space-x-2">
              <div className="hospital-gradient rounded-lg p-2">
                <Stethoscope className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">SPIN</h1>
                <p className="text-xs text-gray-500">Internship Scheduler</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 px-4 py-4">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    'group flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'hospital-gradient text-white shadow-sm'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon
                    className={cn(
                      'mr-3 h-5 w-5 flex-shrink-0',
                      isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-500'
                    )}
                  />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="border-t border-gray-200 p-4">
            <div className="text-center">
              <p className="text-xs text-gray-500">
                UNTH Ituku Ozalla
              </p>
              <p className="text-xs text-gray-400">
                Physiotherapy Department
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Role switch bar */}
      <div className="md:pl-64">
        <div className="sticky top-0 z-40 hidden h-10 items-center justify-end bg-white/80 px-4 backdrop-blur md:flex">
          <div className="text-xs text-gray-600">
            Role: <span className="font-medium">{role}</span>
            <button
              className="ml-3 rounded border border-gray-300 px-2 py-0.5 text-gray-700 hover:bg-gray-50"
              onClick={() => {
                if (role === 'admin') {
                  localStorage.removeItem('adminKey');
                }
                localStorage.removeItem('role');
                window.location.reload();
              }}
            >
              Switch
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="md:pl-64">
        <main className="py-4 md:py-8">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
