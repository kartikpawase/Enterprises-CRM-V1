import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { queryClient } from '../../../lib/query-client';
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  ExternalLink,
  Calendar,
  Clock,
  AlertTriangle,
  RotateCw,
  Wrench,
  Shield,
  History,
  FileText,
  User,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  Layers,
  Play,
  Pause,
  Plus,
  Trash2,
  Save,
  Check,
  Package,
  X,
  FileCheck,
  Receipt,
  CreditCard,
  QrCode,
  Building2,
  Printer,
  Copy,
  CheckCheck,
  ArrowUpRight,
  Navigation,
  Info,
} from 'lucide-react';
import { TECHNICIAN_COMPLETED_ROUTE } from '@crm/shared';
import { useTechnicianTracking } from '../hooks/useTechnicianTracking';
import { apiClient } from '../../../lib/api-client';
import type { TechnicianServiceDetail, TechnicianBillingSummary, TechnicianPaymentReceipt } from '@crm/types';
import { RevampInvoiceView } from '../../../components/invoices/RevampInvoiceView';
import { sendInvoiceViaWhatsApp } from '../../../lib/whatsapp';

interface MaterialItem {
  id?: string;
  name: string;
  sku?: string;
  brand?: string;
  model?: string;
  productType?: string;
  unitPrice?: number;
  currentStock?: number;
}

interface PartReplacedEntry {
  itemId?: string;
  inventoryItemId?: string;
  productId?: string;
  itemName: string;
  description?: string;
  sku?: string;
  quantity: number;
  unitPrice?: number;
  lineTotal?: number;
  isWarrantyCovered?: boolean;
  inventoryDeducted?: boolean;
}

export const TechnicianServiceDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const tracking = useTechnicianTracking(id);

  const [service, setService] = useState<TechnicianServiceDetail | null>(null);
  const [billing, setBilling] = useState<TechnicianBillingSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<{ message: string; isForbidden?: boolean } | null>(null);

  // Phase 5: Execution Actions State
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Hold state
  const [holdReason, setHoldReason] = useState<string>('');

  // Execution modal state & mode ('complete' | 'hold')
  const [isExecutionModalOpen, setIsExecutionModalOpen] = useState<boolean>(false);
  const [executionMode, setExecutionMode] = useState<'complete' | 'hold'>('complete');
  const [diagnosis, setDiagnosis] = useState<string>('');
  const [workPerformed, setWorkPerformed] = useState<string>('');
  const [technicianNotes, setTechnicianNotes] = useState<string>('');
  const [customerRemarks, setCustomerRemarks] = useState<string>('');
  const [partsReplaced, setPartsReplaced] = useState<PartReplacedEntry[]>([]);
  const [businessFields, setBusinessFields] = useState<Record<string, string>>({
    pressureBar: '',
    temperatureC: '',
  });
  const [customerConfirmed, setCustomerConfirmed] = useState<boolean>(false);
  const [customerSignerName, setCustomerSignerName] = useState<string>('');

  // Materials Catalog Picker & Billing state
  const [catalogMaterials, setCatalogMaterials] = useState<MaterialItem[]>([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>('');
  const [selectedPartName, setSelectedPartName] = useState<string>('');
  const [selectedPartQty, setSelectedPartQty] = useState<number>(1);
  const [selectedPartWarranty, setSelectedPartWarranty] = useState<boolean>(false);
  // Manual spare parts entry state
  const [sparePartEntryMode, setSparePartEntryMode] = useState<'manual' | 'catalog'>('manual');
  const [manualPartName, setManualPartName] = useState<string>('');
  const [manualPartQty, setManualPartQty] = useState<number>(1);
  const [manualPartPrice, setManualPartPrice] = useState<string>('');
  const [serviceCharge, setServiceCharge] = useState<string>('');
  const [gstEnabled, setGstEnabled] = useState<boolean>(false);
  const [gstRate, setGstRate] = useState<number>(18);
  const [isCustomGstRate, setIsCustomGstRate] = useState<boolean>(false);
  const [customGstRateInput, setCustomGstRateInput] = useState<string>('18');
  const [completionPaymentMethod, setCompletionPaymentMethod] = useState<'CASH' | 'ONLINE'>('CASH');
  const [completionPaymentAmount, setCompletionPaymentAmount] = useState<string>('');
  const [completionPaymentReference, setCompletionPaymentReference] = useState<string>('');
  const [isCompletionConfirmOpen, setIsCompletionConfirmOpen] = useState<boolean>(false);
  const [completedInvoice, setCompletedInvoice] = useState<any | null>(null);
  const [isCompletedInvoiceModalOpen, setIsCompletedInvoiceModalOpen] = useState<boolean>(false);

  // Phase 7: Payment Collection State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [paymentBusinessDetails, setPaymentBusinessDetails] = useState<any>(null);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE' | 'OTHER'>('UPI');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [isPaymentConfirming, setIsPaymentConfirming] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccessData, setPaymentSuccessData] = useState<any | null>(null);
  const [activeReceipt, setActiveReceipt] = useState<TechnicianPaymentReceipt | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const fetchServiceDetail = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.get<TechnicianServiceDetail>(`/technician/me/services/${id}`);
      if (response && response.data) {
        setService(response.data);
        setBilling(response.data.billing || null);
        if (response.data.diagnosis) setDiagnosis(String(response.data.diagnosis));
        if (response.data.workPerformed) setWorkPerformed(String(response.data.workPerformed));
        if (response.data.technicianNotes) setTechnicianNotes(String(response.data.technicianNotes));
        if (response.data.laborCharges !== undefined && response.data.laborCharges !== null) {
          setServiceCharge(String(response.data.laborCharges));
        }
        if (Array.isArray(response.data.partsReplaced) && response.data.partsReplaced.length > 0) {
          setPartsReplaced(
            response.data.partsReplaced.map((p: any) => ({
              productId: (p.productId && String(p.productId).trim()) || (p.inventoryItemId && String(p.inventoryItemId).trim()) || (p.itemId && String(p.itemId).trim()) || undefined,
              inventoryItemId: (p.inventoryItemId && String(p.inventoryItemId).trim()) || (p.productId && String(p.productId).trim()) || (p.itemId && String(p.itemId).trim()) || undefined,
              itemId: (p.itemId && String(p.itemId).trim()) || (p.productId && String(p.productId).trim()) || undefined,
              itemName: p.itemName || p.partName || 'Spare Part',
              description: p.description || '',
              sku: p.sku || '',
              quantity: Number(p.quantity) || 1,
              unitPrice: Number(p.unitPrice ?? p.price ?? 0),
              isWarrantyCovered: Boolean(p.isWarrantyCovered),
              inventoryDeducted: Boolean(p.inventoryDeducted),
            }))
          );
        }
      }
    } catch (err: any) {
      const isForbidden =
        err?.status === 403 || err?.statusCode === 403 || err?.code === 'SERVICE_NOT_ASSIGNED';
      setError({
        message: err?.message || 'Unable to retrieve assigned service details.',
        isForbidden,
      });
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  // Load available spare parts catalog for the materials picker
  const loadMaterialsCatalog = useCallback(async () => {
    try {
      const response = await apiClient.get<MaterialItem[]>('/technician/catalog/materials');
      if (response && response.data) {
        setCatalogMaterials(response.data);
      }
    } catch {
      // Non-fatal: technician can still type part name manually
    }
  }, []);

  useEffect(() => {
    fetchServiceDetail();
    loadMaterialsCatalog();
  }, [fetchServiceDetail, loadMaterialsCatalog]);

  // Target Job Card ID (or fallback to service ID)
  const getJobCardTargetId = () => service?.jobCardId || service?.id || '';

  // 1. Start Job
  const handleStartJob = async () => {
    const targetId = getJobCardTargetId();
    if (!targetId) return;

    setActionLoading('start');
    setActionError(null);
    setActionSuccess(null);

    try {
      await apiClient.post(`/technician/job-cards/${targetId}/start`, {});
      setActionSuccess('Job execution started successfully!');
      await fetchServiceDetail();
    } catch (err: any) {
      setActionError(err?.message || 'Unable to start job card execution.');
    } finally {
      setActionLoading(null);
    }
  };

  // Helper: Sanitize parts payload to ensure clean strings/numbers and prevent null values
  const sanitizePartsPayload = (parts: PartReplacedEntry[]) => {
    return (parts || [])
      .filter((p) => p && p.itemName && p.itemName.trim())
      .map((p) => {
        const invId =
          (p.inventoryItemId && String(p.inventoryItemId).trim()) ||
          (p.itemId && String(p.itemId).trim()) ||
          undefined;
        const prodId = (p.productId && String(p.productId).trim()) || invId;
        const itemId = (p.itemId && String(p.itemId).trim()) || prodId;
        const desc = (p.description && String(p.description).trim()) || undefined;
        const sku = (p.sku && String(p.sku).trim()) || undefined;
        return {
          itemId,
          productId: prodId,
          inventoryItemId: invId,
          sku,
          itemName: p.itemName.trim(),
          description: desc,
          quantity: Math.max(1, Number(p.quantity) || 1),
          unitPrice: Math.max(0, Number(p.unitPrice ?? (p as any).price ?? 0)),
          isWarrantyCovered: Boolean(p.isWarrantyCovered),
          inventoryDeducted: Boolean(p.inventoryDeducted),
        };
      });
  };

  // 2. Put On Hold with Execution Progress & Consumed Spare Parts
  const handleSaveAndHoldJob = async () => {
    if (actionLoading === 'hold') return;
    const targetId = getJobCardTargetId();
    if (!targetId) return;

    const finalReason = holdReason.trim() || 'Work paused / on hold';

    setActionLoading('hold');
    setActionError(null);
    setActionSuccess(null);

    const effectiveParts = commitPendingDraftSpare();
    const sanitizedParts = sanitizePartsPayload(effectiveParts);

    try {
      await apiClient.post(`/technician/job-cards/${targetId}/hold`, {
        reason: finalReason,
        holdReason: finalReason,
        diagnosis: (diagnosis && diagnosis.trim()) || undefined,
        workPerformed: (workPerformed && workPerformed.trim()) || undefined,
        technicianNotes: (technicianNotes && technicianNotes.trim()) || undefined,
        customerRemarks: (customerRemarks && customerRemarks.trim()) || undefined,
        partsReplaced: sanitizedParts,
        serviceCharge: parsedLabor > 0 ? parsedLabor : undefined,
        gstEnabled: Boolean(gstEnabled),
        gstRate: gstEnabled ? effectiveGstRate : undefined,
        businessFields: businessFields && Object.keys(businessFields).length > 0 ? businessFields : undefined,
      });

      setIsExecutionModalOpen(false);
      setActionSuccess('Job saved and placed on hold.');
      setService((prev) => (prev ? { ...prev, status: 'ON_HOLD', jobCardStatus: 'ON_HOLD' } : prev));

      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['job-cards'] });

      await fetchServiceDetail();
    } catch (err: any) {
      setActionError(err?.message || 'Unable to save progress and put job on hold.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleHoldJob = handleSaveAndHoldJob;

  // 3. Resume Job
  const handleResumeJob = async () => {
    const targetId = getJobCardTargetId();
    if (!targetId) return;

    setActionLoading('resume');
    setActionError(null);
    setActionSuccess(null);

    try {
      await apiClient.post(`/technician/job-cards/${targetId}/resume`, {});
      setActionSuccess('Job resumed successfully!');
      setService((prev) => (prev ? { ...prev, status: 'IN_PROGRESS', jobCardStatus: 'IN_PROGRESS' } : prev));
      await fetchServiceDetail();
    } catch (err: any) {
      setActionError(err?.message || 'Unable to resume job execution.');
    } finally {
      setActionLoading(null);
    }
  };

  // 4. Save Progress (PATCH)
  const handleSaveProgress = async () => {
    const targetId = getJobCardTargetId();
    if (!targetId) return;

    setActionLoading('save');
    setActionError(null);
    setActionSuccess(null);

    const effectiveParts = commitPendingDraftSpare();
    const sanitizedParts = sanitizePartsPayload(effectiveParts);

    try {
      await apiClient.patch(`/technician/job-cards/${targetId}`, {
        diagnosis: (diagnosis && diagnosis.trim()) || undefined,
        workPerformed: (workPerformed && workPerformed.trim()) || undefined,
        technicianNotes: (technicianNotes && technicianNotes.trim()) || undefined,
        customerRemarks: (customerRemarks && customerRemarks.trim()) || undefined,
        partsReplaced: sanitizedParts,
        businessFields: businessFields && Object.keys(businessFields).length > 0 ? businessFields : undefined,
      });
      setActionSuccess('Execution details saved successfully.');
      await fetchServiceDetail();
    } catch (err: any) {
      setActionError(err?.message || 'Unable to save execution details.');
    } finally {
      setActionLoading(null);
    }
  };

  // Bill Calculations
  const partsSubtotal = partsReplaced.reduce((sum, p) => {
    if (p.isWarrantyCovered) return sum;
    const price = Math.max(0, Number(p.unitPrice ?? (p as any).price ?? 0));
    return sum + price * Math.max(1, Number(p.quantity) || 1);
  }, 0);
  const parsedLabor = Math.max(0, parseFloat(serviceCharge) || 0);
  const billSubtotal = partsSubtotal + parsedLabor;
  const effectiveGstRate = gstEnabled
    ? (isCustomGstRate ? Math.max(0, parseFloat(customGstRateInput) || 0) : gstRate)
    : 0;
  const billTax = gstEnabled ? (billSubtotal * effectiveGstRate) / 100 : 0;
  const billTotal = billSubtotal + billTax;

  const paidNum = completionPaymentAmount !== '' ? Math.max(0, parseFloat(completionPaymentAmount) || 0) : billTotal;
  const remainingNum = Math.max(0, billTotal - paidNum);
  let livePaymentStatus = 'NOT PAID';
  if (paidNum >= billTotal && billTotal > 0) {
    livePaymentStatus = 'PAID';
  } else if (paidNum > 0) {
    livePaymentStatus = 'PARTIALLY PAID';
  }

  // 5. Complete Job
  const handleCompleteJob = async () => {
    if (actionLoading === 'complete') return; // Prevent duplicate submissions
    const targetId = getJobCardTargetId();
    if (!targetId) return;

    if (!workPerformed || !workPerformed.trim()) {
      setActionError('Work performed description is required to complete this job.');
      return;
    }

    setActionLoading('complete');
    setActionError(null);
    setActionSuccess(null);

    const effectiveParts = commitPendingDraftSpare();
    const sanitizedParts = sanitizePartsPayload(effectiveParts);

    try {
      const response = await apiClient.post<any>(`/technician/job-cards/${targetId}/complete`, {
        workPerformed: workPerformed.trim(),
        diagnosis: (diagnosis && diagnosis.trim()) || undefined,
        technicianNotes: (technicianNotes && technicianNotes.trim()) || undefined,
        partsReplaced: sanitizedParts,
        serviceCharge: parsedLabor,
        gstEnabled: Boolean(gstEnabled),
        gstRate: gstEnabled ? effectiveGstRate : undefined,
        payment: {
          method: completionPaymentMethod,
          amount: paidNum,
          reference: completionPaymentMethod === 'ONLINE' ? ((completionPaymentReference && completionPaymentReference.trim()) || undefined) : undefined,
        },
        businessFields: businessFields && Object.keys(businessFields).length > 0 ? businessFields : undefined,
        customerSignatureFileId:
          customerConfirmed && customerSignerName && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customerSignerName.trim())
            ? customerSignerName.trim()
            : undefined,
        customerRemarks: [
          (customerRemarks && customerRemarks.trim()) || undefined,
          customerConfirmed && customerSignerName && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customerSignerName.trim())
            ? `Customer Confirmed by: ${customerSignerName.trim() || 'Customer'}`
            : undefined,
        ]
          .filter(Boolean)
          .join(' | ') || undefined,
      });

      setIsExecutionModalOpen(false);
      setIsCompletionConfirmOpen(false);

      const invoiceData = response?.data?.invoice || response?.data?.data?.invoice;
      if (invoiceData) {
        setCompletedInvoice(invoiceData);
        setIsCompletedInvoiceModalOpen(true);
      }

      setActionSuccess('Job completed and invoice generated successfully!');

      if (tracking.activeServiceId === id || tracking.isNavigating) {
        try {
          await tracking.stopTracking();
        } catch (stopErr) {
          console.warn('[Tracking] Clean stop tracking notice on job completion:', stopErr);
        }
      }

      // Clear persistent current job from localStorage so technician is no longer stuck on active job
      try {
        localStorage.removeItem('technician_current_job_id');
        localStorage.removeItem('technician_current_job_data');
      } catch {}

      // Invalidate Admin, CRM, and Technician caches so generated invoice and completed state immediately appear
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['job-cards'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['technician'] });
      queryClient.invalidateQueries({ queryKey: ['technician-services'] });
      queryClient.invalidateQueries({ queryKey: ['technician-summary'] });

      await fetchServiceDetail();
    } catch (err: any) {
      setActionError(err?.message || 'Unable to complete job card.');
    } finally {
      setActionLoading(null);
    }
  };

  // Helper: Add part from inventory catalog
  const handleAddCatalogPart = () => {
    const mat = catalogMaterials.find((m) => m.id === selectedMaterialId);
    if (!mat) return;

    const existingIdx = partsReplaced.findIndex(
      (p) => (p.productId || p.inventoryItemId) === mat.id
    );
    if (existingIdx >= 0) {
      handleUpdatePart(
        existingIdx,
        'quantity',
        partsReplaced[existingIdx].quantity + selectedPartQty
      );
    } else {
      setPartsReplaced((prev) => [
        ...prev,
        {
          productId: mat.id,
          inventoryItemId: mat.id,
          itemId: mat.id,
          itemName: mat.name,
          sku: mat.sku,
          description: [mat.brand, mat.model].filter(Boolean).join(' '),
          quantity: selectedPartQty,
          unitPrice: mat.unitPrice || 0,
          isWarrantyCovered: false,
          inventoryDeducted: false,
        },
      ]);
    }
    setSelectedMaterialId('');
    setSelectedPartQty(1);
  };

  // Helper: Commit any pending manual or catalog draft spare part into partsReplaced
  const commitPendingDraftSpare = (): PartReplacedEntry[] => {
    let updated = [...partsReplaced];
    if (sparePartEntryMode === 'manual' && manualPartName.trim()) {
      const priceNum = Math.max(0, parseFloat(manualPartPrice) || 0);
      const qtyNum = Math.max(1, parseInt(String(manualPartQty)) || 1);
      const newPart: PartReplacedEntry = {
        itemName: manualPartName.trim(),
        quantity: qtyNum,
        unitPrice: priceNum,
        isWarrantyCovered: false,
        inventoryDeducted: false,
      };
      updated = [...updated, newPart];
      setPartsReplaced(updated);
      setManualPartName('');
      setManualPartQty(1);
      setManualPartPrice('');
    } else if (sparePartEntryMode === 'catalog' && selectedMaterialId) {
      const mat = catalogMaterials.find((m) => m.id === selectedMaterialId);
      if (mat) {
        const existingIdx = updated.findIndex(
          (p) => (p.productId || p.inventoryItemId) === mat.id
        );
        if (existingIdx >= 0) {
          updated[existingIdx] = {
            ...updated[existingIdx],
            quantity: updated[existingIdx].quantity + selectedPartQty,
          };
        } else {
          updated = [
            ...updated,
            {
              productId: mat.id,
              inventoryItemId: mat.id,
              itemId: mat.id,
              itemName: mat.name,
              sku: mat.sku,
              quantity: selectedPartQty,
              unitPrice: Number(mat.unitPrice || 0),
              isWarrantyCovered: selectedPartWarranty,
              inventoryDeducted: false,
            },
          ];
        }
        setPartsReplaced(updated);
        setSelectedMaterialId('');
        setSelectedPartQty(1);
        setSelectedPartWarranty(false);
      }
    }
    return updated;
  };

  // Helper: Add direct manual part from form inputs
  const handleAddDirectManualPart = () => {
    commitPendingDraftSpare();
  };

  // Helper: Add manual part row
  const handleAddManualPart = () => {
    setPartsReplaced((prev) => [
      ...prev,
      {
        itemName: '',
        description: '',
        quantity: 1,
        unitPrice: 0,
        isWarrantyCovered: false,
      },
    ]);
  };

  // Helper: Update a spare part row
  const handleUpdatePart = (index: number, field: keyof PartReplacedEntry, value: any) => {
    setPartsReplaced((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // Helper: Remove part from parts list
  const handleRemovePart = (index: number) => {
    setPartsReplaced((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Phase 7: Open payment collection modal
  const openPaymentModal = async () => {
    const targetId = getJobCardTargetId();
    if (!targetId || !billing) return;

    setPaymentError(null);
    setPaymentSuccessData(null);
    setIsPaymentConfirming(false);
    setPaymentAmount(String(billing.outstandingAmount));
    setPaymentMethod('UPI');
    setPaymentReference('');
    setPaymentNotes('');
    setIsPaymentModalOpen(true);

    try {
      const res = await apiClient.get<any>(`/technician/job-cards/${targetId}/payment-summary`);
      if (res?.data) {
        setPaymentBusinessDetails(res.data);
        if (res.data.outstandingAmount !== undefined) {
          setPaymentAmount(String(res.data.outstandingAmount));
        }
      }
    } catch {
      // Fall back to existing billing summary
    }
  };

  // Phase 7: Submit payment recording
  const handleRecordPayment = async () => {
    const targetId = getJobCardTargetId();
    if (!targetId) return;

    const numAmount = parseFloat(paymentAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setPaymentError('Please enter a valid payment amount greater than zero.');
      return;
    }

    if (billing && numAmount > Number(billing.outstandingAmount) + 0.001) {
      setPaymentError(
        `Amount cannot exceed current outstanding balance of ₹${Number(billing.outstandingAmount).toFixed(2)}.`
      );
      return;
    }

    setPaymentLoading(true);
    setPaymentError(null);

    try {
      const idempotencyKey = `tech-pay-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const res = await apiClient.post<any>(`/technician/job-cards/${targetId}/payment`, {
        amount: numAmount,
        paymentMethod,
        referenceNumber: paymentReference.trim() || undefined,
        notes: paymentNotes.trim() || undefined,
        idempotencyKey,
      });

      setPaymentSuccessData(res.data);
      setIsPaymentConfirming(false);
      await fetchServiceDetail();
    } catch (err: any) {
      setPaymentError(err?.message || 'Unable to record payment.');
    } finally {
      setPaymentLoading(false);
    }
  };

  // Phase 7: View official payment receipt
  const handleViewReceipt = async (paymentId: string) => {
    setReceiptLoading(true);
    try {
      const res = await apiClient.get<any>(`/technician/payments/${paymentId}/receipt`);
      setActiveReceipt(res.data);
      setIsReceiptModalOpen(true);
    } catch (err: any) {
      setActionError(err?.message || 'Unable to retrieve payment receipt');
    } finally {
      setReceiptLoading(false);
    }
  };

  // Copy helper
  const handleCopy = (text: string, fieldKey: string) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedField(fieldKey);
      setTimeout(() => setCopiedField(null), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-5 max-w-3xl animate-pulse">
        <div className="h-6 w-32 bg-slate-200 rounded-lg" />
        <div className="h-28 bg-white border border-slate-200/90 rounded-card shadow-2xs" />
        <div className="h-40 bg-white border border-slate-200/90 rounded-card shadow-2xs" />
        <div className="h-40 bg-white border border-slate-200/90 rounded-card shadow-2xs" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6 max-w-3xl">
        <button
          type="button"
          onClick={() => navigate('/technician/services')}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Assigned Services</span>
        </button>

        <div
          className={`p-6 rounded-card border text-center space-y-4 ${
            error.isForbidden
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-white border-slate-200/90 text-slate-800 shadow-2xs'
          }`}
        >
          <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {error.isForbidden ? 'Access Denied: Service Not Assigned' : 'Service Not Available'}
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">{error.message}</p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            {!error.isForbidden && (
              <button
                type="button"
                onClick={fetchServiceDetail}
                className="flex items-center gap-1.5 px-4 py-2 rounded-btn bg-white hover:bg-slate-50 border border-slate-200/90 text-slate-700 text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
            )}
            <Link
              to="/technician/services"
              className="px-4 py-2 rounded-btn bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold shadow-2xs transition-colors"
            >
              Return to Work Queue
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!service) {
    return null;
  }

  const addressParts = [
    service.location?.addressLine1,
    service.location?.addressLine2,
    service.location?.landmark ? `Near ${service.location.landmark}` : null,
    service.location?.city,
    service.location?.state,
    service.location?.pincode,
  ]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter((part) => Boolean(part) && part !== 'Main Service Location');

  const fullRegisteredAddress = addressParts.join(', ');

  const mapQuery = fullRegisteredAddress || [service.customer?.fullName, service.location?.city || 'Pune'].filter(Boolean).join(', ');

  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    mapQuery
  )}`;

  const isCompleted =
    service.status === 'COMPLETED' ||
    (service as any).jobCardStatus === 'COMPLETED' ||
    (service as any).jobCardStatus === 'CUSTOMER_CONFIRMED' ||
    (service as any).jobCardStatus === 'CLOSED';
  const isOnHold =
    (service.status === 'ON_HOLD' || (service as any).jobCardStatus === 'ON_HOLD') &&
    !isCompleted;
  const isInProgress =
    !isCompleted &&
    (service.status === 'IN_PROGRESS' ||
      (service as any).jobCardStatus === 'IN_PROGRESS' ||
      (service as any).jobCardStatus === 'STARTED' ||
      (service as any).jobCardStatus === 'DIAGNOSIS') &&
    !isOnHold;
  const isAssigned =
    !isCompleted &&
    (service.status === 'ASSIGNED' || service.status === 'SCHEDULED') &&
    !isInProgress &&
    !isOnHold;


  const hasCustomerCoordinates = Boolean(
    service.location?.latitude !== null &&
    service.location?.latitude !== undefined &&
    service.location?.longitude !== null &&
    service.location?.longitude !== undefined &&
    !isNaN(Number(service.location?.latitude)) &&
    !isNaN(Number(service.location?.longitude))
  );

  const handleNavigateClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    const res = await tracking.navigate(service.id);
    if (!res?.success && mapUrl) {
      window.open(mapUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6 max-w-3xl mx-auto">
      {/* Conflict Modal: Switch Active Destination */}
      {tracking.conflictModal?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-base font-bold text-slate-900">Switch Active Destination?</h4>
                <p className="text-xs text-slate-500">Only one active navigation is permitted at a time.</p>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              You are currently navigating to <strong>{tracking.conflictModal.activeServiceNumber}</strong>. Switching destination will clear tracking for that service and set <strong>{service.serviceNumber}</strong> as your active destination.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={tracking.dismissConflictModal}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={tracking.confirmSwitchDestination}
                className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
              >
                Confirm Switch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1. Navigation Header */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate('/technician/services')}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200/90 text-xs sm:text-sm font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-slate-500" />
          <span>Back to Assigned Services</span>
        </button>
        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-primary-50 border border-primary-200 text-primary-700">
          Work Order Detail
        </span>
      </div>

      {/* Live Tracking Operational Banner */}
      {tracking.isThisServiceActive && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/90 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-blue-600 text-white shrink-0 shadow-xs">
              <Navigation className="w-5 h-5 animate-pulse" />
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-blue-950 uppercase tracking-wider">
                  Live Navigation Active
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    tracking.state.trackingStatus === 'AT_CUSTOMER'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : tracking.state.trackingStatus === 'ARRIVAL_PENDING'
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : 'bg-blue-100 text-blue-800 border border-blue-300'
                  }`}
                >
                  {tracking.state.trackingStatus === 'AT_CUSTOMER'
                    ? 'ARRIVED AT CUSTOMER'
                    : tracking.state.trackingStatus === 'ARRIVAL_PENDING'
                    ? 'APPROACHING DESTINATION'
                    : 'ON THE WAY'}
                </span>
              </div>
              <p className="text-xs text-blue-700 mt-0.5 font-medium">
                {tracking.state.distanceText ? `${tracking.state.distanceText} remaining` : 'Travelling to customer'}
                {tracking.state.etaText ? ` · ETA: ${tracking.state.etaText}` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center">
            {hasCustomerCoordinates && (
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${service.location.latitude},${service.location.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg bg-white border border-blue-200 text-blue-700 hover:bg-blue-50 text-xs font-semibold shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span>Google Maps</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            <button
              type="button"
              onClick={tracking.stopTracking}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
            >
              Stop Navigation
            </button>
          </div>
        </div>
      )}

      {/* Global Action Notifications */}
      {actionSuccess && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span className="font-medium">{actionSuccess}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionSuccess(null)}
            className="text-emerald-700 hover:text-emerald-900 cursor-pointer p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {actionError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
            <span className="font-medium">{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-rose-700 hover:text-rose-900 cursor-pointer p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. Customer Details & Service Address (At Top) */}
      <div className="bg-white border border-slate-200/90 rounded-card p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
            <User className="w-4 h-4 text-primary-600" />
            <span>Customer Details & Address</span>
          </h2>
          {service.customer.customerNumber && (
            <span className="font-mono text-xs text-slate-500 font-semibold bg-slate-100 px-2.5 py-0.5 rounded-md border border-slate-200/60">
              {service.customer.customerNumber}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 truncate">{service.customer.fullName}</h3>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Authorized service account</p>
          </div>

          <div className="flex flex-row items-center gap-2.5 shrink-0">
            {mapUrl && (
              <a
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleNavigateClick}
                className={`w-11 h-11 inline-flex items-center justify-center rounded-xl text-white shadow-2xs transition-all cursor-pointer ${
                  tracking.isThisServiceActive
                    ? 'bg-emerald-600 hover:bg-emerald-700 ring-2 ring-emerald-400 ring-offset-2'
                    : 'bg-primary-600 hover:bg-primary-700 active:bg-primary-800'
                }`}
                title="Navigate to customer address on Google Maps"
                aria-label="NAVIGATE"
              >
                <MapPin className="w-5 h-5" />
                <span className="sr-only">NAVIGATE</span>
              </a>
            )}
            {service.customer.phone && (
              <a
                href={`tel:${service.customer.phone}`}
                className="w-11 h-11 inline-flex items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white shadow-2xs transition-all cursor-pointer"
                title="Call Customer"
                aria-label="CALL CUSTOMER"
              >
                <Phone className="w-5 h-5" />
                <span className="sr-only">CALL CUSTOMER</span>
              </a>
            )}
          </div>
        </div>

        {/* Clean Contact Details Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs sm:text-sm">
          <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/80 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary-50 border border-primary-100 flex items-center justify-center shrink-0">
              <Phone className="w-4 h-4 text-primary-600" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] text-slate-500 uppercase font-semibold">Primary Phone</div>
              <div className="font-semibold text-slate-900 text-sm mt-0.5 truncate">
                {service.customer.phone || 'Not recorded'}
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/80 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary-50 border border-primary-100 flex items-center justify-center shrink-0">
              <Mail className="w-4 h-4 text-primary-600" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] text-slate-500 uppercase font-semibold">Email Dispatch</div>
              <div className="font-semibold text-slate-900 text-sm mt-0.5 truncate">
                {service.customer.email || 'Not registered'}
              </div>
            </div>
          </div>
        </div>

        {/* Merged Registered Service Address */}
        <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-2 text-xs sm:text-sm">
          <div className="flex items-center justify-between pb-1 border-b border-slate-200/60">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <span>Registered Service Address</span>
            </div>
            {mapUrl && (
              <a
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-bold text-primary-600 hover:text-primary-800 transition-colors cursor-pointer"
              >
                <span>OPEN MAP</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <div className="space-y-1 pt-0.5">
            <div className="font-bold text-slate-900 text-sm sm:text-base">
              {service.location.addressLine1 && service.location.addressLine1 !== 'Main Service Location'
                ? service.location.addressLine1
                : service.customer.fullName || 'Registered Doorstep Address'}
            </div>
            {service.location.addressLine2 && (
              <div className="text-slate-700 font-medium">{service.location.addressLine2}</div>
            )}
            {service.location.landmark && (
              <div className="text-slate-600 flex items-center gap-1.5 text-xs">
                <span className="text-slate-400 font-medium">Landmark:</span>
                <span className="font-semibold text-slate-700">{service.location.landmark}</span>
              </div>
            )}
            <div className="text-slate-600 font-semibold pt-1 border-t border-slate-200/60 text-xs sm:text-sm">
              {[service.location.city, service.location.state, service.location.pincode]
                .filter(Boolean)
                .join(', ')}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Problem & Customer Note (Below Customer Details) */}
      <div className="bg-white border border-slate-200/90 rounded-card p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary-600" />
            <span>Problem & Customer Note</span>
          </h2>
        </div>

        <div className="space-y-3">
          {/* Problem */}
          <div className="p-4 rounded-xl bg-amber-50/80 border border-amber-200 text-xs sm:text-sm">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase text-amber-900 tracking-wider">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>Problem</span>
            </div>
            <div className="text-amber-950 mt-1.5 font-medium leading-relaxed">
              {service.problemReported || 'No problem description reported.'}
            </div>
          </div>

          {/* Customer Note */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 text-xs sm:text-sm">
            <div className="text-xs font-bold uppercase text-slate-600 tracking-wider">
              Customer Note
            </div>
            <div className="mt-1.5 text-slate-800 font-medium leading-relaxed">
              {service.customerNotes || 'No specific customer note recorded.'}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Execution Control Center */}
      <div className="bg-white border-2 border-primary-500/20 rounded-card p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-primary-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Execution Control Center
            </span>
          </div>
          <span className="text-xs text-slate-500">
            Current Status: <span className="text-slate-900 font-bold">{isOnHold ? 'ON HOLD' : service.status}</span>
          </span>
        </div>

        {/* State 1: ASSIGNED / SCHEDULED */}
        {isAssigned && (
          <div>
            <button
              type="button"
              onClick={handleStartJob}
              disabled={Boolean(actionLoading)}
              className="w-full py-3.5 sm:py-4 px-5 rounded-btn bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white font-extrabold text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-sm hover:shadow transition-all cursor-pointer disabled:opacity-50 min-h-[48px]"
            >
              <Play className="w-5 h-5 fill-white" />
              <span>{actionLoading === 'start' ? 'STARTING JOB...' : 'START JOB EXECUTION'}</span>
            </button>
          </div>
        )}

        {/* State 2: IN_PROGRESS */}
        {isInProgress && (
          <div className="space-y-3">
            {/* Primary Hero Action: Complete Job */}
            <button
              type="button"
              onClick={() => {
                setExecutionMode('complete');
                setActionError(null);
                setIsExecutionModalOpen(true);
              }}
              disabled={Boolean(actionLoading)}
              className="w-full py-3.5 sm:py-4 px-5 rounded-btn bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-sm transition-all cursor-pointer disabled:opacity-50 min-h-[48px]"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>COMPLETE JOB</span>
            </button>

            {/* Secondary Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setExecutionMode('complete');
                  setSparePartEntryMode('manual');
                  setManualPartName('');
                  setManualPartQty(1);
                  setManualPartPrice('');
                  setActionError(null);
                  setIsExecutionModalOpen(true);
                }}
                className="py-3 px-4 rounded-btn bg-primary-50 hover:bg-primary-100 border border-primary-200 text-primary-700 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer min-h-[44px]"
              >
                <FileText className="w-4 h-4 text-primary-600" />
                <span>RECORD WORK & PARTS</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setExecutionMode('hold');
                  setSparePartEntryMode('manual');
                  setManualPartName('');
                  setManualPartQty(1);
                  setManualPartPrice('');
                  setActionError(null);
                  setIsExecutionModalOpen(true);
                }}
                disabled={Boolean(actionLoading)}
                className="py-3 px-4 rounded-btn bg-slate-100 hover:bg-slate-200 border border-slate-200 text-amber-800 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 min-h-[44px]"
              >
                <Pause className="w-4 h-4 text-amber-600" />
                <span>PUT ON HOLD</span>
              </button>
            </div>
          </div>
        )}

        {/* State 3: ON_HOLD */}
        {isOnHold && (
          <div className="space-y-3">
            <div className="text-xs sm:text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 font-medium">
              <Pause className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-1.5 flex-1">
                <div className="font-semibold">This job is currently paused on hold. Press Resume to continue work.</div>
                {(service?.holdReason || (service?.technicianNotes && service.technicianNotes.includes('[Hold reason]:'))) && (
                  <div className="text-xs text-amber-800 bg-amber-100/70 p-2.5 rounded-lg border border-amber-200">
                    <span className="font-bold">Hold Reason: </span>
                    {service?.holdReason ||
                      service?.technicianNotes?.split('[Hold reason]:')[1]?.split('\n')[0]?.trim() ||
                      'On Hold'}
                  </div>
                )}
                {partsReplaced.length > 0 && (
                  <div className="text-xs text-amber-800">
                    <span className="font-semibold">Recorded Parts: </span>
                    {partsReplaced.map((p) => `${p.itemName} (x${p.quantity})`).join(', ')}
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={handleResumeJob}
              disabled={Boolean(actionLoading)}
              className="w-full py-3.5 sm:py-4 px-5 rounded-btn bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white font-extrabold text-sm sm:text-base flex items-center justify-center gap-2.5 shadow-sm transition-all cursor-pointer disabled:opacity-50 min-h-[48px]"
            >
              <Play className="w-5 h-5 fill-white" />
              <span>{actionLoading === 'resume' ? 'RESUMING...' : 'RESUME JOB'}</span>
            </button>
          </div>
        )}

        {/* State 4: COMPLETED */}
        {isCompleted && (
          <div>
            <div className="p-4 sm:p-5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                <div>
                  <div className="font-bold text-emerald-950 text-sm sm:text-base">Work Order Completed</div>
                  <div className="text-emerald-700 text-xs sm:text-sm mt-0.5">
                    Job card executed and recorded. This service is now in your Completed tab.
                  </div>
                </div>
              </div>
              <Link
                to={TECHNICIAN_COMPLETED_ROUTE}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs sm:text-sm shadow-2xs transition-colors shrink-0 self-start sm:self-auto cursor-pointer"
              >
                <span>View in Completed Tab</span>
                <ArrowUpRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* 5. Work Order & Schedule Details Card */}
      <div className="bg-white border border-slate-200/90 rounded-card p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm sm:text-base font-bold px-3 py-1 rounded-lg bg-primary-50 text-primary-700 border border-primary-200/90 tracking-wide">
              {service.serviceNumber}
            </span>
            <span
              className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
                service.priority === 'URGENT'
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : service.priority === 'HIGH'
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              {service.priority} PRIORITY
            </span>
          </div>

          {service.serviceClassification && (
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200/90 text-slate-700 text-xs font-semibold">
              {service.serviceClassification}
            </span>
          )}
        </div>

        <div>
          <h1 className="text-xl sm:text-2xl font-display font-extrabold text-slate-900 tracking-tight leading-snug">
            {service.serviceType.replace('_', ' ')}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-4 sm:gap-6 pt-3.5 border-t border-slate-100 text-xs sm:text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary-600 flex-shrink-0" />
            <span className="font-semibold text-slate-800">
              {new Date(service.scheduledDate).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </span>
          </div>
          {service.scheduledTimeSlot && (
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary-600 flex-shrink-0" />
              <span className="font-medium text-slate-700">{service.scheduledTimeSlot}</span>
            </div>
          )}
        </div>
      </div>

      {/* 6. Active Execution & Spare Parts Used Card */}
      {(partsReplaced.length > 0 || workPerformed || diagnosis) && (
        <div className="bg-white border border-slate-200/90 rounded-card p-5 sm:p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <Package className="w-4 h-4 text-primary-600" />
              <span>Active Job Execution & Spare Parts Used</span>
            </h2>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700">
              {partsReplaced.length} Part(s) Logged
            </span>
          </div>

          {/* Work & Diagnosis */}
          {(diagnosis || workPerformed) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {diagnosis && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                    Diagnosis
                  </span>
                  <div className="text-slate-800 font-medium">{diagnosis}</div>
                </div>
              )}
              {workPerformed && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                    Work Performed
                  </span>
                  <div className="text-slate-800 font-medium">{workPerformed}</div>
                </div>
              )}
            </div>
          )}

          {/* Spare Parts List */}
          {partsReplaced.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-bold uppercase text-slate-500">
                Recorded Spare Parts
              </div>
              <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-2.5 pl-3">Item Name</th>
                      <th className="p-2.5">Source</th>
                      <th className="p-2.5 text-center">Qty</th>
                      <th className="p-2.5 text-right">Unit Price</th>
                      <th className="p-2.5 text-right pr-3">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {partsReplaced.map((part, idx) => {
                      const isInv = Boolean(part.productId || part.inventoryItemId);
                      const unitPrice = Number(part.unitPrice || 0);
                      const lineTotal = part.isWarrantyCovered ? 0 : unitPrice * (part.quantity || 1);
                      return (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="p-2.5 pl-3 font-medium text-slate-900">{part.itemName}</td>
                          <td className="p-2.5">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                isInv
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-slate-100 text-slate-600 border border-slate-200'
                              }`}
                            >
                              {isInv ? 'Inventory' : 'Manual'}
                            </span>
                          </td>
                          <td className="p-2.5 text-center font-bold">{part.quantity}</td>
                          <td className="p-2.5 text-right font-mono">₹{unitPrice.toFixed(2)}</td>
                          <td className="p-2.5 text-right pr-3 font-mono font-bold text-slate-900">
                            {part.isWarrantyCovered ? (
                              <span className="text-emerald-600 text-[11px]">₹0.00 (Warranty)</span>
                            ) : (
                              `₹${lineTotal.toFixed(2)}`
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 8. Billing & Invoice Summary */}
      <div className="bg-white border border-slate-200/90 rounded-card p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-emerald-600" />
            <span>Billing & Invoice Summary</span>
          </h2>
          <span className="text-xs text-slate-500 font-medium">Read-Only CRM Truth</span>
        </div>

        {billing ? (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-50/80 border border-slate-200/80">
              <div>
                <div className="text-[11px] text-slate-500 uppercase font-semibold tracking-wider">
                  Official Invoice Number
                </div>
                <div className="font-mono text-base font-bold text-slate-900 mt-0.5">
                  {billing.invoiceNumber}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-bold px-3 py-1 rounded-full border ${
                    billing.paymentStatus === 'PAID'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : billing.paymentStatus === 'PARTIALLY_PAID'
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-rose-50 text-rose-800 border-rose-200'
                  }`}
                >
                  {billing.paymentStatus.replace('_', ' ')}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-1">
                <div className="text-[11px] text-slate-500 uppercase font-semibold">Invoice Total</div>
                <div className="text-lg font-extrabold text-slate-900">
                  ₹{Number(billing.totalAmount).toLocaleString('en-IN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-1">
                <div className="text-[11px] text-slate-500 uppercase font-semibold">Paid to Date</div>
                <div className="text-lg font-extrabold text-emerald-700">
                  ₹{Number(billing.paidAmount).toLocaleString('en-IN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-1">
                <div className="text-[11px] text-slate-500 uppercase font-semibold">
                  Outstanding Balance
                </div>
                <div
                  className={`text-lg font-extrabold ${
                    Number(billing.outstandingAmount) > 0 ? 'text-amber-700' : 'text-slate-500'
                  }`}
                >
                  ₹{Number(billing.outstandingAmount).toLocaleString('en-IN', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>
            </div>

            {Number(billing.outstandingAmount) > 0 ? (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={openPaymentModal}
                  className="w-full py-3.5 px-4 rounded-btn bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-sm shadow-2xs flex items-center justify-center gap-2 transition cursor-pointer min-h-[48px]"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>
                    Record Customer Payment (₹
                    {Number(billing.outstandingAmount).toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                    )
                  </span>
                </button>
              </div>
            ) : (
              <div className="pt-2 flex items-center justify-between p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs sm:text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span className="font-semibold">Invoice Fully Settled (No Outstanding Dues)</span>
                </div>
                {paymentSuccessData?.paymentId && (
                  <button
                    type="button"
                    onClick={() => handleViewReceipt(paymentSuccessData.paymentId)}
                    className="text-xs font-bold underline hover:text-emerald-900 cursor-pointer"
                  >
                    View Receipt
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="p-6 rounded-xl bg-slate-50/80 border border-slate-200/80 text-center space-y-1 text-xs sm:text-sm text-slate-500">
            <div className="font-semibold text-slate-700">Invoice not yet available</div>
            <p className="text-xs text-slate-400">
              Billing details will appear here once an invoice is issued by the CRM billing engine.
            </p>
          </div>
        )}
      </div>

      {/* 9. Relevant Work History Card */}
      <div className="bg-white border border-slate-200/90 rounded-card p-5 sm:p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
            <History className="w-4 h-4 text-purple-600" />
            <span>Relevant Work History</span>
          </h2>
          <span className="text-xs text-slate-500 font-medium">
            {service.relevantHistory?.length || 0} Previous Jobs
          </span>
        </div>

        {service.relevantHistory && service.relevantHistory.length > 0 ? (
          <div className="space-y-3">
            {service.relevantHistory.map((item, idx) => (
              <div
                key={item.serviceId || idx}
                className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/80 space-y-2 text-xs sm:text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs sm:text-sm font-bold text-primary-700">
                    {item.serviceNumber}
                  </span>
                  <span className="text-xs text-slate-500">
                    {item.completedAt
                      ? new Date(item.completedAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })
                      : 'Completed'}
                  </span>
                </div>
                <div className="font-bold text-slate-900 text-sm sm:text-base">{item.serviceType.replace('_', ' ')}</div>
                {item.diagnosis && (
                  <div className="text-slate-700">
                    <span className="font-semibold text-slate-800">Diagnosis:</span> {item.diagnosis}
                  </div>
                )}
                {item.workPerformed && (
                  <div className="text-slate-700">
                    <span className="font-semibold text-slate-800">Action:</span> {item.workPerformed}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs sm:text-sm text-slate-500 italic">
            No previous service history recorded for this customer.
          </p>
        )}
      </div>

      {/* MODAL: EXECUTION & WORK RECORDING FORM (Supports both Completion and On-Hold Checkpoints) */}
      {isExecutionModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200/90 rounded-modal p-5 sm:p-6 w-full max-w-2xl my-8 space-y-5 shadow-modal">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  {executionMode === 'hold' ? (
                    <>
                      <Pause className="w-4 h-4 text-amber-600" />
                      <span>Job Execution Form — Put Job on Hold</span>
                    </>
                  ) : (
                    <>
                      <Wrench className="w-4 h-4 text-primary-600" />
                      <span>Job Execution Form</span>
                    </>
                  )}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {executionMode === 'hold'
                    ? 'Record work performed, consumed parts, and specify hold reason before pausing.'
                    : 'Record work performed, consumed parts, and complete this work order.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsExecutionModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error display inside form */}
            {actionError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span className="font-medium">{actionError}</span>
              </div>
            )}

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
              {/* Hold Reason Section (Optional) */}
              {executionMode === 'hold' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <Pause className="w-3.5 h-3.5 text-amber-600" />
                    <span>Hold Reason <span className="text-slate-400 font-normal">(Optional)</span></span>
                  </label>
                  <textarea
                    value={holdReason}
                    onChange={(e) => setHoldReason(e.target.value)}
                    placeholder="Specify reason for pausing (e.g., waiting for parts, site inaccessible - optional)..."
                    rows={2}
                    className="w-full bg-white border border-slate-300 rounded-btn p-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                </div>
              )}

              {/* Section 1: Diagnosis (Only for completion) */}
              {executionMode === 'complete' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    Diagnosis / Problem Identification
                  </label>
                  <textarea
                    value={diagnosis}
                    onChange={(e) => setDiagnosis(e.target.value)}
                    placeholder="Identify technical root cause or observed symptom..."
                    rows={2}
                    className="w-full bg-white border border-slate-300 rounded-btn p-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                  />
                </div>
              )}

              {/* Section 2: Work Performed */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">
                    Work Performed {executionMode === 'complete' ? <span className="text-rose-500">*</span> : <span className="text-slate-400 font-normal">(Optional)</span>}
                  </label>
                  {executionMode === 'complete' && (
                    <span className="text-[10px] font-semibold text-amber-700">Required for completion</span>
                  )}
                </div>
                <textarea
                  value={workPerformed}
                  onChange={(e) => setWorkPerformed(e.target.value)}
                  placeholder={executionMode === 'hold' ? 'Describe work done so far (optional)...' : 'Describe step-by-step actions performed (e.g., inspected equipment, replaced worn part, tested operation)...'}
                  rows={2}
                  className="w-full bg-white border border-slate-300 rounded-btn p-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                />
              </div>

              {/* Section 3: Spare Parts Used */}
              <div className="space-y-3 p-3.5 bg-slate-50 border border-slate-200/90 rounded-xl">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-primary-600" />
                      <span>Spare Parts Used <span className="text-slate-400 font-normal">(Optional)</span></span>
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Adding parts is optional. You can enter manual parts or select from inventory catalog.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAddManualPart}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-medium text-xs flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                      title="Add blank custom part row directly"
                    >
                      <Plus className="w-3 h-3" />
                      <span>+ Custom Row</span>
                    </button>
                  </div>
                </div>

                {/* Mode Switcher: Manual Part vs. Optional Inventory Catalog */}
                <div className="flex items-center gap-2 pt-1 border-t border-slate-200/80">
                  <button
                    type="button"
                    onClick={() => setSparePartEntryMode('manual')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                      sparePartEntryMode === 'manual'
                        ? 'bg-primary-600 text-white shadow-2xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Manual Part</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSparePartEntryMode('catalog')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                      sparePartEntryMode === 'catalog'
                        ? 'bg-primary-600 text-white shadow-2xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Package className="w-3.5 h-3.5" />
                    <span>From Inventory Catalog <span className="text-[10px] font-normal opacity-85">(Optional)</span></span>
                  </button>
                </div>

                {/* Option 1: Manual Spare Part Form */}
                {sparePartEntryMode === 'manual' && (
                  <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-slate-700">
                        Add Manual Spare Part (No Inventory Required)
                      </label>
                      <span className="text-[10px] text-slate-500 font-medium">Custom item entry</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                      <div className="sm:col-span-6">
                        <input
                          type="text"
                          value={manualPartName}
                          onChange={(e) => setManualPartName(e.target.value)}
                          placeholder="Part / Item name (e.g. Copper Pipe, Filter, Valve)"
                          className="w-full bg-slate-50 border border-slate-300 rounded-btn p-2 text-xs text-slate-900 focus:outline-none focus:border-primary-500 focus:bg-white"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddDirectManualPart();
                            }
                          }}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <input
                          type="number"
                          min="1"
                          value={manualPartQty}
                          onChange={(e) => setManualPartQty(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-full bg-slate-50 border border-slate-300 rounded-btn p-2 text-xs text-slate-900 font-mono text-center focus:outline-none focus:border-primary-500 focus:bg-white"
                          placeholder="Qty"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <input
                          type="number"
                          min="0"
                          step="10"
                          value={manualPartPrice}
                          onChange={(e) => setManualPartPrice(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded-btn p-2 text-xs text-slate-900 font-mono text-center focus:outline-none focus:border-primary-500 focus:bg-white"
                          placeholder="₹ Price"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddDirectManualPart();
                            }
                          }}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <button
                          type="button"
                          onClick={handleAddDirectManualPart}
                          disabled={!manualPartName.trim()}
                          className="w-full py-2 px-3 rounded-btn bg-primary-600 hover:bg-primary-700 text-white font-bold text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Option 2: Active Inventory Catalog (Optional) */}
                {sparePartEntryMode === 'catalog' && (
                  <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-slate-700">
                        Select from Active Inventory Catalog <span className="text-slate-400 font-normal">(Optional)</span>
                      </label>
                      <span className="text-[10px] text-slate-500 font-medium">Authoritative pricing & stock</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                      <div className="sm:col-span-7">
                        <select
                          value={selectedMaterialId}
                          onChange={(e) => setSelectedMaterialId(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded-btn p-2 text-xs text-slate-900 focus:outline-none focus:border-primary-500 focus:bg-white"
                        >
                          <option value="">-- Choose spare part from inventory (Optional) --</option>
                          {catalogMaterials.map((mat) => {
                            const stockCount = mat.currentStock ?? 0;
                            return (
                              <option
                                key={mat.id}
                                value={mat.id}
                                disabled={stockCount <= 0}
                              >
                                {mat.name} {mat.sku ? `(${mat.sku})` : ''} — ₹{Number(mat.unitPrice || 0).toFixed(2)} [Stock: {stockCount}]
                                {stockCount <= 0 ? ' (Out of Stock)' : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <input
                          type="number"
                          min="1"
                          value={selectedPartQty}
                          onChange={(e) => setSelectedPartQty(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-full bg-slate-50 border border-slate-300 rounded-btn p-2 text-xs text-slate-900 font-mono text-center focus:outline-none focus:border-primary-500 focus:bg-white"
                          placeholder="Qty"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <button
                          type="button"
                          onClick={handleAddCatalogPart}
                          disabled={!selectedMaterialId}
                          className="w-full py-2 px-3 rounded-btn bg-primary-600 hover:bg-primary-700 text-white font-bold text-xs flex items-center justify-center gap-1 transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add from Stock</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {partsReplaced.length > 0 ? (
                  <div className="space-y-2.5 pt-1">
                    {partsReplaced.map((part, index) => {
                      const lineTotal = part.isWarrantyCovered
                        ? 0
                        : (Number(part.unitPrice) || 0) * (Number(part.quantity) || 1);
                      const isInventoryItem = Boolean(part.productId || part.inventoryItemId);
                      return (
                        <div
                          key={index}
                          className="p-3 bg-white border border-slate-200 rounded-xl space-y-2 shadow-2xs"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-1 pb-1 border-b border-slate-100">
                            <div className="flex items-center gap-2">
                              {part.inventoryDeducted ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                  Stock Deducted (Held)
                                </span>
                              ) : isInventoryItem ? (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  From Inventory
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                  Manual / Custom Part
                                </span>
                              )}
                              {part.sku && (
                                <span className="text-[10px] font-mono text-slate-500">
                                  SKU: {part.sku}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemovePart(index)}
                              className="px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 rounded-btn flex items-center gap-1 cursor-pointer transition-colors"
                              title="Remove Part"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remove</span>
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                            <div className="sm:col-span-7">
                              <label className="text-[10px] text-slate-500 uppercase font-semibold">
                                Part / Item Name *
                              </label>
                              <input
                                type="text"
                                value={part.itemName}
                                readOnly={isInventoryItem}
                                onChange={(e) => handleUpdatePart(index, 'itemName', e.target.value)}
                                placeholder="Part / Item Name"
                                className={`w-full border rounded-btn p-2 text-xs focus:outline-none ${
                                  isInventoryItem
                                    ? 'bg-slate-100/80 border-slate-200 text-slate-700 cursor-default'
                                    : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-primary-500 focus:bg-white'
                                }`}
                              />
                            </div>
                            <div className="sm:col-span-5">
                              <label className="text-[10px] text-slate-500 uppercase font-semibold">
                                Description (Optional)
                              </label>
                              <input
                                type="text"
                                value={part.description || ''}
                                onChange={(e) => handleUpdatePart(index, 'description', e.target.value)}
                                placeholder="Description"
                                className="w-full bg-slate-50 border border-slate-300 rounded-btn p-2 text-xs text-slate-900 focus:outline-none focus:border-primary-500 focus:bg-white"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 pt-1 border-t border-slate-100 items-center">
                            <div className="sm:col-span-3">
                              <label className="text-[10px] text-slate-500 uppercase font-semibold">Quantity</label>
                              <input
                                type="number"
                                min="1"
                                value={part.quantity}
                                onChange={(e) =>
                                  handleUpdatePart(index, 'quantity', Math.max(1, Number(e.target.value) || 1))
                                }
                                className="w-full bg-slate-50 border border-slate-300 rounded-btn p-1.5 text-xs text-slate-900 font-mono text-center focus:outline-none focus:border-primary-500 focus:bg-white"
                              />
                            </div>
                            <div className="sm:col-span-3">
                              <label className="text-[10px] text-slate-500 uppercase font-semibold">Unit Price (₹)</label>
                              <input
                                type="number"
                                min="0"
                                step="10"
                                readOnly={isInventoryItem}
                                value={part.unitPrice !== undefined ? part.unitPrice : 0}
                                onChange={(e) =>
                                  handleUpdatePart(index, 'unitPrice', Math.max(0, parseFloat(e.target.value) || 0))
                                }
                                className={`w-full border rounded-btn p-1.5 text-xs font-mono focus:outline-none ${
                                  isInventoryItem
                                    ? 'bg-slate-100/80 border-slate-200 text-slate-700 cursor-default'
                                    : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-primary-500 focus:bg-white'
                                }`}
                              />
                            </div>
                            <div className="sm:col-span-3 flex items-center pt-3">
                              <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-700 font-medium cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={Boolean(part.isWarrantyCovered)}
                                  onChange={(e) => handleUpdatePart(index, 'isWarrantyCovered', e.target.checked)}
                                  className="rounded border-slate-300 text-primary-600 focus:ring-0 cursor-pointer"
                                />
                                <span>Warranty</span>
                              </label>
                            </div>
                            <div className="sm:col-span-3 text-right pt-2">
                              <div className="text-[10px] text-slate-500 uppercase font-semibold">Line Total</div>
                              <div className="font-mono font-bold text-slate-900 text-xs">
                                {part.isWarrantyCovered ? (
                                  <span className="text-emerald-600 font-semibold">₹0.00 (Warranty)</span>
                                ) : (
                                  `₹${lineTotal.toFixed(2)}`
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 text-center text-xs text-slate-500 bg-white rounded-xl border border-dashed border-slate-200">
                    <p>No spare parts recorded.</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Spare parts are optional. You can enter a manual part above or choose from inventory catalog.
                    </p>
                  </div>
                )}
              </div>

              {/* Section 4: Manual Service Charge */}
              <div className="p-3 bg-slate-50 border border-slate-200/90 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5 text-primary-600" />
                    <span>Service Charge <span className="text-slate-400 font-normal">(Optional)</span></span>
                  </label>
                  <span className="text-[10px] text-slate-500">Labor fee</span>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-xs">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="50"
                    value={serviceCharge}
                    onChange={(e) => setServiceCharge(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-white border border-slate-300 rounded-btn p-2.5 pl-7 text-xs text-slate-900 font-mono font-bold focus:outline-none focus:border-primary-500"
                  />
                </div>
              </div>

              {/* Section 5: GST Configuration (Only in Complete mode) */}
              {executionMode === 'complete' && (
                <div className="p-3.5 bg-slate-50 border border-slate-200/90 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={gstEnabled}
                        onChange={(e) => setGstEnabled(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                      />
                      <span className="text-xs font-bold text-slate-800">Add GST</span>
                    </label>
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        gstEnabled
                          ? 'bg-primary-100 text-primary-800 border border-primary-200'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {gstEnabled ? 'GST Enabled' : 'GST OFF'}
                    </span>
                  </div>

                  {gstEnabled && (
                    <div className="pt-2 border-t border-slate-200 space-y-2">
                      <label className="text-[11px] font-semibold text-slate-700">Select GST Rate</label>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {[5, 12, 18, 28].map((rate) => (
                          <button
                            key={rate}
                            type="button"
                            onClick={() => {
                              setGstRate(rate);
                              setIsCustomGstRate(false);
                            }}
                            className={`py-1.5 px-2 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                              !isCustomGstRate && gstRate === rate
                                ? 'bg-primary-600 border-primary-600 text-white shadow-2xs'
                                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {rate}%
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => setIsCustomGstRate(true)}
                          className={`py-1.5 px-2 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                            isCustomGstRate
                              ? 'bg-primary-600 border-primary-600 text-white shadow-2xs'
                              : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          Custom
                        </button>
                      </div>

                      {isCustomGstRate && (
                        <div className="pt-1">
                          <label className="text-[10px] text-slate-500 uppercase font-semibold">
                            Custom GST Rate (%)
                          </label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            value={customGstRateInput}
                            onChange={(e) => setCustomGstRateInput(e.target.value)}
                            placeholder="e.g. 12"
                            className="w-full bg-white border border-slate-300 rounded-btn p-2 text-xs text-slate-900 font-mono font-medium focus:outline-none focus:border-primary-500 mt-1"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {executionMode === 'complete' && (
                /* Section 6: Payment Method (Only in Complete mode) */
                <div className="p-3.5 bg-slate-50 border border-slate-200/90 rounded-xl space-y-3">
                  <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Payment Method <span className="text-rose-500">*</span></span>
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setCompletionPaymentMethod('CASH')}
                      className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                        completionPaymentMethod === 'CASH'
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/20 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-base">💵</span>
                      <span>CASH</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCompletionPaymentMethod('ONLINE')}
                      className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                        completionPaymentMethod === 'ONLINE'
                          ? 'bg-blue-50 border-blue-500 text-blue-800 ring-2 ring-blue-500/20 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="text-base">📱</span>
                      <span>ONLINE</span>
                    </button>
                  </div>

                  {completionPaymentMethod === 'ONLINE' && (
                    <div>
                      <label className="text-[10px] text-slate-500 uppercase font-semibold">
                        Transaction Reference / ID (Optional)
                      </label>
                      <input
                        type="text"
                        value={completionPaymentReference}
                        onChange={(e) => setCompletionPaymentReference(e.target.value)}
                        placeholder="e.g. Transaction Ref / UTR / Reference ID"
                        className="w-full bg-white border border-slate-300 rounded-btn p-2.5 text-xs text-slate-900 mt-1 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Section 6: Bill Summary (Shown if parts/service fee entered or completing) */}
              {(executionMode === 'complete' || partsReplaced.length > 0 || parsedLabor > 0) && (
                <div className="p-3.5 bg-slate-50 border border-slate-200/90 rounded-xl space-y-3">
                  <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-2 text-xs">
                    <div className="font-bold text-slate-800 text-[11px] uppercase tracking-wider pb-1 border-b border-slate-100 flex items-center justify-between">
                      <span>{executionMode === 'hold' ? 'Running Bill Estimate' : 'Final Bill Summary'}</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {gstEnabled ? `GST Rate: ${effectiveGstRate}%` : 'GST: OFF'}
                    </span>
                  </div>

                  <div className="flex justify-between text-slate-600">
                    <span>Spare Parts ({partsReplaced.filter((p) => p.itemName.trim()).length})</span>
                    <span className="font-mono font-medium">₹{partsSubtotal.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between text-slate-600">
                    <span>Service Charge</span>
                    <span className="font-mono font-medium">₹{parsedLabor.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal</span>
                    <span className="font-mono font-medium">₹{billSubtotal.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between text-slate-600">
                    <span>GST {gstEnabled ? `(${effectiveGstRate}%)` : ''}</span>
                    <span className="font-mono font-medium">
                      {gstEnabled ? `₹${billTax.toFixed(2)}` : 'OFF (₹0.00)'}
                    </span>
                  </div>

                  <div className="flex justify-between text-slate-900 font-bold text-sm pt-1.5 border-t border-slate-100">
                    <span>{executionMode === 'hold' ? 'Estimated Total' : 'Total Payable'}</span>
                    <span className="font-mono text-primary-700 text-base">₹{billTotal.toFixed(2)}</span>
                  </div>

                  {executionMode === 'complete' && (
                    <>
                      {/* Amount Paid Field */}
                      <div className="pt-2 border-t border-slate-100">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[11px] font-bold text-slate-700">Amount Paid (₹)</label>
                          <button
                            type="button"
                            onClick={() => setCompletionPaymentAmount(billTotal.toFixed(2))}
                            className="text-[10px] text-primary-600 hover:underline font-semibold cursor-pointer"
                          >
                            Fill Full Amount
                          </button>
                        </div>
                        <input
                          type="number"
                          min="0"
                          max={billTotal}
                          step="1"
                          value={completionPaymentAmount !== '' ? completionPaymentAmount : billTotal.toFixed(2)}
                          onChange={(e) => setCompletionPaymentAmount(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-300 rounded-btn p-2.5 text-xs text-slate-900 font-mono font-bold focus:outline-none focus:border-primary-500"
                          placeholder={billTotal.toFixed(2)}
                        />
                      </div>

                      {/* Balance & Payment Status Badge */}
                      <div className="flex items-center justify-between pt-1">
                        <div className="text-[11px] text-slate-600">
                          Remaining Balance: <span className="font-mono font-bold text-slate-900">₹{remainingNum.toFixed(2)}</span>
                        </div>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            livePaymentStatus === 'PAID'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : livePaymentStatus === 'PARTIALLY PAID'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {livePaymentStatus}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Section 5: Execution Notes (Optional) */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Technician Execution Notes <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <textarea
                value={technicianNotes}
                onChange={(e) => setTechnicianNotes(e.target.value)}
                placeholder="Additional field observations or next maintenance recommendations (optional)..."
                rows={2}
                  className="w-full bg-white border border-slate-300 rounded-btn p-3 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                />
              </div>

              {/* Section 6: Customer Confirmation (Only in Complete mode) */}
              {executionMode === 'complete' && (
                <div className="p-3.5 bg-slate-50 border border-slate-200/90 rounded-xl space-y-2.5">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <FileCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Customer Confirmation & Sign-Off</span>
                  </label>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="customer-confirm-check"
                      checked={customerConfirmed}
                      onChange={(e) => setCustomerConfirmed(e.target.checked)}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-0 cursor-pointer"
                    />
                    <label
                      htmlFor="customer-confirm-check"
                      className="text-xs text-slate-700 cursor-pointer font-medium"
                    >
                      Customer verified completed service and satisfactory operation
                    </label>
                  </div>

                  {customerConfirmed && (
                    <div>
                      <label className="text-[10px] text-slate-500 uppercase font-semibold">
                        Customer Signer Name / Representative
                      </label>
                      <input
                        type="text"
                        value={customerSignerName}
                        onChange={(e) => setCustomerSignerName(e.target.value)}
                        placeholder={service.customer.fullName || 'Enter signer name'}
                        className="w-full bg-white border border-slate-300 rounded-btn p-2.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-600 mt-1"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer Controls */}
            {executionMode === 'hold' ? (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsExecutionModalOpen(false)}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-btn bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleSaveAndHoldJob}
                  disabled={Boolean(actionLoading)}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-btn bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-2xs transition-colors cursor-pointer disabled:opacity-50 min-h-[42px]"
                >
                  <Pause className="w-4 h-4 text-white" />
                  <span>
                    {actionLoading === 'hold' ? 'SAVING & HOLDING...' : 'SAVE PROGRESS & PUT ON HOLD'}
                  </span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleSaveProgress}
                  disabled={Boolean(actionLoading)}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-btn bg-white hover:bg-slate-50 border border-slate-200/90 text-slate-700 font-semibold text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shadow-2xs"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{actionLoading === 'save' ? 'SAVING...' : 'SAVE PROGRESS'}</span>
                </button>

                <div className="flex items-center gap-2.5 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setIsExecutionModalOpen(false)}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-btn bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!workPerformed.trim()) {
                        setActionError('Work performed description is required to complete this job.');
                        return;
                      }
                      commitPendingDraftSpare();
                      setIsCompletionConfirmOpen(true);
                    }}
                    disabled={Boolean(actionLoading) || !workPerformed.trim()}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-btn bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      {actionLoading === 'complete' ? 'COMPLETING...' : 'REVIEW & COMPLETE JOB'}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* COMPLETION CONFIRMATION DIALOG */}
      {isCompletionConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200/90 rounded-modal p-6 w-full max-w-md space-y-4 shadow-modal my-auto">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Confirm Service Completion</h3>
                <p className="text-xs text-slate-500">Please review before finalizing</p>
              </div>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed font-medium">
              This will complete the service, update inventory, generate the invoice, and record the payment information.
            </div>

            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/90 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Service:</span>
                <span className="font-semibold text-slate-800">{service?.serviceNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Spare Parts ({partsReplaced.filter((p) => p.itemName.trim()).length}):</span>
                <span className="font-mono font-medium text-slate-800">₹{partsSubtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Service Charge:</span>
                <span className="font-mono font-medium text-slate-800">₹{parsedLabor.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Subtotal:</span>
                <span className="font-mono font-medium text-slate-800">₹{billSubtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">GST:</span>
                <span className="font-mono font-medium text-slate-800">
                  {gstEnabled ? `${effectiveGstRate}% (₹${billTax.toFixed(2)})` : 'OFF (₹0.00)'}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1.5 font-bold">
                <span className="text-slate-900">Total Invoice Amount:</span>
                <span className="font-mono text-primary-700">₹{billTotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-700">
                <span className="text-slate-500">Payment:</span>
                <span className="font-medium">{completionPaymentMethod} (₹{paidNum.toFixed(2)})</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsCompletionConfirmOpen(false)}
                disabled={Boolean(actionLoading)}
                className="px-4 py-2.5 rounded-btn bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCompleteJob}
                disabled={Boolean(actionLoading)}
                className="px-5 py-2.5 rounded-btn bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-2 shadow-2xs cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{actionLoading === 'complete' ? 'COMPLETING...' : 'Confirm & Complete Service'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COMPLETED INVOICE MODAL (Revamp Template) */}
      {isCompletedInvoiceModalOpen && completedInvoice && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200/90 rounded-modal w-full max-w-4xl max-h-[92vh] flex flex-col shadow-modal my-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200">
                  <Receipt className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Invoice Generated Successfully</h3>
                  <p className="text-xs text-slate-500">Invoice #{completedInvoice.invoiceNumber || 'INV'}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCompletedInvoiceModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Revamp Template */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-50">
              <RevampInvoiceView
                invoice={{
                  ...completedInvoice,
                  customerName: completedInvoice.customerName || service?.customer?.fullName,
                  customerPhone: completedInvoice.customerPhone || service?.customer?.phone,
                  customerAddress: completedInvoice.customerAddress || (service?.location ? `${service.location.addressLine1 || ''}, ${service.location.city || ''}` : undefined),
                  items: completedInvoice.items || partsReplaced.map((p) => ({
                    nameSnapshot: p.itemName,
                    quantity: p.quantity,
                    unitPriceSnapshot: p.unitPrice,
                    lineTotal: p.lineTotal,
                  })),
                  totalAmount: completedInvoice.totalAmount || billTotal,
                  paidAmount: completedInvoice.paidAmount || paidNum,
                  outstandingAmount: completedInvoice.outstandingAmount || remainingNum,
                }}
              />
            </div>

            {/* Modal Footer Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-t border-slate-200 bg-white shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (service?.customer?.phone) {
                    sendInvoiceViaWhatsApp({
                      phone: service.customer.phone,
                      orderNumber: completedInvoice.invoiceNumber,
                      invoiceNumber: completedInvoice.invoiceNumber,
                      invoiceId: completedInvoice.id || '',
                      customerName: service.customer.fullName,
                      totalAmount: String(completedInvoice.totalAmount || billTotal),
                      paidAmount: String(completedInvoice.paidAmount || paidNum),
                      balanceAmount: String(completedInvoice.outstandingAmount || remainingNum),
                    });
                  }
                }}
                className="px-4 py-2.5 rounded-btn bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <span>Share via WhatsApp</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2.5 rounded-btn bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 font-semibold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-600" />
                  <span>Print Invoice</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCompletedInvoiceModalOpen(false);
                    navigate(TECHNICIAN_COMPLETED_ROUTE);
                  }}
                  className="px-5 py-2.5 rounded-btn bg-primary-600 hover:bg-primary-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Done / Back to Jobs</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: PHASE 7 PAYMENT COLLECTION MODAL */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200/90 rounded-modal p-5 sm:p-6 w-full max-w-lg space-y-4 shadow-modal my-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200">
                  <CreditCard className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Record Customer Payment</h3>
                  <p className="text-[11px] text-slate-500">Customer pays business directly</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsPaymentModalOpen(false);
                  setPaymentSuccessData(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error Message */}
            {paymentError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="font-medium">{paymentError}</span>
              </div>
            )}

            {/* CASE 1: SUCCESS STATE */}
            {paymentSuccessData ? (
              <div className="space-y-4 py-2">
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <h4 className="text-base font-bold text-slate-900">Payment Recorded Successfully!</h4>
                  <p className="text-xs text-slate-600">
                    Payment has been authoritatively committed to the CRM financial ledger.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-200/70">
                    <span className="text-slate-500">Receipt / Payment Ref:</span>
                    <span className="font-mono font-bold text-slate-900">{paymentSuccessData.paymentNumber}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/70">
                    <span className="text-slate-500">Invoice:</span>
                    <span className="font-mono font-bold text-slate-900">{paymentSuccessData.invoiceNumber}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/70">
                    <span className="text-slate-500">Amount Collected:</span>
                    <span className="font-bold text-emerald-700">
                      ₹{Number(paymentSuccessData.amount).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/70">
                    <span className="text-slate-500">Payment Method:</span>
                    <span className="font-semibold text-slate-900">{paymentSuccessData.paymentMethod}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Remaining Balance:</span>
                    <span className="font-bold text-amber-700">
                      ₹{Number(paymentSuccessData.remainingOutstanding).toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => handleViewReceipt(paymentSuccessData.paymentId)}
                    disabled={receiptLoading}
                    className="w-full sm:flex-1 py-2.5 px-4 rounded-btn bg-primary-600 hover:bg-primary-700 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition shadow-2xs"
                  >
                    <Receipt className="w-4 h-4" />
                    <span>{receiptLoading ? 'Loading Receipt...' : 'View Official Receipt'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsPaymentModalOpen(false);
                      setPaymentSuccessData(null);
                    }}
                    className="w-full sm:w-auto py-2.5 px-5 rounded-btn bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : isPaymentConfirming ? (
              /* CASE 2: CONFIRMATION REVIEW STEP */
              <div className="space-y-4 py-1">
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Confirm Payment Recording</span>
                  </div>
                  <p className="text-[11px] text-amber-900 font-medium">
                    Please verify the customer has transferred/paid before confirming.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2.5 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-200/70">
                    <span className="text-slate-500">Invoice:</span>
                    <span className="font-mono font-bold text-slate-900">{billing?.invoiceNumber}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/70">
                    <span className="text-slate-500">Amount to Record:</span>
                    <span className="text-sm font-bold text-emerald-700">
                      ₹{parseFloat(paymentAmount).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/70">
                    <span className="text-slate-500">Selected Method:</span>
                    <span className="font-semibold text-slate-900">{paymentMethod}</span>
                  </div>
                  {paymentReference && (
                    <div className="flex justify-between py-1 border-b border-slate-200/70">
                      <span className="text-slate-500">Reference / UTR:</span>
                      <span className="font-mono font-bold text-slate-900">{paymentReference}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">New Outstanding After:</span>
                    <span className="font-bold text-amber-700">
                      ₹
                      {Math.max(
                        0,
                        Number(billing?.outstandingAmount || 0) - parseFloat(paymentAmount)
                      ).toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsPaymentConfirming(false)}
                    disabled={paymentLoading}
                    className="flex-1 py-2.5 px-4 rounded-btn bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    Back to Edit
                  </button>
                  <button
                    type="button"
                    onClick={handleRecordPayment}
                    disabled={paymentLoading}
                    className="flex-1 py-2.5 px-4 rounded-btn bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-2xs cursor-pointer disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    <span>{paymentLoading ? 'Recording...' : 'Confirm & Commit'}</span>
                  </button>
                </div>
              </div>
            ) : (
              /* CASE 3: INPUT FORM STEP */
              <div className="space-y-4">
                {/* Outstanding summary badge */}
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/90 flex items-center justify-between">
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Invoice</div>
                    <div className="font-mono text-xs font-bold text-slate-900">{billing?.invoiceNumber}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Outstanding Due</div>
                    <div className="text-sm font-bold text-amber-700">
                      ₹
                      {Number(billing?.outstandingAmount || 0).toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                  </div>
                </div>

                {/* Payment Method Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Select Payment Method</label>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                    {(['UPI', 'CASH', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPaymentMethod(m)}
                        className={`py-2 px-2 rounded-btn text-[11px] font-bold border transition text-center cursor-pointer ${
                          paymentMethod === m
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                            : 'bg-slate-100 border-slate-200/90 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {m === 'BANK_TRANSFER' ? 'BANK' : m}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Business Payment Details according to Method */}
                {paymentMethod === 'UPI' && (
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                      <span className="flex items-center gap-1.5">
                        <QrCode className="w-4 h-4 text-emerald-600" />
                        <span>Company UPI Details</span>
                      </span>
                      <span className="text-[10px] text-slate-500 font-semibold">Direct Business Pay</span>
                    </div>

                    <div className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-slate-200/90">
                      <div>
                        <div className="text-[10px] text-slate-400 font-semibold">Official UPI ID</div>
                        <div className="font-mono text-xs font-bold text-slate-900">
                          {paymentBusinessDetails?.upiId || 'billing@upi'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(
                            paymentBusinessDetails?.upiId || 'billing@upi',
                            'upi'
                          )
                        }
                        className="p-1.5 rounded-btn bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/90 flex items-center gap-1 text-[11px] font-semibold cursor-pointer shadow-2xs"
                      >
                        {copiedField === 'upi' ? (
                          <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copiedField === 'upi' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>

                    <p className="text-[11px] text-slate-500 leading-tight">
                      Customer pays the business directly via any UPI app (GPay, PhonePe, Paytm).
                    </p>
                  </div>
                )}

                {paymentMethod === 'BANK_TRANSFER' && (
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2 text-xs">
                    <div className="flex items-center justify-between font-bold text-slate-800">
                      <span className="flex items-center gap-1.5">
                        <Building2 className="w-4 h-4 text-primary-600" />
                        <span>Company Bank Details</span>
                      </span>
                    </div>

                    <div className="space-y-1.5 p-2.5 rounded-lg bg-white border border-slate-200/90 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Account Name:</span>
                        <span className="font-bold text-slate-900">
                          {paymentBusinessDetails?.accountName ||
                            paymentBusinessDetails?.businessName ||
                            'Enterprises CRM'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Bank Name:</span>
                        <span className="text-slate-800 font-medium">
                          {paymentBusinessDetails?.bankName || 'State Bank of India'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">Account Number:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-slate-900">
                            {paymentBusinessDetails?.accountNumber || '30998877665'}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopy(
                                paymentBusinessDetails?.accountNumber || '30998877665',
                                'acc'
                              )
                            }
                            className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/90 cursor-pointer shadow-2xs"
                          >
                            {copiedField === 'acc' ? (
                              <CheckCheck className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-500">IFSC Code:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-slate-900">
                            {paymentBusinessDetails?.ifsc || 'SBIN0001234'}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopy(paymentBusinessDetails?.ifsc || 'SBIN0001234', 'ifsc')
                            }
                            className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/90 cursor-pointer shadow-2xs"
                          >
                            {copiedField === 'ifsc' ? (
                              <CheckCheck className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Payment Amount Input */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700">Amount Collected (₹)</label>
                    {billing && (
                      <button
                        type="button"
                        onClick={() => setPaymentAmount(String(billing.outstandingAmount))}
                        className="text-[11px] text-emerald-700 hover:text-emerald-800 font-semibold cursor-pointer"
                      >
                        Set Full Due (₹{billing.outstandingAmount})
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 text-slate-400 font-bold text-sm">₹</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={billing?.outstandingAmount}
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-white border border-slate-300 rounded-btn pl-8 pr-3 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                </div>

                {/* Reference / UTR Number Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    {paymentMethod === 'UPI'
                      ? 'UPI Reference / UTR Number'
                      : paymentMethod === 'BANK_TRANSFER'
                      ? 'Bank Transfer / IMPS UTR Reference'
                      : paymentMethod === 'CHEQUE'
                      ? 'Cheque Number & Issuing Bank'
                      : 'Reference Number (Optional)'}
                  </label>
                  <input
                    type="text"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    placeholder={
                      paymentMethod === 'UPI'
                        ? 'e.g. 331122445566'
                        : paymentMethod === 'BANK_TRANSFER'
                        ? 'e.g. UTR-IMPS-998877'
                        : paymentMethod === 'CHEQUE'
                        ? 'e.g. CHQ-554422 (HDFC)'
                        : 'Optional reference'
                    }
                    className="w-full bg-white border border-slate-300 rounded-btn p-2.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                {/* Optional Technician Payment Notes */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">Payment Notes (Optional)</label>
                  <input
                    type="text"
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    placeholder="e.g. Paid in cash at customer premises"
                    className="w-full bg-white border border-slate-300 rounded-btn p-2.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>

                {/* Modal Footer Controls */}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsPaymentModalOpen(false)}
                    className="px-4 py-2.5 rounded-btn bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const num = parseFloat(paymentAmount);
                      if (isNaN(num) || num <= 0) {
                        setPaymentError('Please enter a valid payment amount greater than zero.');
                        return;
                      }
                      if (billing && num > Number(billing.outstandingAmount) + 0.001) {
                        setPaymentError(
                          `Amount cannot exceed the current outstanding balance of ₹${Number(billing.outstandingAmount).toFixed(2)}.`
                        );
                        return;
                      }
                      setPaymentError(null);
                      setIsPaymentConfirming(true);
                    }}
                    disabled={!paymentAmount || parseFloat(paymentAmount) <= 0}
                    className="px-5 py-2.5 rounded-btn bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs shadow-2xs transition cursor-pointer disabled:opacity-50"
                  >
                    Review & Record
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 4: PHASE 7 OFFICIAL PAYMENT RECEIPT MODAL */}
      {isReceiptModalOpen && activeReceipt && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200/90 rounded-modal w-full max-w-md shadow-modal overflow-hidden my-auto">
            {/* Printable Receipt Card */}
            <div className="p-6 space-y-4 bg-white text-slate-900">
              {/* Receipt Header */}
              <div className="text-center pb-4 border-b border-slate-200 space-y-1">
                <div className="font-extrabold text-base tracking-wider text-slate-900 uppercase">
                  {activeReceipt.businessDetails?.businessName || 'Enterprises CRM'}
                </div>
                <div className="text-[10px] text-slate-500">
                  {activeReceipt.businessDetails?.address || 'Field Service Division'}
                </div>
                <div className="inline-block mt-1 px-3 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold tracking-widest uppercase">
                  Payment Receipt
                </div>
              </div>

              {/* Receipt Metadata */}
              <div className="grid grid-cols-2 gap-2 text-xs py-1">
                <div>
                  <div className="text-[10px] text-slate-400 font-semibold">Receipt No:</div>
                  <div className="font-mono font-bold text-slate-900">{activeReceipt.receiptNumber}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-400 font-semibold">Date:</div>
                  <div className="text-slate-700 font-medium">
                    {new Date(activeReceipt.paymentDate).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </div>
                </div>
              </div>

              {/* Customer & Invoice Info */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/90 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Customer:</span>
                  <span className="font-bold text-slate-900">{activeReceipt.customerName}</span>
                </div>
                {activeReceipt.customerPhone && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Phone:</span>
                    <span className="text-slate-800 font-medium">{activeReceipt.customerPhone}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500">Invoice No:</span>
                  <span className="font-mono text-primary-700 font-bold">{activeReceipt.invoiceNumber}</span>
                </div>
              </div>

              {/* Financial Breakdown */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-200/70">
                  <span className="text-slate-500">Payment Method:</span>
                  <span className="font-semibold text-slate-900">{activeReceipt.paymentMethod}</span>
                </div>
                {activeReceipt.referenceNumber && (
                  <div className="flex justify-between py-1 border-b border-slate-200/70">
                    <span className="text-slate-500">Ref / UTR:</span>
                    <span className="font-mono font-bold text-slate-900">{activeReceipt.referenceNumber}</span>
                  </div>
                )}
                <div className="flex justify-between py-1 border-b border-slate-200/70 text-sm">
                  <span className="font-bold text-slate-700">Amount Paid:</span>
                  <span className="font-bold text-emerald-700">
                    ₹{Number(activeReceipt.amount).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Remaining Due:</span>
                  <span className="font-bold text-amber-700">
                    ₹{Number(activeReceipt.outstandingBalance).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Verification & Footnote */}
              <div className="text-[10px] text-slate-400 text-center space-y-0.5 pt-1">
                <p>Recorded by: {activeReceipt.receivedByName || 'Field Technician'}</p>
                <p>Official system-generated electronic receipt · Single Source of Truth</p>
              </div>
            </div>

            {/* Actions Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200/90 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => window.print()}
                className="py-2 px-4 rounded-btn bg-white hover:bg-slate-100 border border-slate-200/90 text-slate-700 text-xs font-semibold shadow-2xs flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print</span>
              </button>
              <button
                type="button"
                onClick={() => setIsReceiptModalOpen(false)}
                className="py-2 px-5 rounded-btn bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-2xs cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

