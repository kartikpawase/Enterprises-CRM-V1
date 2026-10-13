import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../lib/api-client';
import type {
  AnalyticsDateFilter,
  AnalyticsOverview,
  SalesAnalytics,
  RevenueAnalytics,
  PaymentAnalytics,
  CustomerAnalytics,
  ProductAnalytics,
  InventoryAnalytics,
  ServiceAnalytics,
  JobCardAnalytics,
  TechnicianAnalytics,
  WarrantyAnalytics,
  InquiryAnalytics,
  FinancialSummaryReport,
} from '@crm/types';

// Query Keys
export const analyticsKeys = {
  all: ['analytics'] as const,
  overview: (filter: AnalyticsDateFilter) => [...analyticsKeys.all, 'overview', filter] as const,
  financialSummary: (filter: AnalyticsDateFilter) => [...analyticsKeys.all, 'financialSummary', filter] as const,
  sales: (filter: AnalyticsDateFilter) => [...analyticsKeys.all, 'sales', filter] as const,
  revenue: (filter: AnalyticsDateFilter) => [...analyticsKeys.all, 'revenue', filter] as const,
  payments: (filter: AnalyticsDateFilter) => [...analyticsKeys.all, 'payments', filter] as const,
  customers: (filter: AnalyticsDateFilter) => [...analyticsKeys.all, 'customers', filter] as const,
  products: (filter: AnalyticsDateFilter) => [...analyticsKeys.all, 'products', filter] as const,
  inventory: () => [...analyticsKeys.all, 'inventory'] as const,
  services: (filter: AnalyticsDateFilter) => [...analyticsKeys.all, 'services', filter] as const,
  jobCards: (filter: AnalyticsDateFilter) => [...analyticsKeys.all, 'jobCards', filter] as const,
  technicians: (filter: AnalyticsDateFilter) => [...analyticsKeys.all, 'technicians', filter] as const,
  warranties: (filter: AnalyticsDateFilter) => [...analyticsKeys.all, 'warranties', filter] as const,
  inquiries: (filter: AnalyticsDateFilter) => [...analyticsKeys.all, 'inquiries', filter] as const,
};

// Clean Zero-Initialized Overview Data when API is loading or network offline
const EMPTY_OVERVIEW: AnalyticsOverview = {
  period: {
    range: '30D',
    startDate: '',
    endDate: '',
    timezone: 'Asia/Kolkata',
  },
  kpis: {
    grossBilled: { current: 0, previous: 0, deltaPercentage: 0, trend: 'neutral' },
    amountCollected: { current: 0, previous: 0, deltaPercentage: 0, trend: 'neutral' },
    outstandingAmount: { current: 0, previous: 0, deltaPercentage: 0, trend: 'neutral' },
    newCustomers: { current: 0, previous: 0, deltaPercentage: 0, trend: 'neutral' },
    servicesCompleted: { current: 0, previous: 0, deltaPercentage: 0, trend: 'neutral' },
    openJobCards: { current: 0, previous: 0, deltaPercentage: 0, trend: 'neutral' },
    activeWarranties: { current: 0, previous: 0, deltaPercentage: 0, trend: 'neutral' },
    inquiriesConverted: { current: 0, previous: 0, deltaPercentage: 0, trend: 'neutral' },
    inquiryConversionRate: { current: 0, previous: 0, deltaPercentage: 0, trend: 'neutral' },
  },
  sales: {
    totalSalesAmount: 0,
    salesCount: 0,
    averageSaleValue: 0,
    salesTrend: [],
    salesByProduct: [],
    salesByCategory: [],
    salesByCustomerType: [],
    comparison: {
      amount: { current: 0, previous: 0, deltaPercentage: 0, trend: 'neutral' },
      count: { current: 0, previous: 0, deltaPercentage: 0, trend: 'neutral' },
    },
  },
  revenue: {
    grossBilled: 0,
    amountCollected: 0,
    outstandingAmount: 0,
    overdueAmount: 0,
    collectionRate: 0,
    totalInvoicesIssued: 0,
    paidInvoicesCount: 0,
    partiallyPaidCount: 0,
    overdueInvoicesCount: 0,
    revenueTrend: [],
    comparison: {
      billed: { current: 0, previous: 0, deltaPercentage: 0, trend: 'neutral' },
      collected: { current: 0, previous: 0, deltaPercentage: 0, trend: 'neutral' },
      outstanding: { current: 0, previous: 0, deltaPercentage: 0, trend: 'neutral' },
    },
  },
  payments: {
    totalPayments: 0,
    paymentCount: 0,
    averagePaymentAmount: 0,
    paymentMethodDistribution: [],
    collectionTrend: [],
    partialPaymentsCount: 0,
    comparison: {
      total: { current: 0, previous: 0, deltaPercentage: 0, trend: 'neutral' },
      count: { current: 0, previous: 0, deltaPercentage: 0, trend: 'neutral' },
    },
  },
  customers: {
    totalCustomers: 0,
    newCustomers: 0,
    activeCustomers: 0,
    customersWithActiveAssets: 0,
    customersWithOutstandingBalance: 0,
    customersWithActiveServices: 0,
    acquisitionTrend: [],
    customerTypeDistribution: [],
    comparison: {
      newCustomers: { current: 0, previous: 0, deltaPercentage: 0, trend: 'neutral' },
      totalCustomers: { current: 0, previous: 0, deltaPercentage: 0, trend: 'neutral' },
    },
  },
  services: {
    totalServices: 0,
    completedServices: 0,
    pendingServices: 0,
    overdueServices: 0,
    completionRate: 0,
    serviceTypeDistribution: [],
    classificationDistribution: [],
    serviceTrend: [],
    comparison: {
      total: { current: 0, previous: 0, deltaPercentage: 0, trend: 'neutral' },
      completed: { current: 0, previous: 0, deltaPercentage: 0, trend: 'neutral' },
    },
  },
  jobCards: {
    totalJobCards: 0,
    openJobs: 0,
    assignedJobs: 0,
    inProgressJobs: 0,
    completedJobs: 0,
    cancelledJobs: 0,
    reopenedJobs: 0,
    averageCompletionHours: 0,
    jobsByPriority: [],
    jobsByType: [],
    jobStatusTrend: [],
    comparison: {
      total: { current: 0, previous: 0, deltaPercentage: 0, trend: 'neutral' },
      completed: { current: 0, previous: 0, deltaPercentage: 0, trend: 'neutral' },
    },
  },
  technicians: {
    activeTechniciansCount: 0,
    totalAssignedJobs: 0,
    totalCompletedJobs: 0,
    workforceAverageCompletionHours: 0,
    technicianBreakdown: [],
  },
  warranties: {
    activeWarranties: 0,
    expiringWarranties: 0,
    expiredWarranties: 0,
    totalWarrantyServices: 0,
    warrantyVsPaidServiceRatio: {
      warrantyServices: 0,
      paidServices: 0,
      warrantyPercentage: 0,
    },
    comparison: {
      active: { current: 0, previous: 0, deltaPercentage: 0, trend: 'neutral' },
      expiring: { current: 0, previous: 0, deltaPercentage: 0, trend: 'neutral' },
    },
  },
  inquiries: {
    totalInquiries: 0,
    newInquiries: 0,
    contactedInquiries: 0,
    qualifiedInquiries: 0,
    convertedInquiries: 0,
    closedInquiries: 0,
    conversionRate: 0,
    qualifiedConversionRate: 0,
    inquirySourceDistribution: [],
    inquiryTypeDistribution: [],
    inquiryTrend: [],
    comparison: {
      total: { current: 0, previous: 0, deltaPercentage: 0, trend: 'neutral' },
      converted: { current: 0, previous: 0, deltaPercentage: 0, trend: 'neutral' },
      conversionRate: { current: 0, previous: 0, deltaPercentage: 0, trend: 'neutral' },
    },
  },
};

export function useAnalyticsOverview(filter: AnalyticsDateFilter) {
  return useQuery({
    queryKey: analyticsKeys.overview(filter),
    queryFn: async () => {
      try {
        const response = await apiClient.get<AnalyticsOverview>('/analytics/overview', {
          params: {
            range: filter.range,
            startDate: filter.startDate,
            endDate: filter.endDate,
            timezone: filter.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
        });
        return response.data;
      } catch (err) {
        console.warn('Backend analytics API returned empty or error, using clean zero model', err);
        return EMPTY_OVERVIEW;
      }
    },
    staleTime: 60 * 1000,
  });
}

export function useSalesAnalytics(filter: AnalyticsDateFilter) {
  return useQuery({
    queryKey: analyticsKeys.sales(filter),
    queryFn: async () => {
      const response = await apiClient.get<SalesAnalytics>('/analytics/sales', {
        params: {
          range: filter.range,
          startDate: filter.startDate,
          endDate: filter.endDate,
          timezone: filter.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      return response.data;
    },
    staleTime: 60 * 1000,
  });
}

export function useRevenueAnalytics(filter: AnalyticsDateFilter) {
  return useQuery({
    queryKey: analyticsKeys.revenue(filter),
    queryFn: async () => {
      const response = await apiClient.get<RevenueAnalytics>('/analytics/revenue', {
        params: {
          range: filter.range,
          startDate: filter.startDate,
          endDate: filter.endDate,
          timezone: filter.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      return response.data;
    },
    staleTime: 60 * 1000,
  });
}

export function usePaymentAnalytics(filter: AnalyticsDateFilter) {
  return useQuery({
    queryKey: analyticsKeys.payments(filter),
    queryFn: async () => {
      const response = await apiClient.get<PaymentAnalytics>('/analytics/payments', {
        params: {
          range: filter.range,
          startDate: filter.startDate,
          endDate: filter.endDate,
          timezone: filter.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      return response.data;
    },
    staleTime: 60 * 1000,
  });
}

export function useCustomerAnalytics(filter: AnalyticsDateFilter) {
  return useQuery({
    queryKey: analyticsKeys.customers(filter),
    queryFn: async () => {
      const response = await apiClient.get<CustomerAnalytics>('/analytics/customers', {
        params: {
          range: filter.range,
          startDate: filter.startDate,
          endDate: filter.endDate,
          timezone: filter.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      return response.data;
    },
    staleTime: 60 * 1000,
  });
}

export function useServiceAnalytics(filter: AnalyticsDateFilter) {
  return useQuery({
    queryKey: analyticsKeys.services(filter),
    queryFn: async () => {
      const response = await apiClient.get<ServiceAnalytics>('/analytics/services', {
        params: {
          range: filter.range,
          startDate: filter.startDate,
          endDate: filter.endDate,
          timezone: filter.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      return response.data;
    },
    staleTime: 60 * 1000,
  });
}

export function useJobCardAnalytics(filter: AnalyticsDateFilter) {
  return useQuery({
    queryKey: analyticsKeys.jobCards(filter),
    queryFn: async () => {
      const response = await apiClient.get<JobCardAnalytics>('/analytics/jobs', {
        params: {
          range: filter.range,
          startDate: filter.startDate,
          endDate: filter.endDate,
          timezone: filter.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      return response.data;
    },
    staleTime: 60 * 1000,
  });
}

export function useTechnicianAnalytics(filter: AnalyticsDateFilter) {
  return useQuery({
    queryKey: analyticsKeys.technicians(filter),
    queryFn: async () => {
      const response = await apiClient.get<TechnicianAnalytics>('/analytics/technicians', {
        params: {
          range: filter.range,
          startDate: filter.startDate,
          endDate: filter.endDate,
          timezone: filter.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      return response.data;
    },
    staleTime: 60 * 1000,
  });
}

export function useWarrantyAnalytics(filter: AnalyticsDateFilter) {
  return useQuery({
    queryKey: analyticsKeys.warranties(filter),
    queryFn: async () => {
      const response = await apiClient.get<WarrantyAnalytics>('/analytics/warranties', {
        params: {
          range: filter.range,
          startDate: filter.startDate,
          endDate: filter.endDate,
          timezone: filter.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      return response.data;
    },
    staleTime: 60 * 1000,
  });
}

export function useInquiryAnalytics(filter: AnalyticsDateFilter) {
  return useQuery({
    queryKey: analyticsKeys.inquiries(filter),
    queryFn: async () => {
      const response = await apiClient.get<InquiryAnalytics>('/analytics/inquiries', {
        params: {
          range: filter.range,
          startDate: filter.startDate,
          endDate: filter.endDate,
          timezone: filter.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      return response.data;
    },
    staleTime: 60 * 1000,
  });
}

export function useProductAnalytics(filter: AnalyticsDateFilter) {
  return useQuery({
    queryKey: analyticsKeys.products(filter),
    queryFn: async () => {
      const response = await apiClient.get<ProductAnalytics>('/analytics/products', {
        params: {
          range: filter.range,
          startDate: filter.startDate,
          endDate: filter.endDate,
          timezone: filter.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      return response.data;
    },
    staleTime: 60 * 1000,
  });
}

export function useInventoryAnalytics() {
  return useQuery({
    queryKey: analyticsKeys.inventory(),
    queryFn: async () => {
      const response = await apiClient.get<InventoryAnalytics>('/analytics/inventory');
      return response.data;
    },
    staleTime: 60 * 1000,
  });
}

export function useFinancialSummaryQuery(filter: AnalyticsDateFilter) {
  return useQuery<FinancialSummaryReport>({
    queryKey: analyticsKeys.financialSummary(filter),
    queryFn: async () => {
      const response = await apiClient.get<any>('/analytics/financial-summary', {
        params: {
          range: filter.range,
          startDate: filter.startDate,
          endDate: filter.endDate,
          timezone: filter.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      return (response as any).data || response;
    },
    staleTime: 30 * 1000,
  });
}

