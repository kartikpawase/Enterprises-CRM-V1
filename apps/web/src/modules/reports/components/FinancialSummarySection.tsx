import React from 'react';
import {
  DollarSign,
  TrendingUp,
  Receipt,
  Layers,
  HandCoins,
  ArrowDownToLine,
  Clock,
  Wallet,
} from 'lucide-react';
import { formatCurrency } from '../../../lib/formatters';
import type { FinancialSummaryReport } from '@crm/types';

interface FinancialSummarySectionProps {
  financialData?: FinancialSummaryReport;
  isLoading?: boolean;
}

export const FinancialSummarySection: React.FC<FinancialSummarySectionProps> = ({
  financialData,
  isLoading,
}) => {
  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5">
        <div className="animate-pulse space-y-4">
          <div className="h-5 bg-slate-200 rounded w-1/4"></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-20 bg-slate-100 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const {
    totalServiceRevenue = 0,
    totalCustomerPaymentsReceived = 0,
    totalExpenses = 0,
    cogsAmount = 0,
    grossProfit = 0,
    netProfit = 0,
    cashCollectedByTechnicians = 0,
    cashHandedOverToOwner = 0,
    pendingTechnicianCash = 0,
    shopCashMovementBalance = 0,
  } = financialData || {};

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <DollarSign className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Authoritative Financial Summary</h2>
            <p className="text-xs text-slate-500">
              Reconciled across service invoices, customer payments, operating expenses, and cash handovers
            </p>
          </div>
        </div>
        <div className="text-xs font-medium text-slate-400">
          Period: <span className="text-slate-700 font-semibold">{financialData?.period || 'Selected Range'}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Service Revenue */}
        <div className="p-4 rounded-xl border border-slate-200/90 bg-slate-50/50 hover:bg-slate-50 transition-colors">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Total Service Revenue</span>
            <Receipt className="w-4 h-4 text-primary-600" />
          </div>
          <div className="text-xl font-bold text-slate-900 font-mono">
            {formatCurrency(totalServiceRevenue)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Authoritative service billing issued</p>
        </div>

        {/* Customer Payments Received */}
        <div className="p-4 rounded-xl border border-blue-200/80 bg-blue-50/30 hover:bg-blue-50/50 transition-colors">
          <div className="flex items-center justify-between text-xs text-blue-700 mb-1.5">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Payments Collected</span>
            <ArrowDownToLine className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-xl font-bold text-blue-900 font-mono">
            {formatCurrency(totalCustomerPaymentsReceived)}
          </div>
          <p className="text-[11px] text-blue-600/80 mt-1">Actual customer transactions realized</p>
        </div>

        {/* Operating Expenses */}
        <div className="p-4 rounded-xl border border-rose-200/80 bg-rose-50/30 hover:bg-rose-50/50 transition-colors">
          <div className="flex items-center justify-between text-xs text-rose-700 mb-1.5">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Operating Expenses</span>
            <Wallet className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-xl font-bold text-rose-900 font-mono">
            {formatCurrency(totalExpenses)}
          </div>
          <p className="text-[11px] text-rose-600/80 mt-1">Rent, fuel, bills, supplies & tools</p>
        </div>

        {/* Net Operating Surplus */}
        <div className={`p-4 rounded-xl border transition-colors ${netProfit >= 0 ? 'border-emerald-200/90 bg-emerald-50/40 hover:bg-emerald-50/60' : 'border-rose-300 bg-rose-50/40 hover:bg-rose-50/60'}`}>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className={`font-semibold uppercase tracking-wider text-[11px] ${netProfit >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
              Net Operating Surplus
            </span>
            <TrendingUp className={`w-4 h-4 ${netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`} />
          </div>
          <div className={`text-xl font-bold font-mono ${netProfit >= 0 ? 'text-emerald-900' : 'text-rose-900'}`}>
            {formatCurrency(netProfit)}
          </div>
          <p className={`text-[11px] mt-1 ${netProfit >= 0 ? 'text-emerald-700/80' : 'text-rose-700/80'}`}>
            Collections − Parts COGS ({formatCurrency(cogsAmount)}) − Expenses
          </p>
        </div>
      </div>

      <div className="pt-2">
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-3">
          Cash-In-Hand & Technician Handover Realization
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Cash Collected by Technicians */}
          <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/40">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>Technician Cash Collected</span>
              <HandCoins className="w-3.5 h-3.5 text-slate-600" />
            </div>
            <div className="text-lg font-bold text-slate-900 font-mono">
              {formatCurrency(cashCollectedByTechnicians)}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5">Physical cash collected in field</p>
          </div>

          {/* Cash Handed Over to Owner */}
          <div className="p-3.5 rounded-lg border border-emerald-200/80 bg-emerald-50/30">
            <div className="flex items-center justify-between text-xs text-emerald-700 mb-1">
              <span>Cash Handed to Owner</span>
              <ArrowDownToLine className="w-3.5 h-3.5 text-emerald-600" />
            </div>
            <div className="text-lg font-bold text-emerald-900 font-mono">
              {formatCurrency(cashHandedOverToOwner)}
            </div>
            <p className="text-[10px] text-emerald-600/80 mt-0.5">Confirmed received by Admin/Owner</p>
          </div>

          {/* Pending Technician Cash */}
          <div className="p-3.5 rounded-lg border border-amber-200/80 bg-amber-50/30">
            <div className="flex items-center justify-between text-xs text-amber-700 mb-1">
              <span>Pending Technician Cash</span>
              <Clock className="w-3.5 h-3.5 text-amber-600" />
            </div>
            <div className="text-lg font-bold text-amber-900 font-mono">
              {formatCurrency(pendingTechnicianCash)}
            </div>
            <p className="text-[10px] text-amber-700/80 mt-0.5">Physical cash awaiting handover</p>
          </div>

          {/* Recorded Shop Cash Movement Balance */}
          <div className="p-3.5 rounded-lg border border-indigo-200/80 bg-indigo-50/30">
            <div className="flex items-center justify-between text-xs text-indigo-700 mb-1">
              <span>Shop Cash Movement</span>
              <Wallet className="w-3.5 h-3.5 text-indigo-600" />
            </div>
            <div className="text-lg font-bold text-indigo-900 font-mono">
              {formatCurrency(shopCashMovementBalance)}
            </div>
            <p className="text-[10px] text-indigo-700/80 mt-0.5">Cash Received − Physical Cash Expenses</p>
          </div>
        </div>
      </div>
    </div>
  );
};
