import React, { useState, useEffect } from 'react';
import { NavLink, Link, Outlet } from 'react-router-dom';
import {
  Wrench,
  Briefcase,
  ListTodo,
  CheckCircle2,
  User,
  Bell,
  MapPinOff,
} from 'lucide-react';
import {
  TECHNICIAN_PORTAL_ROUTE_PREFIX,
  TECHNICIAN_SERVICES_ROUTE,
  TECHNICIAN_COMPLETED_ROUTE,
  TECHNICIAN_PROFILE_ROUTE,
  TECHNICIAN_NOTIFICATIONS_ROUTE,
} from '@crm/shared';
import { apiClient } from '../../../lib/api-client';
import { CRM_OFFICIAL_LOGO_B64 } from '../../../assets/invoiceAssets';
import { TechnicianBottomNav } from './TechnicianBottomNav';
import { TechnicianTrackingProvider, useTechnicianTracking } from '../hooks/useTechnicianTracking';

const TechnicianPortalLayoutContent: React.FC = () => {
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const tracking = useTechnicianTracking();

  useEffect(() => {
    let mounted = true;
    const fetchUnreadCount = async () => {
      try {
        const res = await apiClient.get<{ unreadCount: number }>(
          '/technician/me/notifications/unread-count'
        );
        if (mounted && res?.data?.unreadCount !== undefined) {
          setUnreadCount(res.data.unreadCount);
        }
      } catch {}
    };

    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="min-h-screen bg-workspace text-slate-900 flex flex-col font-sans selection:bg-primary-500 selection:text-white">
      {/* 1. Header (Mobile & Desktop) */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/90 shadow-2xs">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          {/* Brand & Portal Badge */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center p-1.5 shadow-2xs border border-slate-200/90">
              <img
                src={CRM_OFFICIAL_LOGO_B64}
                alt="Enterprises CRM Logo"
                className="w-full h-full object-contain"
              />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-display font-extrabold text-xs sm:text-sm tracking-tight text-slate-900 uppercase">
                  Enterprises CRM
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200">
                  Field Portal
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium">Technician Workspace</p>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center space-x-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
            <NavLink
              to={TECHNICIAN_PORTAL_ROUTE_PREFIX}
              end
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-white text-primary-700 font-semibold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`
              }
            >
              <div className="flex items-center space-x-1.5">
                <Briefcase className="w-3.5 h-3.5" />
                <span>My Work</span>
              </div>
            </NavLink>

            <NavLink
              to={TECHNICIAN_SERVICES_ROUTE}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-white text-primary-700 font-semibold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`
              }
            >
              <div className="flex items-center space-x-1.5">
                <ListTodo className="w-3.5 h-3.5" />
                <span>Assigned</span>
              </div>
            </NavLink>

            <NavLink
              to={TECHNICIAN_NOTIFICATIONS_ROUTE}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-white text-primary-700 font-semibold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`
              }
            >
              <div className="flex items-center space-x-1.5">
                <Bell className="w-3.5 h-3.5" />
                <span>Alerts</span>
                {unreadCount > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-primary-600 text-white">
                    {unreadCount}
                  </span>
                )}
              </div>
            </NavLink>

            <NavLink
              to={TECHNICIAN_COMPLETED_ROUTE}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-white text-primary-700 font-semibold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`
              }
            >
              <div className="flex items-center space-x-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Completed</span>
              </div>
            </NavLink>

            <NavLink
              to={TECHNICIAN_PROFILE_ROUTE}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-white text-primary-700 font-semibold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`
              }
            >
              <div className="flex items-center space-x-1.5">
                <User className="w-3.5 h-3.5" />
                <span>Profile</span>
              </div>
            </NavLink>
          </nav>

          {/* Right Section: Notification Bell */}
          <div className="flex items-center space-x-2">
            <Link
              to={TECHNICIAN_NOTIFICATIONS_ROUTE}
              className="relative p-2 rounded-xl bg-slate-100 hover:bg-slate-200/80 border border-slate-200/90 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-primary-600 text-white font-bold text-[10px] flex items-center justify-center shadow-2xs">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Link>
          </div>
        </div>
      </header>

      {/* Active Navigation / Live Tracking Banner */}
      {tracking.isNavigating && tracking.destination && (
        <div className="bg-emerald-600 text-white px-4 py-2.5 sm:px-6 shadow-xs flex items-center justify-between gap-3 text-xs animate-in slide-in-from-top-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-200 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
            </span>
            <div className="truncate">
              <span className="font-bold uppercase tracking-wider text-[10px] bg-emerald-700 px-2 py-0.5 rounded-full mr-2">
                Live Journey Active
              </span>
              <span className="font-semibold text-white">
                Traveling to {tracking.destination.customerName}
              </span>
              {tracking.distanceText && (
                <span className="text-emerald-100 hidden sm:inline ml-1.5">
                  ({tracking.distanceText} remaining{tracking.etaText ? ` · ETA: ${tracking.etaText}` : ''})
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              to={`/technician/services/${tracking.destination.serviceId}`}
              className="px-3 py-1 bg-white text-emerald-800 hover:bg-emerald-50 active:bg-emerald-100 font-bold rounded-lg text-xs transition-colors shadow-2xs"
            >
              Active Job
            </Link>
          </div>
        </div>
      )}

      {/* Geolocation Permission Banner: Handled when permission is denied */}
      {tracking.permissionState === 'denied' && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 sm:px-6">
          <div className="max-w-5xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start sm:items-center gap-2.5 text-amber-900">
              <MapPinOff className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
              <span>
                <strong>Location Permission Required:</strong> Live device location tracking is required for technician dispatch, customer navigation, and real-time status updates. Please allow location permissions in your browser or device settings.
              </span>
            </div>
            <button
              type="button"
              onClick={() => tracking.requestPermission()}
              className="self-start sm:self-auto px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-semibold rounded-lg shadow-2xs transition-colors shrink-0 cursor-pointer"
            >
              Enable Location / Try Again
            </button>
          </div>
        </div>
      )}

      {/* 2. Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 pb-24 md:pb-12 animate-in fade-in duration-150">
        <Outlet />
      </main>

      {/* 3. Mobile Bottom Touch Navigation */}
      <TechnicianBottomNav />
    </div>
  );
};

export const TechnicianPortalLayout: React.FC = () => {
  return (
    <TechnicianTrackingProvider>
      <TechnicianPortalLayoutContent />
    </TechnicianTrackingProvider>
  );
};
