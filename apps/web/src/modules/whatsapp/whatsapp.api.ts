import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import type {
  WhatsAppConversation,
  WhatsAppMessage,
  WhatsAppContact,
  WhatsAppTemplateDefinition,
  SendWhatsAppTextMessageDto,
  SendWhatsAppTemplateMessageDto,
} from '@crm/types';
import type {
  WhatsAppConversationQueryFilterInput,
  UpdateWhatsAppConsentInput,
} from '@crm/validation';

const FALLBACK_TEMPLATES: WhatsAppTemplateDefinition[] = [
  {
    id: 'tpl-001',
    name: 'invoice_reminder',
    category: 'UTILITY',
    language: 'en_US',
    description: 'Payment reminder for outstanding invoices',
    parameterKeys: ['customer_name', 'invoice_number', 'amount', 'due_date'],
    sampleText: 'Hello Rahul, this is a friendly reminder that Invoice #INV-001 for ₹500 is due.',
  },
  {
    id: 'tpl-002',
    name: 'service_scheduled',
    category: 'UTILITY',
    language: 'en_US',
    description: 'Notification when equipment service appointment is booked',
    parameterKeys: ['customer_name', 'product_name', 'schedule_date', 'technician_name'],
    sampleText: 'Dear Rahul, your equipment service has been scheduled for tomorrow.',
  },
  {
    id: 'tpl-003',
    name: 'job_completed',
    category: 'UTILITY',
    language: 'en_US',
    description: 'Service completion notification with job summary',
    parameterKeys: ['customer_name', 'product_name', 'job_number'],
    sampleText: 'Hi Rahul, service for your Equipment is completed under Job Card #JOB-001.',
  },
  {
    id: 'tpl-004',
    name: 'payment_receipt',
    category: 'UTILITY',
    language: 'en_US',
    description: 'Instant receipt confirmation upon payment entry',
    parameterKeys: ['customer_name', 'amount', 'payment_method', 'receipt_number', 'balance_amount'],
    sampleText: 'Hello Rahul, we received payment of ₹500 via UPI.',
  },
  {
    id: 'tpl-005',
    name: 'warranty_expiry_notice',
    category: 'MARKETING',
    language: 'en_US',
    description: 'Contract renewal prompt before warranty expiration',
    parameterKeys: ['customer_name', 'product_name', 'serial_number', 'expiry_date'],
    sampleText: 'Hello Rahul, the warranty for your equipment expires on 31 Dec 2026.',
  },
];

const FALLBACK_CONVERSATIONS: WhatsAppConversation[] = [];

const FALLBACK_MESSAGES: Record<string, WhatsAppMessage[]> = {};

export function useWhatsAppTemplates() {
  return useQuery({
    queryKey: ['whatsapp', 'templates'],
    queryFn: async () => {
      try {
        const response = await apiClient.get<WhatsAppTemplateDefinition[]>(
          '/whatsapp/templates'
        );
        return (response as any)?.data?.data ?? response?.data ?? response;
      } catch {
        return FALLBACK_TEMPLATES;
      }
    },
  });
}

export function useWhatsAppConversations(filters: Partial<WhatsAppConversationQueryFilterInput> = {}) {
  return useQuery({
    queryKey: ['whatsapp', 'conversations', filters],
    queryFn: async () => {
      try {
        const response = await apiClient.get<any>('/whatsapp/conversations', { params: filters as any });
        return (response as any)?.data?.data ? (response as any).data : response;
      } catch {
        let filtered = [...FALLBACK_CONVERSATIONS];
        if (filters.status) filtered = filtered.filter((c) => c.status === filters.status);
        if (filters.search) {
          const s = filters.search.toLowerCase();
          filtered = filtered.filter(
            (c) =>
              c.contact?.customer?.fullName?.toLowerCase().includes(s) ||
              c.contact?.phone.includes(s) ||
              c.lastMessagePreview?.toLowerCase().includes(s)
          );
        }
        return {
          data: filtered,
          pagination: { page: 1, limit: 20, total: filtered.length, totalPages: 1 },
        };
      }
    },
    refetchInterval: 15000,
  });
}

export function useWhatsAppConversation(id?: string) {
  return useQuery({
    queryKey: ['whatsapp', 'conversation', id],
    queryFn: async () => {
      if (!id) throw new Error('Conversation ID required');
      try {
        const response = await apiClient.get<WhatsAppConversation>(
          `/whatsapp/conversations/${id}`
        );
        return (response as any)?.data?.data ?? response?.data ?? response;
      } catch {
        const found =
          FALLBACK_CONVERSATIONS.find((c) => c.id === id) || null;
        return found;
      }
    },
    enabled: Boolean(id),
  });
}

export function useWhatsAppMessages(conversationId?: string) {
  return useQuery({
    queryKey: ['whatsapp', 'messages', conversationId],
    queryFn: async () => {
      if (!conversationId)
        return { data: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 1 } };
      try {
        const response = await apiClient.get<{
          success: boolean;
          data: WhatsAppMessage[];
          pagination: { page: number; limit: number; total: number; totalPages: number };
        }>(`/whatsapp/conversations/${conversationId}/messages`);
        return response.data;
      } catch {
        const msgs = FALLBACK_MESSAGES[conversationId] || [];
        return {
          data: msgs,
          pagination: { page: 1, limit: 50, total: msgs.length, totalPages: 1 },
        };
      }
    },
    enabled: Boolean(conversationId),
    refetchInterval: 8000,
  });
}

export function useSendWhatsAppTextMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SendWhatsAppTextMessageDto) => {
      const response = await apiClient.post<any>(
        '/whatsapp/messages',
        payload
      );
      const resData = response?.data || response;
      if (response && 'success' in response && response.success === false) {
        throw new Error((response as any).message || resData?.errorMessage || 'Failed to send WhatsApp message');
      }
      return resData;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
      if (variables.conversationId) {
        queryClient.invalidateQueries({
          queryKey: ['whatsapp', 'messages', variables.conversationId],
        });
      }
    },
  });
}

export function useSendWhatsAppTemplateMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SendWhatsAppTemplateMessageDto) => {
      const response = await apiClient.post<any>(
        '/whatsapp/send-template',
        payload
      );
      const resData = response?.data || response;
      if (response && 'success' in response && response.success === false) {
        throw new Error((response as any).message || resData?.errorMessage || 'Failed to dispatch WhatsApp template');
      }
      return resData;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
      if (variables.conversationId) {
        queryClient.invalidateQueries({
          queryKey: ['whatsapp', 'messages', variables.conversationId],
        });
      }
    },
  });
}

export function useUpdateWhatsAppConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpdateWhatsAppConsentInput) => {
      const response = await apiClient.post<{ success: boolean; data: WhatsAppContact }>(
        '/whatsapp/contacts/consent',
        payload
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp'] });
    },
  });
}

export function useMarkWhatsAppConversationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const response = await apiClient.post<{ success: boolean }>(
        `/whatsapp/conversations/${conversationId}/read`
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp', 'conversations'] });
    },
  });
}
