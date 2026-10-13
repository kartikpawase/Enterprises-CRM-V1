import React, { useState, useMemo } from 'react';
import {
  User,
  CheckCircle2,
  Clock,
  ArrowDownToLine,
  HandCoins,
  AlertCircle,
  X,
  FileText,
  ShieldCheck,
  Calendar,
} from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { formatINR, formatDate } from '../../../lib/formatters';
import {
  useCashHandoverSummary,
  useCashHandovers,
  useMarkCashReceived,
  useBatchMarkCashReceived,
} from '../../payments/cash-handovers.api';
import type { CashHandoverItem } from '@crm/types';

export const TechnicianCashHandoverView: React.FC = () => {
  const [selectedTechId, setSelectedTechId] = useState<string | null>(null);
  const [selectedHandoverIds, setSelectedHandoverIds] = useState<string[]>([]);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'SUBMITTED' | 'RECEIVED'>('ALL');
  const [notes, setNotes] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Date filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const dateFilter = useMemo(() => {
    return {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    };
  }, [startDate, endDate]);

  const { data: summary, isLoading: isSummaryLoading, refetch: refetchSummary } = useCashHandoverSummary(dateFilter);

  // Fetch handovers with filter
  const { data: handoversData, isLoading: isHandoversLoading, refetch: refetchHandovers } = useCashHandovers({
    technicianId: selectedTechId || undefined,
    status: statusFilter,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    limit: 100,
  });

  const markSingleMutation = useMarkCashReceived();
  const markBatchMutation = useBatchMarkCashReceived();

  const technicianBreakdown = summary?.byTechnician || [];
  const allHandovers = handoversData?.items || [];
  const eligibleHandovers = allHandovers.filter((h) => h.status !== 'RECEIVED');

  // Currently selected technician details
  const activeTech = useMemo(() => {
    if (!selectedTechId) return null;
    return technicianBreakdown.find((t) => t.technicianId === selectedTechId) || null;
  }, [selectedTechId, technicianBreakdown]);

  // Selected records for batch receipt
  const selectedRecords = useMemo(() => {
    return allHandovers.filter((h) => selectedHandoverIds.includes(h.id));
  }, [allHandovers, selectedHandoverIds]);

  const amountBeingReceived = useMemo(() => {
    return selectedRecords.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  }, [selectedRecords]);

  const totalOutstandingForTech = activeTech ? (activeTech.outstandingBalance ?? activeTech.pending) : (summary?.outstandingBalance ?? summary?.totalPending ?? 0);
  const remainingOutstandingAmount = Math.max(0, totalOutstandingForTech - amountBeingReceived);

  const handleSelectAllForTech = (checked: boolean) => {
    if (checked) {
      setSelectedHandoverIds(eligibleHandovers.map((h) => h.id));
    } else {
      setSelectedHandoverIds([]);
    }
  };

  const handleToggleHandover = (id: string) => {
    setSelectedHandoverIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleOpenConfirm = () => {
    if (selectedHandoverIds.length === 0) return;
    setNotes('');
    setIsConfirmModalOpen(true);
  };

  const handleExecuteBatchConfirm = async () => {
    if (selectedHandoverIds.length === 0) return;
    setFeedback(null);

    try {
      if (selectedHandoverIds.length === 1) {
        await markSingleMutation.mutateAsync({
          id: selectedHandoverIds[0],
          payload: { notes: notes.trim() || undefined },
        });
      } else {
        await markBatchMutation.mutateAsync({
          handoverIds: selectedHandoverIds,
          notes: notes.trim() || undefined,
        });
      }

      setFeedback({
        type: 'success',
        message: `Successfully confirmed receipt of ${formatINR(amountBeingReceived)} across ${selectedHandoverIds.length} collection record(s).`,
      });
      setSelectedHandoverIds([]);
      setIsConfirmModalOpen(false);
      refetchSummary();
      refetchHandovers();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.response?.data?.error?.message || err?.message || 'Failed to confirm cash receipt.',
      });
    }
  };

  const handleSingleConfirmImmediate = async (handover: CashHandoverItem) => {
    setFeedback(null);
    try {
      await markSingleMutation.mutateAsync({
        id: handover.id,
      });
      setFeedback({
        type: 'success',
        message: `Confirmed receipt of ${formatINR(handover.amount)} from ${handover.technicianName || 'Technician'}.`,
      });
      refetchSummary();
      refetchHandovers();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.response?.data?.error?.message || err?.message || 'Failed to confirm cash receipt.',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Date & Status Filter Bar */}
      <Card className="p-4 border-slate-200/90 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-semibold text-slate-700">Filter Collections:</span>
          
          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as any);
                setSelectedHandoverIds([]);
              }}
              className="py-1 px-2.5 rounded-lg border border-slate-200 text-xs text-slate-700 focus:outline-none bg-white"
            >
              <option value="ALL">All Statuses</option>
              <option value="SUBMITTED">Submitted (Awaiting Confirmation)</option>
              <option value="PENDING">In Field (Unsubmitted)</option>
              <option value="RECEIVED">Confirmed Received</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">From</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="py-1 px-2.5 rounded-lg border border-slate-200 text-xs text-slate-700 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400">To</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="py-1 px-2.5 rounded-lg border border-slate-200 text-xs text-slate-700 focus:outline-none"
            />
          </div>
          {(startDate || endDate || statusFilter !== 'ALL') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStartDate('');
                setEndDate('');
                setStatusFilter('ALL');
              }}
              className="text-xs text-slate-500"
            >
              Reset Filters
            </Button>
          )}
        </div>

        <div className="text-[11px] text-slate-400 font-mono">
          Outstanding Cash = Field Collections − Confirmed Received
        </div>
      </Card>

      {/* Summary KPI Cards (4 Pillars) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Collected */}
        <Card className="p-4 border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Field Cash Collected</span>
            <HandCoins className="w-4 h-4 text-slate-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 font-mono">
            {formatINR(summary?.totalCollected || 0)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Total physical cash collected across all jobs</p>
        </Card>

        {/* Submitted for Handover */}
        <Card className="p-4 border-indigo-200/90 bg-indigo-50/20 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-indigo-800 mb-1">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Submitted for Handover</span>
            <ArrowDownToLine className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-extrabold text-indigo-900 font-mono">
            {formatINR(summary?.totalSubmitted || 0)}
          </div>
          <p className="text-[11px] text-indigo-700/80 mt-1">Handover submitted, awaiting Admin confirmation</p>
        </Card>

        {/* Confirmed Received */}
        <Card className="p-4 border-emerald-200/90 bg-emerald-50/20 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-emerald-800 mb-1">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Confirmed Received</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-900 font-mono">
            {formatINR(summary?.totalReceived || 0)}
          </div>
          <p className="text-[11px] text-emerald-700/80 mt-1">Physically verified & received by Owner/Admin</p>
        </Card>

        {/* Outstanding Balance */}
        <Card className="p-4 border-amber-200/90 bg-amber-50/30 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-amber-800 mb-1">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Outstanding Balance</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-extrabold text-amber-900 font-mono">
            {formatINR(summary?.outstandingBalance ?? summary?.totalPending ?? 0)}
          </div>
          <p className="text-[11px] text-amber-700/80 mt-1">Total unreceived cash in technician custody</p>
        </Card>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center gap-2.5 border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* SECTION 9: TECHNICIAN-WISE CASH-IN-HAND TABLE */}
      <Card className="overflow-hidden border border-slate-200/90 shadow-2xs">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Technician-Wise Cash-in-Hand</h3>
            <p className="text-xs text-slate-500">
              One row per technician showing field collections, submitted handovers, confirmed receipts, and outstanding balances.
            </p>
          </div>
          {selectedTechId && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setSelectedTechId(null);
                setSelectedHandoverIds([]);
              }}
              className="text-xs self-start sm:self-auto"
            >
              Show All Technicians
            </Button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-600 font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">Technician</th>
                <th className="py-3 px-4">Field Collected</th>
                <th className="py-3 px-4">Submitted</th>
                <th className="py-3 px-4">Confirmed Received</th>
                <th className="py-3 px-4">Outstanding Balance</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isSummaryLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={6} className="py-4 px-4">
                      <div className="h-4 bg-slate-100 rounded-sm w-full" />
                    </td>
                  </tr>
                ))
              ) : technicianBreakdown.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No cash collection records found for technicians.
                  </td>
                </tr>
              ) : (
                technicianBreakdown.map((t: any) => {
                  const isSelected = selectedTechId === t.technicianId;
                  const outstanding = t.outstandingBalance ?? t.pending ?? 0;
                  const isOutstanding = outstanding > 0;
                  return (
                    <tr
                      key={t.technicianId}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isSelected ? 'bg-primary-50/30' : ''
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-xs">
                            {t.technicianName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-bold text-slate-900">{t.technicianName}</span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono font-semibold text-slate-900">
                        {formatINR(t.collected)}
                      </td>

                      <td className="py-3.5 px-4 font-mono font-semibold text-indigo-700">
                        {formatINR(t.submitted || 0)}
                      </td>

                      <td className="py-3.5 px-4 font-mono font-semibold text-emerald-700">
                        {formatINR(t.received)}
                      </td>

                      <td className="py-3.5 px-4 font-mono font-bold">
                        <span className={isOutstanding ? 'text-amber-800' : 'text-slate-400'}>
                          {formatINR(outstanding)}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant={isSelected ? 'primary' : 'secondary'}
                            onClick={() => {
                              setSelectedTechId(isSelected ? null : t.technicianId);
                              setSelectedHandoverIds([]);
                            }}
                            className="text-xs"
                          >
                            {isSelected ? 'Viewing Collections' : 'View Collections'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* SECTION 10: COLLECTIONS BREAKDOWN & CONFIRMATION */}
      <Card className="overflow-hidden border border-slate-200/90 shadow-2xs">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {activeTech ? `Cash Collections for ${activeTech.technicianName}` : 'Cash Collections'}
            </h3>
            <p className="text-xs text-slate-500">
              Review and confirm physical cash receipt from technicians. Handovers with status "Submitted" are ready for verification.
            </p>
          </div>

          {selectedHandoverIds.length > 0 && (
            <div className="flex items-center gap-3 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
              <span className="text-xs font-semibold text-emerald-900">
                Selected: {selectedHandoverIds.length} ({formatINR(amountBeingReceived)})
              </span>
              <Button
                size="sm"
                onClick={handleOpenConfirm}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
              >
                Confirm Cash Received
              </Button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-600 font-semibold uppercase tracking-wider">
                <th className="py-3 px-4 w-10">
                  <input
                    type="checkbox"
                    checked={eligibleHandovers.length > 0 && selectedHandoverIds.length === eligibleHandovers.length}
                    onChange={(e) => handleSelectAllForTech(e.target.checked)}
                    disabled={eligibleHandovers.length === 0}
                    aria-label="Select all eligible collections"
                    className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                </th>
                <th className="py-3 px-4">Technician</th>
                <th className="py-3 px-4">Service / Job Card</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Collected Date</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isHandoversLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={8} className="py-4 px-4">
                      <div className="h-4 bg-slate-100 rounded-sm w-full" />
                    </td>
                  </tr>
                ))
              ) : allHandovers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                    <p className="font-semibold text-slate-700">No cash collection records matching filter</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      No collections found for the selected status and date range.
                    </p>
                  </td>
                </tr>
              ) : (
                allHandovers.map((h) => {
                  const isEligible = h.status !== 'RECEIVED';
                  const isSelected = selectedHandoverIds.includes(h.id);
                  return (
                    <tr
                      key={h.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isSelected ? 'bg-emerald-50/30' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleHandover(h.id)}
                          disabled={!isEligible}
                          aria-label={`Select collection ${h.id}`}
                          className="rounded border-slate-300 text-primary-600 focus:ring-primary-500 disabled:opacity-30"
                        />
                      </td>

                      <td className="py-3 px-4 font-semibold text-slate-900">
                        {h.technicianName || 'Technician'}
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-700">
                        {h.serviceNumber || h.jobCardNumber || h.serviceId || '—'}
                      </td>

                      <td className="py-3 px-4 text-slate-700">
                        {h.customerName || 'Customer'}
                      </td>

                      <td className="py-3 px-4 font-bold font-mono text-slate-900">
                        {formatINR(h.amount)}
                      </td>

                      <td className="py-3 px-4 font-mono text-slate-500">
                        {formatDate(h.collectedAt)}
                      </td>

                      <td className="py-3 px-4">
                        {h.status === 'RECEIVED' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Confirmed Received</span>
                          </span>
                        ) : h.status === 'SUBMITTED' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200">
                            <ArrowDownToLine className="w-3 h-3 text-indigo-600" />
                            <span>Awaiting Confirmation</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300">
                            <Clock className="w-3 h-3 text-amber-600" />
                            <span>In Field</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        {isEligible ? (
                          <Button
                            size="sm"
                            variant={h.status === 'SUBMITTED' ? 'primary' : 'secondary'}
                            onClick={() => handleSingleConfirmImmediate(h)}
                            disabled={markSingleMutation.isPending}
                            className={`text-xs ${
                              h.status === 'SUBMITTED'
                                ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                                : 'text-emerald-800 hover:text-emerald-900 hover:bg-emerald-50'
                            }`}
                          >
                            Confirm Receipt
                          </Button>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-mono">
                            Received by {h.receivedByName || 'Admin'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* CONFIRMATION MODAL (SECTION 10) */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-fast">
          <div className="bg-white rounded-xl shadow-modal w-full max-w-lg border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-emerald-50/60">
              <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <span>Owner Cash Handover Confirmation</span>
              </div>
              <button
                type="button"
                onClick={() => setIsConfirmModalOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600">
                You are confirming the physical receipt of cash collected by technician(s). This will update the
                handover state to <strong>RECEIVED</strong> with your Admin credentials and a server-verified
                timestamp.
              </p>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Technician:</span>
                  <span className="font-bold text-slate-900">
                    {activeTech ? activeTech.technicianName : `${new Set(selectedRecords.map((r) => r.technicianName)).size} Technician(s)`}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Selected Collections:</span>
                  <span className="font-mono font-semibold text-slate-800">
                    {selectedHandoverIds.length} collection record(s)
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                  <span className="text-slate-700 font-semibold">Amount Being Received:</span>
                  <span className="text-base font-extrabold text-emerald-700 font-mono">
                    {formatINR(amountBeingReceived)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Remaining Outstanding Balance:</span>
                  <span className="font-mono font-semibold text-amber-700">
                    {formatINR(remainingOutstandingAmount)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Handover Notes / Verification (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Received in cash box at shop counter..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full py-2 px-3 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setIsConfirmModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleExecuteBatchConfirm}
                  disabled={markBatchMutation.isPending || markSingleMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {markBatchMutation.isPending || markSingleMutation.isPending
                    ? 'Confirming Receipt...'
                    : `Confirm Receipt of ${formatINR(amountBeingReceived)}`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
