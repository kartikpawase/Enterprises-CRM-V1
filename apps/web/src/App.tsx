import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/query-client';
import { NetworkStatusProvider } from './providers/NetworkStatusProvider';
import { AuthProvider, useAuth } from './providers/AuthBoundary';
import { ToastProvider } from './providers/ToastProvider';
import { AppShell } from './layouts/AppShell';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { PageHeader } from './components/ui/PageHeader';
import { Card, CardContent } from './components/ui/Card';
import { StatusBadge } from './components/ui/StatusBadge';
import { LoadingState } from './components/ui/LoadingState';
import { Button } from './components/ui/Button';
import { LoginPage } from './pages/LoginPage';
import { notifyCrmReady, updateSplashProgress } from './lib/splashScreen';
import { PwaCoordinator } from './lib/pwa-coordinator';

// Code-split route modules dynamically to optimize initial bundle size and processing speed
const DashboardPage = React.lazy(() => import('./modules/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const CustomerDirectory = React.lazy(() => import('./modules/customers/CustomerDirectory').then((m) => ({ default: m.CustomerDirectory })));
const CustomerProfile = React.lazy(() => import('./modules/customers/CustomerProfile').then((m) => ({ default: m.CustomerProfile })));
const SalesDirectory = React.lazy(() => import('./modules/sales/SalesDirectory').then((m) => ({ default: m.SalesDirectory })));
const SaleCreatePage = React.lazy(() => import('./modules/sales/SaleCreatePage').then((m) => ({ default: m.SaleCreatePage })));
const SaleDetailPage = React.lazy(() => import('./modules/sales/SaleDetailPage').then((m) => ({ default: m.SaleDetailPage })));
const RentalsPage = React.lazy(() => import('./modules/rentals/RentalsPage').then((m) => ({ default: m.RentalsPage })));
const InvoiceDirectory = React.lazy(() => import('./modules/invoices/InvoiceDirectory').then((m) => ({ default: m.InvoiceDirectory })));
const InvoiceDetailPage = React.lazy(() => import('./modules/invoices/InvoiceDetailPage').then((m) => ({ default: m.InvoiceDetailPage })));
const AssetsDirectory = React.lazy(() => import('./modules/assets/AssetsDirectory').then((m) => ({ default: m.AssetsDirectory })));
const ServicesDirectory = React.lazy(() => import('./modules/services/ServicesDirectory').then((m) => ({ default: m.ServicesDirectory })));
const ServiceDetailPage = React.lazy(() => import('./modules/services/ServiceDetailPage').then((m) => ({ default: m.ServiceDetailPage })));
const JobCardDirectory = React.lazy(() => import('./modules/job-cards/JobCardDirectory').then((m) => ({ default: m.JobCardDirectory })));
const JobCardDetailPage = React.lazy(() => import('./modules/job-cards/JobCardDetailPage').then((m) => ({ default: m.JobCardDetailPage })));
const TechniciansDirectory = React.lazy(() => import('./modules/technicians/TechniciansDirectory').then((m) => ({ default: m.TechniciansDirectory })));
const TechnicianProfilePage = React.lazy(() => import('./modules/technicians/TechnicianProfilePage').then((m) => ({ default: m.TechnicianProfilePage })));
const PaymentsDirectory = React.lazy(() => import('./modules/payments/PaymentsDirectory').then((m) => ({ default: m.PaymentsDirectory })));
const RemindersDirectory = React.lazy(() => import('./modules/reminders/RemindersDirectory').then((m) => ({ default: m.RemindersDirectory })));
const WhatsAppHub = React.lazy(() => import('./modules/whatsapp/WhatsAppHub').then((m) => ({ default: m.WhatsAppHub })));
const ReportsPage = React.lazy(() => import('./modules/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const NotificationsPage = React.lazy(() => import('./modules/notifications/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const SettingsPage = React.lazy(() => import('./modules/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const DuesPage = React.lazy(() => import('./modules/dues/DuesPage').then((m) => ({ default: m.DuesPage })));
const InventoryPage = React.lazy(() => import('./modules/inventory/InventoryPage').then((m) => ({ default: m.InventoryPage })));
const ExpensesPage = React.lazy(() => import('./modules/expenses/ExpensesPage').then((m) => ({ default: m.ExpensesPage })));
const PublicInvoicePage = React.lazy(() => import('./pages/PublicInvoicePage').then((m) => ({ default: m.PublicInvoicePage })));
const TechnicianPortalRouter = React.lazy(() => import('./modules/technician-portal').then((m) => ({ default: m.TechnicianPortalRouter })));
import {
  TrendingUp,
  Plus,
  Lock,
  Loader2,
} from 'lucide-react';

/**
 * Permission Guard wrapper for module views
 */
export const PermissionGuard: React.FC<{
  permission?: string;
  moduleName: string;
  children: React.ReactNode;
}> = ({ permission, moduleName, children }) => {
  const { hasPermission } = useAuth();

  if (permission && !hasPermission(permission)) {
    return (
      <div className="p-8 text-center bg-white rounded-card border border-slate-200">
        <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
          <Lock className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-slate-900 mb-1">Access Restricted</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          You do not have the required permission (<code className="font-mono bg-slate-100 px-1 py-0.5 rounded">{permission}</code>) to access the {moduleName} module.
        </p>
      </div>
    );
  }

  return <>{children}</>;
};

// Reusable Module Shell View Placeholder
function ModulePlaceholderView({
  title,
  description,
  permission,
}: {
  title: string;
  description: string;
  permission?: string;
}) {
  return (
    <PermissionGuard permission={permission} moduleName={title}>
      <div className="space-y-6 animate-in fade-in duration-fast">
        <PageHeader
          title={title}
          description={description}
          breadcrumbs={[{ label: 'Home' }, { label: title }]}
          actions={
            <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />}>
              Add New
            </Button>
          }
        />

        <Card>
          <CardContent className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-primary-50 text-primary-600 flex items-center justify-center mx-auto mb-3">
              <TrendingUp className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 mb-1">{title} Module Foundation</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed mb-4">
              The application shell, navigation routing, and design system components are active. Complete
              business domain flows will be enabled in subsequent development phases.
            </p>
            <StatusBadge status="active" label="Ready for Module Implementation" />
          </CardContent>
        </Card>
      </div>
    </PermissionGuard>
  );
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-900 text-white select-none">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
          <p className="text-sm font-medium text-slate-400">Verifying session security...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

function LoginRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as any)?.from?.pathname || '/dashboard';

  React.useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  return (
    <LoginPage
      onLoginSuccess={() => {
        navigate(from, { replace: true });
      }}
    />
  );
}

function MainAppShellRouter() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <ProtectedRoute>
      <AppShell activePath={location.pathname} onNavigate={(path) => navigate(path)}>
        <Suspense fallback={<LoadingState message="Loading module..." />}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />

            {/* Date-Wise Dues & Scheduled Activities */}
            <Route
              path="/dues"
              element={
                <PermissionGuard moduleName="Dues">
                  <DuesPage />
                </PermissionGuard>
              }
            />

          {/* Customer Domain Routes */}
          <Route
            path="/customers"
            element={
              <PermissionGuard permission="customers.view" moduleName="Customers">
                <CustomerDirectory />
              </PermissionGuard>
            }
          />
          <Route
            path="/customers/:id"
            element={
              <PermissionGuard permission="customers.view" moduleName="Customer Profile">
                <CustomerProfile />
              </PermissionGuard>
            }
          />

          {/* Sales Domain Routes (Phase 5 Live) */}
          <Route
            path="/sales"
            element={
              <PermissionGuard permission="sales.view" moduleName="Sales">
                <SalesDirectory />
              </PermissionGuard>
            }
          />
          <Route
            path="/sales/new"
            element={
              <PermissionGuard permission="sales.create" moduleName="New Sale">
                <SaleCreatePage />
              </PermissionGuard>
            }
          />
          <Route
            path="/sales/:id"
            element={
              <PermissionGuard permission="sales.view" moduleName="Sale Details">
                <SaleDetailPage />
              </PermissionGuard>
            }
          />

          {/* Rent & Machine Subscription Management */}
          <Route
            path="/rent"
            element={
              <PermissionGuard permission="rentals.view" moduleName="Rental Management">
                <RentalsPage />
              </PermissionGuard>
            }
          />

          {/* Invoices Domain Routes (Phase 5 Live) */}
          <Route
            path="/invoices"
            element={
              <PermissionGuard permission="invoices.view" moduleName="Invoices">
                <InvoiceDirectory />
              </PermissionGuard>
            }
          />
          <Route
            path="/invoices/:id"
            element={
              <PermissionGuard permission="invoices.view" moduleName="Invoice Details">
                <InvoiceDetailPage />
              </PermissionGuard>
            }
          />
          <Route path="/invoice" element={<Navigate to="/invoices" replace />} />
          <Route
            path="/invoice/:id"
            element={
              <PermissionGuard permission="invoices.view" moduleName="Invoice Details">
                <InvoiceDetailPage />
              </PermissionGuard>
            }
          />

          {/* Customer Assets Domain Routes (Phase 5 Live) */}
          <Route
            path="/assets"
            element={
              <PermissionGuard permission="assets.view" moduleName="Customer Assets">
                <AssetsDirectory />
              </PermissionGuard>
            }
          />

          {/* Services & Maintenance Domain Routes (Page 6 Live) */}
          <Route
            path="/services"
            element={
              <PermissionGuard permission="services.view" moduleName="Services & Maintenance">
                <ServicesDirectory />
              </PermissionGuard>
            }
          />
          <Route
            path="/services/:id"
            element={
              <PermissionGuard permission="services.view" moduleName="Service Details">
                <ServiceDetailPage />
              </PermissionGuard>
            }
          />
          {/* Inventory & Spare Parts Management */}
          <Route
            path="/inventory"
            element={
              <PermissionGuard moduleName="Inventory">
                <InventoryPage />
              </PermissionGuard>
            }
          />
          {/* Payments & Collections (Phase 8 Live) */}
          <Route
            path="/payments"
            element={
              <PermissionGuard permission="payments.view" moduleName="Payments & Collections">
                <PaymentsDirectory />
              </PermissionGuard>
            }
          />
          {/* Expenses & Cash-in-Hand */}
          <Route
            path="/expenses"
            element={
              <PermissionGuard permission="expenses.view" moduleName="Expenses">
                <ExpensesPage />
              </PermissionGuard>
            }
          />
          {/* Reminders & Follow-ups (Phase 8 Live) */}
          <Route
            path="/reminders"
            element={
              <PermissionGuard permission="tasks.view" moduleName="Follow-up Reminders">
                <RemindersDirectory />
              </PermissionGuard>
            }
          />
          <Route
            path="/reports"
            element={
              <PermissionGuard permission="reports.view" moduleName="Reports & Analytics">
                <ReportsPage />
              </PermissionGuard>
            }
          />
          {/* Job Cards & Field Operations (Phase 7 Live) */}
          <Route
            path="/job-cards"
            element={
              <PermissionGuard permission="services.view" moduleName="Job Cards">
                <JobCardDirectory />
              </PermissionGuard>
            }
          />
          <Route
            path="/job-cards/:id"
            element={
              <PermissionGuard permission="services.view" moduleName="Job Card Details">
                <JobCardDetailPage />
              </PermissionGuard>
            }
          />
          <Route
            path="/tasks"
            element={
              <PermissionGuard permission="services.view" moduleName="Field Tasks & Job Cards">
                <JobCardDirectory />
              </PermissionGuard>
            }
          />
          <Route
            path="/whatsapp"
            element={
              <PermissionGuard permission="whatsapp.view" moduleName="WhatsApp Business Hub">
                <WhatsAppHub />
              </PermissionGuard>
            }
          />
          {/* Technicians & Field Workforce Domain Routes (Phase 7 Live) */}
          <Route
            path="/technicians"
            element={
              <PermissionGuard permission="services.view" moduleName="Technicians Roster">
                <TechniciansDirectory />
              </PermissionGuard>
            }
          />
          <Route
            path="/technicians/map"
            element={
              <PermissionGuard permission="services.view" moduleName="Live Technician Map">
                <TechniciansDirectory />
              </PermissionGuard>
            }
          />
          <Route
            path="/technicians/:id"
            element={
              <PermissionGuard permission="services.view" moduleName="Technician Profile">
                <TechnicianProfilePage />
              </PermissionGuard>
            }
          />
          {/* Notifications Center (Phase 10 Live) */}
          <Route
            path="/notifications"
            element={
              <PermissionGuard moduleName="Notifications Center">
                <NotificationsPage />
              </PermissionGuard>
            }
          />
          <Route
            path="/settings"
            element={
              <PermissionGuard moduleName="System Settings" permission="settings.manage">
                <SettingsPage />
              </PermissionGuard>
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  </ProtectedRoute>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route
        path="/invoice/view/:id"
        element={
          <Suspense fallback={<LoadingState message="Loading invoice..." />}>
            <PublicInvoicePage />
          </Suspense>
        }
      />
      <Route
        path="/invoices/view/:id"
        element={
          <Suspense fallback={<LoadingState message="Loading invoice..." />}>
            <PublicInvoicePage />
          </Suspense>
        }
      />
      <Route
        path="/technician/*"
        element={
          <Suspense fallback={<LoadingState message="Loading Technician Portal..." />}>
            <TechnicianPortalRouter />
          </Suspense>
        }
      />
      <Route path="/*" element={<MainAppShellRouter />} />
    </Routes>
  );
}

export function SplashScreenCoordinator() {
  const { isInitialCheckDone, authStatus } = useAuth();

  React.useEffect(() => {
    // While initial authentication/session verification is running
    if (!isInitialCheckDone) {
      updateSplashProgress(65);
    } else if (authStatus !== 'AUTH_CHECKING') {
      notifyCrmReady();
    }
  }, [isInitialCheckDone, authStatus]);

  return null;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <NetworkStatusProvider>
          <AuthProvider>
            <SplashScreenCoordinator />
            <ErrorBoundary>
              <BrowserRouter>
                <PwaCoordinator>
                  <AppRoutes />
                </PwaCoordinator>
              </BrowserRouter>
            </ErrorBoundary>
          </AuthProvider>
        </NetworkStatusProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export default App;
