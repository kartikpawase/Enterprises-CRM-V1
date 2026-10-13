import React, { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  TrendingUp,
  ShoppingBag,
  Users,
  Wrench,
  FileText,
  WalletCards,
  Package,
  HardHat,
} from 'lucide-react';
import {
  useAnalyticsOverview,
  useFinancialSummaryQuery,
} from '../analytics/analytics.api';
import { useCustomersQuery } from '../customers/customer.api';
import { useInvoicesQuery } from '../invoices/invoices.api';
import { useJobCardsQuery } from '../job-cards/job-cards.api';
import { useTechniciansQuery } from '../technicians/technicians.api';
import { useProductsQuery, useSalesQuery } from '../sales/sales.api';
import { useWarrantiesQuery } from '../warranties/warranties.api';
import { useServicesQuery } from '../services/services.api';
import { ReportsHeader } from './components/ReportsHeader';
import { ReportControlBar } from './components/ReportControlBar';
import { ReportKpiGrid } from './components/ReportKpiGrid';
import { RevenueSalesSection } from './components/RevenueSalesSection';
import { SalesPerformanceSection } from './components/SalesPerformanceSection';
import { CustomerInsightsSection } from './components/CustomerInsightsSection';
import { ServicePerformanceSection } from './components/ServicePerformanceSection';
import { FinancialOverviewSection } from './components/FinancialOverviewSection';
import { FinancialSummarySection } from './components/FinancialSummarySection';
import { PaymentPerformanceSection } from './components/PaymentPerformanceSection';
import { ProductPerformanceSection } from './components/ProductPerformanceSection';
import { TechnicianPerformanceSection } from './components/TechnicianPerformanceSection';
import { WarrantyAlertsSection } from './components/WarrantyAlertsSection';
import { BusinessInsightsSection } from './components/BusinessInsightsSection';
import { ReportRecordsTable } from './components/ReportRecordsTable';
import { ExportReportModal } from './components/ExportReportModal';
import { ReportSkeletonLoader } from './components/ReportSkeletonLoader';
import { formatCurrency, formatNumber } from '../../lib/formatters';
import type { ReportFilterState, KpiMetric } from './reports.types';
import type { AnalyticsDateFilter } from '@crm/types';

function computeDateBounds(preset: string, customStart?: string, customEnd?: string): { startDate: string; endDate: string } {
  const now = new Date();
  const formatYmd = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  switch (preset) {
    case 'today': {
      const todayStr = formatYmd(now);
      return { startDate: `${todayStr}T00:00:00.000Z`, endDate: `${todayStr}T23:59:59.999Z` };
    }
    case 'yesterday': {
      const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const yStr = formatYmd(y);
      return { startDate: `${yStr}T00:00:00.000Z`, endDate: `${yStr}T23:59:59.999Z` };
    }
    case '7D':
    case 'last_week': {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      return { startDate: `${formatYmd(start)}T00:00:00.000Z`, endDate: `${formatYmd(now)}T23:59:59.999Z` };
    }
    case 'this_month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { startDate: `${formatYmd(start)}T00:00:00.000Z`, endDate: `${formatYmd(end)}T23:59:59.999Z` };
    }
    case 'previous_month':
    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { startDate: `${formatYmd(start)}T00:00:00.000Z`, endDate: `${formatYmd(end)}T23:59:59.999Z` };
    }
    case 'this_quarter': {
      const quarter = Math.floor(now.getMonth() / 3);
      const start = new Date(now.getFullYear(), quarter * 3, 1);
      const end = new Date(now.getFullYear(), quarter * 3 + 3, 0);
      return { startDate: `${formatYmd(start)}T00:00:00.000Z`, endDate: `${formatYmd(end)}T23:59:59.999Z` };
    }
    case 'this_year': {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear(), 11, 31);
      return { startDate: `${formatYmd(start)}T00:00:00.000Z`, endDate: `${formatYmd(end)}T23:59:59.999Z` };
    }
    case 'custom': {
      if (customStart && customEnd) {
        return {
          startDate: customStart.includes('T') ? customStart : `${customStart}T00:00:00.000Z`,
          endDate: customEnd.includes('T') ? customEnd : `${customEnd}T23:59:59.999Z`,
        };
      }
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { startDate: `${formatYmd(start)}T00:00:00.000Z`, endDate: `${formatYmd(now)}T23:59:59.999Z` };
    }
    default: {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { startDate: `${formatYmd(start)}T00:00:00.000Z`, endDate: `${formatYmd(end)}T23:59:59.999Z` };
    }
  }
}

export const ReportsPage: React.FC = () => {
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<ReportFilterState>({
    datePreset: 'this_month',
    reportType: 'overview',
    compareWith: 'previous_period',
    customStartDate: '',
    customEndDate: '',
  });

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  const dateBounds = useMemo(() => {
    return computeDateBounds(filters.datePreset, filters.customStartDate, filters.customEndDate);
  }, [filters.datePreset, filters.customStartDate, filters.customEndDate]);

  const apiFilter: AnalyticsDateFilter = useMemo(() => ({
    range: filters.datePreset === 'custom' ? 'custom' : (filters.datePreset as any),
    startDate: dateBounds.startDate,
    endDate: dateBounds.endDate,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }), [filters.datePreset, dateBounds]);

  // 1. Live CRM Domain Queries synchronized with selected date interval
  const { data: customersData, isLoading: isCustomersLoading, refetch: refetchCustomers } = useCustomersQuery({ page: 1, limit: 100 });
  const { data: invoicesData, isLoading: isInvoicesLoading, refetch: refetchInvoices } = useInvoicesQuery({
    page: 1,
    limit: 100,
    startDate: dateBounds.startDate,
    endDate: dateBounds.endDate,
  });
  const { data: jobCardsData, isLoading: isJobCardsLoading, refetch: refetchJobCards } = useJobCardsQuery({
    page: 1,
    limit: 100,
    dateFrom: dateBounds.startDate,
    dateTo: dateBounds.endDate,
  });
  const { data: techniciansData, isLoading: isTechniciansLoading, refetch: refetchTechnicians } = useTechniciansQuery({ page: 1, limit: 100 });
  const { data: productsData, isLoading: isProductsLoading, refetch: refetchProducts } = useProductsQuery();
  const { data: salesData, isLoading: isSalesLoading, refetch: refetchSales } = useSalesQuery({
    page: 1,
    limit: 100,
    startDate: dateBounds.startDate,
    endDate: dateBounds.endDate,
    datePreset: filters.datePreset === 'custom' ? undefined : (filters.datePreset as any),
  });
  const { data: warrantiesData, isLoading: isWarrantiesLoading, refetch: refetchWarranties } = useWarrantiesQuery({ page: 1, limit: 100 });
  const { data: servicesData, refetch: refetchServices } = useServicesQuery({ page: 1, limit: 100 });

  // 2. High-level Analytics Overview & Financial Summary Queries
  const { data: overview, isLoading: isOverviewLoading, refetch: refetchOverview } = useAnalyticsOverview(apiFilter);
  const { data: financialData, isLoading: isFinancialLoading, refetch: refetchFinancial } = useFinancialSummaryQuery(apiFilter);

  const handleFilterChange = (updates: Partial<ReportFilterState>) => {
    setFilters((prev) => ({ ...prev, ...updates }));
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries(),
        refetchCustomers(),
        refetchInvoices(),
        refetchJobCards(),
        refetchServices(),
        refetchTechnicians(),
        refetchProducts(),
        refetchSales(),
        refetchWarranties(),
        refetchOverview(),
        refetchFinancial(),
      ]);
    } finally {
      setTimeout(() => setIsRefreshing(false), 400);
    }
  };

  const getDatePresetLabel = () => {
    switch (filters.datePreset) {
      case 'today':
        return 'Today';
      case 'yesterday':
        return 'Yesterday';
      case '7D':
        return 'This Week (7D)';
      case 'last_week':
        return 'Last Week';
      case 'this_month':
        return 'This Month';
      case 'previous_month':
        return 'Last Month';
      case 'this_quarter':
        return 'This Quarter';
      case 'this_year':
        return 'This Year';
      case 'custom':
        return filters.customStartDate && filters.customEndDate
          ? `${filters.customStartDate} to ${filters.customEndDate}`
          : 'Custom Range';
      default:
        return 'This Month';
    }
  };

  // Real authoritative metrics from database overview or filtered domain queries
  const realTotalCustomers = overview?.customers?.totalCustomers ?? customersData?.pagination?.total ?? customersData?.data?.length ?? 0;
  const realInvoicesList = invoicesData?.data ?? [];
  const realGrossBilled = overview?.revenue?.grossBilled ?? realInvoicesList.reduce((sum, inv) => sum + Number(inv.totalAmount || 0), 0);
  const realAmountCollected = overview?.revenue?.amountCollected ?? realInvoicesList.reduce((sum, inv) => sum + Number(inv.paidAmount || 0), 0);
  const realOutstandingAmount = overview?.revenue?.outstandingAmount ?? Math.max(0, realGrossBilled - realAmountCollected);
  const realOverdueInvoices = overview?.revenue?.overdueInvoicesCount ?? realInvoicesList.filter((inv) => inv.status === 'OVERDUE').length;
  const realOverdueAmount = overview?.revenue?.overdueAmount ?? realInvoicesList.filter((inv) => inv.status === 'OVERDUE').reduce((sum, inv) => sum + Number(inv.totalAmount || 0), 0);

  const realSalesList = salesData?.data ?? [];
  const realSalesCount = overview?.sales?.salesCount ?? salesData?.pagination?.total ?? realSalesList.length;
  const realTotalSalesAmount = overview?.sales?.totalSalesAmount ?? realSalesList.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0);

  const realJobCardsList = jobCardsData?.data ?? [];
  const realServicesList = servicesData?.data ?? [];
  const combinedServicesCount = Math.max(realServicesList.length, realJobCardsList.length);
  const realTotalServices = overview?.services?.totalServices ?? (combinedServicesCount > 0 ? combinedServicesCount : jobCardsData?.pagination?.total ?? 0);
  const realCompletedServices = overview?.services?.completedServices ?? (realServicesList.filter((s: any) => s.status === 'COMPLETED').length || realJobCardsList.filter((j: any) => j.status === 'COMPLETED').length);
  const realPendingServices = overview?.services?.pendingServices ?? Math.max(0, realTotalServices - realCompletedServices);

  const realTechniciansList = techniciansData?.data ?? [];
  const realActiveTechnicians = overview?.technicians?.activeTechniciansCount ?? realTechniciansList.filter((t: any) => t.status === 'ACTIVE').length;

  const realProductsList = productsData ?? [];
  const realWarrantiesList = warrantiesData?.data ?? [];
  const realActiveWarranties = overview?.warranties?.activeWarranties ?? realWarrantiesList.filter((w: any) => w.status === 'ACTIVE').length;

  // Map live metrics across all CRM data to KPI grid
  const dynamicKpis: Partial<Record<'revenue' | 'sales' | 'customers' | 'services' | 'outstanding', Partial<KpiMetric>>> = {
    revenue: {
      value: formatCurrency(realGrossBilled),
      deltaPercentage: overview?.kpis?.grossBilled?.deltaPercentage ?? 0,
      trend: overview?.kpis?.grossBilled?.trend ?? 'neutral',
      sparklineData: overview?.revenue?.revenueTrend?.map((t: any) => t.billed || 0) || [realGrossBilled, realGrossBilled],
    },
    sales: {
      value: formatNumber(realSalesCount),
      deltaPercentage: overview?.sales?.comparison?.count?.deltaPercentage ?? 0,
      trend: overview?.sales?.comparison?.count?.trend ?? 'neutral',
      sparklineData: overview?.sales?.salesTrend?.map((t: any) => t.secondaryValue || 0) || [realSalesCount, realSalesCount],
    },
    customers: {
      value: formatNumber(realTotalCustomers),
      deltaPercentage: overview?.customers?.comparison?.totalCustomers?.deltaPercentage ?? 0,
      trend: overview?.customers?.comparison?.totalCustomers?.trend ?? 'neutral',
      sparklineData: overview?.customers?.acquisitionTrend?.map((t: any) => t.value || 0) || [realTotalCustomers, realTotalCustomers],
    },
    services: {
      value: formatNumber(realCompletedServices),
      deltaPercentage: overview?.kpis?.servicesCompleted?.deltaPercentage ?? 0,
      trend: overview?.kpis?.servicesCompleted?.trend ?? 'neutral',
      sparklineData: overview?.services?.serviceTrend?.map((t: any) => t.completed || 0) || [realCompletedServices, realCompletedServices],
    },
    outstanding: {
      value: formatCurrency(realOutstandingAmount),
      deltaPercentage: overview?.kpis?.outstandingAmount?.deltaPercentage ?? 0,
      trend: overview?.kpis?.outstandingAmount?.trend === 'up' ? 'up' : 'down',
      sparklineData: overview?.revenue?.revenueTrend?.map((t: any) => (t.billed || 0) - (t.collected || 0)) || [realOutstandingAmount, realOutstandingAmount],
    },
  };

  const isAnyInitialLoading = isOverviewLoading && isCustomersLoading && isInvoicesLoading;

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-12 animate-in fade-in duration-150">
      {/* 1. Reports Global Header */}
      <ReportsHeader
        dateLabel={getDatePresetLabel()}
        onExportClick={() => setIsExportModalOpen(true)}
        onDateClick={() => handleFilterChange({ datePreset: 'this_month' })}
      />

      {/* 2. Control & Filter Bar */}
      <ReportControlBar
        filters={filters}
        onFilterChange={handleFilterChange}
        onRefresh={handleRefresh}
        onExport={() => setIsExportModalOpen(true)}
        isRefreshing={isRefreshing}
      />

      {isAnyInitialLoading ? (
        <ReportSkeletonLoader />
      ) : (
        <>
          {/* TAB 1: EXECUTIVE OVERVIEW */}
          {filters.reportType === 'overview' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Primary 5 KPI Cards */}
              <ReportKpiGrid kpis={dynamicKpis} />

              {/* Main Two-Column Revenue & Sales Trend Section */}
              <RevenueSalesSection overview={overview} />

              {/* Sales Performance Summary */}
              <SalesPerformanceSection salesData={overview?.sales} />

              {/* Customer Insights Summary */}
              <CustomerInsightsSection customerData={overview?.customers} />

              {/* Service Operations Summary */}
              <ServicePerformanceSection serviceData={overview?.services} />

              {/* Financial & Invoices Summary */}
              <FinancialSummarySection financialData={financialData} isLoading={isFinancialLoading} />
              <FinancialOverviewSection revenueData={overview?.revenue} />

              {/* Top Products Table */}
              <ProductPerformanceSection
                productData={overview?.products}
                catalogProducts={realProductsList}
              />

              {/* Technician Leaderboard Table */}
              <TechnicianPerformanceSection
                technicianData={overview?.technicians}
                techniciansList={realTechniciansList}
              />

              {/* Warranty & Maintenance Alerts */}
              <WarrantyAlertsSection warrantyData={overview?.warranties} customerData={overview?.customers} />

              {/* Dynamic Business Insights */}
              <BusinessInsightsSection
                overview={overview}
                onActionClick={(category) => {
                  if (category === 'revenue') handleFilterChange({ reportType: 'invoices' });
                  else if (category === 'service') handleFilterChange({ reportType: 'services' });
                  else if (category === 'maintenance') handleFilterChange({ reportType: 'services' });
                  else if (category === 'collection') handleFilterChange({ reportType: 'payments' });
                }}
              />
            </div>
          )}

          {/* TAB 2: SALES REPORT */}
          {filters.reportType === 'sales' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                    <TrendingUp className="w-3.5 h-3.5 text-primary-600" />
                    <span>Total Sales Revenue</span>
                  </div>
                  <div className="text-xl font-extrabold text-slate-900 mt-1 font-mono">
                    {formatCurrency(realTotalSalesAmount)}
                  </div>
                  <div className="text-[11px] text-emerald-600 font-mono mt-0.5">
                    Live from sales records
                  </div>
                </div>

                <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                    <ShoppingBag className="w-3.5 h-3.5 text-purple-600" />
                    <span>Sales Orders</span>
                  </div>
                  <div className="text-xl font-extrabold text-purple-900 mt-1 font-mono">
                    {formatNumber(realSalesCount)} Orders
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Completed customer orders</div>
                </div>

                <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                    <Package className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Avg Order Ticket</span>
                  </div>
                  <div className="text-xl font-extrabold text-slate-900 mt-1 font-mono">
                    {formatCurrency(realSalesCount > 0 ? Math.round(realTotalSalesAmount / realSalesCount) : 0)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Average revenue per sale</div>
                </div>

                <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                    <Users className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Active Product SKUs</span>
                  </div>
                  <div className="text-xl font-extrabold text-emerald-700 font-mono">
                    {realProductsList.length} Catalog Items
                  </div>
                  <div className="text-[11px] text-emerald-600 font-mono mt-0.5">Available in inventory</div>
                </div>
              </div>

              <SalesPerformanceSection salesData={overview?.sales} />
              
              <ProductPerformanceSection
                productData={overview?.products}
                catalogProducts={realProductsList}
              />

              {/* Live Real Sales Records from Database */}
              <ReportRecordsTable
                type="sales"
                data={realSalesList}
                isLoading={isSalesLoading}
              />

              <BusinessInsightsSection overview={overview} />
            </div>
          )}

          {/* TAB 3: CUSTOMERS REPORT */}
          {filters.reportType === 'customers' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                    <Users className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Registered Customers</span>
                  </div>
                  <div className="text-xl font-extrabold text-slate-900 mt-1 font-mono">
                    {formatNumber(realTotalCustomers)} Accounts
                  </div>
                  <div className="text-[11px] text-emerald-600 mt-0.5 font-mono">
                    Live CRM directory records
                  </div>
                </div>

                <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                    <Users className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Active Accounts</span>
                  </div>
                  <div className="text-xl font-extrabold text-emerald-900 mt-1 font-mono">
                    {formatNumber(realTotalCustomers)}
                  </div>
                  <div className="text-[11px] text-emerald-600 mt-0.5 font-mono">Active customer accounts</div>
                </div>

                <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                    <Wrench className="w-3.5 h-3.5 text-primary-600" />
                    <span>Active Machine Assets</span>
                  </div>
                  <div className="text-xl font-extrabold text-primary-900 mt-1 font-mono">
                    {formatNumber(realActiveWarranties || realTotalCustomers)}
                  </div>
                  <div className="text-[11px] text-primary-600 mt-0.5 font-mono">Installed customer assets</div>
                </div>

                <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                    <Wrench className="w-3.5 h-3.5 text-amber-600" />
                    <span>Service Requests Due</span>
                  </div>
                  <div className="text-xl font-extrabold text-amber-900 mt-1 font-mono">
                    {formatNumber(realPendingServices)}
                  </div>
                  <div className="text-[11px] text-amber-600 mt-0.5">Filter maintenance due</div>
                </div>
              </div>

              <CustomerInsightsSection customerData={overview?.customers} />
              
              {/* Live Real Customers Records from Database */}
              <ReportRecordsTable
                type="customers"
                data={customersData?.data ?? []}
                isLoading={isCustomersLoading}
              />

              <WarrantyAlertsSection warrantyData={overview?.warranties} customerData={overview?.customers} />
              <BusinessInsightsSection overview={overview} />
            </div>
          )}

          {/* TAB 4: SERVICES REPORT */}
          {filters.reportType === 'services' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                    <Wrench className="w-3.5 h-3.5 text-primary-600" />
                    <span>Total Service Tickets</span>
                  </div>
                  <div className="text-xl font-extrabold text-slate-900 mt-1 font-mono">
                    {formatNumber(realTotalServices)} Jobs
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Live from job card logs</div>
                </div>

                <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                    <Wrench className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Completed Services</span>
                  </div>
                  <div className="text-xl font-extrabold text-emerald-900 mt-1 font-mono">
                    {formatNumber(realCompletedServices)} Jobs
                  </div>
                  <div className="text-[11px] text-emerald-600 font-mono mt-0.5">
                    {realTotalServices > 0 ? Math.round((realCompletedServices / realTotalServices) * 100) : 100}% SLA Resolution
                  </div>
                </div>

                <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                    <Wrench className="w-3.5 h-3.5 text-amber-600" />
                    <span>Pending Work</span>
                  </div>
                  <div className="text-xl font-extrabold text-amber-900 mt-1 font-mono">
                    {formatNumber(realPendingServices)} Jobs
                  </div>
                  <div className="text-[11px] text-amber-700 mt-0.5">In technician queue</div>
                </div>

                <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                    <HardHat className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Field Technicians</span>
                  </div>
                  <div className="text-xl font-extrabold text-indigo-900 mt-1 font-mono">
                    {realActiveTechnicians} Staff
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Registered on duty</div>
                </div>
              </div>

              <ServicePerformanceSection serviceData={overview?.services} />
              
              <TechnicianPerformanceSection
                technicianData={overview?.technicians}
                techniciansList={realTechniciansList}
              />

              {/* Live Real Services & Job Cards from Database */}
              <ReportRecordsTable
                type="services"
                data={realJobCardsList}
                isLoading={isJobCardsLoading}
              />

              <WarrantyAlertsSection warrantyData={overview?.warranties} customerData={overview?.customers} />
            </div>
          )}

          {/* TAB 5: INVOICES REPORT */}
          {filters.reportType === 'invoices' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                    <FileText className="w-3.5 h-3.5 text-primary-600" />
                    <span>Gross Invoiced</span>
                  </div>
                  <div className="text-xl font-extrabold text-slate-900 mt-1 font-mono">
                    {formatCurrency(realGrossBilled)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                    {realInvoicesList.length} invoices generated
                  </div>
                </div>

                <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                    <FileText className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Realized Collections</span>
                  </div>
                  <div className="text-xl font-extrabold text-emerald-900 mt-1 font-mono">
                    {formatCurrency(realAmountCollected)}
                  </div>
                  <div className="text-[11px] text-emerald-600 font-mono mt-0.5">
                    {realGrossBilled > 0 ? Math.round((realAmountCollected / realGrossBilled) * 100) : 100}% collected
                  </div>
                </div>

                <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                    <FileText className="w-3.5 h-3.5 text-amber-600" />
                    <span>Outstanding Dues</span>
                  </div>
                  <div className="text-xl font-extrabold text-amber-900 mt-1 font-mono">
                    {formatCurrency(realOutstandingAmount)}
                  </div>
                  <div className="text-[11px] text-amber-700 mt-0.5">Awaiting customer clearance</div>
                </div>

                <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                    <FileText className="w-3.5 h-3.5 text-rose-600" />
                    <span>Overdue Invoices</span>
                  </div>
                  <div className="text-xl font-extrabold text-rose-900 mt-1 font-mono">
                    {formatCurrency(realOverdueAmount)}
                  </div>
                  <div className="text-[11px] text-rose-600 mt-0.5 font-mono">
                    {realOverdueInvoices} invoices overdue
                  </div>
                </div>
              </div>

              <FinancialOverviewSection revenueData={overview?.revenue} />

              {/* Live Real Invoices Records from Database */}
              <ReportRecordsTable
                type="invoices"
                data={realInvoicesList}
                isLoading={isInvoicesLoading}
              />

              <BusinessInsightsSection overview={overview} />
            </div>
          )}

          {/* TAB 6: PAYMENTS REPORT */}
          {filters.reportType === 'payments' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <PaymentPerformanceSection
                paymentData={overview?.payments}
                revenueData={overview?.revenue}
              />

              {/* Invoices with payment statuses */}
              <FinancialSummarySection financialData={financialData} isLoading={isFinancialLoading} />
              <ReportRecordsTable
                type="invoices"
                data={realInvoicesList}
                isLoading={isInvoicesLoading}
              />

              <FinancialOverviewSection revenueData={overview?.revenue} />
              <BusinessInsightsSection overview={overview} />
            </div>
          )}

          {/* TAB 7: PRODUCTS REPORT */}
          {filters.reportType === 'products' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                    <Package className="w-3.5 h-3.5 text-primary-600" />
                    <span>Product Catalog Value</span>
                  </div>
                  <div className="text-xl font-extrabold text-slate-900 mt-1 font-mono">
                    {formatCurrency(realTotalSalesAmount || realGrossBilled)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Machine &amp; spare sales</div>
                </div>

                <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                    <Package className="w-3.5 h-3.5 text-purple-600" />
                    <span>Active Catalog SKUs</span>
                  </div>
                  <div className="text-xl font-extrabold text-purple-900 mt-1 font-mono">
                    {realProductsList.length} SKUs
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">In live database catalog</div>
                </div>

                <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                    <Package className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Top Selling Model</span>
                  </div>
                  <div className="text-base font-extrabold text-slate-900 mt-1 truncate">
                    {realProductsList[0]?.name || overview?.sales?.salesByProduct?.[0]?.productName || 'Standard Equipment'}
                  </div>
                  <div className="text-[11px] text-emerald-600 font-mono mt-0.5">
                    {realProductsList[0]?.productType ? realProductsList[0].productType.replace(/_/g, ' ') : 'Equipment'}
                  </div>
                </div>

                <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                    <Package className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Sales Orders Logged</span>
                  </div>
                  <div className="text-xl font-extrabold text-indigo-900 mt-1 font-mono">
                    {realSalesCount} Orders
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Dispatched units</div>
                </div>
              </div>

              <ProductPerformanceSection
                productData={overview?.products}
                catalogProducts={realProductsList}
              />

              <SalesPerformanceSection salesData={overview?.sales} />
              <BusinessInsightsSection overview={overview} />
            </div>
          )}

          {/* TAB 8: TECHNICIANS REPORT */}
          {filters.reportType === 'technicians' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                    <HardHat className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Registered Technicians</span>
                  </div>
                  <div className="text-xl font-extrabold text-slate-900 mt-1 font-mono">
                    {realActiveTechnicians} Staff
                  </div>
                  <div className="text-[11px] text-emerald-600 mt-0.5 font-mono">
                    Live technician accounts
                  </div>
                </div>

                <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                    <HardHat className="w-3.5 h-3.5 text-primary-600" />
                    <span>Total Jobs Assigned</span>
                  </div>
                  <div className="text-xl font-extrabold text-primary-900 mt-1 font-mono">
                    {formatNumber(realTotalServices)}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Service orders assigned</div>
                </div>

                <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                    <HardHat className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Jobs Resolved</span>
                  </div>
                  <div className="text-xl font-extrabold text-emerald-900 mt-1 font-mono">
                    {formatNumber(realCompletedServices)}
                  </div>
                  <div className="text-[11px] text-emerald-600 font-mono mt-0.5">Completed jobs</div>
                </div>

                <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-medium">
                    <HardHat className="w-3.5 h-3.5 text-amber-600" />
                    <span>Pending Work</span>
                  </div>
                  <div className="text-xl font-extrabold text-amber-900 mt-1 font-mono">
                    {formatNumber(realPendingServices)}
                  </div>
                  <div className="text-[11px] text-amber-700 mt-0.5 font-mono">In field queue</div>
                </div>
              </div>

              <TechnicianPerformanceSection
                technicianData={overview?.technicians}
                techniciansList={realTechniciansList}
              />

              <ServicePerformanceSection serviceData={overview?.services} />
              <BusinessInsightsSection overview={overview} />
            </div>
          )}
        </>
      )}

      {/* Export Modal */}
      <ExportReportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        currentDatePreset={filters.datePreset}
      />
    </div>
  );
};
