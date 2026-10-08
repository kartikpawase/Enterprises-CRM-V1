import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { TechnicianAuthGuard } from './guards/TechnicianAuthGuard';
import { TechnicianPortalLayout } from './layouts/TechnicianPortalLayout';
import { TechnicianTrackingProvider } from './hooks/useTechnicianTracking';
import { TechnicianLoginPage } from './pages/TechnicianLoginPage';
import { TechnicianDashboardPage } from './pages/TechnicianDashboardPage';
import { TechnicianServicesPage } from './pages/TechnicianServicesPage';
import { TechnicianServiceDetailPage } from './pages/TechnicianServiceDetailPage';
import { TechnicianCompletedServicesPage } from './pages/TechnicianCompletedServicesPage';
import { TechnicianProfilePage } from './pages/TechnicianProfilePage';
import { TechnicianNotificationsPage } from './pages/TechnicianNotificationsPage';

/**
 * Technician Portal Root Router
 * Phase 1: Structural Shell
 *
 * Registered routes:
 * - /technician/login
 * - /technician (My Work)
 * - /technician/services (Assigned Services)
 * - /technician/completed-services (Completed Services)
 * - /technician/profile (Technician Profile)
 * - /technician/notifications (Operational Notifications)
 */
export const TechnicianPortalRouter: React.FC = () => {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-workspace flex items-center justify-center text-slate-500">
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs text-slate-600 font-medium">Loading Technician Portal...</span>
          </div>
        </div>
      }
    >
      <Routes>
        {/* Public Login Shell */}
        <Route path="login" element={<TechnicianLoginPage />} />

        {/* Authenticated Portal Shell */}
        <Route
          element={
            <TechnicianAuthGuard>
              <TechnicianTrackingProvider>
                <TechnicianPortalLayout />
              </TechnicianTrackingProvider>
            </TechnicianAuthGuard>
          }
        >
          <Route index element={<TechnicianDashboardPage />} />
          <Route path="services" element={<TechnicianServicesPage />} />
          <Route path="services/:id" element={<TechnicianServiceDetailPage />} />
          <Route path="completed-services" element={<TechnicianCompletedServicesPage />} />
          <Route path="profile" element={<TechnicianProfilePage />} />
          <Route path="notifications" element={<TechnicianNotificationsPage />} />
        </Route>

        {/* Fallback to portal root */}
        <Route path="*" element={<Navigate to="/technician" replace />} />
      </Routes>
    </Suspense>
  );
};
