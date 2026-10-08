import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { useCreateWarrantyMutation } from '../warranties.api';
import { useCustomersQuery, useCustomerAssetsQuery } from '../../customers/customer.api';
import { useToast } from '../../../providers/ToastProvider';
import { ShieldCheck, Calendar, User, Cpu, AlertCircle } from 'lucide-react';
import type { WarrantyTypeSchema } from '@crm/validation';
import { z } from 'zod';

export interface CreateWarrantyModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCustomerId?: string;
  defaultAssetId?: string;
}

export const CreateWarrantyModal: React.FC<CreateWarrantyModalProps> = ({
  isOpen,
  onClose,
  defaultCustomerId,
  defaultAssetId,
}) => {
  const toast = useToast();
  const createWarrantyMutation = useCreateWarrantyMutation();

  const [customerId, setCustomerId] = useState(defaultCustomerId || '');
  const [assetId, setAssetId] = useState(defaultAssetId || '');
  const [warrantyType, setWarrantyType] = useState<z.infer<typeof WarrantyTypeSchema>>('STANDARD_MACHINE');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0] || '');
  const [durationMonths, setDurationMonths] = useState(12);
  const [terms, setTerms] = useState('Covers all standard operational components and technician service costs.');
  const [coverageParts, setCoverageParts] = useState(true);
  const [coverageLabour, setCoverageLabour] = useState(true);
  const [coverageMembrane, setCoverageMembrane] = useState(false);

  // Fetch customers list for selection (sorted with newest on top)
  const { data: customerData } = useCustomersQuery({
    status: 'ACTIVE',
    page: 1,
    limit: 500,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  const customerList = React.useMemo(() => {
    const raw = customerData?.data || [];
    return [...raw].sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });
  }, [customerData]);

  // Fetch customer assets once customer is selected
  const { data: assets, isLoading: isAssetsLoading } = useCustomerAssetsQuery(customerId || '');

  // Reset or initialize state when modal opens
  useEffect(() => {
    if (isOpen) {
      if (defaultCustomerId) setCustomerId(defaultCustomerId);
      if (defaultAssetId) setAssetId(defaultAssetId);
    }
  }, [isOpen, defaultCustomerId, defaultAssetId]);

  // Automatically select first asset if available and none selected
  useEffect(() => {
    if (assets && assets.length > 0 && !assetId) {
      setAssetId(assets[0]?.id || '');
    }
  }, [assets, assetId]);

  // Calculate calculated end date
  const calculatedEndDate = React.useMemo(() => {
    if (!startDate) return '';
    const d = new Date(startDate);
    d.setMonth(d.getMonth() + durationMonths);
    return d.toISOString().split('T')[0] || '';
  }, [startDate, durationMonths]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!customerId) {
      toast.error('Please select a customer');
      return;
    }
    if (!assetId) {
      toast.error('Please select a customer asset/equipment');
      return;
    }

    const coverage: string[] = [];
    if (coverageParts) coverage.push('PARTS');
    if (coverageLabour) coverage.push('LABOUR');
    if (coverageMembrane) coverage.push('MEMBRANE');

    try {
      await createWarrantyMutation.mutateAsync({
        customerId,
        assetId,
        warrantyType,
        startDate: new Date(startDate).toISOString(),
        endDate: new Date(calculatedEndDate).toISOString(),
        durationMonths,
        coverage,
        terms,
      });

      toast.success('Warranty registered and activated successfully');
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.message || 'Failed to register warranty');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Register New Warranty Policy" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {/* Customer Selection */}
        <div>
          <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-primary-600" />
            Select Customer *
          </label>
          <select
            value={customerId}
            onChange={(e) => {
              setCustomerId(e.target.value);
              setAssetId('');
            }}
            required
            className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 text-xs bg-slate-50/50"
          >
            <option value="">-- Choose Customer --</option>
            {customerList.map((c) => (
              <option key={c.id} value={c.id}>
                {c.fullName} ({c.phone}) - {c.customerNumber}
              </option>
            ))}
          </select>
        </div>

        {/* Asset Selection */}
        <div>
          <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-emerald-600" />
            Registered Machine / Unit *
          </label>
          {isAssetsLoading ? (
            <div className="p-2.5 text-slate-400 bg-slate-50 rounded-xl">Loading customer assets...</div>
          ) : assets && assets.length > 0 ? (
            <select
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              required
              className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 text-xs bg-slate-50/50"
            >
              <option value="">-- Choose Unit --</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.product?.name || 'Equipment'} (SN: {a.serialNumber || 'Non-serialized'})
                </option>
              ))}
            </select>
          ) : (
            <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>No registered machines found for this customer. Please register an asset first.</span>
            </div>
          )}
        </div>

        {/* 2-Column: Warranty Type & Duration */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-purple-600" />
              Warranty Policy Type *
            </label>
            <select
              value={warrantyType}
              onChange={(e) => setWarrantyType(e.target.value as any)}
              className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 text-xs"
            >
              <option value="STANDARD_MACHINE">Standard Machine Warranty</option>
              <option value="EXTENDED_MACHINE">Extended AMC Warranty</option>
              <option value="SPARE_PART">Spare Part Warranty</option>
              <option value="MANUFACTURER">Manufacturer Warranty</option>
              <option value="SELLER">Seller Warranty</option>
              <option value="SERVICE">Service Warranty</option>
            </select>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Duration (Months) *</label>
            <select
              value={durationMonths}
              onChange={(e) => setDurationMonths(Number(e.target.value))}
              className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 text-xs"
            >
              <option value={3}>3 Months</option>
              <option value={6}>6 Months</option>
              <option value={12}>12 Months (1 Year)</option>
              <option value={24}>24 Months (2 Years)</option>
              <option value={36}>36 Months (3 Years)</option>
            </select>
          </div>
        </div>

        {/* Start Date & End Date Preview */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              Start Date *
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 text-xs"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Calculated Expiry Date</label>
            <div className="p-2.5 bg-slate-100 rounded-xl border border-slate-200 font-mono text-slate-700 font-bold">
              {calculatedEndDate
                ? new Date(calculatedEndDate).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })
                : '--'}
            </div>
          </div>
        </div>

        {/* Coverage Checkboxes */}
        <div>
          <label className="block font-bold text-slate-700 mb-1.5">Coverage Scope</label>
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={coverageParts}
                onChange={(e) => setCoverageParts(e.target.checked)}
                className="rounded text-primary-600 focus:ring-primary-500"
              />
              <span className="text-slate-700">Spare Parts &amp; Electricals</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={coverageLabour}
                onChange={(e) => setCoverageLabour(e.target.checked)}
                className="rounded text-primary-600 focus:ring-primary-500"
              />
              <span className="text-slate-700">Technician Labour</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={coverageMembrane}
                onChange={(e) => setCoverageMembrane(e.target.checked)}
                className="rounded text-primary-600 focus:ring-primary-500"
              />
              <span className="text-slate-700">Consumables &amp; Replacements</span>
            </label>
          </div>
        </div>

        {/* Terms & Notes */}
        <div>
          <label className="block font-bold text-slate-700 mb-1">Warranty Policy Terms &amp; Inclusions</label>
          <textarea
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            rows={2}
            className="w-full p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/20 text-xs"
            placeholder="Specify coverage terms, limits, or warranty conditions..."
          />
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <Button variant="ghost" size="sm" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            type="submit"
            isLoading={createWarrantyMutation.isPending}
            className="bg-primary-600 hover:bg-primary-700 text-white font-bold"
          >
            Activate Warranty
          </Button>
        </div>
      </form>
    </Modal>
  );
};
