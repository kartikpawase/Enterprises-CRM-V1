import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import type {
  CashHandoverItem,
  CashHandoverSummary,
  TechnicianCashSummary,
} from '@crm/types';
import type {
  CashHandoverQueryFilter,
  SubmitCashHandoverInput,
  BatchSubmitCashHandoverInput,
  MarkCashReceivedInput,
  BatchMarkCashReceivedInput,
} from '@crm/validation';

export interface CashHandoversListResponse {
  items: CashHandoverItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export const cashHandoversApi = {
  getHandovers: async (filters: Partial<CashHandoverQueryFilter> = {}): Promise<CashHandoversListResponse> => {
    const response = await apiClient.get<any>('/cash-handovers', { params: filters as any });
    const raw = response as any;
    const innerData = raw?.data;
    const items = Array.isArray(innerData) ? innerData : (Array.isArray(raw?.items) ? raw.items : []);
    const pagination = raw?.pagination || innerData?.pagination || { page: 1, limit: 10, total: items.length, totalPages: 1 };
    return {
      items,
      pagination,
    };
  },

  getSummary: async (filters?: Partial<CashHandoverQueryFilter>): Promise<CashHandoverSummary> => {
    const response = await apiClient.get<CashHandoverSummary>('/cash-handovers/summary', { params: filters as any });
    return (response as any).data || response;
  },

  getTechnicianSummary: async (): Promise<TechnicianCashSummary> => {
    const response = await apiClient.get<TechnicianCashSummary>('/technician/my-cash');
    return (response as any).data || response;
  },

  getTechnicianMyHandovers: async (filters: Partial<CashHandoverQueryFilter> = {}): Promise<CashHandoversListResponse> => {
    const response = await apiClient.get<any>('/technician/my-handovers', { params: filters as any });
    const raw = response as any;
    const innerData = raw?.data;
    const items = Array.isArray(innerData) ? innerData : (Array.isArray(raw?.items) ? raw.items : []);
    const pagination = raw?.pagination || innerData?.pagination || { page: 1, limit: 50, total: items.length, totalPages: 1 };
    return {
      items,
      pagination,
    };
  },

  submitHandover: async (id: string, payload?: SubmitCashHandoverInput) => {
    const response = await apiClient.post<CashHandoverItem>(`/cash-handovers/${id}/submit`, payload || {});
    return response;
  },

  submitBatchHandover: async (payload: BatchSubmitCashHandoverInput) => {
    const response = await apiClient.post<{ success: boolean; data: { submittedCount: number; totalAmount: number } }>(
      '/cash-handovers/submit-batch',
      payload
    );
    return response;
  },

  submitTechnicianPortalHandover: async (payload: { handoverId?: string; handoverIds?: string[]; notes?: string }) => {
    const response = await apiClient.post<{ success: boolean; data: any; message: string }>(
      '/technician/submit-handover',
      payload
    );
    return response;
  },

  markReceived: async (id: string, payload?: MarkCashReceivedInput) => {
    const response = await apiClient.post<CashHandoverItem>(`/cash-handovers/${id}/receive`, payload || {});
    return response;
  },

  markBatchReceived: async (payload: BatchMarkCashReceivedInput) => {
    const response = await apiClient.post<{ success: boolean; data: { updatedCount: number; totalAmount: number } }>(
      '/cash-handovers/receive-batch',
      payload
    );
    return response;
  },
};

export function useCashHandovers(filters: Partial<CashHandoverQueryFilter> = {}) {
  return useQuery({
    queryKey: ['cash-handovers', filters],
    queryFn: () => cashHandoversApi.getHandovers(filters),
    staleTime: 30000,
  });
}

export function useCashHandoverSummary(filters?: Partial<CashHandoverQueryFilter>) {
  return useQuery({
    queryKey: ['cash-handovers-summary', filters],
    queryFn: () => cashHandoversApi.getSummary(filters),
    staleTime: 30000,
  });
}

export function useTechnicianCashSummary() {
  return useQuery({
    queryKey: ['technician-my-cash'],
    queryFn: () => cashHandoversApi.getTechnicianSummary(),
    staleTime: 30000,
  });
}

export function useTechnicianMyHandovers(filters: Partial<CashHandoverQueryFilter> = {}) {
  return useQuery({
    queryKey: ['technician-my-handovers', filters],
    queryFn: () => cashHandoversApi.getTechnicianMyHandovers(filters),
    staleTime: 15000,
  });
}

export function useSubmitCashHandover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload?: SubmitCashHandoverInput }) =>
      cashHandoversApi.submitHandover(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-handovers'] });
      queryClient.invalidateQueries({ queryKey: ['cash-handovers-summary'] });
      queryClient.invalidateQueries({ queryKey: ['technician-my-cash'] });
      queryClient.invalidateQueries({ queryKey: ['technician-my-handovers'] });
      queryClient.invalidateQueries({ queryKey: ['technician-360-profile'] });
    },
  });
}

export function useBatchSubmitCashHandover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: BatchSubmitCashHandoverInput) => cashHandoversApi.submitBatchHandover(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-handovers'] });
      queryClient.invalidateQueries({ queryKey: ['cash-handovers-summary'] });
      queryClient.invalidateQueries({ queryKey: ['technician-my-cash'] });
      queryClient.invalidateQueries({ queryKey: ['technician-my-handovers'] });
      queryClient.invalidateQueries({ queryKey: ['technician-360-profile'] });
    },
  });
}

export function useSubmitTechnicianPortalHandover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { handoverId?: string; handoverIds?: string[]; notes?: string }) =>
      cashHandoversApi.submitTechnicianPortalHandover(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-handovers'] });
      queryClient.invalidateQueries({ queryKey: ['cash-handovers-summary'] });
      queryClient.invalidateQueries({ queryKey: ['technician-my-cash'] });
      queryClient.invalidateQueries({ queryKey: ['technician-my-handovers'] });
      queryClient.invalidateQueries({ queryKey: ['technician-360-profile'] });
    },
  });
}

export function useMarkCashReceived() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload?: MarkCashReceivedInput }) =>
      cashHandoversApi.markReceived(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-handovers'] });
      queryClient.invalidateQueries({ queryKey: ['cash-handovers-summary'] });
      queryClient.invalidateQueries({ queryKey: ['technician-my-cash'] });
      queryClient.invalidateQueries({ queryKey: ['technician-my-handovers'] });
      queryClient.invalidateQueries({ queryKey: ['technician-360-profile'] });
      queryClient.invalidateQueries({ queryKey: ['expenses-overview'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
}

export function useBatchMarkCashReceived() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: BatchMarkCashReceivedInput) => cashHandoversApi.markBatchReceived(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-handovers'] });
      queryClient.invalidateQueries({ queryKey: ['cash-handovers-summary'] });
      queryClient.invalidateQueries({ queryKey: ['technician-my-cash'] });
      queryClient.invalidateQueries({ queryKey: ['technician-my-handovers'] });
      queryClient.invalidateQueries({ queryKey: ['technician-360-profile'] });
      queryClient.invalidateQueries({ queryKey: ['expenses-overview'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
}
