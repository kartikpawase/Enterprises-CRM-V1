import React, { useState, useEffect } from 'react';
import {
  Landmark,
  PiggyBank,
  AlertCircle,
  CheckCircle2,
  Lock,
  FileEdit,
  Save,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Info,
  Scale,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { formatINR, formatDate } from '../../../lib/formatters';
import {
  useMonthlyReconciliationQuery,
  useSaveMonthlyClosingDraftMutation,
  useApproveMonthlyClosingMutation,
} from '../expenses.api';
import { useAuth } from '../../../providers/AuthBoundary';
import { useToast } from '../../../providers/ToastProvider';

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const YEAR_OPTIONS = [
  { value: CURRENT_YEAR - 1, label: String(CURRENT_YEAR - 1) },
  { value: CURRENT_YEAR, label: String(CURRENT_YEAR) },
  { value: CURRENT_YEAR + 1, label: String(CURRENT_YEAR + 1) },
];

const MONTH_OPTIONS = MONTH_NAMES.map((name, index) => ({
  value: index + 1,
  label: `${name} (${index + 1})`,
}));

export interface BankReconciliationTabProps {
  initialYear?: number;
  initialMonth?: number;
  onPeriodChange?: (year: number, month: number) => void;
}

export const BankReconciliationTab: React.FC<BankReconciliationTabProps> = ({
  initialYear,
  initialMonth,
  onPeriodChange,
}) => {
  const { user, hasRole } = useAuth();
  const toast = useToast();

  const isAccountantOrAdmin =
    hasRole('Admin', 'Super Admin', 'Staff') || (user?.role as string) === 'Accountant';
  const isAdmin = hasRole('Admin', 'Super Admin');

  const [selectedYear, setSelectedYear] = useState<number>(initialYear ?? CURRENT_YEAR);
  const [selectedMonth, setSelectedMonth] = useState<number>(initialMonth ?? CURRENT_MONTH);

  useEffect(() => {
    if (initialYear !== undefined && initialYear !== selectedYear) {
      setSelectedYear(initialYear);
    }
  }, [initialYear]);

  useEffect(() => {
    if (initialMonth !== undefined && initialMonth !== selectedMonth) {
      setSelectedMonth(initialMonth);
    }
  }, [initialMonth]);

  // Form input states
  const [leadProfitInput, setLeadProfitInput] = useState<string>('0');
  const [actualBankBalanceInput, setActualBankBalanceInput] = useState<string>('0');
  const [savingsTransferInput, setSavingsTransferInput] = useState<string>('0');
  const [previousClosingCashInput, setPreviousClosingCashInput] = useState<string>('0');
  const [previousSavingsBalanceInput, setPreviousSavingsBalanceInput] = useState<string>('0');
  const [confirmOpeningBaseline, setConfirmOpeningBaseline] = useState<boolean>(false);
  const [notesInput, setNotesInput] = useState<string>('');
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState<boolean>(false);

  // Query server reconciliation summary
  const {
    data: summary,
    isLoading,
    isFetching,
    refetch,
  } = useMonthlyReconciliationQuery(
    {
      year: selectedYear,
      month: selectedMonth,
    },
    true
  );

  const saveDraftMutation = useSaveMonthlyClosingDraftMutation();
  const approveClosingMutation = useApproveMonthlyClosingMutation();

  // Sync inputs when summary is loaded or period changes
  useEffect(() => {
    if (summary) {
      setLeadProfitInput(String(summary.serviceEarnings ?? summary.leadProfit ?? 0));
      setActualBankBalanceInput(String(summary.actualBankBalance ?? 0));
      setSavingsTransferInput(String(summary.savingsTransfer ?? 0));
      setPreviousClosingCashInput(String(summary.previousClosingCash ?? 0));
      setPreviousSavingsBalanceInput(String(summary.previousSavingsBalance ?? 0));
      setConfirmOpeningBaseline(false);
      setNotesInput(summary.closingRecord?.notes ?? '');
      setIsDirty(false);
    }
  }, [summary, selectedYear, selectedMonth]);

  // Derived live preview calculations
  const isApproved = summary?.closingRecord?.status === 'APPROVED';
  const isOpeningPeriod = summary?.isOpeningPeriod ?? false;

  const parsedLeadProfit = parseFloat(leadProfitInput) || 0;
  const parsedActualBank = parseFloat(actualBankBalanceInput) || 0;
  const parsedSavingsTransfer = parseFloat(savingsTransferInput) || 0;

  const parsedPreviousClosingCash =
    isOpeningPeriod && !isApproved
      ? parseFloat(previousClosingCashInput) || 0
      : summary?.previousClosingCash ?? 0;

  const parsedPreviousSavingsBalance =
    isOpeningPeriod && !isApproved
      ? parseFloat(previousSavingsBalanceInput) || 0
      : summary?.previousSavingsBalance ?? 0;

  const totalExpenses = summary?.totalExpenses ?? 0;
  const liveMonthlyProfit = parsedLeadProfit - totalExpenses;
  const liveExpectedCash = parsedPreviousClosingCash + liveMonthlyProfit;
  const liveReconciliationDiff = parsedActualBank - liveExpectedCash;

  const liveCurrentSavingsBalance = parsedPreviousSavingsBalance + parsedSavingsTransfer;
  const liveClosingCash = liveExpectedCash - parsedSavingsTransfer;

  const nextMonth = selectedMonth === 12 ? 1 : selectedMonth + 1;
  const nextYear = selectedMonth === 12 ? selectedYear + 1 : selectedYear;

  const handleSaveDraft = async () => {
    if (!isAccountantOrAdmin) {
      toast.error('Only administrators and accountants can save reconciliation drafts.', 'Permission Denied');
      return;
    }

    if (isApproved) {
      toast.error('This period has been approved and closed. Changes are locked.', 'Period Locked');
      return;
    }

    try {
      await saveDraftMutation.mutateAsync({
        year: selectedYear,
        month: selectedMonth,
        leadProfit: parsedLeadProfit,
        actualBankBalance: parsedActualBank,
        savingsTransfer: parsedSavingsTransfer,
        previousClosingCash: isOpeningPeriod ? parsedPreviousClosingCash : undefined,
        previousSavingsBalance: isOpeningPeriod ? parsedPreviousSavingsBalance : undefined,
        confirmOpeningBaseline: isOpeningPeriod ? confirmOpeningBaseline : undefined,
        notes: notesInput.trim() || undefined,
      });

      toast.success(
        `Reconciliation draft for ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} saved successfully.`,
        'Draft Saved'
      );
      setIsDirty(false);
      refetch();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to save reconciliation draft.';
      toast.error(msg, 'Save Failed');
    }
  };

  const handleApproveClosing = async () => {
    if (!isAdmin) {
      toast.error('Only authorized administrators can approve and lock monthly closings.', 'Permission Denied');
      return;
    }

    if (isApproved) {
      toast.error('This period has already been approved and finalized.', 'Already Approved');
      return;
    }

    if (isOpeningPeriod && !confirmOpeningBaseline && parsedPreviousClosingCash === 0) {
      toast.error(
        'Please confirm that ₹0.00 is the authorized opening baseline before approving.',
        'Baseline Confirmation Required'
      );
      return;
    }

    try {
      await approveClosingMutation.mutateAsync({
        year: selectedYear,
        month: selectedMonth,
        leadProfit: parsedLeadProfit,
        actualBankBalance: parsedActualBank,
        savingsTransfer: parsedSavingsTransfer,
        previousClosingCash: isOpeningPeriod ? parsedPreviousClosingCash : undefined,
        previousSavingsBalance: isOpeningPeriod ? parsedPreviousSavingsBalance : undefined,
        confirmOpeningBaseline: isOpeningPeriod ? true : undefined,
        notes: notesInput.trim() || undefined,
      });

      toast.success(
        `Monthly close for ${MONTH_NAMES[selectedMonth - 1]} ${selectedYear} approved and locked. Balances carried forward to ${MONTH_NAMES[nextMonth - 1]} ${nextYear}.`,
        'Monthly Closing Approved & Locked'
      );
      setIsApproveModalOpen(false);
      setIsDirty(false);
      refetch();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Failed to approve monthly closing.';
      toast.error(msg, 'Approval Failed');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Filter and Status Bar */}
      <Card className="p-4 sm:p-5 border-slate-200/90 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200/60 flex items-center justify-center text-sky-700">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Monthly Bank Reconciliation & Savings
              </h2>
              <p className="text-xs text-slate-500">
                Compare actual current-account bank balance against expected operating cash and allocate savings reserves.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="w-28">
              <Select
                value={selectedYear}
                onChange={(e) => {
                  const newYear = Number(e.target.value);
                  setSelectedYear(newYear);
                  setIsDirty(false);
                  onPeriodChange?.(newYear, selectedMonth);
                }}
                options={YEAR_OPTIONS}
              />
            </div>
            <div className="w-36">
              <Select
                value={selectedMonth}
                onChange={(e) => {
                  const newMonth = Number(e.target.value);
                  setSelectedMonth(newMonth);
                  setIsDirty(false);
                  onPeriodChange?.(selectedYear, newMonth);
                }}
                options={MONTH_OPTIONS}
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading || isFetching}
              title="Refresh monthly data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Status Alerts */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">Status:</span>
            {isApproved ? (
              <Badge variant="success" className="gap-1">
                <Lock className="w-3 h-3" />
                Approved & Locked ({formatDate(summary?.closingRecord?.approvedAt)})
              </Badge>
            ) : summary?.closingRecord ? (
              <Badge variant="primary" className="gap-1">
                <FileEdit className="w-3 h-3" />
                Draft Saved ({formatDate(summary.closingRecord.updatedAt)})
              </Badge>
            ) : (
              <Badge variant="neutral">Unclosed / Active Draft</Badge>
            )}

            {isOpeningPeriod && (
              <Badge variant="warning" className="gap-1">
                <AlertCircle className="w-3 h-3" />
                Opening Baseline Period
              </Badge>
            )}
          </div>

          {isDirty && !isApproved && (
            <span className="text-amber-600 font-medium flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              Unsaved draft changes (previewing live)
            </span>
          )}
        </div>
      </Card>

      {/* Advisory Banners */}
      {isOpeningPeriod && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900 flex items-start gap-3 shadow-2xs">
          <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-amber-950">Opening Baseline Period</p>
            <p>
              No prior approved monthly closing exists for this company. The opening cash balance is an unestablished baseline.
              Enter verified opening operating cash and savings reserves below, or confirm a zero baseline upon formal approval.
            </p>
          </div>
        </div>
      )}

      {isApproved && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs text-emerald-900 flex items-start gap-3 shadow-2xs">
          <Lock className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-emerald-950">Period Formally Approved & Locked</p>
            <p>
              This monthly record was approved on {formatDate(summary?.closingRecord?.approvedAt)} by{' '}
              <span className="font-semibold">
                {summary?.closingRecord?.approvedByName || summary?.closingRecord?.approvedBy || 'Administrator'}
              </span>
              . All financial figures are frozen to preserve accounting history and prevent unauthorized alterations. Balances have carried forward to {MONTH_NAMES[nextMonth - 1]} {nextYear}.
            </p>
          </div>
        </div>
      )}

      {/* Grid of Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: Operating Books Baseline */}
        <Card className="p-5 border-slate-200/90 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Scale className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-900">1. Operating Books Baseline</h3>
            </div>
            <Badge variant="neutral">Formula</Badge>
          </div>

          <div className="space-y-3 text-xs">
            {/* Lead Profit */}
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Total Service Earnings (Gross):</span>
              {isApproved || !isAccountantOrAdmin ? (
                <span className="font-semibold text-slate-900">{formatINR(parsedLeadProfit)}</span>
              ) : (
                <div className="w-32">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={leadProfitInput}
                    onChange={(e) => {
                      setLeadProfitInput(e.target.value);
                      setIsDirty(true);
                    }}
                    className="h-8 text-right text-xs"
                    disabled={isApproved || !isAccountantOrAdmin}
                  />
                </div>
              )}
            </div>

            {/* Total Expenses */}
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Total Operating Expenses:</span>
              <span className="font-semibold text-danger-700">− {formatINR(totalExpenses)}</span>
            </div>

            {/* Monthly Profit */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="font-medium text-slate-700">Balance After Recorded Expenses:</span>
              <span className={`font-bold ${liveMonthlyProfit >= 0 ? 'text-emerald-700' : 'text-danger-700'}`}>
                {formatINR(liveMonthlyProfit)}
              </span>
            </div>

            {/* Previous Closing Cash */}
            <div className="flex items-center justify-between">
              <span className="text-slate-600">
                {isOpeningPeriod ? 'Opening Operating Cash (Baseline):' : 'Previous Closing Cash:'}
              </span>
              {isOpeningPeriod && !isApproved && isAccountantOrAdmin ? (
                <div className="w-32">
                  <Input
                    type="number"
                    step="0.01"
                    value={previousClosingCashInput}
                    onChange={(e) => {
                      setPreviousClosingCashInput(e.target.value);
                      setIsDirty(true);
                    }}
                    className="h-8 text-right text-xs"
                    disabled={isApproved}
                  />
                </div>
              ) : (
                <span className="font-medium text-slate-900">+ {formatINR(parsedPreviousClosingCash)}</span>
              )}
            </div>

            {/* Expected Cash Before Savings */}
            <div className="pt-3 border-t border-slate-200 bg-slate-50/80 -mx-5 -mb-4 p-4 rounded-b-xl">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900">Expected Cash (Pre-Savings):</span>
                <span className="text-sm font-extrabold text-indigo-700">
                  {formatINR(liveExpectedCash)}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Expected cash = Previous Closing Cash + Monthly Profit.
              </p>
            </div>
          </div>
        </Card>

        {/* Column 2: Bank Reconciliation */}
        <Card className="p-5 border-slate-200/90 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Landmark className="w-4 h-4 text-sky-600" />
              <h3 className="text-sm font-bold text-slate-900">2. Bank Reconciliation</h3>
            </div>
            <Badge variant="primary">Current Account</Badge>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Actual Bank Balance (Current A/c)
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={actualBankBalanceInput}
                onChange={(e) => {
                  setActualBankBalanceInput(e.target.value);
                  setIsDirty(true);
                }}
                disabled={isApproved || !isAccountantOrAdmin}
                placeholder="0.00"
                helperText="Enter verified bank balance at end of reporting period."
              />
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Expected Operating Cash:</span>
                <span className="font-medium text-slate-900">{formatINR(liveExpectedCash)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Actual Bank Balance:</span>
                <span className="font-medium text-slate-900">{formatINR(parsedActualBank)}</span>
              </div>
            </div>

            {/* Reconciliation Difference Card */}
            <div
              className={`p-4 rounded-xl border transition-all ${
                liveReconciliationDiff > 0
                  ? 'border-emerald-200 bg-emerald-50/50'
                  : liveReconciliationDiff < 0
                  ? 'border-red-200 bg-red-50/50'
                  : 'border-slate-200 bg-slate-50/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800">Reconciliation Difference:</span>
                <span
                  className={`text-sm font-extrabold ${
                    liveReconciliationDiff > 0
                      ? 'text-emerald-700'
                      : liveReconciliationDiff < 0
                      ? 'text-red-700'
                      : 'text-slate-700'
                  }`}
                >
                  {liveReconciliationDiff > 0 ? `+${formatINR(liveReconciliationDiff)}` : formatINR(liveReconciliationDiff)}
                </span>
              </div>

              <div className="mt-2 flex items-center gap-2">
                {liveReconciliationDiff > 0 ? (
                  <Badge variant="success" className="gap-1">
                    <TrendingUp className="w-3 h-3" />
                    Surplus in Bank
                  </Badge>
                ) : liveReconciliationDiff < 0 ? (
                  <Badge variant="danger" className="gap-1">
                    <TrendingDown className="w-3 h-3" />
                    Shortfall in Bank
                  </Badge>
                ) : (
                  <Badge variant="neutral" className="gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Perfect Balance
                  </Badge>
                )}
              </div>

              <p className="text-[11px] text-slate-600 mt-2 leading-relaxed">
                {liveReconciliationDiff > 0
                  ? `Bank balance exceeds expected cash books by ${formatINR(liveReconciliationDiff)}.`
                  : liveReconciliationDiff < 0
                  ? `Bank balance is lower than expected cash books by ${formatINR(Math.abs(liveReconciliationDiff))}.`
                  : 'Bank account matches expected cash records exactly.'}
              </p>
            </div>

            <div className="rounded-lg bg-sky-50/60 border border-sky-200/50 p-2.5 flex items-start gap-2 text-[11px] text-sky-900">
              <Info className="w-3.5 h-3.5 text-sky-600 shrink-0 mt-0.5" />
              <span>
                <strong>Non-conversion rule:</strong> The reconciliation difference is an audit comparison metric. It is
                <strong> never converted into an expense</strong> or deducted from CRM profit.
              </span>
            </div>
          </div>
        </Card>

        {/* Column 3: Savings Allocation */}
        <Card className="p-5 border-slate-200/90 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <PiggyBank className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">3. Savings Reserve</h3>
            </div>
            <Badge variant="success">Liquidity Transfer</Badge>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Monthly Transfer to Savings
              </label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={savingsTransferInput}
                onChange={(e) => {
                  setSavingsTransferInput(e.target.value);
                  setIsDirty(true);
                }}
                disabled={isApproved || !isAccountantOrAdmin}
                placeholder="0.00"
                helperText="Internal capital transfer from current account to savings."
              />
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">
                  {isOpeningPeriod ? 'Opening Savings (Baseline):' : 'Previous Savings Balance:'}
                </span>
                {isOpeningPeriod && !isApproved && isAccountantOrAdmin ? (
                  <div className="w-32">
                    <Input
                      type="number"
                      step="0.01"
                      value={previousSavingsBalanceInput}
                      onChange={(e) => {
                        setPreviousSavingsBalanceInput(e.target.value);
                        setIsDirty(true);
                      }}
                      className="h-8 text-right text-xs"
                      disabled={isApproved}
                    />
                  </div>
                ) : (
                  <span className="font-medium text-slate-900">{formatINR(parsedPreviousSavingsBalance)}</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Current Month's Transfer:</span>
                <span className="font-semibold text-emerald-700">+ {formatINR(parsedSavingsTransfer)}</span>
              </div>
              <div className="flex items-center justify-between pt-1 font-bold text-slate-800">
                <span>Current Savings Balance:</span>
                <span className="text-emerald-700 font-extrabold">{formatINR(liveCurrentSavingsBalance)}</span>
              </div>
            </div>

            {/* Closing Cash Summary */}
            <div className="pt-3 border-t border-slate-200 bg-slate-50/80 -mx-5 -mb-4 p-4 rounded-b-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900">Final Closing Operating Cash:</span>
                <span className="text-sm font-extrabold text-slate-900">
                  {formatINR(liveClosingCash)}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Closing Cash = Expected Cash Before Savings − Savings Transfer.
              </p>
            </div>

            <div className="rounded-lg bg-emerald-50/60 border border-emerald-200/50 p-2.5 flex items-start gap-2 text-[11px] text-emerald-900">
              <Info className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong>Accounting isolation:</strong> Savings transfers are capital reserve allocations. They are
                <strong> not operating expenses</strong>, income, or new customer revenue.
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Next Month Balance Carry-Forward Section */}
      <Card className="p-5 border-slate-200/90 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200/60 flex items-center justify-center text-indigo-700">
              <ArrowRight className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900">
                  Next Month Balance Carry-Forward
                </h3>
                {isApproved ? (
                  <Badge variant="success" className="gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Authoritative Carry-Forward
                  </Badge>
                ) : (
                  <Badge variant="neutral" className="gap-1">
                    <Info className="w-3 h-3" />
                    Provisional (Draft)
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Target Period: <strong>{MONTH_NAMES[nextMonth - 1]} {nextYear}</strong>
              </p>
            </div>
          </div>
          <div className="text-xs text-slate-500 max-w-sm sm:text-right">
            {isApproved ? (
              <span className="text-emerald-700 font-medium">
                Approved figures establish opening balances for {MONTH_NAMES[nextMonth - 1]} {nextYear}.
              </span>
            ) : (
              <span className="text-slate-500">
                Draft values do not affect next month. Formal administrator approval is required to carry forward balances.
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
          <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
            <span className="text-xs text-slate-500 block">Next Month Opening Operating Cash:</span>
            <span className="text-lg font-bold text-slate-900 mt-1 block">
              {formatINR(liveClosingCash)}
            </span>
            <span className="text-[11px] text-slate-500 mt-0.5 block">
              = Closing Cash (Expected Cash Before Savings − Savings Transfer)
            </span>
          </div>

          <div className="p-3.5 rounded-xl border border-emerald-200/70 bg-emerald-50/40">
            <span className="text-xs text-emerald-800 block">Next Month Opening Savings Balance:</span>
            <span className="text-lg font-bold text-emerald-800 mt-1 block">
              {formatINR(liveCurrentSavingsBalance)}
            </span>
            <span className="text-[11px] text-emerald-700 mt-0.5 block">
              = Current Savings Balance (Previous Savings + Monthly Transfer)
            </span>
          </div>
        </div>
      </Card>

      {/* Draft Notes and Actions */}
      <Card className="p-5 border-slate-200/90 shadow-2xs">
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Auditor / Closing Notes
            </label>
            <Textarea
              value={notesInput}
              onChange={(e) => {
                setNotesInput(e.target.value);
                setIsDirty(true);
              }}
              disabled={isApproved || !isAccountantOrAdmin}
              placeholder="Add optional notes regarding bank statement date, variances, or savings transfers..."
              rows={2}
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
            <div className="text-xs text-slate-500">
              {!isAccountantOrAdmin ? (
                <span className="text-amber-600 font-medium flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4" />
                  Read-only view: You must be an administrator or accountant to manage monthly closing.
                </span>
              ) : isApproved ? (
                <span className="text-slate-600 flex items-center gap-1.5 font-medium">
                  <Lock className="w-4 h-4 text-emerald-600" />
                  This month has been formally approved and locked. Further edits or draft modifications are disabled.
                </span>
              ) : (
                <span>
                  Edits are previewed in real-time. Save a draft to persist changes, or approve to permanently lock and carry forward balances.
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                onClick={handleSaveDraft}
                disabled={!isAccountantOrAdmin || isApproved || saveDraftMutation.isPending || approveClosingMutation.isPending}
                className="sm:w-auto"
              >
                <Save className={`w-4 h-4 mr-1.5 ${saveDraftMutation.isPending ? 'animate-spin' : ''}`} />
                <span>{saveDraftMutation.isPending ? 'Saving Draft...' : 'Save Draft'}</span>
              </Button>

              <Button
                variant="primary"
                onClick={() => setIsApproveModalOpen(true)}
                disabled={!isAdmin || isApproved || saveDraftMutation.isPending || approveClosingMutation.isPending}
                className="sm:w-auto bg-emerald-700 hover:bg-emerald-800 text-white"
              >
                <Lock className="w-4 h-4 mr-1.5" />
                <span>Approve & Lock Period</span>
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Approval Confirmation Modal */}
      <Modal
        isOpen={isApproveModalOpen}
        onClose={() => setIsApproveModalOpen(false)}
        title={
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-emerald-600" />
            <span>Approve & Lock Monthly Closing</span>
          </div>
        }
        size="lg"
      >
        <div className="space-y-4 text-xs">
          <p className="text-slate-600">
            You are about to formally approve the monthly closing for{' '}
            <strong>{MONTH_NAMES[selectedMonth - 1]} {selectedYear}</strong>.
            Review the final financial figures below before confirming.
          </p>

          {/* Breakdown Table */}
          <div className="rounded-xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
            <div className="grid grid-cols-2 p-2.5 bg-slate-50/80 font-medium">
              <span className="text-slate-700">Financial Metric</span>
              <span className="text-right text-slate-700">Amount</span>
            </div>
            <div className="grid grid-cols-2 p-2.5">
              <span className="text-slate-600">Total Service Earnings (Gross)</span>
              <span className="text-right font-semibold text-slate-900">{formatINR(parsedLeadProfit)}</span>
            </div>
            <div className="grid grid-cols-2 p-2.5">
              <span className="text-slate-600">Total Recorded Operating Expenses</span>
              <span className="text-right font-semibold text-danger-700">− {formatINR(totalExpenses)}</span>
            </div>
            <div className="grid grid-cols-2 p-2.5 bg-slate-50/50">
              <span className="font-semibold text-slate-800">Balance After Recorded Expenses</span>
              <span className={`text-right font-bold ${liveMonthlyProfit >= 0 ? 'text-emerald-700' : 'text-danger-700'}`}>
                {formatINR(liveMonthlyProfit)}
              </span>
            </div>
            <div className="grid grid-cols-2 p-2.5">
              <span className="text-slate-600">Opening Operating Cash</span>
              <span className="text-right font-semibold text-slate-900">+ {formatINR(parsedPreviousClosingCash)}</span>
            </div>
            <div className="grid grid-cols-2 p-2.5 bg-slate-50/50">
              <span className="font-semibold text-slate-800">Expected Operating Cash (Pre-Savings)</span>
              <span className="text-right font-bold text-indigo-700">{formatINR(liveExpectedCash)}</span>
            </div>
            <div className="grid grid-cols-2 p-2.5">
              <span className="text-slate-600">Verified Bank Balance (Current A/c)</span>
              <span className="text-right font-semibold text-slate-900">{formatINR(parsedActualBank)}</span>
            </div>
            <div className="grid grid-cols-2 p-2.5">
              <span className="text-slate-600">Bank Reconciliation Difference</span>
              <span className={`text-right font-bold ${liveReconciliationDiff >= 0 ? 'text-emerald-700' : 'text-danger-700'}`}>
                {liveReconciliationDiff >= 0 ? `+${formatINR(liveReconciliationDiff)}` : formatINR(liveReconciliationDiff)}
              </span>
            </div>
            <div className="grid grid-cols-2 p-2.5">
              <span className="text-slate-600">Savings Reserve Transfer</span>
              <span className="text-right font-semibold text-emerald-700">− {formatINR(parsedSavingsTransfer)}</span>
            </div>
            <div className="grid grid-cols-2 p-3 bg-emerald-50/70 font-bold border-t border-emerald-200">
              <span className="text-emerald-950">Closing Operating Cash (Carries Forward)</span>
              <span className="text-right text-emerald-950 text-sm font-extrabold">{formatINR(liveClosingCash)}</span>
            </div>
            <div className="grid grid-cols-2 p-3 bg-emerald-50/40 font-bold">
              <span className="text-emerald-900">Current Savings Balance (Carries Forward)</span>
              <span className="text-right text-emerald-900 text-sm font-extrabold">{formatINR(liveCurrentSavingsBalance)}</span>
            </div>
          </div>

          {/* Unestablished Opening Baseline Warning if opening period */}
          {isOpeningPeriod && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2">
              <div className="font-semibold text-amber-950 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                Unestablished Opening Baseline Acknowledgment
              </div>
              <p className="text-amber-900 leading-relaxed text-[11px]">
                This company has no prior approved closing. By approving this period, you establish{' '}
                <strong>₹{formatINR(parsedPreviousClosingCash)}</strong> as the authoritative opening operating cash baseline.
              </p>
              <label className="flex items-start gap-2 pt-1 text-amber-950 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmOpeningBaseline}
                  onChange={(e) => setConfirmOpeningBaseline(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded text-indigo-600 border-amber-400 focus:ring-indigo-500"
                />
                <span className="text-xs">
                  I confirm that {formatINR(parsedPreviousClosingCash)} is the verified opening baseline for this period.
                </span>
              </label>
            </div>
          )}

          {/* Immutability Warning */}
          <div className="rounded-xl border border-red-200 bg-red-50/70 p-3 text-red-950 space-y-1">
            <p className="font-bold flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-red-700" />
              Permanent Period Lock Notice
            </p>
            <p className="text-[11px] leading-relaxed text-red-900">
              Once approved, all financial figures for {MONTH_NAMES[selectedMonth - 1]} {selectedYear} are permanently frozen.
              Draft modifications, re-approvals, or recalculations based on subsequent expense edits will be blocked.
              Balances will authoritatively carry forward into {MONTH_NAMES[nextMonth - 1]} {nextYear}.
            </p>
          </div>

          {/* Approver Audit Metadata */}
          <div className="text-[11px] text-slate-500 pt-1 flex items-center justify-between border-t border-slate-100">
            <span>Approver: <strong>{user?.displayName || user?.username || 'Administrator'}</strong></span>
            <span>Target: <strong>{MONTH_NAMES[nextMonth - 1]} {nextYear} Carry-Forward</strong></span>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <Button
              variant="secondary"
              onClick={() => setIsApproveModalOpen(false)}
              disabled={approveClosingMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleApproveClosing}
              disabled={
                approveClosingMutation.isPending ||
                (isOpeningPeriod && !confirmOpeningBaseline && parsedPreviousClosingCash === 0)
              }
              className="bg-emerald-700 hover:bg-emerald-800 text-white"
            >
              <Lock className={`w-4 h-4 mr-1.5 ${approveClosingMutation.isPending ? 'animate-spin' : ''}`} />
              <span>{approveClosingMutation.isPending ? 'Finalizing Close...' : 'Confirm Approval & Lock Period'}</span>
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
