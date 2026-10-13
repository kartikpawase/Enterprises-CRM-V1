import React, { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { useMarkCashReceived } from '../cash-handovers.api';
import { formatINR } from '../../../lib/formatters';
import type { CashHandoverItem } from '@crm/types';
import { X, CheckCircle2, AlertCircle } from 'lucide-react';

interface ConfirmCashHandoverModalProps {
  isOpen: boolean;
  onClose: () => void;
  handover: CashHandoverItem | null;
  onSuccess?: () => void;
}

export const ConfirmCashHandoverModal: React.FC<ConfirmCashHandoverModalProps> = ({
  isOpen,
  onClose,
  handover,
  onSuccess,
}) => {
  const [error, setError] = useState<string | null>(null);
  const markReceivedMutation = useMarkCashReceived();

  if (!isOpen || !handover) return null;

  const handleConfirm = async () => {
    setError(null);
    try {
      await markReceivedMutation.mutateAsync({
        id: handover.id,
      });
      onSuccess?.();
      onClose();
    } catch (err: any) {
      setError(
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        err.message ||
        'Failed to mark cash as received.'
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-fast">
      <div className="bg-white rounded-xl shadow-modal w-full max-w-md border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-emerald-50/50">
          <div className="flex items-center gap-2 text-emerald-800">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <h2 className="text-sm font-semibold">Confirm Cash Handover</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Technician:</span>
              <span className="font-semibold text-slate-900">
                {handover.technicianName || 'Technician'}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Amount:</span>
              <span className="text-base font-bold text-emerald-700 font-mono">
                {formatINR(handover.amount)}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Service:</span>
              <span className="font-mono font-medium text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                {handover.serviceNumber || handover.serviceId || 'N/A'}
              </span>
            </div>

            {handover.customerName && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">Customer:</span>
                <span className="font-medium text-slate-800">{handover.customerName}</span>
              </div>
            )}
          </div>

          <p className="text-xs text-slate-600 text-center font-medium pt-1">
            Are you sure you received this cash?
          </p>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={markReceivedMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleConfirm}
              isLoading={markReceivedMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              Confirm Received
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
