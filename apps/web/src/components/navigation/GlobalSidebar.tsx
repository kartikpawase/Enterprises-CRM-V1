import React from 'react';
import {
  LayoutDashboard,
  UsersRound,
  BarChart3,
  FileText,
  Wrench,
  UserCog,
  WalletCards,
  PieChart,
  ClipboardCheck,
  Settings,
  LogOut,
  Repeat,
  CalendarClock,
  PackageSearch,
  Receipt,
} from 'lucide-react';
import { NAVIGATION_ITEMS } from '@crm/shared';
import { useAuth } from '../../providers/AuthBoundary';
import { useUIStore } from '../../stores/ui-store';
import { Tooltip } from '../ui/Tooltip';
import { cn } from '../../lib/utils';
import { CRM_OFFICIAL_LOGO_B64 } from '../../assets/invoiceAssets';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  CalendarClock,
  UsersRound,
  BarChart3,
  Repeat,
  FileText,
  Wrench,
  PackageSearch,
  UserCog,
  WalletCards,
  Receipt,
  PieChart,
  ClipboardCheck,
  Settings,
};

const MODULE_PERMISSIONS: Record<string, string> = {
  '/customers': 'customers.view',
  '/sales': 'sales.view',
  '/rent': 'rentals.view',
  '/invoices': 'invoices.view',
  '/services': 'services.view',
  '/technicians': 'services.view',
  '/payments': 'payments.view',
  '/expenses': 'expenses.view',
  '/reports': 'reports.view',
  '/tasks': 'tasks.view',
  '/settings': 'settings.manage',
};

export interface GlobalSidebarProps {
  activePath?: string;
  onNavigate?: (path: string) => void;
}

export const GlobalSidebar: React.FC<GlobalSidebarProps> = ({
  activePath = '/dashboard',
  onNavigate,
}) => {
  const { hasPermission, logout } = useAuth();
  const {
    sidebarState,
    mobileNavOpen,
    expandSidebarManually,
    setHoverExpanded,
    setMobileNavOpen,
    resetSidebarOnLogout,
  } = useUIStore();

  const isExpandedView =
    sidebarState === 'expanded' ||
    sidebarState === 'manuallyExpanded' ||
    sidebarState === 'hoverExpanded' ||
    mobileNavOpen;

  const isCollapsedView = sidebarState === 'collapsed' && !mobileNavOpen;

  // Filter accessible items
  const accessibleNavItems = NAVIGATION_ITEMS.filter((item) => {
    const requiredPermission = MODULE_PERMISSIONS[item.path];
    if (!requiredPermission) return true; // Public module
    return hasPermission(requiredPermission);
  });

  const handleItemClick = (path: string) => {
    // 1-click execution: navigates and sets state to manuallyExpanded until outside click
    expandSidebarManually();
    onNavigate?.(path);
    setMobileNavOpen(false);
  };

  const handleLogout = async () => {
    resetSidebarOnLogout();
    await logout();
    onNavigate?.('/login');
  };

  // Route matching with nested route support
  const isRouteActive = (itemPath: string) => {
    if (itemPath === '/dashboard') {
      return activePath === '/' || activePath === '/dashboard';
    }
    return activePath === itemPath || activePath.startsWith(`${itemPath}/`);
  };

  return (
    <aside
      onMouseEnter={() => setHoverExpanded(true)}
      onMouseLeave={() => setHoverExpanded(false)}
      className={cn(
        'fixed top-0 bottom-0 left-0 h-screen z-40 bg-[#00152B] text-white flex flex-col justify-between py-4 select-none print:hidden',
        'border-r border-slate-800/80 rounded-r-2xl transition-all duration-200 ease-out shadow-2xl',
        // Desktop Widths: 136px expanded vs 68px collapsed
        isExpandedView ? 'w-[160px] md:w-[136px]' : 'w-[68px]',
        // Responsive mobile slide-out drawer
        mobileNavOpen
          ? 'translate-x-0 w-[160px] md:w-[136px]'
          : '-translate-x-full md:translate-x-0'
      )}
      aria-label="Master Global Navigation Sidebar"
    >
      {/* Top Branding Section */}
      <div className="flex flex-col items-center px-2 shrink-0">
        {/* Centered Brand Logo */}
        <div className="w-11 h-11 rounded-xl bg-white/10 backdrop-blur-xs flex items-center justify-center p-1 shadow-md mb-1.5 shrink-0 border border-white/20">
          <img
            src={CRM_OFFICIAL_LOGO_B64}
            alt="Enterprises CRM Logo"
            className="w-full h-full object-contain select-none drop-shadow"
          />
        </div>

        {/* Brand Text Hierarchy */}
        {isExpandedView ? (
          <div className="text-center px-1 animate-in fade-in duration-150 overflow-hidden w-full">
            <span className="block text-[10px] font-display font-extrabold tracking-wider text-white uppercase truncate">
              ENTERPRISES
            </span>
            <span className="block text-[9px] font-bold text-sky-400 tracking-widest uppercase mt-0.5 font-mono">
              CRM
            </span>
          </div>
        ) : (
          <span className="block text-[9px] font-bold text-sky-400 tracking-widest uppercase font-mono">
            CRM
          </span>
        )}

        {/* Low-contrast Subtle Separator */}
        <div className="w-8 h-[1px] bg-slate-800 my-2 shrink-0" />
      </div>

      {/* Primary Navigation List (9 Core Modules) */}
      <nav
        className="flex-1 px-2 py-1 space-y-1.5 overflow-y-auto overflow-x-hidden flex flex-col items-center w-full"
        aria-label="Main Navigation"
      >
        {accessibleNavItems.map((item) => {
          const Icon = ICON_MAP[item.icon] || LayoutDashboard;
          const isActive = isRouteActive(item.path);

          const navButton = (
            <button
              key={item.id || item.key}
              type="button"
              onClick={() => handleItemClick(item.path)}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex items-center text-xs transition-all duration-150 cursor-pointer focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none shrink-0',
                isExpandedView
                  ? 'w-full h-10 rounded-xl px-3 justify-start gap-2.5'
                  : 'w-10 h-10 rounded-full aspect-square justify-center p-0 mx-auto',
                isActive
                  ? 'bg-[#C1121F] text-white font-bold shadow-md'
                  : 'text-slate-200 hover:bg-white/[0.06] hover:text-white'
              )}
            >
              <Icon
                className={cn(
                  'w-5 h-5 shrink-0 transition-colors',
                  isActive ? 'text-white' : 'text-slate-300'
                )}
              />
              {isExpandedView && (
                <span className="text-[12px] font-semibold tracking-tight truncate leading-none text-left">
                  {item.label}
                </span>
              )}
            </button>
          );

          if (isCollapsedView) {
            return (
              <Tooltip key={item.id || item.key} content={item.label} position="right" className="z-50">
                {navButton}
              </Tooltip>
            );
          }

          return navButton;
        })}
      </nav>

      {/* Bottom Navigation Section: Logout */}
      <div className="px-2 pt-2 border-t border-slate-800/80 shrink-0 w-full flex flex-col items-center">
        {(() => {
          const logoutButton = (
            <button
              type="button"
              onClick={handleLogout}
              aria-label="Logout"
              className={cn(
                'flex items-center text-xs text-slate-300 hover:text-red-300 hover:bg-red-950/40 transition-all duration-150 cursor-pointer focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:outline-none shrink-0',
                isExpandedView
                  ? 'w-full h-10 rounded-xl px-3 justify-start gap-2.5'
                  : 'w-10 h-10 rounded-full aspect-square justify-center p-0 mx-auto'
              )}
            >
              <LogOut className="w-5 h-5 shrink-0 text-slate-400 group-hover:text-red-300" />
              {isExpandedView && (
                <span className="text-[12px] font-medium tracking-tight truncate leading-none text-left">
                  Logout
                </span>
              )}
            </button>
          );

          if (isCollapsedView) {
            return (
              <Tooltip content="Logout" position="right" className="z-50">
                {logoutButton}
              </Tooltip>
            );
          }

          return logoutButton;
        })()}
      </div>
    </aside>
  );
};
