import React, { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Textarea } from '../../../components/ui/Textarea';
import { Select } from '../../../components/ui/Select';
import { useCompleteServiceMutation, type ServiceItem } from '../services.api';
import {
  CheckCircle,
  Plus,
  Trash2,
  AlertCircle,
  Wrench,
  ShieldCheck,
  CreditCard,
} from 'lucide-react';
import type { JobCardPartItem } from '@crm/validation';

export interface CompleteServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  service: ServiceItem | null;
}

export const CompleteServiceModal: React.FC<CompleteServiceModalProps> = ({
  isOpen,
  onClose,
  service,
}) => {
  const [workPerformed, setWorkPerformed] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [technicianNotes, setTechnicianNotes] = useState('');
  const [customerRemarks, setCustomerRemarks] = useState('');
  const [laborCharges, setLaborCharges] = useState<number>(0);
  const [parts, setParts] = useState<JobCardPartItem[]>([]);

  const [scheduleNextService, setScheduleNextService] = useState(false);
  const [recommendationMonths, setRecommendationMonths] = useState(3);
  const [paymentOption, setPaymentOption] = useState<'PENDING' | 'FULL' | 'PARTIAL'>('PENDING');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'UPI' | 'CARD' | 'BANK_TRANSFER' | 'CHEQUE'>('CASH');
  const [customPaidAmount, setCustomPaidAmount] = useState<number>(0);
  const [paymentRefNumber, setPaymentRefNumber] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const completeMutation = useCompleteServiceMutation();

  const partsTotal = parts.reduce((sum, p) => sum + (p.totalPrice || 0), 0);
  const grandTotal = (Number(laborCharges) || 0) + partsTotal;

  const handleAddPart = () => {
    setParts((prev) => [
      ...prev,
      {
        partName: '',
        partSku: '',
        quantity: 1,
        unitPrice: 0,
        isWarrantyCovered: service?.serviceClassification === 'WARRANTY',
        totalPrice: 0,
      },
    ]);
  };

  const handleRemovePart = (index: number) => {
    setParts((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePartChange = (index: number, field: keyof JobCardPartItem, value: any) => {
    setParts((prev) => {
      const updated = [...prev];
      const current = { ...updated[index], [field]: value };

      if (field === 'quantity' || field === 'unitPrice' || field === 'isWarrantyCovered') {
        const qty = Number(field === 'quantity' ? value : current.quantity) || 1;
        const price = Number(field === 'unitPrice' ? value : current.unitPrice) || 0;
        const isCovered = field === 'isWarrantyCovered' ? value : current.isWarrantyCovered;
        current.totalPrice = isCovered ? 0 : qty * price;
      }

      updated[index] = current as JobCardPartItem;
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!service) return;
    setFormError(null);

    if (!workPerformed.trim()) {
      setFormError('Work performed description is required.');
      return;
    }

    const initialPayment =
      grandTotal > 0 && paymentOption !== 'PENDING'
        ? {
            amount: paymentOption === 'FULL' ? grandTotal : Number(customPaidAmount) || 0,
            paymentMethod,
            referenceNumber: paymentRefNumber.trim() || undefined,
            notes: `Recorded on service completion (${paymentOption === 'FULL' ? 'Full Settlement' : 'Partial Payment'})`,
          }
        : undefined;

    try {
      await completeMutation.mutateAsync({
        id: service.id,
        data: {
          workPerformed,
          diagnosis,
          partsReplaced: parts.filter((p) => p.partName.trim() !== ''),
          laborCharges: Number(laborCharges) || 0,
          partsCharges: partsTotal,
          totalCharges: grandTotal,
          technicianNotes,
          customerRemarks,
          scheduleNextService,
          nextServiceRecommendationMonths: scheduleNextService ? recommendationMonths : null,
          initialPayment,
        } as any,
      });

      onClose();
    } catch (err: any) {
      setFormError(err.message || 'Failed to complete service');
    }
  };

  if (!service) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Complete Service & Job Card"
      description={`Record completed diagnostics, replaced spares, charges, and customer remarks for ${service.serviceNumber}.`}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        {formError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {formError}
          </div>
        )}

        {/* Quick Context Summary Banner */}
        <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center justify-between gap-4 text-xs">
          <div>
            <div className="font-bold text-slate-900 flex items-center gap-1.5">
              <span>{service.customerName}</span>
              <span className="font-mono text-slate-400 font-normal">({service.customerPhone})</span>
            </div>
            <div className="text-slate-500 font-medium mt-0.5">
              {service.productName} • {service.serialNumber ? `SN: ${service.serialNumber}` : 'Non-serialized'}
            </div>
          </div>
          <div className="text-right shrink-0">
            {service.serviceClassification === 'WARRANTY' ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                <ShieldCheck className="w-3.5 h-3.5" />
                Warranty Covered
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                General Service
              </span>
            )}
          </div>
        </div>

        {/* Work Performed & Diagnosis */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700">
            Work Performed Summary <span className="text-rose-500">*</span>
          </label>
          <Input
            value={workPerformed}
            onChange={(e) => setWorkPerformed(e.target.value)}
            placeholder="e.g. Completed maintenance inspection and routine service"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700">Diagnosis / Findings</label>
          <Input
            value={diagnosis}
            onChange={(e) => setDiagnosis(e.target.value)}
            placeholder="e.g. Regular component wear or operational diagnosis"
          />
        </div>

        {/* Parts Replaced Table */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5 text-slate-500" />
              Replaced Parts & Spares ({parts.length})
            </label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddPart}
              className="h-7 text-xs"
              leftIcon={<Plus className="w-3 h-3" />}
            >
              Add Part
            </Button>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                <tr>
                  <th className="p-2 pl-3">Part Name</th>
                  <th className="p-2 w-28">SKU</th>
                  <th className="p-2 w-16 text-center">Qty</th>
                  <th className="p-2 w-24 text-right">Price (₹)</th>
                  <th className="p-2 w-24 text-center">Warranty?</th>
                  <th className="p-2 w-24 text-right">Total (₹)</th>
                  <th className="p-2 w-10 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {parts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-slate-400">
                      No spare parts recorded. Click "Add Part" if replacement components were used.
                    </td>
                  </tr>
                ) : (
                  parts.map((p, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="p-2 pl-3">
                        <Input
                          value={p.partName}
                          onChange={(e) => handlePartChange(idx, 'partName', e.target.value)}
                          placeholder="e.g. Replacement Part"
                          className="h-8 text-xs"
                        />
                      </td>
                    <td className="p-2">
                      <Input
                        value={p.partSku}
                        onChange={(e) => handlePartChange(idx, 'partSku', e.target.value)}
                        placeholder="SKU-01"
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        min="1"
                        value={p.quantity}
                        onChange={(e) => handlePartChange(idx, 'quantity', Number(e.target.value))}
                        className="h-8 text-xs text-center"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        min="0"
                        value={p.unitPrice}
                        onChange={(e) => handlePartChange(idx, 'unitPrice', Number(e.target.value))}
                        className="h-8 text-xs text-right"
                      />
                    </td>
                    <td className="p-2 text-center">
                      <input
                        type="checkbox"
                        checked={p.isWarrantyCovered}
                        onChange={(e) => handlePartChange(idx, 'isWarrantyCovered', e.target.checked)}
                        className="rounded text-primary-600 focus:ring-primary-500 h-4 w-4"
                      />
                    </td>
                    <td className="p-2 text-right font-mono font-semibold">
                      ₹{p.totalPrice.toLocaleString('en-IN')}
                    </td>
                    <td className="p-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemovePart(idx)}
                        className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Charges Breakdown */}
        <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600">Labor / Service Charges:</span>
            <div className="w-32">
              <Input
                type="number"
                min="0"
                value={laborCharges}
                onChange={(e) => setLaborCharges(Number(e.target.value))}
                className="h-8 text-xs text-right font-mono"
              />
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-slate-600">
            <span>Parts & Spares Total:</span>
            <span className="font-mono font-semibold">₹{partsTotal.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex items-center justify-between text-xs font-bold text-slate-900 pt-2 border-t border-slate-200">
            <span>Grand Total:</span>
            <span className="text-sm font-mono text-emerald-700">₹{grandTotal.toLocaleString('en-IN')}</span>
          </div>
        </div>

        {/* Payment Settlement upon Completion */}
        {grandTotal > 0 && (
          <div className="p-3.5 bg-emerald-50/50 rounded-xl border border-emerald-200/80 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                <CreditCard className="w-4 h-4 text-emerald-700" />
                Payment Settlement Option
              </span>
              <span className="text-[11px] font-semibold text-emerald-700 font-mono">Total Due: ₹{grandTotal.toLocaleString('en-IN')}</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPaymentOption('PENDING')}
                className={`py-1.5 px-2 rounded-lg font-bold text-xs border text-center transition-all ${paymentOption === 'PENDING' ? 'bg-orange-500 text-white border-orange-600 shadow-xs' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
              >
                Payment Pending
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaymentOption('FULL');
                  setCustomPaidAmount(grandTotal);
                }}
                className={`py-1.5 px-2 rounded-lg font-bold text-xs border text-center transition-all ${paymentOption === 'FULL' ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
              >
                Full Payment (₹{grandTotal})
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaymentOption('PARTIAL');
                  if (!customPaidAmount) setCustomPaidAmount(Math.round(grandTotal / 2));
                }}
                className={`py-1.5 px-2 rounded-lg font-bold text-xs border text-center transition-all ${paymentOption === 'PARTIAL' ? 'bg-amber-500 text-white border-amber-600 shadow-xs' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
              >
                Partially Paid
              </button>
            </div>

            {paymentOption !== 'PENDING' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-emerald-200/60">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Payment Mode</label>
                  <Select
                    options={[
                      { value: 'CASH', label: 'Cash' },
                      { value: 'UPI', label: 'UPI / QR' },
                      { value: 'CARD', label: 'Card' },
                      { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
                      { value: 'CHEQUE', label: 'Cheque' },
                    ]}
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                  />
                </div>

                {paymentOption === 'PARTIAL' && (
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 block mb-1">Amount Paid (₹)</label>
                    <Input
                      type="number"
                      min="1"
                      max={grandTotal}
                      value={customPaidAmount}
                      onChange={(e) => setCustomPaidAmount(Number(e.target.value))}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                )}

                <div className={paymentOption === 'FULL' ? 'sm:col-span-2' : ''}>
                  <label className="text-[11px] font-bold text-slate-700 block mb-1">Reference / UTR # (Optional)</label>
                  <Input
                    placeholder="e.g. UPI Ref / Receipt #"
                    value={paymentRefNumber}
                    onChange={(e) => setPaymentRefNumber(e.target.value)}
                    className="h-8 text-xs font-mono"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Technician & Customer Remarks */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Technician Remarks</label>
            <Textarea
              value={technicianNotes}
              onChange={(e) => setTechnicianNotes(e.target.value)}
              placeholder="e.g. Customer briefed on weekly backwash valve..."
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Customer Feedback</label>
            <Textarea
              value={customerRemarks}
              onChange={(e) => setCustomerRemarks(e.target.value)}
              placeholder="e.g. Satisfied with service quality..."
              rows={2}
            />
          </div>
        </div>

        {/* Next Service Recommendation Engine */}
        <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-200/80 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <label className="font-bold text-blue-900 flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={scheduleNextService}
                onChange={(e) => setScheduleNextService(e.target.checked)}
                className="rounded text-primary-600 focus:ring-primary-500 h-4 w-4"
              />
              Automatically Schedule Recommended Next Maintenance
            </label>
            <span className="text-[11px] text-blue-700 font-semibold">Smart Recommendation</span>
          </div>

          {scheduleNextService && (
            <div className="flex items-center gap-3 pt-1">
              <span className="text-blue-800">Recommend next visit after:</span>
              <div className="w-36">
                <Select
                  options={[
                    { value: '1', label: '1 Month' },
                    { value: '2', label: '2 Months' },
                    { value: '3', label: '3 Months (Standard)' },
                    { value: '6', label: '6 Months' },
                    { value: '12', label: '12 Months' },
                  ]}
                  value={String(recommendationMonths)}
                  onChange={(e) => setRecommendationMonths(Number(e.target.value))}
                />
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={completeMutation.isPending}>
            Cancel
          </Button>
          <Button
            type="submit"
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
            disabled={completeMutation.isPending}
            leftIcon={<CheckCircle className="w-4 h-4" />}
          >
            {completeMutation.isPending ? 'Closing Service...' : 'Mark Completed & Close Job Card'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
