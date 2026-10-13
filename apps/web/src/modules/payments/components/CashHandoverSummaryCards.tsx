import React from 'react';
import { Card } from '../../../components/ui/Card';
import { formatINR } from '../../../lib/formatters';
import type { CashHandoverSummary } from '@crm/types';
import { Wallet, CheckCircle2, Clock, Users } from 'lucide-react';

interface CashHandoverSummaryCardsProps {
  summary?: CashHandoverSummary;
  isLoading: boolean;
}

export const CashHandoverSummaryCards: React.FC<CashHandoverSummaryCardsProps> = ({
  summary,
  isLoading,
}) => {
  const totalCollected = summary?.totalCollected ?? 0;
  const totalReceived = summary?.totalReceived ?? 0;
  const totalPending = summary?.totalPending ?? 0;
  const byTechnician = summary?.byTechnician ?? [];

  return (
    <div className="space-y-4">
      {/* 3 Overview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Collected */}
        <Card className="p-4 border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Total Cash Collected
            </span>
            <div className="w-8 h-8 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            {isLoading ? (
              <div className="h-7 w-28 bg-slate-100 rounded-sm animate-pulse" />
            ) : (
              <div className="text-xl font-bold font-mono text-slate-900">
                {formatINR(totalCollected)}
              </div>
            )}
            <p className="text-[11px] text-slate-400 mt-0.5">
              Physical cash collected by technicians
            </p>
          </div>
        </Card>

        {/* Total Received */}
        <Card className="p-4 border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">
              Total Cash Received
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            {isLoading ? (
              <div className="h-7 w-28 bg-slate-100 rounded-sm animate-pulse" />
            ) : (
              <div className="text-xl font-bold font-mono text-emerald-700">
                {formatINR(totalReceived)}
              </div>
            )}
            <p className="text-[11px] text-slate-400 mt-0.5">
              Confirmed handed over to owner
            </p>
          </div>
        </Card>

        {/* Total Pending */}
        <Card className="p-4 border border-slate-200/90 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
              Total Cash Pending
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            {isLoading ? (
              <div className="h-7 w-28 bg-slate-100 rounded-sm animate-pulse" />
            ) : (
              <div className="text-xl font-bold font-mono text-amber-700">
                {formatINR(totalPending)}
              </div>
            )}
            <p className="text-[11px] text-slate-400 mt-0.5">
              Awaiting technician handover
            </p>
          </div>
        </Card>
      </div>

      {/* Technician Breakdown Section (Step 13) */}
      {byTechnician.length > 0 && (
        <Card className="p-4 border border-slate-200/80 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Pending by Technician
              </h3>
            </div>
            <span className="text-[11px] text-slate-400">
              {byTechnician.length} Technician(s)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {byTechnician.map((tech) => (
              <div
                key={tech.technicianId}
                className="p-3 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-slate-900">
                    {tech.technicianName}
                  </span>
                  <span
                    className={`font-mono text-xs font-bold px-1.5 py-0.5 rounded ${
                      tech.pending > 0
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    Pending: {formatINR(tech.pending)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                  <span>Collected: {formatINR(tech.collected)}</span>
                  <span>Received: {formatINR(tech.received)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
