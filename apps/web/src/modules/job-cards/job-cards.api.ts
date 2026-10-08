import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import type {
  JobCardQueryFilter,
  CreateJobCardInput,
  AssignTechnicianInput,
  UpdateJobCardWorkInput,
  CompleteJobCardInput,
} from '@crm/validation';

export interface JobCardPartItem {
  partName: string;
  partSku?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  isWarrantyCovered: boolean;
}

export interface JobCardItem {
  id: string;
  jobCardNumber: string;
  status: 'OPEN' | 'SCHEDULED' | 'ASSIGNED' | 'ACCEPTED' | 'STARTED' | 'DIAGNOSIS' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CUSTOMER_CONFIRMED' | 'CLOSED' | 'CANCELLED' | 'REOPENED';
  problemReported: string | null;
  diagnosis: string | null;
  workPerformed: string | null;
  partsReplaced: JobCardPartItem[] | null;
  laborCharges: string;
  partsCharges: string;
  totalCharges: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  serviceId: string;
  serviceNumber: string;
  serviceType: string;
  serviceLocation: 'DOORSTEP' | 'IN_SHOP';
  serviceClassification: 'GENERAL' | 'WARRANTY';
  scheduledDate: string;
  scheduledTimeSlot: string | null;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerNumber: string;
  assetId: string;
  assetNumber: string;
  serialNumber: string | null;
  productName: string;
  productBrand: string | null;
  productSku: string;
  technicianId: string | null;
  technicianName: string | null;
  technicianPhone: string | null;
  technicianNotes?: string | null;
  warrantyId: string | null;
  warrantyStatus: string | null;
  warrantyEndDate: string | null;
}

export interface JobCardDetail extends JobCardItem {
  technicianNotes: string | null;
  customerRemarks: string | null;
  nextServiceRecommendationMonths: number | null;
  nextServiceNotes: string | null;
  customerEmail: string | null;
  customerNotes: string | null;
  internalNotes: string | null;
  installationDate: string | null;
  technicianStatus: string | null;
  technicianSkills: string[] | null;
  warrantyType: string | null;
  warrantyStartDate: string | null;
}

export interface JobCardKPIs {
  totalJobCards: number;
  assignedCount: number;
  inProgressCount: number;
  onHoldCount: number;
  completedCount: number;
  cancelledCount: number;
}

export interface PaginatedJobCardsResponse {
  data: JobCardItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Hook to query paginated job cards
 */
export function useJobCardsQuery(filters: Partial<JobCardQueryFilter>) {
  return useQuery({
    queryKey: ['job-cards', filters],
    queryFn: async () => {
      const response = await apiClient.get<PaginatedJobCardsResponse>('/job-cards', {
        params: filters,
      });
      return (response as any)?.data?.data ? (response as any).data : response;
    },
    staleTime: 30_000,
  });
}

/**
 * Hook to query single job card details
 */
export function useJobCardDetailQuery(id: string | undefined) {
  return useQuery({
    queryKey: ['job-card', id],
    queryFn: async () => {
      if (!id) return null;
      const response = await apiClient.get<JobCardDetail>(`/job-cards/${id}`);
      return (response as any)?.data?.data ?? response?.data ?? response;
    },
    enabled: Boolean(id),
  });
}

/**
 * Hook to query operational KPIs for Job Cards
 */
export function useJobCardKPIsQuery() {
  return useQuery({
    queryKey: ['job-cards', 'kpis'],
    queryFn: async () => {
      const response = await apiClient.get<JobCardKPIs>('/job-cards/kpis');
      return (response as any)?.data?.data ?? response?.data ?? response;
    },
    staleTime: 60_000,
  });
}

/**
 * Mutation to create a job card
 */
export function useCreateJobCardMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateJobCardInput) => {
      const response = await apiClient.post<{ success: boolean; data: any }>('/job-cards', input);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-cards'] });
      queryClient.invalidateQueries({ queryKey: ['services'] });
    },
  });
}

/**
 * Mutation to assign technician to job card
 */
export function useAssignTechnicianMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: AssignTechnicianInput }) => {
      const response = await apiClient.post<{ success: boolean; data: any }>(`/job-cards/${id}/assign`, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['job-cards'] });
      queryClient.invalidateQueries({ queryKey: ['job-card', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['technicians'] });
    },
  });
}

/**
 * Mutation to perform workflow transition (accept, start, hold, resume, cancel, reopen)
 */
export function useJobCardActionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action, reason, notes }: { id: string; action: 'accept' | 'start' | 'hold' | 'resume' | 'cancel' | 'reopen'; reason?: string; notes?: string }) => {
      const response = await apiClient.post<{ success: boolean; data: any }>(`/job-cards/${id}/${action}`, {
        action,
        reason,
        notes,
      });
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['job-cards'] });
      queryClient.invalidateQueries({ queryKey: ['job-card', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['services'] });
    },
  });
}

/**
 * Mutation to update work details
 */
export function useUpdateJobCardWorkMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateJobCardWorkInput }) => {
      const response = await apiClient.patch<{ success: boolean; data: any }>(`/job-cards/${id}`, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['job-cards'] });
      queryClient.invalidateQueries({ queryKey: ['job-card', variables.id] });
    },
  });
}

/**
 * Mutation to complete Job Card & Service
 */
export function useCompleteJobCardMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CompleteJobCardInput }) => {
      const response = await apiClient.post<{ success: boolean; data: any }>(`/job-cards/${id}/complete`, data);
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['job-cards'] });
      queryClient.invalidateQueries({ queryKey: ['job-card', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['services'] });
      queryClient.invalidateQueries({ queryKey: ['technicians'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['payments'] });
    },
  });
}

/**
 * Mutation to send or retry WhatsApp notification to assigned technician
 */
export function useNotifyTechnicianWhatsAppMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (jobCardId: string) => {
      const response = await apiClient.post<any>(
        `/job-cards/${jobCardId}/notify-technician`
      );
      const data = response?.data || response;
      if (response && 'success' in response && typeof data === 'object') {
        data.success = response.success;
        if ((response as any).message && !data.message) {
          data.message = (response as any).message;
        }
      }
      return data;
    },
    onSuccess: (_, jobCardId) => {
      queryClient.invalidateQueries({ queryKey: ['job-card', jobCardId] });
      queryClient.invalidateQueries({ queryKey: ['job-cards'] });
    },
  });
}
