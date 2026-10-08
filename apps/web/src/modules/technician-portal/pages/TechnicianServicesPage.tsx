import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  Calendar,
  Clock,
  MapPin,
  ChevronRight,
  AlertTriangle,
  RotateCw,
  Inbox,
  Wrench,
  Activity,
  Layers,
  ExternalLink,
  Navigation,
} from 'lucide-react';
import { useTechnicianTracking } from '../hooks/useTechnicianTracking';
import { apiClient } from '../../../lib/api-client';
import type { TechnicianAssignedService, TechnicianServiceViewTab } from '@crm/types';

export const TechnicianServicesPage: React.FC = () => {
  const [filterTab, setFilterTab] = useState<TechnicianServiceViewTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [servicesList, setServicesList] = useState<TechnicianAssignedService[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const tracking = useTechnicianTracking();
  const currentNavigatedJobId = tracking.activeServiceId || (typeof window !== 'undefined' ? localStorage.getItem('technician_current_job_id') : null);

  const handleNavigate = async (service: TechnicianAssignedService) => {
    const serviceId = service.serviceId || service.id;
    if (!serviceId) return;

    if (typeof window !== 'undefined') {
      localStorage.setItem('technician_current_job_id', serviceId);
      localStorage.setItem('technician_current_job_data', JSON.stringify(service));
    }

    try {
      const res = await tracking.navigate(serviceId);
      if (!res?.success && !res?.conflict) {
        const formattedAddress = [
          service.serviceAddress,
          (service as any).addressLine2,
          service.landmark,
          service.city,
          (service as any).state,
          service.pincode,
        ]
          .filter(Boolean)
          .filter((p) => p !== 'Main Service Location')
          .join(', ') || service.customerName || 'Service Location';

        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(formattedAddress)}`;
        if (typeof window !== 'undefined' && window.open) {
          window.open(mapsUrl, '_blank', 'noopener,noreferrer');
        }
      }
    } catch (navErr) {
      console.error('Failed to trigger navigation tracking:', navErr);
    }
  };

  const fetchServices = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.get<TechnicianAssignedService[]>(
        `/technician/me/services?view=${filterTab}`
      );
      if (response && response.data) {
        setServicesList(response.data);
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to load assigned services.');
    } finally {
      setIsLoading(false);
    }
  }, [filterTab]);

  useEffect(() => {
    fetchServices();
  }, [fetchServices]);

  // Client-side search filtering across customer name, service number, address, and equipment
  const filteredList = servicesList.filter((service) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      service.serviceNumber?.toLowerCase().includes(q) ||
      service.customerName?.toLowerCase().includes(q) ||
      service.serviceAddress?.toLowerCase().includes(q) ||
      service.city?.toLowerCase().includes(q) ||
      service.productName?.toLowerCase().includes(q) ||
      service.serviceType?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 max-w-3xl">
      {/* 1. Header */}
      <div>
        <h1 className="text-2xl font-display font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
          <span>Assigned Services</span>
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-primary-700">
            Phase 4
          </span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Live work orders and scheduled field dispatches assigned strictly to you.
        </p>
      </div>

      {/* Error Banner with Retry */}
      {error && (
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={fetchServices}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-100 hover:bg-red-200 border border-red-300 text-red-800 font-medium text-[11px] transition-colors cursor-pointer"
          >
            <RotateCw className="w-3 h-3" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* 2. Search & Filter Bar */}
      <div className="flex flex-col gap-3">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            placeholder="Search by customer, WO number, address, or equipment..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500 shadow-2xs transition-colors"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 border border-slate-200/80 p-1 rounded-xl overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setFilterTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
              filterTab === 'all'
                ? 'bg-white text-primary-700 font-semibold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Work
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('today')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
              filterTab === 'today'
                ? 'bg-white text-primary-700 font-semibold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Today's Services
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('upcoming')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
              filterTab === 'upcoming'
                ? 'bg-white text-primary-700 font-semibold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Upcoming
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('in_progress')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
              filterTab === 'in_progress'
                ? 'bg-white text-primary-700 font-semibold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            In Progress
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('on_hold')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
              filterTab === 'on_hold'
                ? 'bg-white text-primary-700 font-semibold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            On Hold
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('completed')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
              filterTab === 'completed'
                ? 'bg-white text-primary-700 font-semibold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Completed
          </button>
        </div>
      </div>

      {/* 3. Service Card List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="bg-white border border-slate-200/90 rounded-card p-5 animate-pulse space-y-3 shadow-2xs"
            >
              <div className="h-4 bg-slate-100 rounded w-1/3" />
              <div className="h-5 bg-slate-100 rounded w-2/3" />
              <div className="h-4 bg-slate-100 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filteredList.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-card p-12 text-center space-y-3 shadow-2xs">
          <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Inbox className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900">
            {filterTab === 'today'
              ? 'No Services Scheduled for Today'
              : filterTab === 'upcoming'
              ? 'No Upcoming Services Found'
              : filterTab === 'in_progress'
              ? 'No Jobs Currently In Progress'
              : filterTab === 'on_hold'
              ? 'No Jobs On Hold'
              : filterTab === 'completed'
              ? 'No Completed Services Found'
              : 'No Assigned Services'}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {searchQuery
              ? 'No work orders matched your search criteria. Try a different query.'
              : 'New assignments dispatched by the CRM administrator will automatically appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredList.map((service) => {
            const serviceId = service.serviceId || service.id;
            return (
              <div
                key={serviceId}
                className="bg-white hover:border-slate-300 border border-slate-200/90 rounded-card p-5 shadow-2xs transition-all space-y-3.5 group"
              >
                {/* Top row: Service number + Priority badge + Schedule */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-primary-700 border border-slate-200/90">
                      {service.serviceNumber}
                    </span>
                    <span
                      className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                        service.priority === 'URGENT'
                          ? 'bg-red-50 text-red-800 border-red-200'
                          : service.priority === 'HIGH'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {service.priority}
                    </span>
                    <span
                      className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                        service.status === 'ON_HOLD' || (service as any).jobCardStatus === 'ON_HOLD'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : service.status === 'IN_PROGRESS'
                          ? 'bg-sky-50 text-sky-800 border-sky-200'
                          : service.status === 'COMPLETED'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {service.status === 'ON_HOLD' || (service as any).jobCardStatus === 'ON_HOLD'
                        ? 'ON HOLD'
                        : service.status.replace('_', ' ')}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Clock className="w-3.5 h-3.5 text-primary-600" />
                    <span>
                      {service.scheduledTimeSlot ||
                        new Date(service.scheduledDate).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                    </span>
                  </div>
                </div>

                {/* Customer & Service Info */}
                <div>
                  <h2 className="text-base font-bold text-slate-900 group-hover:text-primary-700 transition-colors">
                    {service.customerName}
                  </h2>
                  <p className="text-xs text-slate-600 font-medium mt-0.5">
                    {service.serviceType?.replace('_', ' ')}
                  </p>
                  {service.productName && (
                    <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5">
                      <Wrench className="w-3.5 h-3.5 text-slate-400" />
                      <span>{service.productName}</span>
                      {service.serialNumber && (
                        <span className="font-mono text-slate-400">({service.serialNumber})</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Address */}
                {(service.serviceAddress || service.city) && (
                  <div className="flex items-center gap-2 text-xs text-slate-500 pt-2 border-t border-slate-100 truncate">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span className="truncate">
                      {[
                        service.serviceAddress,
                        (service as any).addressLine2,
                        service.landmark,
                        service.city,
                        (service as any).state,
                        service.pincode,
                      ]
                        .filter(Boolean)
                        .filter((p) => p !== 'Main Service Location')
                        .join(', ')}
                    </span>
                  </div>
                )}

                {/* Actions Footer: 2 Options (View Service and Navigate) */}
                <div className="pt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>
                      {new Date(service.scheduledDate).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      to={`/technician/services/${serviceId}`}
                      className="py-1.5 px-3 rounded-btn bg-slate-100 hover:bg-slate-200/80 border border-slate-200/90 text-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                    >
                      <span>VIEW SERVICE</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Link>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleNavigate(service);
                      }}
                      className={`py-1.5 px-3 rounded-btn text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
                        currentNavigatedJobId === serviceId && tracking.isNavigating
                          ? 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white ring-2 ring-emerald-300'
                          : currentNavigatedJobId === serviceId
                          ? 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white ring-2 ring-amber-300'
                          : 'bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white'
                      }`}
                      title="Set as Current Job and start live tracking / navigation"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      <span>{currentNavigatedJobId === serviceId && tracking.isNavigating ? 'Navigating' : 'Navigate'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Conflict Modal: Switch Active Destination */}
      {tracking.conflictModal?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-900">Switch Active Destination?</h4>
                <p className="text-xs text-slate-500">Only one active navigation is permitted at a time.</p>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              You are currently navigating to <strong>{tracking.conflictModal.activeServiceNumber}</strong>. Switching destination will clear tracking for that service and set the selected service as your active destination.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={tracking.dismissConflictModal}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={tracking.confirmSwitchDestination}
                className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
              >
                Confirm Switch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
