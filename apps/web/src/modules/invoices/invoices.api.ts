import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import type { InvoiceQueryFilter, CancelInvoiceInput, CreateInvoiceInput, UpdateInvoiceInput } from '@crm/validation';

export interface InvoiceItemData {
  id: string;
  invoiceId: string;
  productId?: string | null;
  itemType: 'PRODUCT' | 'SERVICE' | 'SPARE_PART' | 'CUSTOM';
  nameSnapshot: string;
  descriptionSnapshot?: string | null;
  quantity: number;
  unitPriceSnapshot: string;
  discountAmount: string;
  taxRatePercent: string;
  taxAmount: string;
  lineTotal: string;
}

export interface InvoiceSummaryData {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerNumber: string;
  customerPhone: string;
  saleId?: string | null;
  jobCardId?: string | null;
  serviceId?: string | null;
  template?: string | null;
  invoiceDate: string;
  dueDate: string;
  poNumber?: string | null;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  outstandingAmount: string;
  status: 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  notes?: string | null;
  createdAt: string;
  cancelledAt?: string | null;
  cancelReason?: string | null;
}

export interface InvoiceDetailData extends InvoiceSummaryData {
  customerEmail?: string | null;
  customerGst?: string | null;
  customerType?: string;
  termsAndConditions?: string | null;
  items: InvoiceItemData[];
  addresses?: {
    id: string;
    addressType: string;
    addressLine1: string;
    addressLine2?: string | null;
    landmark?: string | null;
    city: string;
    state: string;
    postalCode: string;
    isDefault: boolean;
  }[];
  payments?: {
    id: string;
    paymentNumber: string;
    amount: string;
    paymentMethod: string;
    paymentDate: string;
    status: string;
    referenceNumber?: string | null;
  }[];
  sale?: {
    id: string;
    saleNumber: string;
  } | null;
}

export function useInvoicesQuery(filters: Partial<InvoiceQueryFilter> = {}) {
  return useQuery({
    queryKey: ['invoices', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.page) params.append('page', String(filters.page));
      if (filters.limit) params.append('limit', String(filters.limit));
      if (filters.search) params.append('search', filters.search);
      if (filters.status) params.append('status', filters.status);
      if (filters.customerId) params.append('customerId', filters.customerId);
      if (filters.saleId) params.append('saleId', filters.saleId);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.overdueOnly) params.append('overdueOnly', 'true');
      if (filters.sortBy) params.append('sortBy', filters.sortBy);
      if (filters.sortOrder) params.append('sortOrder', filters.sortOrder);

      const res = await apiClient.get<InvoiceSummaryData[]>(`/invoices?${params.toString()}`);
      return {
        data: res.data || [],
        pagination: (res as any).pagination || { page: 1, limit: 20, total: 0, totalPages: 1 },
      };
    },
  });
}

export const useInvoices = useInvoicesQuery;

export function useInvoiceQuery(id: string | undefined) {
  return useQuery({
    queryKey: ['invoices', id],
    queryFn: async () => {
      if (!id) return null;
      const res = await apiClient.get<InvoiceDetailData>(`/invoices/${id}`);
      return res.data || null;
    },
    enabled: !!id,
  });
}

export function useCancelInvoiceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CancelInvoiceInput }) => {
      const res = await apiClient.post<InvoiceDetailData>(`/invoices/${id}/cancel`, data);
      return res.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoices', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}

export function useSendInvoiceDueMailMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invoiceId: string) => {
      const res = await apiClient.post<{ success: boolean; data?: any; message?: string }>(
        `/invoices/${invoiceId}/send-due-mail`
      );
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useCreateInvoiceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateInvoiceInput) => {
      const res = await apiClient.post<InvoiceDetailData>('/invoices', data);
      return res.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      if (data?.customerId) {
        queryClient.invalidateQueries({ queryKey: ['customers', data.customerId] });
      }
    },
  });
}

export function useUpdateInvoiceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateInvoiceInput }) => {
      const res = await apiClient.patch<InvoiceDetailData>(`/invoices/${id}`, data);
      return res.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoices', variables.id] });
    },
  });
}

