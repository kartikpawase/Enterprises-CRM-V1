import React from 'react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Pagination } from '../../../components/ui/Pagination';
import { formatINR, formatDate } from '../../../lib/formatters';
import type { CashHandoverItem } from '@crm/types';
import { User, CheckCircle2, Clock } from 'lucide-react';

interface CashHandoverTableProps {
  handovers: CashHandoverItem[];
  isLoading: boolean;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onMarkReceived: (handover: CashHandoverItem) => void;
}

export const CashHandoverTable: React.FC<CashHandoverTableProps> = ({
  handovers,
  isLoading,
  pagination,
  onPageChange,
  onMarkReceived,
}) => {
  const getStatusBadge = (status: CashHandoverItem['status']) => {
    if (status === 'RECEIVED') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          <span>Received</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300">
        <Clock className="w-3 h-3 text-amber-600" />
        <span>Pending</span>
      </span>
    );
  };

  return (
    <Card className="overflow-hidden border border-slate-200/80 shadow-xs">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-600 font-semibold uppercase tracking-wider">
              <th className="py-3 px-4">Technician</th>
              <th className="py-3 px-4">Service</th>
              <th className="py-3 px-4">Customer</th>
              <th className="py-3 px-4">Amount</th>
              <th className="py-3 px-4">Collected Date</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={7} className="py-4 px-4">
                    <div className="h-4 bg-slate-100 rounded-sm w-full" />
                  </td>
                </tr>
              ))
            ) : handovers.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-500">
                  <p className="font-medium">No cash handovers found</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Cash payments recorded for services will appear here for owner handover tracking.
                  </p>
                </td>
              </tr>
            ) : (
              handovers.map((item) => (
                <tr
                  key={item.id}
                  className="hover:bg-slate-50/80 transition-colors group"
                >
                  {/* Technician */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary-50 border border-primary-200 flex items-center justify-center text-primary-700 font-semibold text-[10px]">
                        <User className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-semibold text-slate-900">
                        {item.technicianName || 'Technician'}
                      </span>
                    </div>
                  </td>

                  {/* Service */}
                  <td className="py-3.5 px-4 font-mono text-slate-700">
                    {item.serviceNumber || item.jobCardNumber || item.serviceId || '—'}
                  </td>

                  {/* Customer */}
                  <td className="py-3.5 px-4 text-slate-800 font-medium">
                    {item.customerName || '—'}
                  </td>

                  {/* Amount */}
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-900 text-sm">
                    {formatINR(item.amount)}
                  </td>

                  {/* Collected Date */}
                  <td className="py-3.5 px-4 text-slate-600">
                    {formatDate(item.collectedAt)}
                  </td>

                  {/* Status */}
                  <td className="py-3.5 px-4">
                    {getStatusBadge(item.status)}
                    {item.status === 'RECEIVED' && item.receivedByName && (
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        by {item.receivedByName}
                      </div>
                    )}
                  </td>

                  {/* Action */}
                  <td className="py-3.5 px-4 text-right">
                    {item.status === 'PENDING' ? (
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() => onMarkReceived(item)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs font-semibold text-xs py-1 px-2.5"
                      >
                        Mark Cash Received
                      </Button>
                    ) : (
                      <span className="text-slate-400 font-medium text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="p-4 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
          </span>
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            onPageChange={onPageChange}
          />
        </div>
      )}
    </Card>
  );
};
