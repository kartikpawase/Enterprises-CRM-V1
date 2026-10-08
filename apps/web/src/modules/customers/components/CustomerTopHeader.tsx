import React, { useState } from 'react';
import { Search, Calendar, Bell, ChevronDown, User, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../providers/AuthBoundary';

export interface CustomerTopHeaderProps {
  unreadNotificationsCount?: number;
  onSearch?: (query: string) => void;
}

export const CustomerTopHeader: React.FC<CustomerTopHeaderProps> = ({
  unreadNotificationsCount = 3,
  onSearch,
}) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  // Format dynamic live date ("Today, 25 Aug 2026")
  const dateFormatted = React.useMemo(() => {
    const formatted = new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    return `Today, ${formatted}`;
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSearch) {
      onSearch(searchQuery.trim());
    }
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 select-none pb-1">
      {/* Left/Center: Large Global Search Field */}
      <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
          <Search className="w-4 h-4" />
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            onSearch?.(e.target.value);
          }}
          placeholder="Search customers, invoices, services..."
          className="w-full h-11 pl-10 pr-4 bg-white rounded-xl border border-slate-200/90 text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400 shadow-2xs hover:border-slate-300 focus:border-primary-600 focus:ring-2 focus:ring-primary-500/15 focus:outline-none transition-all"
        />
      </form>

      {/* Right Side: Date Selector + Notification Icon + Admin Avatar */}
      <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
        {/* Date Selector */}
        <div className="h-11 px-3.5 bg-white rounded-xl border border-slate-200/90 shadow-2xs flex items-center gap-2 text-slate-700 text-xs sm:text-sm font-semibold cursor-pointer hover:border-slate-300 transition-colors">
          <Calendar className="w-4 h-4 text-slate-500" />
          <span className="font-mono text-xs sm:text-sm">{dateFormatted}</span>
        </div>

        {/* Admin Profile Area */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            aria-label="User profile menu"
            className="h-11 px-3 bg-white rounded-xl border border-slate-200/90 shadow-2xs flex items-center gap-2.5 hover:border-slate-300 transition-colors cursor-pointer"
          >
            <div className="w-7 h-7 rounded-lg bg-sky-50 text-sky-700 font-bold font-mono text-xs flex items-center justify-center border border-sky-200 overflow-hidden">
              {user?.username?.charAt(0).toUpperCase() || 'A'}
            </div>
            <div className="text-left hidden sm:block">
              <span className="block text-xs font-bold text-slate-900 leading-tight">
                {user?.username || 'Admin'}
              </span>
              <span className="block text-[10px] text-slate-500 font-semibold leading-none mt-0.5 font-mono">
                {user?.role || 'Super Admin'}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {/* Profile Dropdown Menu */}
          {showProfileMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-dropdown border border-slate-200/90 z-50 p-2 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-3 py-2 border-b border-slate-100 mb-1">
                <p className="text-xs font-bold text-slate-900">{user?.displayName || 'Administrator'}</p>
                <p className="text-[11px] text-slate-500 font-mono">{user?.email || 'admin@enterprisescrm.local'}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowProfileMenu(false);
                  navigate('/settings');
                }}
                className="w-full px-3 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-lg flex items-center gap-2 cursor-pointer"
              >
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>Account Settings</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowProfileMenu(false);
                  await logout();
                }}
                className="w-full px-3 py-2 text-left text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-2 mt-1 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5 text-red-500" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
