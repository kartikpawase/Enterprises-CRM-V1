import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  User,
  Phone,
  Mail,
  MapPin,
  Award,
  Shield,
  Clock,
  Briefcase,
  LogOut,
  Info,
  CheckCircle2,
  Calendar,
  Layers,
  Wrench,
  Activity,
  AlertTriangle,
  RotateCw,
  Package,
  ArrowUpRight,
  HandCoins,
  Wallet,
  ArrowDownToLine,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { apiClient } from '../../../lib/api-client';
import { formatINR, formatDate } from '../../../lib/formatters';
import { useTechnicianAuth } from '../guards/TechnicianAuthGuard';
import {
  useTechnicianMyHandovers,
  useSubmitTechnicianPortalHandover,
} from '../../payments/cash-handovers.api';
import type { Technician360ResponseData } from '@crm/types';

export const TechnicianProfilePage: React.FC = () => {
  const { technician: authTech, logout } = useTechnicianAuth();
  const [profileData, setProfileData] = useState<Technician360ResponseData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Cash Handover submission state
  const [selectedHandoverIds, setSelectedHandoverIds] = useState<string[]>([]);
  const [handoverNotes, setHandoverNotes] = useState('');
  const [handoverFeedback, setHandoverFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const {
    data: myHandoversData,
    isLoading: isHandoversLoading,
    refetch: refetchHandovers,
  } = useTechnicianMyHandovers();
  const submitHandoverMutation = useSubmitTechnicianPortalHandover();

  const myCollections = useMemo(() => myHandoversData?.items || [], [myHandoversData]);
  const eligibleCollections = useMemo(
    () => myCollections.filter((c) => c.status === 'PENDING'),
    [myCollections]
  );

  const selectedRecords = useMemo(
    () => myCollections.filter((c) => selectedHandoverIds.includes(c.id)),
    [myCollections, selectedHandoverIds]
  );

  const amountSelectedForHandover = useMemo(
    () => selectedRecords.reduce((sum, r) => sum + Number(r.amount || 0), 0),
    [selectedRecords]
  );

  const handleToggleHandover = (id: string) => {
    setSelectedHandoverIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllPending = (checked: boolean) => {
    if (checked) {
      setSelectedHandoverIds(eligibleCollections.map((c) => c.id));
    } else {
      setSelectedHandoverIds([]);
    }
  };

  const handleSubmitHandover = async () => {
    if (selectedHandoverIds.length === 0) return;
    setHandoverFeedback(null);

    try {
      if (selectedHandoverIds.length === 1) {
        await submitHandoverMutation.mutateAsync({
          handoverId: selectedHandoverIds[0],
          notes: handoverNotes.trim() || undefined,
        });
      } else {
        await submitHandoverMutation.mutateAsync({
          handoverIds: selectedHandoverIds,
          notes: handoverNotes.trim() || undefined,
        });
      }

      setHandoverFeedback({
        type: 'success',
        message: `Successfully submitted handover request for ${formatINR(amountSelectedForHandover)} (${selectedHandoverIds.length} collection records). Awaiting Admin verification.`,
      });
      setSelectedHandoverIds([]);
      setHandoverNotes('');
      refetchHandovers();
      fetchProfile();
    } catch (err: any) {
      setHandoverFeedback({
        type: 'error',
        message:
          err?.response?.data?.error?.message ||
          err?.message ||
          'Failed to submit cash handover request.',
      });
    }
  };

  const fetchProfile = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiClient.get<Technician360ResponseData>('/technician/me');
      if (response && response.data) {
        setProfileData(response.data);
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to load technician profile.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Merge live profile data with authenticated context fallback
  const tech = profileData?.technician || {
    id: authTech?.id || '',
    technicianId: authTech?.technicianId || authTech?.id || '',
    fullName: authTech?.fullName || 'Technician',
    name: authTech?.fullName || 'Technician',
    phone: authTech?.phone || '',
    email: authTech?.email || '',
    status: (authTech as any)?.status || ('ACTIVE' as const),
    availability: 'AVAILABLE' as const,
    skills: (((authTech as any)?.skills as string[]) || []) as string[],
    portalAccess: 'ENABLED' as const,
    portalEnabled: true,
  };

  const summary = profileData?.workSummary || {
    assigned: 0,
    inProgress: 0,
    completed: 0,
    upcoming: 0,
    completionRate: 0,
  };

  const getInitials = (name: string) => {
    if (!name) return 'TP';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return (name.slice(0, 2) || 'TP').toUpperCase();
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* 1. Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <span>Technician Profile</span>
          <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary-50 border border-primary-200 text-primary-700">
            Technician 360
          </span>
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Authoritative field roster identity, certified competencies, and personal work summary.
        </p>
      </div>

      {/* Error Banner with Retry */}
      {error && (
        <div className="flex items-center justify-between p-3.5 rounded-card bg-rose-50 border border-rose-200 text-rose-800 text-xs">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={fetchProfile}
            className="flex items-center gap-1 px-2.5 py-1 rounded-btn bg-white hover:bg-slate-50 border border-slate-200/90 text-slate-700 font-semibold text-[11px] shadow-2xs transition-colors cursor-pointer"
          >
            <RotateCw className="w-3 h-3" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* 2. Identity & Status Card */}
      <div className="bg-white border border-slate-200/90 rounded-card p-6 shadow-2xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-primary-600 to-sky-500 flex items-center justify-center text-white text-xl font-bold shadow-sm">
              {getInitials(tech.fullName || tech.name)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">{tech.fullName || tech.name}</h2>
                <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-primary-700 border border-slate-200/90">
                  {tech.technicianId || 'TECH-004'}
                </span>
              </div>
              <p className="text-xs text-slate-500">Certified Field Service Specialist</p>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                {/* Status Badge */}
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                    tech.status === 'ACTIVE'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : tech.status === 'ON_LEAVE'
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-slate-100 text-slate-700 border-slate-200/90'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      tech.status === 'ACTIVE'
                        ? 'bg-emerald-500'
                        : tech.status === 'ON_LEAVE'
                        ? 'bg-amber-500'
                        : 'bg-slate-400'
                    }`}
                  />
                  <span>
                    {tech.status === 'ACTIVE'
                      ? 'Active'
                      : tech.status === 'ON_LEAVE'
                      ? 'On Leave'
                      : 'Inactive'}
                  </span>
                </span>

                {/* Availability Badge */}
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                    tech.availability === 'AVAILABLE'
                      ? 'bg-sky-50 text-sky-800 border-sky-200'
                      : tech.availability === 'BUSY'
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-slate-100 text-slate-700 border-slate-200/90'
                  }`}
                >
                  <Activity className="w-3 h-3 text-primary-600" />
                  <span>
                    {tech.availability === 'AVAILABLE'
                      ? 'Available'
                      : tech.availability === 'BUSY'
                      ? 'Job In Progress'
                      : tech.availability === 'ON_LEAVE'
                      ? 'On Leave'
                      : 'Off Duty'}
                  </span>
                </span>

                {/* Portal Access Badge */}
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                    tech.portalAccess === 'ENABLED' || tech.portalEnabled
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border-rose-200'
                  }`}
                >
                  <Shield className="w-3 h-3" />
                  <span>
                    {tech.portalAccess === 'ENABLED' || tech.portalEnabled
                      ? 'Portal Enabled'
                      : 'Portal Disabled'}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Basic Contact Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/90">
            <Phone className="w-4 h-4 text-primary-600 flex-shrink-0" />
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Contact Number</div>
              <div className="font-semibold text-slate-800">{tech.phone || 'Not recorded'}</div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/90">
            <Mail className="w-4 h-4 text-primary-600 flex-shrink-0" />
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-semibold">Email Dispatch</div>
              <div className="font-semibold text-slate-800">{tech.email || 'Not registered'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Personal Work Summary */}
      <div className="bg-white border border-slate-200/90 rounded-card p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-primary-600" />
            <span>Personal Work Summary</span>
          </h2>
          <span className="text-[11px] text-slate-400">Personal Metrics Only</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Assigned */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 text-center">
            <div className="text-xl font-bold text-slate-900">{summary.assigned}</div>
            <div className="text-[10px] text-slate-500 mt-1 uppercase font-semibold">Assigned</div>
          </div>

          {/* Current Workload */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 text-center">
            <div className="text-xl font-bold text-amber-600">{summary.currentWorkload ?? (summary.assigned + summary.inProgress)}</div>
            <div className="text-[10px] text-slate-500 mt-1 uppercase font-semibold">Workload</div>
          </div>

          {/* In Progress */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 text-center">
            <div className="text-xl font-bold text-amber-600">{summary.inProgress}</div>
            <div className="text-[10px] text-slate-500 mt-1 uppercase font-semibold">In Progress</div>
          </div>

          {/* Completed */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 text-center">
            <div className="text-xl font-bold text-emerald-600">{summary.completed}</div>
            <div className="text-[10px] text-slate-500 mt-1 uppercase font-semibold">Completed</div>
          </div>

          {/* Completion Rate */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 text-center">
            <div className="text-xl font-bold text-primary-600">{summary.completionRate}%</div>
            <div className="text-[10px] text-slate-500 mt-1 uppercase font-semibold">Rate</div>
          </div>

          {/* Avg Completion Time */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 text-center">
            <div className="text-xl font-bold text-slate-700">
              {summary.isAverageCompletionTimeReliable ? summary.averageCompletionTimeFormatted : 'N/A'}
            </div>
            <div className="text-[10px] text-slate-500 mt-1 uppercase font-semibold">Avg Time</div>
          </div>
        </div>

        {/* Completion Progress Bar */}
        <div className="pt-2">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
            <span>Overall Completion Progress</span>
            <span className="font-bold text-primary-700">{summary.completionRate}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden border border-slate-200/60">
            <div
              className="h-full bg-gradient-to-r from-primary-600 to-sky-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, summary.completionRate))}%` }}
            />
          </div>
        </div>
      </div>

      {/* 4. Active Job Spares (Currently On Hold / In Progress) */}
      <div className="bg-white border border-slate-200/90 rounded-card p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <Package className="w-4 h-4 text-primary-600" />
            <span>Active Job Spares (Currently Reserved / On Hold)</span>
          </h2>
          <span className="text-[11px] text-slate-400">
            {profileData?.activeJobSpares?.length || 0} Active Work Order(s)
          </span>
        </div>

        {profileData?.activeJobSpares && profileData.activeJobSpares.length > 0 ? (
          <div className="space-y-3">
            {profileData.activeJobSpares.map((job) => (
              <div
                key={job.jobCardId}
                className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/60">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-xs">
                      {job.serviceNumber}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                      {job.jobCardNumber}
                    </span>
                    <span className="text-slate-400 text-xs">•</span>
                    <span className="text-xs text-slate-600 font-medium">
                      {job.customerName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        job.status === 'ON_HOLD'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-sky-50 text-sky-800 border-sky-200'
                      }`}
                    >
                      {job.status === 'ON_HOLD' ? 'On Hold' : job.status.replace(/_/g, ' ')}
                    </span>
                    {job.serviceId && (
                      <Link
                        to={`/technician/services/${job.serviceId}`}
                        className="px-2 py-0.5 rounded bg-white hover:bg-slate-100 border border-slate-200 text-primary-700 text-[11px] font-semibold inline-flex items-center gap-1 transition-colors"
                      >
                        <span>Open</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </Link>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Spare Parts Used
                  </div>
                  <div className="divide-y divide-slate-200/60 bg-white rounded-lg border border-slate-200/60 overflow-hidden">
                    {job.parts.map((p, idx) => (
                      <div
                        key={idx}
                        className="px-3 py-2 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800">{p.itemName}</span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-100 text-slate-600 border border-slate-200">
                            {p.source}
                          </span>
                          {p.isWarrantyCovered && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                              Warranty
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-slate-600 font-bold">x{p.quantity}</span>
                          <span className="font-mono text-slate-900 font-medium">
                            ₹{(p.unitPrice * p.quantity).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 italic py-2">
            No active spare parts currently recorded on assigned jobs.
          </p>
        )}
      </div>

      {/* 5. Skills & Competencies */}
      <div className="bg-white border border-slate-200/90 rounded-card p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-500" />
            <span>Certified Skills & Competencies</span>
          </h2>
          <span className="text-[11px] text-slate-400">
            {tech.skills?.length || 0} Verified
          </span>
        </div>

        {tech.skills && tech.skills.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {tech.skills.map((skill: string, idx: number) => (
              <span
                key={idx}
                className="px-3 py-1.5 rounded-xl bg-slate-50 text-xs font-semibold text-slate-700 border border-slate-200/90 flex items-center gap-1.5 shadow-2xs"
              >
                <Wrench className="w-3.5 h-3.5 text-primary-600" />
                <span>{skill}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 italic">No verified skills recorded on roster.</p>
        )}
      </div>

      {/* MY CASH Status Card & Handover Action Engine */}
      <div className="bg-white border border-slate-200/90 rounded-card p-6 shadow-2xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <HandCoins className="w-4 h-4 text-emerald-600" />
              <span>My Cash (Physical Cash Collections)</span>
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Field collections, handover requests, and verified owner receipts
            </p>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            Outstanding = Field Collected − Confirmed Received
          </span>
        </div>

        {/* 4 Pillars Summary KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 1. Cash Collected */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider">Field Collected</span>
              <Wallet className="w-3.5 h-3.5 text-sky-600" />
            </div>
            <div className="text-lg font-bold font-mono text-slate-900">
              {formatINR(profileData?.cashSummary?.cashCollected || 0)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">Total collected across all jobs</div>
          </div>

          {/* 2. Submitted for Handover */}
          <div className="p-3.5 rounded-xl bg-indigo-50/50 border border-indigo-200/80">
            <div className="flex items-center justify-between text-indigo-700 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider">Submitted for Handover</span>
              <ArrowDownToLine className="w-3.5 h-3.5 text-indigo-600" />
            </div>
            <div className="text-lg font-bold font-mono text-indigo-800">
              {formatINR(profileData?.cashSummary?.submittedForHandover || 0)}
            </div>
            <div className="text-[10px] text-indigo-600 mt-0.5">Awaiting Admin confirmation</div>
          </div>

          {/* 3. Confirmed Received */}
          <div className="p-3.5 rounded-xl bg-emerald-50/50 border border-emerald-200/80">
            <div className="flex items-center justify-between text-emerald-700 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider">Confirmed Received</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="text-lg font-bold font-mono text-emerald-800">
              {formatINR(profileData?.cashSummary?.cashHandedOver || 0)}
            </div>
            <div className="text-[10px] text-emerald-600 mt-0.5">Physically verified by Owner</div>
          </div>

          {/* 4. Outstanding Balance */}
          <div className="p-3.5 rounded-xl bg-amber-50/50 border border-amber-200/80">
            <div className="flex items-center justify-between text-amber-800 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider">Outstanding Balance</span>
              <Clock className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <div className="text-lg font-bold font-mono text-amber-900">
              {formatINR(profileData?.cashSummary?.outstandingBalance ?? profileData?.cashSummary?.pendingHandover ?? 0)}
            </div>
            <div className="text-[10px] text-amber-700 mt-0.5">
              {profileData?.cashSummary?.pendingHandover ? `₹${profileData.cashSummary.pendingHandover.toFixed(0)} unsubmitted` : 'In custody'}
            </div>
          </div>
        </div>

        {/* Handover Action Feedback Notification */}
        {handoverFeedback && (
          <div
            className={`p-3.5 rounded-xl text-xs flex items-center gap-2.5 border ${
              handoverFeedback.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {handoverFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            )}
            <span>{handoverFeedback.message}</span>
          </div>
        )}

        {/* Interactive Handover Submission & Collection History */}
        <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                <span>My Cash Collections & Handover Status</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Select collected cash records to submit a physical handover request to the admin desk.
              </p>
            </div>

            {selectedHandoverIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 bg-indigo-50/70 p-2 rounded-lg border border-indigo-200">
                <span className="text-xs font-bold text-indigo-900">
                  {selectedHandoverIds.length} selected ({formatINR(amountSelectedForHandover)})
                </span>
                <input
                  type="text"
                  placeholder="Notes (optional, e.g. Left at desk)"
                  value={handoverNotes}
                  onChange={(e) => setHandoverNotes(e.target.value)}
                  className="py-1 px-2 text-xs rounded border border-indigo-200 bg-white focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleSubmitHandover}
                  disabled={submitHandoverMutation.isPending}
                  className="py-1 px-3 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                >
                  {submitHandoverMutation.isPending ? 'Submitting...' : 'Submit Handover Request'}
                </button>
              </div>
            )}
          </div>

          <div className="overflow-x-auto border border-slate-200/80 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-2.5 px-3 w-10">
                    <input
                      type="checkbox"
                      checked={eligibleCollections.length > 0 && selectedHandoverIds.length === eligibleCollections.length}
                      onChange={(e) => handleSelectAllPending(e.target.checked)}
                      disabled={eligibleCollections.length === 0}
                      aria-label="Select all pending collections"
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-30"
                    />
                  </th>
                  <th className="py-2.5 px-3">Job / Service</th>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3">Amount</th>
                  <th className="py-2.5 px-3">Collected Date</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isHandoversLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={7} className="py-3 px-3">
                        <div className="h-4 bg-slate-100 rounded w-full" />
                      </td>
                    </tr>
                  ))
                ) : myCollections.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-400">
                      No physical cash collections recorded on your profile.
                    </td>
                  </tr>
                ) : (
                  myCollections.map((c) => {
                    const isPending = c.status === 'PENDING';
                    const isSelected = selectedHandoverIds.includes(c.id);
                    return (
                      <tr
                        key={c.id}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          isSelected ? 'bg-indigo-50/30' : ''
                        }`}
                      >
                        <td className="py-2.5 px-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleHandover(c.id)}
                            disabled={!isPending}
                            aria-label={`Select collection ${c.id}`}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-30"
                          />
                        </td>
                        <td className="py-2.5 px-3 font-mono font-semibold text-slate-800">
                          {c.serviceNumber || c.jobCardNumber || c.serviceId || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {c.customerName || 'Customer'}
                        </td>
                        <td className="py-2.5 px-3 font-bold font-mono text-slate-900">
                          {formatINR(c.amount)}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-400 text-[11px]">
                          {formatDate(c.collectedAt)}
                        </td>
                        <td className="py-2.5 px-3">
                          {c.status === 'RECEIVED' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Received</span>
                            </span>
                          ) : c.status === 'SUBMITTED' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              <ArrowDownToLine className="w-3 h-3 text-indigo-600" />
                              <span>Awaiting Admin Review</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <Clock className="w-3 h-3 text-amber-600" />
                              <span>Ready to Handover</span>
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {isPending ? (
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedHandoverIds([c.id]);
                                handleSubmitHandover();
                              }}
                              disabled={submitHandoverMutation.isPending}
                              className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer disabled:opacity-50"
                            >
                              Submit
                            </button>
                          ) : c.status === 'SUBMITTED' ? (
                            <span className="text-[10px] text-slate-400 italic">Pending Admin</span>
                          ) : (
                            <span className="text-[10px] text-emerald-600">Verified</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 5. Session Actions */}
      <div className="bg-white border border-slate-200/90 rounded-card p-4 shadow-2xs">
        <div>
          <button
            type="button"
            onClick={logout}
            className="w-full py-2.5 px-4 rounded-btn bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-semibold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-2xs"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout Technician Session</span>
          </button>
        </div>
      </div>
    </div>
  );
};
