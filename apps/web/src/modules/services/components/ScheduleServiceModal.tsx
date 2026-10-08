import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import { useCustomersQuery, useCustomerDetailQuery } from '../../customers/customer.api';
import { useAssetsQuery } from '../../assets/assets.api';
import { useTechniciansQuery, useCreateServiceMutation } from '../services.api';
import { useToast } from '../../../providers/ToastProvider';
import { Calendar, User, Cpu, AlertCircle, Search, X } from 'lucide-react';
import type { CreateServiceInput } from '@crm/validation';

export interface ScheduleServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDate?: string; // Pre-populate if clicked from Heatmap
  initialCustomerId?: string; // Auto-select customer (e.g. from customer profile)
  initialCustomer?: {
    id: string;
    fullName: string;
    phone?: string;
    customerNumber?: string;
    companyName?: string;
  };
  initialAssetId?: string; // Auto-select asset if specified
}

function getSystemDateString(d = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const ScheduleServiceModal: React.FC<ScheduleServiceModalProps> = ({
  isOpen,
  onClose,
  initialDate,
  initialCustomerId,
  initialCustomer,
  initialAssetId,
}) => {
  const [customerSearch, setCustomerSearch] = useState('');
  const [machineName, setMachineName] = useState('');
  const [formData, setFormData] = useState<Partial<CreateServiceInput>>({
    customerId: initialCustomerId || initialCustomer?.id || '',
    assetId: initialAssetId || '',
    serviceType: 'PERIODIC_MAINTENANCE',
    serviceLocation: 'DOORSTEP',
    serviceClassification: 'GENERAL',
    scheduledDate: initialDate || getSystemDateString(),
    scheduledTimeSlot: '10:00 AM - 12:00 PM',
    priority: 'NORMAL',
    technicianId: '',
    customerNotes: '',
    internalNotes: '',
  });

  const [formError, setFormError] = useState<string | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce customer search input by 200ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(customerSearch);
    }, 200);
    return () => clearTimeout(handler);
  }, [customerSearch]);

  // Sync initial date, initial customer, or system date whenever modal opens
  useEffect(() => {
    if (isOpen) {
      const effectiveCustId = initialCustomerId || initialCustomer?.id || '';
      setFormData((prev) => ({
        ...prev,
        customerId: effectiveCustId || prev.customerId || '',
        assetId: initialAssetId || (effectiveCustId && effectiveCustId !== prev.customerId ? '' : prev.assetId) || '',
        scheduledDate: initialDate || getSystemDateString(),
        scheduledTimeSlot: prev.scheduledTimeSlot || '10:00 AM - 12:00 PM',
      }));
      setMachineName('');
      setCustomerSearch('');
      setFormError(null);
    }
  }, [isOpen, initialDate, initialCustomerId, initialCustomer, initialAssetId]);

  // Queries for customers, assets, technicians
  const { data: customersData, isLoading: isLoadingCustomers } = useCustomersQuery({
    status: 'ACTIVE',
    page: 1,
    limit: 200,
    search: debouncedSearch.trim() || undefined,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });
  const { data: assetsData, isLoading: isLoadingAssets } = useAssetsQuery(
    formData.customerId ? { customerId: formData.customerId, limit: 100 } : { customerId: 'none', limit: 0 }
  );
  const { data: customerDetail } = useCustomerDetailQuery(formData.customerId || undefined);
  const { data: technicians } = useTechniciansQuery();

  const toast = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const createMutation = useCreateServiceMutation();

  const customerList = React.useMemo(() => {
    const raw = customersData?.data || [];
    const list = [...raw];

    const currentCustId = formData.customerId || initialCustomerId || initialCustomer?.id;
    // If a customer is currently selected and not present in the current search query page, preserve them
    if (currentCustId && !list.some((c) => c.id === currentCustId)) {
      if (customerDetail && customerDetail.id === currentCustId) {
        list.unshift(customerDetail as any);
      } else if (initialCustomer && initialCustomer.id === currentCustId) {
        list.unshift({
          id: initialCustomer.id,
          fullName: initialCustomer.fullName,
          phone: initialCustomer.phone || '',
          customerNumber: initialCustomer.customerNumber || '',
          companyName: initialCustomer.companyName || '',
        } as any);
      }
    }

    return list;
  }, [customersData, formData.customerId, initialCustomerId, initialCustomer, customerDetail]);

  const filteredCustomerList = React.useMemo(() => {
    if (!customerSearch.trim()) return customerList;
    const q = customerSearch.toLowerCase().trim();
    return customerList.filter((c) => {
      return (
        c.id === formData.customerId ||
        c.fullName?.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.customerNumber?.toLowerCase().includes(q) ||
        c.companyName?.toLowerCase().includes(q)
      );
    });
  }, [customerList, customerSearch, formData.customerId]);

  const totalAvailableCustomers = customersData?.pagination?.total ?? customerList.length;

  const assetList = React.useMemo(() => {
    if (!formData.customerId) return [];
    const directAssets = assetsData?.data || [];
    const detailAssets = (customerDetail as any)?.assets || [];
    
    const map = new Map<string, any>();
    for (const a of detailAssets) {
      if (a && a.id) {
        map.set(a.id, {
          id: a.id,
          productName: a.customName || a.product?.name || a.productName || 'Product / Spare',
          productBrand: a.product?.brand || a.productBrand || '',
          productSku: a.product?.sku || a.productSku || '',
          serialNumber: a.serialNumber || '',
          assetType: a.assetType || 'RO_MACHINE',
          assetNumber: a.assetNumber || 'ASSET',
        });
      }
    }
    for (const a of directAssets) {
      if (a && a.id) {
        const existing = map.get(a.id);
        map.set(a.id, {
          ...existing,
          ...a,
          productName: a.customName || a.productName || (a as any).product?.name || existing?.productName || 'Product / Spare',
          productBrand: a.productBrand || (a as any).product?.brand || existing?.productBrand || '',
          productSku: a.productSku || (a as any).product?.sku || existing?.productSku || '',
        });
      }
    }
    return Array.from(map.values());
  }, [formData.customerId, assetsData, customerDetail]);

  const cleanAssetSuggestions = React.useMemo(() => {
    return assetList.filter((a) => {
      const name = (a.productName || a.customName || '').trim().toLowerCase();
      return name && name !== 'customer ro water purifier';
    });
  }, [assetList]);

  const handleCustomerChange = (custId: string) => {
    setFormData((prev) => ({
      ...prev,
      customerId: custId,
      assetId: '',
    }));
    setMachineName('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (isSubmitting || createMutation.isPending) {
      return;
    }

    if (!formData.customerId) {
      setFormError('Please select a customer.');
      return;
    }
    if (!formData.scheduledDate) {
      setFormError('Please choose a scheduled visit date.');
      return;
    }

    const trimmedMachine = machineName.trim();
    let effectiveAssetId: string | null = null;

    if (trimmedMachine && assetList.length > 0) {
      const matched = assetList.find(
        (a) =>
          (a.productName && a.productName.toLowerCase() === trimmedMachine.toLowerCase()) ||
          (a.customName && a.customName.toLowerCase() === trimmedMachine.toLowerCase())
      );
      if (matched) {
        effectiveAssetId = matched.id;
      }
    }

    // Only fallback to formData.assetId if the user did NOT enter a machine name
    if (!trimmedMachine && !effectiveAssetId && formData.assetId && formData.assetId !== 'DEFAULT_RO_PURIFIER') {
      effectiveAssetId = formData.assetId;
    }

    setIsSubmitting(true);
    try {
      const res = await createMutation.mutateAsync({
        customerId: formData.customerId,
        assetId: effectiveAssetId,
        machineName: trimmedMachine || undefined,
        serviceType: formData.serviceType || 'PERIODIC_MAINTENANCE',
        serviceLocation: formData.serviceLocation || 'DOORSTEP',
        serviceClassification: formData.serviceClassification || 'GENERAL',
        scheduledDate: formData.scheduledDate,
        scheduledTimeSlot: formData.scheduledTimeSlot || '10:00 AM - 12:00 PM',
        priority: formData.priority || 'NORMAL',
        technicianId: formData.technicianId && formData.technicianId.trim() !== '' ? formData.technicianId.trim() : null,
        customerNotes: formData.customerNotes || null,
        internalNotes: formData.internalNotes || null,
      });

      const srvNumber = (res as any)?.service?.serviceNumber || (res as any)?.serviceNumber || 'Service';
      toast.success('Service Scheduled', `Service visit ${srvNumber} scheduled successfully.`);
      onClose();
    } catch (err: any) {
      const msg = err?.message || err?.error?.message || 'Failed to schedule service';
      setFormError(msg);
      toast.error('Scheduling Failed', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isBusy = isSubmitting || createMutation.isPending;

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Schedule Service Visit"
      description="Book a new doorstep maintenance, warranty check, or in-shop repair visit."
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        {formError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {formError}
          </div>
        )}

        {/* 1. Customer Selection with Search Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-500" />
              Select Customer <span className="text-rose-500">*</span>
            </label>
            {customerSearch.trim() ? (
              <span className="text-[11px] font-medium text-slate-500">
                {isLoadingCustomers ? 'Searching...' : `${filteredCustomerList.length} matching customer(s)`}
              </span>
            ) : (
              <span className="text-[11px] font-medium text-slate-500">
                {totalAvailableCustomers > 0
                  ? `${totalAvailableCustomers.toLocaleString('en-IN')} available in CRM`
                  : ''}
              </span>
            )}
          </div>

          {/* Search Bar Input */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all"
              placeholder="Search customer by name, phone number, customer #, or company..."
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
            />
            {customerSearch && (
              <button
                type="button"
                onClick={() => setCustomerSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200 transition-colors"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Customer Dropdown */}
          <Select
            options={[
              {
                value: '',
                label: customerSearch.trim()
                  ? filteredCustomerList.length === 0
                    ? '— No customers match your search —'
                    : `— Select Customer (${filteredCustomerList.length} found) —`
                  : totalAvailableCustomers > 0
                    ? `— Choose Customer (${totalAvailableCustomers.toLocaleString('en-IN')} available) —`
                    : '— Choose Customer —',
              },
              ...filteredCustomerList.map((c) => ({
                value: c.id,
                label: `${c.fullName} (${c.phone})${c.companyName ? ` [${c.companyName}]` : ''} - ${c.customerNumber}`,
              })),
            ]}
            value={formData.customerId || ''}
            onChange={(e) => handleCustomerChange(e.target.value)}
          />
        </div>

        {/* 2. Machine / Equipment Name Input Field */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-slate-500" />
              Product / Equipment Name
            </label>
            {formData.customerId && assetList.length > 0 && (
              <span className="text-[11px] font-medium text-slate-500">
                {assetList.length} registered item(s) on file
              </span>
            )}
          </div>

          <div className="relative">
            <Input
              type="text"
              list="customer-machine-suggestions"
              placeholder={
                !formData.customerId
                  ? 'Select customer above first, or enter product / machine name directly...'
                  : 'Enter machine name / product equipment...'
              }
              value={machineName}
              onChange={(e) => {
                const val = e.target.value;
                setMachineName(val);
                const matched = assetList.find(
                  (a) =>
                    (a.productName && a.productName.toLowerCase() === val.trim().toLowerCase()) ||
                    (a.customName && a.customName.toLowerCase() === val.trim().toLowerCase())
                );
                setFormData((prev) => ({
                  ...prev,
                  assetId: matched ? matched.id : '',
                }));
              }}
            />

            <datalist id="customer-machine-suggestions">
              {cleanAssetSuggestions.map((a) => (
                <option
                  key={a.id}
                  value={a.productName || a.customName || 'Equipment'}
                >
                  {a.serialNumber ? `SN: ${a.serialNumber}` : a.assetNumber || ''}
                </option>
              ))}
            </datalist>
          </div>

          {/* Quick select chips if customer has registered machines */}
          {formData.customerId && cleanAssetSuggestions.length > 0 && !machineName && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="text-[11px] text-slate-400">Quick select:</span>
              {cleanAssetSuggestions.slice(0, 4).map((a) => {
                const label = a.productName || a.customName || 'Equipment';
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setMachineName(label);
                      setFormData((prev) => ({ ...prev, assetId: a.id }));
                    }}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 hover:bg-primary-50 hover:text-primary-700 hover:border-primary-200 border border-slate-200 text-[11px] font-medium text-slate-600 transition-colors cursor-pointer"
                  >
                    <span>{label}</span>
                    {a.serialNumber && (
                      <span className="text-slate-400 font-mono text-[10px]">({a.serialNumber})</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 3. Service Type, Location & Classification */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Service Type</label>
            <Select
              options={[
                { value: 'PERIODIC_MAINTENANCE', label: 'Periodic Maintenance' },
                { value: 'INSTALLATION', label: 'Installation' },
                { value: 'REPAIR', label: 'Repair Visit' },
                { value: 'SPARE_REPLACEMENT', label: 'Spare Replacement' },
                { value: 'EMERGENCY', label: 'Emergency Breakdown' },
              ]}
              value={formData.serviceType || 'PERIODIC_MAINTENANCE'}
              onChange={(e) => setFormData((prev) => ({ ...prev, serviceType: e.target.value as any }))}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Location</label>
            <Select
              options={[
                { value: 'DOORSTEP', label: 'Doorstep Visit' },
                { value: 'IN_SHOP', label: 'In-Shop Repair' },
              ]}
              value={formData.serviceLocation || 'DOORSTEP'}
              onChange={(e) => setFormData((prev) => ({ ...prev, serviceLocation: e.target.value as any }))}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Classification</label>
            <Select
              options={[
                { value: 'GENERAL', label: 'General (Billable)' },
                { value: 'WARRANTY', label: 'Warranty (Free)' },
              ]}
              value={formData.serviceClassification || 'GENERAL'}
              onChange={(e) => setFormData((prev) => ({ ...prev, serviceClassification: e.target.value as any }))}
            />
          </div>
        </div>

        {/* 4. Scheduled Date, Slot & Priority */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              Visit Date <span className="text-rose-500">*</span>
            </label>
            <Input
              type="date"
              value={formData.scheduledDate || ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, scheduledDate: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Time Slot</label>
            <Select
              options={[
                { value: '09:00 AM - 11:00 AM', label: '09:00 AM - 11:00 AM' },
                { value: '10:00 AM - 12:00 PM', label: '10:00 AM - 12:00 PM (Morning)' },
                { value: '12:00 PM - 02:00 PM', label: '12:00 PM - 02:00 PM (Afternoon)' },
                { value: '02:00 PM - 04:00 PM', label: '02:00 PM - 04:00 PM' },
                { value: '04:00 PM - 06:00 PM', label: '04:00 PM - 06:00 PM (Evening)' },
                { value: '06:00 PM - 08:00 PM', label: '06:00 PM - 08:00 PM' },
              ]}
              value={formData.scheduledTimeSlot || '10:00 AM - 12:00 PM'}
              onChange={(e) => setFormData((prev) => ({ ...prev, scheduledTimeSlot: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Priority</label>
            <Select
              options={[
                { value: 'LOW', label: 'Low' },
                { value: 'NORMAL', label: 'Normal' },
                { value: 'HIGH', label: 'High' },
                { value: 'URGENT', label: 'Urgent Breakdown' },
              ]}
              value={formData.priority || 'NORMAL'}
              onChange={(e) => setFormData((prev) => ({ ...prev, priority: e.target.value as any }))}
            />
          </div>
        </div>

        {/* 5. Assigned Technician */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700">Assign Technician (Optional)</label>
          {(() => {
            const techList: any[] = Array.isArray(technicians)
              ? technicians
              : Array.isArray((technicians as any)?.data)
              ? (technicians as any).data
              : [];

            return (
              <Select
                options={[
                  { value: '', label: '— Unassigned / Assign Later —' },
                  ...techList.map((t: any) => ({
                    value: t.id,
                    label: `${t.fullName || t.name} (${t.phone || 'No phone'})`,
                  })),
                ]}
                value={formData.technicianId || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, technicianId: e.target.value }))}
              />
            );
          })()}
        </div>

        {/* 6. Customer & Internal Notes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Customer Reported Notes</label>
            <Textarea
              placeholder="e.g. Water TDS high, slow filtration, filter beep..."
              rows={2}
              value={formData.customerNotes || ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, customerNotes: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">Internal Instructions</label>
            <Textarea
              placeholder="e.g. Carry standard toolset & replacement components..."
              rows={2}
              value={formData.internalNotes || ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, internalNotes: e.target.value }))}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
          <Button type="button" variant="outline" onClick={onClose} disabled={isBusy}>
            Cancel
          </Button>
          <Button
            type="submit"
            className="bg-primary-600 hover:bg-primary-700 text-white font-bold"
            disabled={isBusy}
          >
            {isBusy ? 'Scheduling...' : 'Confirm & Schedule'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
