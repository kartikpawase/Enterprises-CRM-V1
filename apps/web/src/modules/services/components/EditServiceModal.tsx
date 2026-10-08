import React, { useState, useEffect } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import { useCustomersQuery, useCustomerDetailQuery } from '../../customers/customer.api';
import { useAssetsQuery } from '../../assets/assets.api';
import {
  useTechniciansQuery,
  useUpdateServiceMutation,
  type ServiceItem,
  type ServiceDetail,
} from '../services.api';
import { useToast } from '../../../providers/ToastProvider';
import {
  Calendar,
  User,
  Cpu,
  AlertCircle,
  Search,
  X,
  Clock,
  Wrench,
  FileText,
  DollarSign,
  AlertTriangle,
} from 'lucide-react';
import type { UpdateServiceInput } from '@crm/validation';

export interface EditServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  service: ServiceItem | ServiceDetail | null;
}

function toDateInputValue(dateVal: string | Date | null | undefined): string {
  if (!dateVal) return '';
  if (typeof dateVal === 'string') {
    const match = dateVal.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const EditServiceModal: React.FC<EditServiceModalProps> = ({
  isOpen,
  onClose,
  service,
}) => {
  const [activeTab, setActiveTab] = useState<'details' | 'execution'>('details');
  const [customerSearch, setCustomerSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [machineName, setMachineName] = useState('');

  const [formData, setFormData] = useState<Partial<UpdateServiceInput> & { customerId?: string }>({
    customerId: '',
    assetId: '',
    serviceType: 'PERIODIC_MAINTENANCE',
    serviceLocation: 'DOORSTEP',
    serviceClassification: 'GENERAL',
    scheduledDate: '',
    scheduledTimeSlot: '10:00 AM - 12:00 PM',
    priority: 'NORMAL',
    status: 'SCHEDULED',
    technicianId: '',
    customerNotes: '',
    internalNotes: '',
    cancelReason: '',
    diagnosis: '',
    workPerformed: '',
    technicianNotes: '',
    customerRemarks: '',
    laborCharges: 0,
    partsCharges: 0,
    totalCharges: 0,
  });

  // Debounce customer search input by 200ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(customerSearch);
    }, 200);
    return () => clearTimeout(handler);
  }, [customerSearch]);

  // Synchronize state from service prop when modal opens or service changes
  useEffect(() => {
    if (isOpen && service) {
      const srv = service as any;
      setFormData({
        customerId: srv.customerId || '',
        assetId: srv.assetId || '',
        serviceType: (srv.serviceType as any) || 'PERIODIC_MAINTENANCE',
        serviceLocation: (srv.serviceLocation as any) || 'DOORSTEP',
        serviceClassification: (srv.serviceClassification as any) || 'GENERAL',
        scheduledDate: toDateInputValue(srv.scheduledDate),
        scheduledTimeSlot: srv.scheduledTimeSlot || '10:00 AM - 12:00 PM',
        priority: (srv.priority as any) || 'NORMAL',
        status: (srv.status as any) || 'SCHEDULED',
        technicianId: srv.technicianId || '',
        customerNotes: srv.customerNotes || srv.problemReported || '',
        internalNotes: srv.internalNotes || '',
        cancelReason: srv.cancelReason || '',
        diagnosis: srv.diagnosis || '',
        workPerformed: srv.workPerformed || '',
        technicianNotes: srv.technicianNotes || '',
        customerRemarks: srv.customerRemarks || '',
        laborCharges: srv.laborCharges ? Number(srv.laborCharges) : 0,
        partsCharges: srv.partsCharges ? Number(srv.partsCharges) : 0,
        totalCharges: srv.totalCharges ? Number(srv.totalCharges) : 0,
      });
      const initialMachine =
        srv.productName && srv.productName !== 'Customer RO Water Purifier'
          ? srv.productName
          : srv.customName && srv.customName !== 'Customer RO Water Purifier'
          ? srv.customName
          : '';
      setMachineName(initialMachine);
      setCustomerSearch('');
      setFormError(null);
      setActiveTab('details');
    }
  }, [isOpen, service]);

  // Queries for customers, assets, technicians
  const { data: customersData, isLoading: isLoadingCustomers } = useCustomersQuery({
    status: 'ACTIVE',
    page: 1,
    limit: 200,
    search: debouncedSearch.trim() || undefined,
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  const selectedCustomerId = formData.customerId || service?.customerId;

  const { data: assetsData, isLoading: isLoadingAssets } = useAssetsQuery(
    selectedCustomerId ? { customerId: selectedCustomerId, limit: 100 } : { customerId: 'none', limit: 0 }
  );

  const { data: customerDetail } = useCustomerDetailQuery(selectedCustomerId || undefined);
  const { data: technicians } = useTechniciansQuery();

  const toast = useToast();
  const updateMutation = useUpdateServiceMutation();

  const customerList = React.useMemo(() => {
    const raw = customersData?.data || [];
    const list = [...raw];

    // If current selected customer is not in the search results, add them from customerDetail or service
    if (selectedCustomerId) {
      const exists = list.some((c) => c.id === selectedCustomerId);
      if (!exists) {
        if (customerDetail) {
          list.unshift(customerDetail as any);
        } else if (service && service.customerId === selectedCustomerId) {
          list.unshift({
            id: service.customerId,
            fullName: service.customerName || 'Customer',
            phone: service.customerPhone || '',
            customerNumber: service.customerNumber || '',
          } as any);
        }
      }
    }

    return list;
  }, [customersData, selectedCustomerId, customerDetail, service]);

  const filteredCustomerList = React.useMemo(() => {
    if (!customerSearch.trim()) return customerList;
    const q = customerSearch.toLowerCase().trim();
    return customerList.filter((c) => {
      return (
        c.id === selectedCustomerId ||
        c.fullName?.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.customerNumber?.toLowerCase().includes(q) ||
        c.companyName?.toLowerCase().includes(q)
      );
    });
  }, [customerList, customerSearch, selectedCustomerId]);

  const assetList = React.useMemo(() => {
    if (!selectedCustomerId) return [];
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
          productName:
            a.customName ||
            a.productName ||
            (a as any).product?.name ||
            existing?.productName ||
            'Product / Spare',
          productBrand: a.productBrand || (a as any).product?.brand || existing?.productBrand || '',
          productSku: a.productSku || (a as any).product?.sku || existing?.productSku || '',
        });
      }
    }

    // Preserve currently attached service asset if not yet in fetched list
    if (service?.assetId && !map.has(service.assetId) && service.customerId === selectedCustomerId) {
      map.set(service.assetId, {
        id: service.assetId,
        productName: service.productName || 'Product / Equipment',
        productBrand: service.productBrand || '',
        productSku: service.productSku || '',
        serialNumber: service.serialNumber || '',
        assetNumber: service.assetNumber || 'ASSET',
      });
    }

    return Array.from(map.values());
  }, [selectedCustomerId, assetsData, customerDetail, service]);

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

  const handleLaborOrPartsChange = (type: 'labor' | 'parts', val: number) => {
    setFormData((prev) => {
      const labor = type === 'labor' ? val : Number(prev.laborCharges || 0);
      const parts = type === 'parts' ? val : Number(prev.partsCharges || 0);
      return {
        ...prev,
        [type === 'labor' ? 'laborCharges' : 'partsCharges']: val,
        totalCharges: labor + parts,
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!service) return;
    setFormError(null);

    if (isSubmitting || updateMutation.isPending) {
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
    let effectiveAssetId: string | null = formData.assetId || null;

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

    const payload: UpdateServiceInput = {
      customerId: formData.customerId,
      assetId: effectiveAssetId,
      machineName: trimmedMachine || undefined,
      serviceType: formData.serviceType,
      serviceLocation: formData.serviceLocation,
      serviceClassification: formData.serviceClassification,
      scheduledDate: formData.scheduledDate,
      scheduledTimeSlot: formData.scheduledTimeSlot || '10:00 AM - 12:00 PM',
      priority: formData.priority,
      status: formData.status,
      technicianId: formData.technicianId && formData.technicianId.trim() !== '' ? formData.technicianId.trim() : null,
      customerNotes: formData.customerNotes || null,
      internalNotes: formData.internalNotes || null,
      cancelReason: formData.status === 'CANCELLED' ? formData.cancelReason || 'Cancelled by user' : null,
      diagnosis: formData.diagnosis || null,
      workPerformed: formData.workPerformed || null,
      technicianNotes: formData.technicianNotes || null,
      customerRemarks: formData.customerRemarks || null,
      laborCharges: formData.laborCharges !== undefined ? Number(formData.laborCharges) : undefined,
      partsCharges: formData.partsCharges !== undefined ? Number(formData.partsCharges) : undefined,
      totalCharges: formData.totalCharges !== undefined ? Number(formData.totalCharges) : undefined,
    };

    setIsSubmitting(true);
    try {
      await updateMutation.mutateAsync({
        id: service.id,
        data: payload,
      });

      toast.success('Service Updated', `Service ${service.serviceNumber} has been updated successfully.`);
      onClose();
    } catch (err: any) {
      const msg = err?.message || err?.error?.message || 'Failed to update service record.';
      setFormError(msg);
      toast.error('Update Failed', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isBusy = isSubmitting || updateMutation.isPending;

  if (!service) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Edit Service — ${service.serviceNumber}`}
      description="Update customer, equipment, schedule, technician assignment, status, and job card details."
      size="xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        {formError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {formError}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 gap-4 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('details')}
            className={`pb-2.5 flex items-center gap-1.5 transition-colors border-b-2 cursor-pointer ${
              activeTab === 'details'
                ? 'border-primary-600 text-primary-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            Service & Assignment Details
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('execution')}
            className={`pb-2.5 flex items-center gap-1.5 transition-colors border-b-2 cursor-pointer ${
              activeTab === 'execution'
                ? 'border-primary-600 text-primary-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            Job Card & Work Execution
            {(formData.status === 'COMPLETED' || formData.status === 'IN_PROGRESS' || Number(formData.totalCharges) > 0) && (
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
            )}
          </button>
        </div>

        {activeTab === 'details' ? (
          <div className="space-y-4">
            {/* 1. Customer Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-500" />
                  Customer <span className="text-rose-500">*</span>
                </label>
                {customerSearch.trim() && (
                  <span className="text-[11px] font-medium text-slate-500">
                    {isLoadingCustomers ? 'Searching...' : `${filteredCustomerList.length} matching customer(s)`}
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
                        ? '— No customers match search —'
                        : `— Select Customer (${filteredCustomerList.length} found) —`
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

            {/* 2. Customer Machine / Equipment Name */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-slate-500" />
                  Product / Equipment Name
                </label>
                {formData.customerId && cleanAssetSuggestions.length > 0 && (
                  <span className="text-[11px] font-medium text-slate-500">
                    {cleanAssetSuggestions.length} registered item(s) on file
                  </span>
                )}
              </div>

              <div className="relative">
                <Input
                  type="text"
                  list="edit-customer-machine-suggestions"
                  placeholder={
                    !formData.customerId
                      ? 'Select customer above first, or enter product name directly...'
                      : 'Enter product or equipment name...'
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
                      assetId: matched ? matched.id : prev.assetId,
                    }));
                  }}
                />

                <datalist id="edit-customer-machine-suggestions">
                  {cleanAssetSuggestions.map((a) => (
                    <option
                      key={a.id}
                      value={a.productName || a.customName || 'Product'}
                    >
                      {a.serialNumber ? `SN: ${a.serialNumber}` : a.assetNumber || ''}
                    </option>
                  ))}
                </datalist>
              </div>

              {/* Quick select chips if customer has registered machines */}
              {formData.customerId && cleanAssetSuggestions.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className="text-[11px] text-slate-400">Quick select:</span>
                  {cleanAssetSuggestions.slice(0, 4).map((a) => {
                    const label = a.productName || a.customName || 'Product';
                    const isSelected = machineName.toLowerCase() === label.toLowerCase();
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          setMachineName(label);
                          setFormData((prev) => ({ ...prev, assetId: a.id }));
                        }}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-medium transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-primary-50 text-primary-700 border-primary-300 font-semibold'
                            : 'bg-slate-100 hover:bg-primary-50 hover:text-primary-700 text-slate-600 border-slate-200'
                        }`}
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

            {/* 3. Service Status & Priority */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Status</label>
                <Select
                  options={[
                    { value: 'SCHEDULED', label: 'Scheduled' },
                    { value: 'ASSIGNED', label: 'Assigned' },
                    { value: 'IN_PROGRESS', label: 'In Progress' },
                    { value: 'COMPLETED', label: 'Completed' },
                    { value: 'CANCELLED', label: 'Cancelled' },
                    { value: 'OVERDUE', label: 'Overdue' },
                  ]}
                  value={formData.status || 'SCHEDULED'}
                  onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value as any }))}
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

            {/* If Cancelled, show Cancel Reason */}
            {formData.status === 'CANCELLED' && (
              <div className="space-y-1.5 p-3 bg-rose-50/70 border border-rose-200 rounded-xl">
                <label className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                  Cancellation Reason <span className="text-rose-600">*</span>
                </label>
                <Input
                  placeholder="e.g. Customer rescheduled to next month, customer cancelled request..."
                  value={formData.cancelReason || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, cancelReason: e.target.value }))}
                />
              </div>
            )}

            {/* 4. Service Type, Location & Classification */}
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

            {/* 5. Scheduled Date & Slot */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  Time Slot
                </label>
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
            </div>

            {/* 6. Assigned Technician */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">Assigned Technician</label>
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

            {/* 7. Notes */}
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
          </div>
        ) : (
          <div className="space-y-4">
            {/* Job Card Execution Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Technician Diagnosis</label>
                <Textarea
                  placeholder="e.g. Diagnostic findings, wear and tear, component malfunction..."
                  rows={3}
                  value={formData.diagnosis || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, diagnosis: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Work Performed</label>
                <Textarea
                  placeholder="e.g. Cleaned components, replaced worn parts, tested functionality..."
                  rows={3}
                  value={formData.workPerformed || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, workPerformed: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Technician Notes</label>
                <Textarea
                  placeholder="e.g. Advised customer on pressure valve and regular flushes..."
                  rows={2}
                  value={formData.technicianNotes || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, technicianNotes: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">Customer Remarks</label>
                <Textarea
                  placeholder="e.g. Customer satisfied with water output and taste..."
                  rows={2}
                  value={formData.customerRemarks || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, customerRemarks: e.target.value }))}
                />
              </div>
            </div>

            {/* Financial Charges */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                  Service Financials & Job Card Charges
                </h4>
                <span className="text-[11px] text-slate-500 font-medium">
                  {formData.serviceClassification === 'WARRANTY' ? 'Under Warranty (Free)' : 'Billable Service'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600">Labor Charges (₹)</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.laborCharges ?? 0}
                    onChange={(e) => handleLaborOrPartsChange('labor', parseFloat(e.target.value) || 0)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-600">Parts Charges (₹)</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.partsCharges ?? 0}
                    onChange={(e) => handleLaborOrPartsChange('parts', parseFloat(e.target.value) || 0)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-800">Total Charges (₹)</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.totalCharges ?? 0}
                    onChange={(e) => setFormData((prev) => ({ ...prev, totalCharges: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

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
            {isBusy ? 'Saving Changes...' : 'Save Service Changes'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
