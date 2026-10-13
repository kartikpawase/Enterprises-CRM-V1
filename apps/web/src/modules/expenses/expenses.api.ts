import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import type {
  ExpenseItem,
  ExpenseScheduleItem,
  ExpensesOverviewSummary,
  ExpensesListSummary,
  MonthlyReconciliationSummary,
  MonthlyClosingRecord,
} from '@crm/types';
import type {
  CreateExpenseInput,
  UpdateExpenseInput,
  VoidExpenseInput,
  ExpenseQueryFilter,
  CreateExpenseScheduleInput,
  MonthlyReconciliationQuery,
  SaveMonthlyClosingDraftInput,
  ApproveMonthlyClosingInput,
} from '@crm/validation';

export interface ExpensesListResponse {
  items: ExpenseItem[];
  summary?: ExpensesListSummary;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export const expensesApi = {
  getOverview: async (filter?: Partial<ExpenseQueryFilter>): Promise<ExpensesOverviewSummary> => {
    const response = await apiClient.get<any>('/expenses/overview', { params: filter as any });
    return (response as any).data || response;
  },

  getExpenses: async (filter: Partial<ExpenseQueryFilter> = {}): Promise<ExpensesListResponse> => {
    const response = await apiClient.get<any>('/expenses', { params: filter as any });
    const raw = response as any;
    const innerData = raw?.data;
    const items = Array.isArray(innerData) ? innerData : (Array.isArray(raw?.items) ? raw.items : []);
    const pagination = raw?.pagination || innerData?.pagination || { page: 1, limit: 20, total: items.length, totalPages: 1 };
    const summary: ExpensesListSummary = raw?.summary || innerData?.summary || {
      totalAmount: items.filter((e: any) => e.status === 'RECORDED').reduce((acc: number, curr: any) => acc + (Number(curr.amount) || 0), 0),
      voidedAmount: items.filter((e: any) => e.status === 'VOIDED').reduce((acc: number, curr: any) => acc + (Number(curr.amount) || 0), 0),
      totalCount: pagination.total,
    };
    return {
      items,
      summary,
      pagination,
    };
  },

  getExpense: async (id: string): Promise<ExpenseItem> => {
    const response = await apiClient.get<any>(`/expenses/${id}`);
    return (response as any).data || response;
  },

  createExpense: async (payload: CreateExpenseInput): Promise<ExpenseItem> => {
    const response = await apiClient.post<any>('/expenses', payload);
    return (response as any).data || response;
  },

  updateExpense: async (id: string, payload: UpdateExpenseInput): Promise<ExpenseItem> => {
    const response = await apiClient.patch<any>(`/expenses/${id}`, payload);
    return (response as any).data || response;
  },

  voidExpense: async (id: string, payload: VoidExpenseInput): Promise<ExpenseItem> => {
    const response = await apiClient.post<any>(`/expenses/${id}/void`, payload);
    return (response as any).data || response;
  },

  getSchedules: async (): Promise<ExpenseScheduleItem[]> => {
    const response = await apiClient.get<any>('/expenses/schedules');
    const raw = (response as any).data || response;
    return Array.isArray(raw) ? raw : [];
  },

  createSchedule: async (payload: CreateExpenseScheduleInput): Promise<ExpenseScheduleItem> => {
    const response = await apiClient.post<any>('/expenses/schedules', payload);
    return (response as any).data || response;
  },

  toggleSchedule: async (id: string): Promise<ExpenseScheduleItem> => {
    const response = await apiClient.post<any>(`/expenses/schedules/${id}/toggle`);
    return (response as any).data || response;
  },

  recordScheduleOccurrence: async (id: string, expenseDate?: string): Promise<ExpenseItem> => {
    const response = await apiClient.post<any>(`/expenses/schedules/${id}/record`, { expenseDate });
    return (response as any).data || response;
  },

  getMonthlyReconciliation: async (query: MonthlyReconciliationQuery): Promise<MonthlyReconciliationSummary> => {
    const response = await apiClient.get<any>('/expenses/monthly-reconciliation', { params: query });
    return (response as any).data || response;
  },

  saveMonthlyClosingDraft: async (payload: SaveMonthlyClosingDraftInput): Promise<MonthlyClosingRecord> => {
    const response = await apiClient.post<any>('/expenses/monthly-closing/draft', payload);
    return (response as any).data || response;
  },

  approveMonthlyClosing: async (payload: ApproveMonthlyClosingInput): Promise<MonthlyClosingRecord> => {
    const response = await apiClient.post<any>('/expenses/monthly-closing/approve', payload);
    return (response as any).data || response;
  },
};

export function useExpensesOverview(filter?: Partial<ExpenseQueryFilter>) {
  return useQuery({
    queryKey: ['expenses-overview', filter],
    queryFn: () => expensesApi.getOverview(filter),
    staleTime: 30000,
  });
}

export function useExpensesQuery(filter: Partial<ExpenseQueryFilter> = {}) {
  return useQuery({
    queryKey: ['expenses-list', filter],
    queryFn: () => expensesApi.getExpenses(filter),
    staleTime: 30000,
  });
}

export function useCreateExpenseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateExpenseInput) => expensesApi.createExpense(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses-list'] });
      queryClient.invalidateQueries({ queryKey: ['expenses-overview'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['cash-handovers'] });
      queryClient.invalidateQueries({ queryKey: ['cash-handovers-summary'] });
    },
  });
}

export function useUpdateExpenseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateExpenseInput }) =>
      expensesApi.updateExpense(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses-list'] });
      queryClient.invalidateQueries({ queryKey: ['expenses-overview'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['cash-handovers'] });
      queryClient.invalidateQueries({ queryKey: ['cash-handovers-summary'] });
    },
  });
}

export function useVoidExpenseMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: VoidExpenseInput }) =>
      expensesApi.voidExpense(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses-list'] });
      queryClient.invalidateQueries({ queryKey: ['expenses-overview'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['cash-handovers'] });
      queryClient.invalidateQueries({ queryKey: ['cash-handovers-summary'] });
    },
  });
}

export function useExpenseSchedulesQuery() {
  return useQuery({
    queryKey: ['expense-schedules'],
    queryFn: () => expensesApi.getSchedules(),
    staleTime: 30000,
  });
}

export function useCreateExpenseScheduleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateExpenseScheduleInput) => expensesApi.createSchedule(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-schedules'] });
    },
  });
}

export function useToggleScheduleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => expensesApi.toggleSchedule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expense-schedules'] });
    },
  });
}

export function useRecordScheduleOccurrenceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expenseDate }: { id: string; expenseDate?: string }) =>
      expensesApi.recordScheduleOccurrence(id, expenseDate),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses-list'] });
      queryClient.invalidateQueries({ queryKey: ['expenses-overview'] });
      queryClient.invalidateQueries({ queryKey: ['expense-schedules'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['cash-handovers'] });
      queryClient.invalidateQueries({ queryKey: ['cash-handovers-summary'] });
    },
  });
}

export function useMonthlyReconciliationQuery(query: MonthlyReconciliationQuery, enabled = true) {
  return useQuery({
    queryKey: ['monthly-reconciliation', query],
    queryFn: () => expensesApi.getMonthlyReconciliation(query),
    enabled: Boolean(enabled && query.year && query.month),
    staleTime: 10000,
  });
}

export function useSaveMonthlyClosingDraftMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SaveMonthlyClosingDraftInput) => expensesApi.saveMonthlyClosingDraft(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthly-reconciliation'] });
      queryClient.invalidateQueries({ queryKey: ['expenses-overview'] });
    },
  });
}

export function useApproveMonthlyClosingMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ApproveMonthlyClosingInput) => expensesApi.approveMonthlyClosing(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthly-reconciliation'] });
      queryClient.invalidateQueries({ queryKey: ['expenses-overview'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      queryClient.invalidateQueries({ queryKey: ['reports'] });
    },
  });
}

