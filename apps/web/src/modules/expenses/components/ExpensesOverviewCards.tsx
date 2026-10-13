import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Landmark,
  PiggyBank,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronRight,
  Receipt,
  Building2,
  Home,
  HandCoins,
  ShieldAlert,
  FileEdit,
  Repeat,
  ArrowRight,
  Lock,
  PlusCircle,
  History,
  Scale,
} from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { formatINR } from '../../../lib/formatters';
import type {
  ExpensesOverviewSummary,
  MonthlyReconciliationSummary,
  CashHandoverSummary,
} from '@crm/types';

export interface ExpensesOverviewCardsProps {
  overview?: ExpensesOverviewSummary;
  reconciliationSummary?: MonthlyReconciliationSummary;
  handoverSummary?: CashHandoverSummary;
  isLoading: boolean;
  isReconciliationLoading?: boolean;
  selectedYear: number;
  selectedMonth: number;
  onPeriodChange: (year: number, month: number) => void;
  onNavigateTab: (tabId: 'record' | 'history' | 'handover' | 'reconciliation') => void;
}

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

export const ExpensesOverviewCards: React.FC<ExpensesOverviewCardsProps> = ({
  overview,
  reconciliationSummary,
  handoverSummary,
  isLoading,
  isReconciliationLoading,
  selectedYear,
  selectedMonth,
  onPeriodChange,
  onNavigateTab,
}) => {
  // Navigation helpers for month switching
  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      onPeriodChange(selectedYear - 1, 12);
    } else {
      onPeriodChange(selectedYear, selectedMonth - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      onPeriodChange(selectedYear + 1, 1);
    } else {
      onPeriodChange(selectedYear, selectedMonth + 1);
    }
  };

  if (isLoading && isReconciliationLoading) {
    return (
      <div className="space-y-6">
        <div className="h-16 bg-white border border-slate-200/80 rounded-xl p-4 animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 bg-white border border-slate-200/80 rounded-xl p-4 animate-pulse">
              <div className="h-4 bg-slate-200 rounded w-1/2 mb-3" />
              <div className="h-8 bg-slate-200 rounded w-3/4 mb-2" />
              <div className="h-3 bg-slate-200 rounded w-2/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Authoritative Backend Reconciliation Metrics
  const leadProfit = reconciliationSummary?.leadProfit ?? 0;
  const serviceEarnings = reconciliationSummary?.serviceEarnings ?? leadProfit;
  const serviceRevenueBilled = reconciliationSummary?.serviceRevenueBilled ?? serviceEarnings;
  const servicePaymentsCollected = reconciliationSummary?.servicePaymentsCollected ?? 0;
  const totalExpenses = reconciliationSummary?.totalExpenses ?? (overview?.expensesThisMonth ?? 0);
  const businessExpenses = reconciliationSummary?.businessExpenses ?? totalExpenses;
  const homeExpenses = reconciliationSummary?.homeExpenses ?? 0;
  const monthlyProfit = reconciliationSummary?.monthlyProfit ?? (serviceEarnings - totalExpenses);
  const balanceAfterExpenses = reconciliationSummary?.balanceAfterExpenses ?? monthlyProfit;
  const previousClosingCash = reconciliationSummary?.previousClosingCash ?? 0;
  const expectedCashBeforeSavings = reconciliationSummary?.expectedCashBeforeSavings ?? (previousClosingCash + balanceAfterExpenses);
  const actualBankBalance = reconciliationSummary?.actualBankBalance ?? 0;
  const reconciliationDifference = reconciliationSummary?.reconciliationDifference ?? (actualBankBalance - expectedCashBeforeSavings);
  const savingsTransfer = reconciliationSummary?.savingsTransfer ?? 0;
  const currentSavingsBalance = reconciliationSummary?.currentSavingsBalance ?? (reconciliationSummary?.previousSavingsBalance ?? 0);
  const closingCash = reconciliationSummary?.closingCash ?? (expectedCashBeforeSavings - savingsTransfer);
  const isOpeningPeriod = reconciliationSummary?.isOpeningPeriod ?? false;
  const isClosed = reconciliationSummary?.isClosed ?? false;
  const closingStatus = reconciliationSummary?.closingRecord?.status ?? (isClosed ? 'APPROVED' : null);

  // Authoritative 4-Pillar Technician Cash Metrics
  const totalCollected = handoverSummary?.totalCollected ?? (overview?.pendingTechnicianCash ?? 0);
  const totalSubmitted = handoverSummary?.totalSubmitted ?? 0;
  const totalReceived = handoverSummary?.totalReceived ?? (overview?.cashReceivedByOwner ?? 0);
  const totalPending = handoverSummary?.totalPending ?? (overview?.pendingTechnicianCash ?? 0);
  const outstandingBalance = handoverSummary?.outstandingBalance ?? (totalCollected - totalReceived);

  // Channel Metrics from overview
  const cashExpensesTotal = overview?.cashExpensesTotal ?? 0;
  const nonCashExpensesTotal = overview?.nonCashExpensesTotal ?? 0;
  const shopCashMovementBalance = overview?.shopCashMovementBalance ?? (totalReceived - cashExpensesTotal);
  const activeSchedulesCount = overview?.activeSchedulesCount ?? 0;

  // Percentage calculations
  const totalOperating = totalExpenses > 0 ? totalExpenses : 1;
  const businessPercent = Math.round((businessExpenses / totalOperating) * 100);
  const homePercent = Math.max(0, 100 - businessPercent);

  // Top category distribution from categoryTotals
  const categoryTotals = reconciliationSummary?.categoryTotals || {};
  const sparePartsExpenses = categoryTotals['Spare Parts'] || 0;
  const sortedCategories = Object.entries(categoryTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const monthName = MONTH_NAMES[selectedMonth - 1] || 'Current Month';

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------------------------- */}
      {/* 1. EXECUTIVE PERIOD & STATUS COMMAND BAR                                */}
      {/* ---------------------------------------------------------------------- */}
      <Card className="p-4 sm:p-5 border-slate-200/90 shadow-2xs bg-surface">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Period Selector & Status */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200">
              <button
                type="button"
                onClick={handlePrevMonth}
                aria-label="Previous month"
                className="p-1.5 rounded-md hover:bg-white text-slate-600 hover:text-slate-900 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 text-xs font-bold font-mono text-slate-900 select-none">
                {monthName} {selectedYear}
              </span>
              <button
                type="button"
                onClick={handleNextMonth}
                aria-label="Next month"
                className="p-1.5 rounded-md hover:bg-white text-slate-600 hover:text-slate-900 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Closing Status Badge */}
            {closingStatus === 'APPROVED' ? (
              <Badge variant="success" dot className="px-2.5 py-1">
                <Lock className="w-3 h-3 mr-1 inline" />
                <span>Closed & Approved</span>
              </Badge>
            ) : closingStatus === 'DRAFT' ? (
              <Badge variant="warning" dot className="px-2.5 py-1">
                <FileEdit className="w-3 h-3 mr-1 inline" />
                <span>Draft Closing Saved</span>
              </Badge>
            ) : (
              <Badge variant="neutral" dot className="px-2.5 py-1">
                <Clock className="w-3 h-3 mr-1 inline" />
                <span>Active Operating Period</span>
              </Badge>
            )}

            {isOpeningPeriod && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                <ShieldAlert className="w-3 h-3 text-amber-600 shrink-0" />
                <span>Initial / Opening Period</span>
              </span>
            )}
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onNavigateTab('reconciliation')}
              className="text-xs"
            >
              <Landmark className="w-3.5 h-3.5 mr-1 text-slate-500" />
              <span>Reconciliation</span>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onNavigateTab('handover')}
              className="text-xs relative"
            >
              <HandCoins className="w-3.5 h-3.5 mr-1 text-slate-500" />
              <span>Field Cash</span>
              {totalPending > 0 && (
                <span className="ml-1 px-1.5 py-0.2 bg-amber-500 text-white rounded-full text-[10px] font-bold">
                  !
                </span>
              )}
            </Button>
            <Button
              size="sm"
              onClick={() => onNavigateTab('record')}
              className="text-xs"
            >
              <PlusCircle className="w-3.5 h-3.5 mr-1.5" />
              <span>Record Expense</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* ---------------------------------------------------------------------- */}
      {/* 2. CRITICAL WARNING BANNERS                                            */}
      {/* ---------------------------------------------------------------------- */}
      {isOpeningPeriod && (
        <div className="bg-amber-50 border border-amber-200/90 rounded-xl p-4 flex items-start gap-3 shadow-2xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-0.5">
            <h4 className="font-bold text-amber-900">Unestablished Opening Balance Warning</h4>
            <p className="text-amber-800 leading-relaxed">
              This financial period has no prior approved monthly closing to carry forward cash. Expected cash is
              operating with an initial unverified baseline (₹0.00). Once {monthName} {selectedYear} is formally
              closed, its verified balance will carry forward authoritatively.
            </p>
          </div>
        </div>
      )}

      {reconciliationDifference < 0 && (
        <div className="bg-rose-50 border border-rose-200/90 rounded-xl p-4 flex items-start gap-3 shadow-2xs">
          <TrendingDown className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-0.5 flex-1">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-rose-900">Reconciliation Shortfall Detected</h4>
              <button
                type="button"
                onClick={() => onNavigateTab('reconciliation')}
                className="text-rose-700 hover:text-rose-900 font-semibold underline text-[11px]"
              >
                Review Bank Details &rarr;
              </button>
            </div>
            <p className="text-rose-800 leading-relaxed">
              Actual bank balance ({formatINR(actualBankBalance)}) is{' '}
              <strong>{formatINR(Math.abs(reconciliationDifference))}</strong> lower than calculated expected cash (
              {formatINR(expectedCashBeforeSavings)}). Please verify unrecorded expenses, bank fees, or pending deposits.
            </p>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------- */}
      {/* 3. SIX-CARD EXECUTIVE FINANCIAL KPI MATRIX                             */}
      {/* ---------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* CARD 1: Total Service Earnings */}
        <Card className="p-4 sm:p-5 border-slate-200/90 hover:border-slate-300 transition-colors shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span className="font-semibold uppercase tracking-wider text-[11px]">Total Service Earnings</span>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-emerald-50 text-emerald-700">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>

            <div className="text-2xl sm:text-3xl font-extrabold font-mono tracking-tight text-emerald-700">
              {formatINR(serviceEarnings)}
            </div>

            <div className="mt-2 text-xs font-mono text-slate-600 space-y-0.5">
              <div className="flex justify-between">
                <span className="text-slate-400">Completed Services:</span>
                <span className="font-semibold text-slate-700">
                  {formatINR(serviceRevenueBilled)}
                  {reconciliationSummary?.completedServicesCount !== undefined && reconciliationSummary.completedServicesCount > 0 && (
                    <span className="text-[10px] font-normal text-slate-500 ml-1">
                      ({reconciliationSummary.completedServicesCount} {reconciliationSummary.completedServicesCount === 1 ? 'service' : 'services'})
                    </span>
                  )}
                </span>
              </div>
              {servicePaymentsCollected > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-400">Collected Cash:</span>
                  <span className="font-semibold text-emerald-700">{formatINR(servicePaymentsCollected)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Period: {monthName}</span>
            <span className="font-semibold text-emerald-700">Authoritative Gross Intake</span>
          </div>
        </Card>

        {/* CARD 2: Total Operating Expenses (Business vs Home) */}
        <Card className="p-4 sm:p-5 border-slate-200/90 hover:border-slate-300 transition-colors shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span className="font-semibold uppercase tracking-wider text-[11px]">Total Operating Expenses</span>
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-700">
                <Receipt className="w-4 h-4" />
              </div>
            </div>

            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono tracking-tight">
              {formatINR(totalExpenses)}
            </div>

            {/* Clear Segregation: Business vs Home Expenses + Spare Parts */}
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                  <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Business Expenses:</span>
                </span>
                <span className="font-mono font-bold text-slate-900">{formatINR(businessExpenses)}</span>
              </div>

              {sparePartsExpenses > 0 && (
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span className="text-slate-500 pl-4.5">↳ Spare Parts Cost:</span>
                  <span className="font-mono font-semibold text-slate-800">{formatINR(sparePartsExpenses)}</span>
                </div>
              )}

              <div className="flex items-center justify-between text-xs bg-amber-50/70 p-1 rounded-md border border-amber-200/60">
                <span className="inline-flex items-center gap-1 font-semibold text-amber-900">
                  <Home className="w-3.5 h-3.5 text-amber-700" />
                  <span>Home Expenses:</span>
                </span>
                <span className="font-mono font-bold text-amber-900">{formatINR(homeExpenses)}</span>
              </div>
            </div>
          </div>

          <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Split: {businessPercent}% Biz / {homePercent}% Home</span>
            <button
              type="button"
              onClick={() => onNavigateTab('history')}
              className="text-indigo-600 hover:text-indigo-800 font-semibold"
            >
              View History &rarr;
            </button>
          </div>
        </Card>

        {/* CARD 3: Balance After Recorded Expenses */}
        <Card className="p-4 sm:p-5 border-slate-200/90 hover:border-slate-300 transition-colors shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span className="font-semibold uppercase tracking-wider text-[11px]">Balance After Recorded Expenses</span>
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  balanceAfterExpenses >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                }`}
              >
                {balanceAfterExpenses >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              </div>
            </div>

            <div
              className={`text-2xl sm:text-3xl font-extrabold font-mono tracking-tight ${
                balanceAfterExpenses >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {formatINR(balanceAfterExpenses)}
            </div>

            <div className="mt-2 text-xs font-mono text-slate-600 space-y-0.5">
              <div className="flex justify-between">
                <span className="text-slate-400">Service Earnings:</span>
                <span className="font-semibold text-slate-700">{formatINR(serviceEarnings)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Total Recorded Expenses:</span>
                <span className="font-semibold text-rose-600">− {formatINR(totalExpenses)}</span>
              </div>
            </div>
          </div>

          <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Formula: Earnings − Expenses</span>
            <span
              className={`font-semibold ${
                balanceAfterExpenses >= 0 ? 'text-emerald-700' : 'text-rose-600'
              }`}
            >
              {balanceAfterExpenses >= 0 ? 'Positive Balance' : 'Operating Deficit'}
            </span>
          </div>
        </Card>

        {/* CARD 4: Actual Bank Balance & Reconciliation Variance */}
        <Card className="p-4 sm:p-5 border-slate-200/90 hover:border-slate-300 transition-colors shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span className="font-semibold uppercase tracking-wider text-[11px]">Actual Bank Balance</span>
              <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center text-teal-700">
                <Landmark className="w-4 h-4" />
              </div>
            </div>

            <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono tracking-tight">
              {formatINR(actualBankBalance)}
            </div>

            {/* Reconciliation Difference Badge */}
            <div className="mt-2">
              <div
                className={`flex items-center justify-between px-2.5 py-1 rounded-lg text-xs font-mono font-semibold border ${
                  reconciliationDifference > 0
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : reconciliationDifference < 0
                    ? 'bg-rose-50 text-rose-800 border-rose-200'
                    : 'bg-slate-100 text-slate-800 border-slate-200'
                }`}
              >
                <span>Difference:</span>
                <span>
                  {reconciliationDifference > 0 ? `+${formatINR(reconciliationDifference)} Surplus` : reconciliationDifference < 0 ? `−${formatINR(Math.abs(reconciliationDifference))} Shortfall` : '₹0.00 Reconciled'}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-400">Bank vs Expected</span>
            <button
              type="button"
              onClick={() => onNavigateTab('reconciliation')}
              className="text-teal-700 hover:text-teal-900 font-semibold"
            >
              Update Balance &rarr;
            </button>
          </div>
        </Card>

        {/* CARD 5: Savings Balance & Monthly Transfer */}
        <Card className="p-4 sm:p-5 border-slate-200/90 hover:border-slate-300 transition-colors shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span className="font-semibold uppercase tracking-wider text-[11px]">Savings Reserve Balance</span>
              <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center text-purple-700">
                <PiggyBank className="w-4 h-4" />
              </div>
            </div>

            <div className="text-2xl sm:text-3xl font-extrabold text-purple-950 font-mono tracking-tight">
              {formatINR(currentSavingsBalance)}
            </div>

            <div className="mt-2 text-xs font-mono text-slate-600 space-y-0.5">
              <div className="flex justify-between">
                <span className="text-slate-400">Monthly Transfer:</span>
                <span className="font-semibold text-purple-700">{formatINR(savingsTransfer)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Post-Transfer Cash:</span>
                <span className="font-semibold text-emerald-700">{formatINR(closingCash)}</span>
              </div>
            </div>
          </div>

          <div className="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Cumulative Reserve</span>
            <span className="font-semibold text-purple-700">Isolated Fund</span>
          </div>
        </Card>

        {/* CARD 6: Technician Cash 4 Pillars */}
        <Card className="p-4 sm:p-5 border-amber-200/90 bg-amber-50/20 hover:border-amber-300 transition-colors shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-amber-800 mb-2">
              <span className="font-semibold uppercase tracking-wider text-[11px]">Technician Field Cash</span>
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700">
                <HandCoins className="w-4 h-4" />
              </div>
            </div>

            <div className="text-2xl sm:text-3xl font-extrabold text-amber-950 font-mono tracking-tight">
              {formatINR(outstandingBalance)}
            </div>
            <p className="text-[11px] text-amber-700 mt-0.5">Total unconfirmed field cash balance</p>

            <div className="mt-2 text-[11px] font-mono space-y-1 bg-white/80 p-2 rounded-lg border border-amber-200/70">
              <div className="flex justify-between text-slate-700">
                <span>1. Collected:</span>
                <span className="font-bold">{formatINR(totalCollected)}</span>
              </div>
              <div className="flex justify-between text-indigo-700">
                <span>2. Submitted:</span>
                <span className="font-bold">{formatINR(totalSubmitted)}</span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>3. Confirmed:</span>
                <span className="font-bold">{formatINR(totalReceived)}</span>
              </div>
            </div>
          </div>

          <div className="pt-3 mt-3 border-t border-amber-200/60 flex items-center justify-between text-[11px]">
            <span className="text-amber-800 font-medium">Pending: {formatINR(totalPending)}</span>
            <button
              type="button"
              onClick={() => onNavigateTab('handover')}
              className="text-amber-900 hover:text-amber-950 font-bold underline"
            >
              Verify Handovers &rarr;
            </button>
          </div>
        </Card>
      </div>

      {/* ---------------------------------------------------------------------- */}
      {/* 4. FINANCIAL CLASSIFICATION & PAYMENT CHANNEL DIAGNOSTICS              */}
      {/* ---------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: Business vs Home Expenses Breakdown & Top Categories */}
        <Card className="p-5 border-slate-200/90 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Expense Classification & Categories</h3>
                <p className="text-xs text-slate-500">Separation of commercial business operations from home costs</p>
              </div>
              <Scale className="w-5 h-5 text-slate-400" />
            </div>

            {/* Segmented Ratio Bar */}
            <div className="space-y-1.5 mb-4">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-slate-700">Business: {formatINR(businessExpenses)} ({businessPercent}%)</span>
                <span className="font-semibold text-amber-800">Home: {formatINR(homeExpenses)} ({homePercent}%)</span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex border border-slate-200/70">
                <div
                  style={{ width: `${businessPercent}%` }}
                  className="bg-indigo-600 transition-all duration-300"
                  title={`Business Expenses: ${businessPercent}%`}
                />
                <div
                  style={{ width: `${homePercent}%` }}
                  className="bg-amber-500 transition-all duration-300"
                  title={`Home Expenses: ${homePercent}%`}
                />
              </div>
            </div>

            {/* Top Categories Ranking */}
            <div className="space-y-2">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Top Categories ({monthName})</h4>
              {sortedCategories.length === 0 ? (
                <p className="text-xs text-slate-400 py-3 text-center">No categorized expenses recorded in this period.</p>
              ) : (
                <div className="space-y-2">
                  {sortedCategories.map(([catName, catAmount]) => {
                    const isHome = catName.trim().toLowerCase() === 'home expenses';
                    const pctOfTotal = totalExpenses > 0 ? Math.round((catAmount / totalExpenses) * 100) : 0;
                    return (
                      <div
                        key={catName}
                        className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isHome ? 'bg-amber-500' : 'bg-indigo-600'
                            }`}
                          />
                          <span className="font-medium text-slate-800">{catName}</span>
                          {isHome && (
                            <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-200">
                              Home
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-slate-400 font-mono text-[11px]">{pctOfTotal}%</span>
                          <span className="font-bold font-mono text-slate-900">{formatINR(catAmount)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-[11px] text-slate-400">Non-deductible personal costs isolated cleanly</span>
            <button
              type="button"
              onClick={() => onNavigateTab('history')}
              className="text-indigo-600 hover:text-indigo-800 font-semibold text-xs flex items-center gap-1"
            >
              <span>Explore All Categories</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </Card>

        {/* RIGHT: Payment Channel Diagnostics & Shop Cash Flow */}
        <Card className="p-5 border-slate-200/90 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Payment Outflows & Cash Box Movement</h3>
                <p className="text-xs text-slate-500">Physical shop drawer vs digital banking outflow</p>
              </div>
              <Wallet className="w-5 h-5 text-slate-400" />
            </div>

            <div className="space-y-3">
              {/* Cash Box Outflow */}
              <div className="p-3 bg-amber-50/40 rounded-xl border border-amber-200/70">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-amber-900">Physical Cash Outflow (Shop Drawer)</span>
                  <span className="text-sm font-mono font-bold text-amber-950">{formatINR(cashExpensesTotal)}</span>
                </div>
                <p className="text-[11px] text-amber-800/90">
                  Expenses paid directly using counter cash-in-hand (petrol, local parts, petty cash).
                </p>
              </div>

              {/* Digital Outflow */}
              <div className="p-3 bg-blue-50/40 rounded-xl border border-blue-200/70">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-blue-900">Digital Outflow (UPI / Bank / Card)</span>
                  <span className="text-sm font-mono font-bold text-blue-950">{formatINR(nonCashExpensesTotal)}</span>
                </div>
                <p className="text-[11px] text-blue-800/90">
                  Transfers originating from current account; does not deplete physical counter cash.
                </p>
              </div>

              {/* Net Shop Cash Flow */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-800">Net Shop Cash Movement</span>
                  <span
                    className={`text-sm font-mono font-bold ${
                      shopCashMovementBalance >= 0 ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    {formatINR(shopCashMovementBalance)}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Authoritatively confirmed technician handovers ({formatINR(totalReceived)}) minus physical cash spent (
                  {formatINR(cashExpensesTotal)}).
                </p>
              </div>
            </div>
          </div>

          <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-[11px] text-slate-400">
              Active Recurring Schedules: <strong className="text-slate-700">{activeSchedulesCount}</strong>
            </span>
            <button
              type="button"
              onClick={() => onNavigateTab('reconciliation')}
              className="text-teal-700 hover:text-teal-900 font-semibold text-xs flex items-center gap-1"
            >
              <span>Audit Bank Differences</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </Card>
      </div>

      {/* ---------------------------------------------------------------------- */}
      {/* 5. CUMULATIVE & HISTORICAL RUN-RATE CARDS                              */}
      {/* ---------------------------------------------------------------------- */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-3.5 border-slate-200/80 shadow-2xs">
          <div className="text-[11px] font-semibold uppercase text-slate-400 mb-1">Expenses Today</div>
          <div className="text-lg font-bold font-mono text-slate-900">{formatINR(overview?.expensesToday ?? 0)}</div>
          <p className="text-[10px] text-slate-400 mt-0.5">Current calendar day</p>
        </Card>

        <Card className="p-3.5 border-slate-200/80 shadow-2xs">
          <div className="text-[11px] font-semibold uppercase text-slate-400 mb-1">Expenses This Week</div>
          <div className="text-lg font-bold font-mono text-slate-900">{formatINR(overview?.expensesThisWeek ?? 0)}</div>
          <p className="text-[10px] text-slate-400 mt-0.5">Monday–Sunday cycle</p>
        </Card>

        <Card className="p-3.5 border-slate-200/80 shadow-2xs">
          <div className="text-[11px] font-semibold uppercase text-slate-400 mb-1">Expenses This Month</div>
          <div className="text-lg font-bold font-mono text-slate-900">{formatINR(overview?.expensesThisMonth ?? totalExpenses)}</div>
          <p className="text-[10px] text-slate-400 mt-0.5">Current month burn</p>
        </Card>

        <Card className="p-3.5 border-slate-200/80 shadow-2xs">
          <div className="text-[11px] font-semibold uppercase text-slate-400 mb-1">Expenses YTD (Year)</div>
          <div className="text-lg font-bold font-mono text-slate-900">{formatINR(overview?.expensesThisYear ?? 0)}</div>
          <p className="text-[10px] text-slate-400 mt-0.5">Year-to-date total</p>
        </Card>
      </div>
    </div>
  );
};

export default ExpensesOverviewCards;
