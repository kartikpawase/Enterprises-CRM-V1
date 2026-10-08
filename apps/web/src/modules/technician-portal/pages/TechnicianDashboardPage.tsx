import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar,
  Clock,
  MapPin,
  Briefcase,
  AlertCircle,
  ChevronRight,
  CheckCircle2,
  Layers,
  ArrowUpRight,
  BarChart3,
  RotateCw,
  TrendingUp,
  Hourglass,
  ExternalLink,
} from 'lucide-react';
import { TECHNICIAN_SERVICES_ROUTE, TECHNICIAN_COMPLETED_ROUTE } from '@crm/shared';
import { useTechnicianTracking } from '../hooks/useTechnicianTracking';
import { apiClient } from '../../../lib/api-client';
import type {
  TechnicianPersonalSummary,
  TechnicianPersonalSummaryResponse,
  TechnicianAssignedService,
} from '@crm/types';

export const TechnicianDashboardPage: React.FC = () => {
  const tracking = useTechnicianTracking();
  const [summary, setSummary] = useState<TechnicianPersonalSummary>({
    assignedCount: 0,
    completedCount: 0,
    currentWorkload: 0,
    completionRate: 0,
    averageCompletionTimeMinutes: 0,
    averageCompletionTimeFormatted: '0m',
    isAverageCompletionTimeReliable: false,
    sampleSize: 0,
    workloadBreakdown: {
      assigned: 0,
      inProgress: 0,
      onHold: 0,
      upcoming: 0,
    },
  });
  const [todayServices, setTodayServices] = useState<TechnicianAssignedService[]>([]);
  const [activeJob, setActiveJob] = useState<{
    id: string;
    serviceNumber: string;
    scheduledTime: string;
    customerName: string;
    serviceType: string;
    status: string;
    address: string;
    asset: string;
  } | null>(() => {
    // STRICT RULE: Only when the technician clicks on navigate, only then that one particular
    // service is listed into the "current job" section.
    const savedJobId = typeof window !== 'undefined' ? localStorage.getItem('technician_current_job_id') : null;
    if (!savedJobId) return null;

    try {
      const cachedRaw = localStorage.getItem('technician_current_job_data');
      if (cachedRaw) {
        const current = JSON.parse(cachedRaw);
        if ((current.serviceId || current.id) === savedJobId) {
          const formattedAddress = [
            current.serviceAddress,
            current.addressLine2,
            current.landmark,
            current.city,
            current.state,
            current.pincode,
          ]
            .filter(Boolean)
            .filter((p: string) => p !== 'Main Service Location')
            .join(', ');

          const isOnHold = current.status === 'ON_HOLD' || current.jobCardStatus === 'ON_HOLD';

          return {
            id: current.serviceId || current.id,
            serviceNumber: current.serviceNumber || 'WO-PENDING',
            scheduledTime: current.scheduledTimeSlot || 'Scheduled',
            customerName: current.customerName || 'Customer',
            serviceType: current.serviceType || 'Service',
            status: isOnHold
              ? 'On Hold'
              : current.status
              ? current.status.charAt(0).toUpperCase() + current.status.slice(1).toLowerCase().replace('_', ' ')
              : 'Assigned',
            address: formattedAddress || 'Service Location',
            asset: current.productName ? `Asset: ${current.productName}` : 'Commercial Equipment',
          };
        }
      }
    } catch {
      // ignore parse error
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<TechnicianPersonalSummary>('/technician/me/summary');
      if (res && res.data) {
        setSummary(res.data);
      }
    } catch (err: any) {
      // Soft error: preserve baseline state while noting refresh failure
      setError(err?.message || 'Unable to refresh live metrics');
    } finally {
      setIsLoading(false);
    }

    try {
      const servicesRes = await apiClient.get<TechnicianAssignedService[]>('/technician/me/services?view=all');
      const list = servicesRes?.data || [];

      // Populate Today's Schedule with live assigned tasks
      setTodayServices(list.filter((s) => s.status !== 'COMPLETED' && s.status !== 'CANCELLED'));

      const currentJobId = tracking.activeServiceId || (typeof window !== 'undefined' ? localStorage.getItem('technician_current_job_id') : null);

      // STRICT USER RULE: Only when the technician clicks on navigate, only then that one particular
      // service has to be listed into "current job" section.
      if (!currentJobId) {
        setActiveJob(null);
        return;
      }

      // Find the specific service that the technician navigated to
      const current = list.find((s) => (s.serviceId || s.id) === currentJobId) || null;

      if (current) {
        // STRICT RULE: Completed, cancelled, or closed services must NEVER be selected as the Current Job
        const isCompleted =
          current.status === 'COMPLETED' ||
          (current as any).jobCardStatus === 'COMPLETED' ||
          (current as any).jobCardStatus === 'CUSTOMER_CONFIRMED' ||
          (current as any).jobCardStatus === 'CLOSED';
        const isCancelled = current.status === 'CANCELLED' || (current as any).jobCardStatus === 'CANCELLED';

        if (isCompleted || isCancelled) {
          if (typeof window !== 'undefined') {
            localStorage.removeItem('technician_current_job_id');
            localStorage.removeItem('technician_current_job_data');
          }
          setActiveJob(null);
          return;
        }

        const formattedAddress = [
          current.serviceAddress,
          (current as any).addressLine2,
          current.landmark,
          current.city,
          (current as any).state,
          current.pincode,
        ]
          .filter(Boolean)
          .filter((p) => p !== 'Main Service Location')
          .join(', ');

        const isOnHold = current.status === 'ON_HOLD' || (current as any).jobCardStatus === 'ON_HOLD';

        setActiveJob({
          id: current.serviceId || current.id || currentJobId,
          serviceNumber: current.serviceNumber || 'WO-PENDING',
          scheduledTime: current.scheduledTimeSlot || 'Scheduled',
          customerName: current.customerName || 'Customer',
          serviceType: current.serviceType || 'Service',
          status: isOnHold
            ? 'On Hold'
            : current.status
            ? current.status.charAt(0).toUpperCase() + current.status.slice(1).toLowerCase().replace('_', ' ')
            : 'Assigned',
          address: formattedAddress || 'Service Location',
          asset: current.productName ? `Asset: ${current.productName}` : 'Commercial Equipment',
        });
      } else {
        // Navigated service not found in active assigned list
        setActiveJob(null);
      }
    } catch {
      // Ignore if offline
    }
  };

  useEffect(() => {
    fetchSummary();

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'technician_current_job_id' || e.key === 'technician_current_job_data') {
        fetchSummary();
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', fetchSummary);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', fetchSummary);
    };
  }, [tracking.activeServiceId, tracking.isNavigating]);

  return (
    <div className="space-y-6">
      {/* 1. Header Greeting & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-extrabold tracking-tight text-slate-900">
            My Work
          </h1>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={fetchSummary}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200/90 text-xs font-semibold text-slate-700 shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
            title="Refresh Summary"
          >
            <RotateCw className={`w-3.5 h-3.5 text-primary-600 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={fetchSummary}
            className="text-[11px] font-semibold text-amber-800 hover:underline cursor-pointer"
          >
            Try Again
          </button>
        </div>
      )}

      {/* 2. Personal Operational Summary (Minimal & Non-Intrusive) */}
      <div className="bg-white border border-slate-200/90 rounded-card shadow-2xs px-3.5 py-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-1.5 border-b border-slate-100">
          <div className="flex items-center gap-1.5 text-slate-700">
            <BarChart3 className="w-3.5 h-3.5 text-primary-600" />
            <span className="text-xs font-semibold text-slate-800">
              Personal Operational Summary
            </span>
          </div>
          <span className="text-[11px] text-slate-500">
            Completion: <span className="font-bold text-primary-600">{summary.completionRate}%</span>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
          <div className="px-2 py-1.5 rounded-lg bg-slate-50/80 border border-slate-200/80">
            <div className="text-[10px] uppercase font-semibold text-slate-500">Assigned</div>
            <div className="text-sm font-bold text-slate-900">{summary.assignedCount}</div>
          </div>
          <div className="px-2 py-1.5 rounded-lg bg-slate-50/80 border border-slate-200/80">
            <div className="text-[10px] uppercase font-semibold text-slate-500">Workload</div>
            <div className="text-sm font-bold text-amber-600">{summary.currentWorkload}</div>
          </div>
          <div className="px-2 py-1.5 rounded-lg bg-slate-50/80 border border-slate-200/80">
            <div className="text-[10px] uppercase font-semibold text-slate-500">Completed</div>
            <div className="text-sm font-bold text-emerald-600">{summary.completedCount}</div>
          </div>
          <div className="px-2 py-1.5 rounded-lg bg-slate-50/80 border border-slate-200/80">
            <div className="text-[10px] uppercase font-semibold text-slate-500">Rate</div>
            <div className="text-sm font-bold text-primary-600">{summary.completionRate}%</div>
          </div>
          <div className="col-span-2 sm:col-span-1 px-2 py-1.5 rounded-lg bg-slate-50/80 border border-slate-200/80">
            <div className="text-[10px] uppercase font-semibold text-slate-500">Avg Time</div>
            <div className="text-sm font-bold text-slate-900">
              {summary.isAverageCompletionTimeReliable ? summary.averageCompletionTimeFormatted : 'N/A'}
            </div>
            <div className="text-[10px] text-slate-500 truncate">
              {summary.isAverageCompletionTimeReliable
                ? `Sample: ${summary.sampleSize} jobs`
                : 'Data unavailable'}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Current Job Card */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-600 flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-primary-600" />
            <span>Current Job</span>
          </h2>
          {activeJob ? (
            <span className="text-xs text-amber-800 font-semibold px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200">
              Ongoing Assignment
            </span>
          ) : (
            <span className="text-xs text-emerald-800 font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200">
              Up to Date
            </span>
          )}
        </div>

        {activeJob ? (
          <div className="bg-white border border-slate-200/90 rounded-card p-5 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-primary-700 border border-slate-200/90">
                    {activeJob.serviceNumber}
                  </span>
                  <span className="text-xs font-medium text-slate-500">Scheduled: {activeJob.scheduledTime}</span>
                </div>
                <h3 className="text-base sm:text-lg font-display font-bold text-slate-900">
                  {activeJob.customerName}
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  {activeJob.serviceType}
                </p>
              </div>
              <span
                className={`self-start text-xs font-semibold px-2.5 py-1 rounded-full border ${
                  activeJob.status.toLowerCase() === 'on hold'
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : activeJob.status.toLowerCase() === 'in progress'
                    ? 'bg-sky-50 text-sky-800 border-sky-200'
                    : 'bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                {activeJob.status}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-3 border-t border-slate-100 text-xs text-slate-600">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 truncate">
                  <MapPin className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <span className="truncate">{activeJob.address}</span>
                </div>
                {activeJob.address && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activeJob.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-primary-600 hover:text-primary-800 transition-colors shrink-0 ml-1"
                    title="Navigate on Google Maps"
                  >
                    <span>Maps</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <span>{activeJob.asset}</span>
              </div>
            </div>

            <div className="pt-2">
              <Link
                to={`/technician/services/${activeJob.id}`}
                className="w-full py-2.5 px-4 rounded-btn bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
              >
                <span>Open Job Card</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-slate-200/90 rounded-card p-6 shadow-2xs text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">No Active Ongoing Job</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Completed services have been moved to the Completed tab. You have no pending work in progress right now.
              </p>
            </div>
            <div className="pt-1">
              <Link
                to={TECHNICIAN_COMPLETED_ROUTE}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-btn bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold transition-colors border border-emerald-200 cursor-pointer"
              >
                <span>View Completed Tab</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* 5. Today's Work Queue */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-600 flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary-600" />
            <span>Today's Schedule</span>
          </h2>
          <Link
            to={TECHNICIAN_SERVICES_ROUTE}
            className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1"
          >
            <span>View All</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="space-y-2.5">
          {todayServices.length > 0 ? (
            todayServices.slice(0, 5).map((service) => {
              const serviceId = service.serviceId || service.id;
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
                .join(', ') || 'Service Location';

              return (
                <Link
                  key={serviceId}
                  to={`/technician/services/${serviceId}`}
                  className="bg-white border border-slate-200/90 rounded-card p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-primary-300 transition-colors block"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-semibold text-primary-700 bg-slate-100 border border-slate-200/90 px-1.5 py-0.5 rounded">
                        {service.serviceNumber || 'WO-SCHEDULED'}
                      </span>
                      <span className="text-xs text-slate-500">{service.scheduledTimeSlot || 'Scheduled'}</span>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200">
                        {service.priority || 'Standard'}
                      </span>
                    </div>
                    <div className="font-semibold text-sm text-slate-900">{service.customerName}</div>
                    <div className="text-xs text-slate-500">{service.serviceType}</div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3 text-xs text-slate-500">
                    <span className="max-w-[200px] truncate">{formattedAddress}</span>
                    <span className="px-2 py-1 rounded bg-slate-100 border border-slate-200 text-slate-700 font-medium text-xs">
                      {service.status === 'ON_HOLD' ? 'On Hold' : service.status}
                    </span>
                  </div>
                </Link>
              );
            })
          ) : (
            <div className="bg-white border border-slate-200/90 rounded-card p-6 text-center shadow-2xs">
              <Calendar className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">No scheduled services for today</p>
              <p className="text-xs text-slate-500 mt-1">Check back later or view all assigned services.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
