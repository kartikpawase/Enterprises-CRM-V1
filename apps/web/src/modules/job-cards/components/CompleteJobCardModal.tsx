import React, { useState } from 'react';
import { X, CheckCircle2, Plus, Trash2, AlertCircle, ShieldCheck } from 'lucide-react';
import { useCompleteJobCardMutation, type JobCardItem, type JobCardPartItem } from '../job-cards.api';

export interface CompleteJobCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobCard: JobCardItem | null;
}

export const CompleteJobCardModal: React.FC<CompleteJobCardModalProps> = ({
  isOpen,
  onClose,
  jobCard,
}) => {
  const [diagnosis, setDiagnosis] = useState(jobCard?.diagnosis || '');
  const [workPerformed, setWorkPerformed] = useState(jobCard?.workPerformed || '');
  const [parts, setParts] = useState<JobCardPartItem[]>(
    jobCard?.partsReplaced && Array.isArray(jobCard.partsReplaced) ? jobCard.partsReplaced : []
  );
  const [laborCharges, setLaborCharges] = useState(jobCard?.laborCharges ? parseFloat(jobCard.laborCharges) : 350);
  const [technicianNotes, setTechnicianNotes] = useState('');
  const [customerRemarks, setCustomerRemarks] = useState('');
  const [scheduleNextService, setScheduleNextService] = useState(true);
  const [nextServiceMonths, setNextServiceMonths] = useState(3);
  const [error, setError] = useState<string | null>(null);

  const completeMutation = useCompleteJobCardMutation();

  if (!isOpen || !jobCard) return null;

  const partsTotal = parts.reduce((sum, p) => sum + (p.isWarrantyCovered ? 0 : p.totalPrice || 0), 0);
  const grandTotal = laborCharges + partsTotal;

  const handleAddPart = () => {
    setParts([
      ...parts,
      {
        partName: '',
        partSku: '',
        quantity: 1,
        unitPrice: 0,
        totalPrice: 0,
        isWarrantyCovered: Boolean(jobCard.warrantyStatus === 'ACTIVE'),
      },
    ]);
  };

  const handleRemovePart = (index: number) => {
    setParts(parts.filter((_, i) => i !== index));
  };

  const handlePartChange = (index: number, field: keyof JobCardPartItem, value: any) => {
    const updated = [...parts];
    const current = { ...updated[index]!, [field]: value };
    if (field === 'quantity' || field === 'unitPrice') {
      current.totalPrice = (current.quantity || 1) * (current.unitPrice || 0);
    }
    updated[index] = current;
    setParts(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workPerformed.trim()) {
      setError('Please describe the work performed');
      return;
    }

    setError(null);
    try {
      await completeMutation.mutateAsync({
        id: jobCard.id,
        data: {
          diagnosis: diagnosis.trim() || undefined,
          workPerformed: workPerformed.trim(),
          partsReplaced: parts.filter((p) => p.partName.trim().length > 0),
          laborCharges,
          partsCharges: partsTotal,
          totalCharges: grandTotal,
          technicianNotes: technicianNotes.trim() || undefined,
          customerRemarks: customerRemarks.trim() || undefined,
          scheduleNextService,
          nextServiceRecommendationMonths: scheduleNextService ? nextServiceMonths : undefined,
        },
      });
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || 'Failed to complete job card');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Complete & Close Job Card</h3>
              <p className="text-xs text-slate-700">{jobCard.jobCardNumber} — {jobCard.customerName}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Warranty Status Banner */}
          {jobCard.warrantyStatus === 'ACTIVE' && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              <span>
                <strong>Active Warranty Coverage:</strong> Warranty parts replacements are covered at ₹0 chargeable to customer.
              </span>
            </div>
          )}

          {/* Diagnosis & Work Performed */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Root Cause / Diagnosis
              </label>
              <textarea
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                rows={2}
                placeholder="e.g. Sediment filter choked, high TDS inlet (950 ppm)..."
                className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Work Executed <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={workPerformed}
                onChange={(e) => setWorkPerformed(e.target.value)}
                rows={2}
                required
                placeholder="e.g. Replaced worn components, cleaned unit housing, calibrated operational settings..."
                className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Replaced Parts List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Spare Parts Replaced & Installed
              </label>
              <button
                type="button"
                onClick={handleAddPart}
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Part
              </button>
            </div>

            {parts.length === 0 ? (
              <p className="text-xs text-slate-700 italic bg-slate-50 p-3 rounded-xl border border-slate-100">
                No spare parts replaced. (Click "Add Part" if replacement components were installed)
              </p>
            ) : (
              <div className="space-y-2">
                {parts.map((p, idx) => (
                  <div key={idx} className="flex flex-wrap sm:flex-nowrap items-center gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <input
                      type="text"
                      placeholder="Part Name (e.g. Replacement Module)"
                      value={p.partName}
                      onChange={(e) => handlePartChange(idx, 'partName', e.target.value)}
                      className="flex-1 min-w-[140px] px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                      required
                    />
                    <input
                      type="number"
                      min={1}
                      placeholder="Qty"
                      value={p.quantity}
                      onChange={(e) => handlePartChange(idx, 'quantity', parseInt(e.target.value) || 1)}
                      className="w-16 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-center"
                    />
                    <input
                      type="number"
                      min={0}
                      placeholder="Price"
                      value={p.unitPrice}
                      onChange={(e) => handlePartChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                      className="w-20 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-right"
                    />
                    <label className="flex items-center gap-1 text-[11px] text-slate-700 whitespace-nowrap cursor-pointer">
                      <input
                        type="checkbox"
                        checked={p.isWarrantyCovered}
                        onChange={(e) => handlePartChange(idx, 'isWarrantyCovered', e.target.checked)}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      Warranty
                    </label>
                    <span className="font-semibold text-slate-900 w-16 text-right">
                      ₹{p.isWarrantyCovered ? '0.00' : (p.totalPrice || 0).toLocaleString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemovePart(idx)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded-md transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Charges Breakdown */}
          <div className="p-4 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-slate-700">Labor / Service Charges (₹):</span>
              <input
                type="number"
                min={0}
                value={laborCharges}
                onChange={(e) => setLaborCharges(parseFloat(e.target.value) || 0)}
                className="w-24 px-2.5 py-1 bg-white border border-slate-200 rounded-lg font-semibold text-right"
              />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-700">Parts Subtotal:</span>
              <span className="font-semibold text-slate-900">₹{partsTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-slate-200 font-bold text-sm">
              <span className="text-slate-900">Total Customer Charge:</span>
              <span className="text-indigo-600 text-base">₹{grandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* Remarks & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Technician Notes
              </label>
              <textarea
                value={technicianNotes}
                onChange={(e) => setTechnicianNotes(e.target.value)}
                rows={2}
                placeholder="Internal notes for next service team..."
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Customer Feedback / Confirmation
              </label>
              <textarea
                value={customerRemarks}
                onChange={(e) => setCustomerRemarks(e.target.value)}
                rows={2}
                placeholder="Customer acknowledged machine is working smoothly..."
                className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Schedule Next Maintenance Service */}
          <div className="p-3.5 bg-indigo-50/50 border border-indigo-100 rounded-xl text-xs space-y-2">
            <label className="flex items-center gap-2 font-semibold text-indigo-950 cursor-pointer">
              <input
                type="checkbox"
                checked={scheduleNextService}
                onChange={(e) => setScheduleNextService(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-indigo-500"
              />
              Automatically Schedule Next Routine Maintenance Visit
            </label>
            {scheduleNextService && (
              <div className="flex items-center gap-2 pl-6">
                <span className="text-slate-700">Interval:</span>
                <select
                  value={nextServiceMonths}
                  onChange={(e) => setNextServiceMonths(parseInt(e.target.value))}
                  className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                >
                  <option value={1}>In 1 Month (High TDS Water)</option>
                  <option value={2}>In 2 Months</option>
                  <option value={3}>In 3 Months (Standard Quarterly)</option>
                  <option value={6}>In 6 Months (Biannual)</option>
                </select>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-sm rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={completeMutation.isPending}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-sm rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
            >
              {completeMutation.isPending ? 'Finalizing...' : 'Finalize & Close Job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
