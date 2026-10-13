import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Wrench,
  User,
  Phone,
  Mail,
  ShieldCheck,
  ShieldAlert,
  Play,
  Pause,
  CheckCircle2,
  XCircle,
  RotateCcw,
  UserPlus,
  Cpu,
  Receipt,
  AlertCircle,
  MessageSquare,
  Send,
} from 'lucide-react';
import {
  useJobCardDetailQuery,
  useJobCardActionMutation,
  useNotifyTechnicianWhatsAppMutation,
} from './job-cards.api';
import { useTechniciansQuery } from '../technicians/technicians.api';
import { useToast } from '../../providers/ToastProvider';
import { AssignTechnicianModal } from './components/AssignTechnicianModal';
import { CompleteJobCardModal } from './components/CompleteJobCardModal';
import { HoldStatusModal, extractHoldReason } from '../../components/ui/HoldStatusModal';
import { PauseCircle } from 'lucide-react';

export const JobCardDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const { data: jobCard, isLoading, isError, refetch } = useJobCardDetailQuery(id);
  const { data: techniciansData } = useTechniciansQuery({ limit: 100 });

  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [isCompleteOpen, setIsCompleteOpen] = useState(false);
  const [isHoldModalOpen, setIsHoldModalOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [whatsappFeedback, setWhatsappFeedback] = useState<{ type: 'success' | 'error'; message: string; directUrl?: string } | null>(null);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);

  const actionMutation = useJobCardActionMutation();
  const notifyWhatsAppMutation = useNotifyTechnicianWhatsAppMutation();

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-6 animate-pulse">
        <div className="h-8 bg-slate-200 rounded-lg w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-64 bg-slate-100 rounded-2xl md:col-span-2" />
          <div className="h-64 bg-slate-100 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (isError || !jobCard) {
    return (
      <div className="p-12 max-w-xl mx-auto text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">Job Card Not Found</h2>
        <p className="text-sm text-slate-700">The requested work order could not be loaded or does not exist.</p>
        <button
          type="button"
          onClick={() => navigate('/job-cards')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Job Cards
        </button>
      </div>
    );
  }

  const handleAction = async (action: 'accept' | 'start' | 'hold' | 'resume' | 'cancel' | 'reopen', reason?: string) => {
    setActionError(null);
    try {
      await actionMutation.mutateAsync({ id: jobCard.id, action, reason });
      refetch();
    } catch (err: any) {
      setActionError(err?.response?.data?.message || err.message || `Failed to perform ${action}`);
    }
  };

  const handleSendWhatsApp = async () => {
    if (notifyWhatsAppMutation.isPending || isSendingWhatsApp) return;
    setIsSendingWhatsApp(true);
    setWhatsappFeedback(null);
    try {
      const res = await notifyWhatsAppMutation.mutateAsync(jobCard.id);
      const resData = (res as any)?.data || res;
      if (res?.success) {
        const successMsg = res.message || resData?.message || `WhatsApp notification sent to ${jobCard.technicianName || 'technician'}!`;
        setWhatsappFeedback({
          type: 'success',
          message: successMsg,
          directUrl: resData?.directUrl,
        });
        toast.success(successMsg, 'WhatsApp Sent');
      } else {
        const errorMsg = res?.message || resData?.error || resData?.message || 'Failed to send WhatsApp notification';
        setWhatsappFeedback({
          type: 'error',
          message: errorMsg,
          directUrl: resData?.directUrl,
        });
        toast.error(errorMsg, 'WhatsApp Error');
      }
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || err?.message || 'WhatsApp notification failed';
      setWhatsappFeedback({
        type: 'error',
        message: errMsg,
      });
      toast.error(errMsg, 'WhatsApp Failed');
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SCHEDULED':
      case 'OPEN':
        return <span className="px-3 py-1 bg-slate-100 text-slate-700 font-bold rounded-full text-xs border border-slate-200">Scheduled</span>;
      case 'ASSIGNED':
      case 'ACCEPTED':
        return <span className="px-3 py-1 bg-blue-50 text-blue-700 font-bold rounded-full text-xs border border-blue-200">Assigned</span>;
      case 'STARTED':
      case 'DIAGNOSIS':
      case 'IN_PROGRESS':
        return <span className="px-3 py-1 bg-amber-50 text-amber-700 font-bold rounded-full text-xs border border-amber-200 animate-pulse">In Progress</span>;
      case 'ON_HOLD':
        return (
          <button
            type="button"
            onClick={() => setIsHoldModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-900 font-bold rounded-full text-xs border border-amber-300 hover:bg-amber-100 hover:border-amber-400 transition-all cursor-pointer shadow-xs group"
            title="Click to view hold status note"
          >
            <PauseCircle className="w-3.5 h-3.5 text-amber-600 group-hover:scale-110 transition-transform shrink-0" />
            <span>On Hold</span>
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
          </button>
        );
      case 'COMPLETED':
      case 'CLOSED':
        return <span className="px-3 py-1 bg-emerald-50 text-emerald-700 font-bold rounded-full text-xs border border-emerald-200">Completed</span>;
      case 'CANCELLED':
        return <span className="px-3 py-1 bg-rose-50 text-rose-700 font-bold rounded-full text-xs border border-rose-200">Cancelled</span>;
      default:
        return <span className="px-3 py-1 bg-slate-100 text-slate-700 font-bold rounded-full text-xs">{status}</span>;
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300">
      {/* Top Breadcrumb & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/job-cards')}
            className="p-2 border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-xl transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900">{jobCard.jobCardNumber}</h1>
              {getStatusBadge(jobCard.status)}
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 uppercase">
                {jobCard.priority} Priority
              </span>
            </div>
            <p className="text-xs text-slate-700 mt-0.5">
              Created on {new Date(jobCard.createdAt).toLocaleString()} · Service #{jobCard.serviceNumber}
            </p>
          </div>
        </div>

        {/* Dynamic Workflow Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Assign / Reassign */}
          <button
            type="button"
            onClick={() => setIsAssignOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4 text-indigo-600" />
            {jobCard.technicianId ? 'Reassign Tech' : 'Assign Tech'}
          </button>

          {/* Start Work */}
          {(jobCard.status === 'ASSIGNED' || jobCard.status === 'SCHEDULED') && (
            <button
              type="button"
              onClick={() => handleAction('start')}
              disabled={actionMutation.isPending}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              Start Work
            </button>
          )}

          {/* On Hold */}
          {(jobCard.status === 'IN_PROGRESS' || jobCard.status === 'STARTED') && (
            <button
              type="button"
              onClick={() => handleAction('hold', 'Waiting for spare parts / customer reschedule')}
              disabled={actionMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-orange-100 hover:bg-orange-200 text-orange-800 text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5" />
              Put On Hold
            </button>
          )}

          {/* Resume */}
          {jobCard.status === 'ON_HOLD' && (
            <button
              type="button"
              onClick={() => handleAction('resume')}
              disabled={actionMutation.isPending}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              Resume Work
            </button>
          )}

          {/* Complete */}
          {(jobCard.status === 'IN_PROGRESS' || jobCard.status === 'STARTED' || jobCard.status === 'ON_HOLD') && (
            <button
              type="button"
              onClick={() => setIsCompleteOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              Complete & Close
            </button>
          )}

          {/* Cancel */}
          {jobCard.status !== 'COMPLETED' && jobCard.status !== 'CLOSED' && jobCard.status !== 'CANCELLED' && (
            <button
              type="button"
              onClick={() => handleAction('cancel', 'Customer cancelled / duplicate order')}
              disabled={actionMutation.isPending}
              className="p-2 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
              title="Cancel Job Card"
            >
              <XCircle className="w-4 h-4" />
            </button>
          )}

          {/* Reopen */}
          {(jobCard.status === 'COMPLETED' || jobCard.status === 'CLOSED') && (
            <button
              type="button"
              onClick={() => handleAction('reopen', 'Customer reported recurrence / follow-up check')}
              disabled={actionMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Reopen Job
            </button>
          )}
        </div>
      </div>

      {/* On Hold Alert Banner */}
      {jobCard.status === 'ON_HOLD' && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/90 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm shadow-amber-500/20">
              <PauseCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-slate-900">Job Card is Currently On Hold</h4>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                  ON HOLD
                </span>
              </div>
              <p className="text-xs text-slate-700 mt-1 font-medium">
                {extractHoldReason(jobCard.technicianNotes || (jobCard as any).internalNotes).reason}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsHoldModalOpen(true)}
            className="px-3.5 py-1.5 rounded-xl bg-white border border-amber-300 text-amber-900 font-bold text-xs hover:bg-amber-100/70 transition-colors cursor-pointer shrink-0 shadow-xs"
          >
            View Hold Note
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Main Grid: Left 2 cols (Details & Execution), Right 1 col (Customer & Tech) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 spans) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Work Execution & Diagnosis */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-indigo-600" />
                <h2 className="text-base font-bold text-slate-900">Work Execution & Findings</h2>
              </div>
              {jobCard.completedAt && (
                <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  Completed on {new Date(jobCard.completedAt).toLocaleDateString()}
                </span>
              )}
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide block mb-1">
                  Problem Reported / Customer Complaint
                </label>
                <div className="p-3 bg-slate-50 rounded-xl text-slate-800 border border-slate-100 font-medium">
                  {jobCard.problemReported || 'None reported'}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide block mb-1">
                    Diagnosis / Root Cause
                  </label>
                  <div className="p-3 bg-slate-50 rounded-xl text-slate-800 border border-slate-100">
                    {jobCard.diagnosis || 'Pending on-site inspection'}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide block mb-1">
                    Work Executed
                  </label>
                  <div className="p-3 bg-slate-50 rounded-xl text-slate-800 border border-slate-100">
                    {jobCard.workPerformed || 'In progress / awaiting completion'}
                  </div>
                </div>
              </div>

              {/* Parts Replaced Table */}
              <div>
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide block mb-2">
                  Spare Parts Replaced
                </label>
                {jobCard.partsReplaced && Array.isArray(jobCard.partsReplaced) && jobCard.partsReplaced.length > 0 ? (
                  <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 font-semibold text-slate-600 border-b border-slate-200">
                        <tr>
                          <th className="p-2.5">Part Name</th>
                          <th className="p-2.5">Source</th>
                          <th className="p-2.5 text-center">Qty</th>
                          <th className="p-2.5 text-right">Unit Price</th>
                          <th className="p-2.5 text-center">Coverage</th>
                          <th className="p-2.5 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {jobCard.partsReplaced.map((part: any, i: number) => {
                          const pName = part.itemName || part.partName || 'Spare Part';
                          const isInv = Boolean(part.productId || part.inventoryItemId);
                          const uPrice = Number(part.unitPrice ?? part.price ?? 0);
                          const qVal = Number(part.quantity || 1);
                          const tVal = Number(part.lineTotal ?? part.totalPrice ?? (uPrice * qVal));
                          return (
                            <tr key={i}>
                              <td className="p-2.5 font-medium text-slate-900">{pName}</td>
                              <td className="p-2.5">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                    isInv
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                                  }`}
                                >
                                  {isInv ? 'Inventory' : 'Manual'}
                                </span>
                              </td>
                              <td className="p-2.5 text-center">{qVal}</td>
                              <td className="p-2.5 text-right">₹{uPrice.toFixed(2)}</td>
                              <td className="p-2.5 text-center">
                                {part.isWarrantyCovered ? (
                                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded-md text-[10px]">
                                    Warranty
                                  </span>
                                ) : (
                                  <span className="text-slate-700">Chargeable</span>
                                )}
                              </td>
                              <td className="p-2.5 text-right font-bold text-slate-900">
                                ₹{part.isWarrantyCovered ? '0.00' : tVal.toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-700 italic bg-slate-50 p-3 rounded-xl border border-slate-100">
                    No spare parts replaced for this service.
                  </p>
                )}
              </div>

              {/* Financial Charges Breakdown */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center gap-2 font-bold text-slate-900 mb-2">
                  <Receipt className="w-4 h-4 text-indigo-600" />
                  <span>Invoice & Charges Summary</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-700">Labor Charges:</span>
                  <span className="font-semibold text-slate-900">₹{parseFloat(jobCard.laborCharges || '0').toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-700">Parts Subtotal:</span>
                  <span className="font-semibold text-slate-900">₹{parseFloat(jobCard.partsCharges || '0').toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-sm font-black text-indigo-700 pt-2 border-t border-slate-200">
                  <span>Total Amount Due:</span>
                  <span>₹{parseFloat(jobCard.totalCharges || '0').toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>

              {/* Remarks */}
              {(jobCard.technicianNotes || jobCard.customerRemarks) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  {jobCard.technicianNotes && (
                    <div>
                      <span className="text-xs font-semibold text-slate-700 block mb-1">Technician Notes</span>
                      <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-100 whitespace-pre-line">
                        {jobCard.technicianNotes}
                      </p>
                    </div>
                  )}
                  {jobCard.customerRemarks && (
                    <div>
                      <span className="text-xs font-semibold text-slate-700 block mb-1">Customer Remarks</span>
                      <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-100 whitespace-pre-line">
                        {jobCard.customerRemarks}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column (1 span) */}
        <div className="space-y-6">
          {/* Customer & Service Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4 text-xs">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <User className="w-4 h-4 text-indigo-600" />
              <h3 className="font-bold text-slate-900 text-sm">Customer & Service</h3>
            </div>

            <div className="space-y-2">
              <div>
                <span className="text-slate-700 block">Customer Name</span>
                <span className="font-bold text-slate-900 text-sm">{jobCard.customerName}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-700">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span>{jobCard.customerPhone}</span>
              </div>
              {jobCard.customerEmail && (
                <div className="flex items-center gap-2 text-slate-700">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>{jobCard.customerEmail}</span>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-700">Service Number:</span>
                <span className="font-semibold text-slate-900">{jobCard.serviceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-700">Service Type:</span>
                <span className="font-semibold text-slate-900">{jobCard.serviceType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-700">Scheduled Date:</span>
                <span className="font-semibold text-slate-900">
                  {new Date(jobCard.scheduledDate).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          {/* Machine / Asset Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4 text-xs">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Cpu className="w-4 h-4 text-indigo-600" />
              <h3 className="font-bold text-slate-900 text-sm">Machine / RO Asset</h3>
            </div>

            <div className="space-y-2">
              <div>
                <span className="text-slate-700 block">Model</span>
                <span className="font-bold text-slate-900 text-sm">{jobCard.productName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-700">Serial Number:</span>
                <span className="font-mono font-semibold text-slate-900">{jobCard.serialNumber || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-700">Asset Tag:</span>
                <span className="font-mono text-slate-700">{jobCard.assetNumber}</span>
              </div>
            </div>

            {/* Warranty Badge */}
            <div className="pt-3 border-t border-slate-100">
              {jobCard.warrantyStatus === 'ACTIVE' ? (
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <div>
                    <div className="font-bold text-emerald-900">Active Warranty</div>
                    <div className="text-[11px] text-emerald-700">
                      Valid until {jobCard.warrantyEndDate ? new Date(jobCard.warrantyEndDate).toLocaleDateString() : 'N/A'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  <div>
                    <div className="font-semibold text-slate-700">No Active Warranty</div>
                    <div className="text-[11px] text-slate-700">Services & parts are chargeable</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Assigned Technician Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-sm">Assigned Technician</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAssignOpen(true)}
                className="text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
              >
                Change
              </button>
            </div>

            {jobCard.technicianName ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 font-bold text-sm flex items-center justify-center flex-shrink-0">
                    {jobCard.technicianName.charAt(0)}
                  </div>
                  <div>
                    <div className="font-bold text-slate-900">{jobCard.technicianName}</div>
                    <div className="text-slate-700 flex items-center gap-1 mt-0.5">
                      <Phone className="w-3 h-3 text-slate-400" />
                      {jobCard.technicianPhone}
                    </div>
                  </div>
                </div>

                {jobCard.technicianSkills && jobCard.technicianSkills.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-2 border-t border-slate-100">
                    {jobCard.technicianSkills.map((sk: any, idx: number) => (
                      <span key={idx} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-medium">
                        {sk}
                      </span>
                    ))}
                  </div>
                )}

                {/* WhatsApp Technician Notification Status & Manual Trigger */}
                <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 flex items-center gap-1 font-medium">
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                    WhatsApp Alert
                  </span>
                  <button
                    type="button"
                    onClick={handleSendWhatsApp}
                    disabled={notifyWhatsAppMutation.isPending || isSendingWhatsApp}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer border border-emerald-700 disabled:opacity-50"
                    title="Send WhatsApp assignment notification to technician"
                  >
                    <Send className="w-3 h-3" />
                    {notifyWhatsAppMutation.isPending || isSendingWhatsApp ? 'Sending...' : 'Notify WhatsApp'}
                  </button>
                </div>

                {whatsappFeedback && (
                  <div
                    className={`p-2 rounded-lg text-[11px] flex items-center justify-between gap-1.5 ${
                      whatsappFeedback.type === 'success'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="break-words">{whatsappFeedback.message}</span>
                    </div>
                    {whatsappFeedback.directUrl && (
                      <a
                        href={whatsappFeedback.directUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-2 py-0.5 rounded transition-colors text-[10px] shrink-0"
                        title="Open WhatsApp chat with technician"
                      >
                        <Send className="w-2.5 h-2.5" />
                        Open WhatsApp
                      </a>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-4 space-y-2">
                <p className="text-slate-700">No technician assigned yet.</p>
                <button
                  type="button"
                  onClick={() => setIsAssignOpen(true)}
                  className="px-3.5 py-1.5 bg-indigo-600 text-white rounded-xl font-semibold shadow-xs hover:bg-indigo-700 cursor-pointer inline-flex items-center gap-1"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Assign Now
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <AssignTechnicianModal
        isOpen={isAssignOpen}
        onClose={() => setIsAssignOpen(false)}
        jobCard={jobCard as any}
        technicians={techniciansData?.data || []}
      />

      <CompleteJobCardModal
        isOpen={isCompleteOpen}
        onClose={() => setIsCompleteOpen(false)}
        jobCard={jobCard as any}
      />

      <HoldStatusModal
        isOpen={isHoldModalOpen}
        onClose={() => setIsHoldModalOpen(false)}
        data={{
          serviceNumber: jobCard.serviceNumber,
          jobCardNumber: jobCard.jobCardNumber,
          technicianName: jobCard.technicianName,
          technicianPhone: jobCard.technicianPhone,
          customerName: jobCard.customerName,
          notes: jobCard.technicianNotes || (jobCard as any).internalNotes,
          updatedAt: jobCard.updatedAt,
        }}
      />
    </div>
  );
};
