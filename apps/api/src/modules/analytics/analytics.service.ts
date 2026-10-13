import { analyticsRepository, type DateRangeBounds } from './analytics.repository';
import { formatCsvRow } from '../../security/csv-sanitizer';
import type {
  AnalyticsDateFilter,
  AnalyticsDateRangePreset,
  MetricComparison,
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
  UserRole,
  FinancialSummaryReport,
} from '@crm/types';

function formatYMD(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export class AnalyticsService {
  /**
   * Check if role has financial metrics viewing permissions
   */
  checkFinancialPermission(userRole?: string | UserRole): boolean {
    if (!userRole) return false;
    const roleStr = String(userRole).toUpperCase().replace(/\s+/g, '_');
    return ['ADMIN', 'SUPER_ADMIN', 'MANAGER', 'OWNER', 'EXECUTIVE', 'STAFF'].includes(roleStr);
  }

  /**
   * Helper: Resolve Date Range and Equivalent Comparison Period Bounds
   */
  resolveDateBounds(filter: AnalyticsDateFilter): {
    current: DateRangeBounds;
    previous: DateRangeBounds;
    preset: AnalyticsDateRangePreset;
    startDateStr: string;
    endDateStr: string;
    prevStartDateStr: string;
    prevEndDateStr: string;
  } {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    let prevStartDate: Date;
    let prevEndDate: Date;

    const preset = filter.range || filter.preset || 'last_30_days';

    switch (preset) {
      case 'today': {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        prevStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
        prevEndDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
        break;
      }
      case 'yesterday': {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
        prevStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2, 0, 0, 0, 0);
        prevEndDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2, 23, 59, 59, 999);
        break;
      }
      case '7D':
      case '7d':
      case 'last_7_days':
      case 'last_week': {
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
        prevEndDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 23, 59, 59, 999);
        prevStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13, 0, 0, 0, 0);
        break;
      }
      case 'this_month': {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        prevStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
        prevEndDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        break;
      }
      case 'last_month':
      case 'previous_month': {
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
        endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        prevStartDate = new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0, 0);
        prevEndDate = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59, 999);
        break;
      }
      case 'this_quarter':
      case '90d':
      case '90D': {
        const currentQuarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), currentQuarter * 3, 1, 0, 0, 0, 0);
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        prevStartDate = new Date(now.getFullYear(), (currentQuarter - 1) * 3, 1, 0, 0, 0, 0);
        prevEndDate = new Date(now.getFullYear(), currentQuarter * 3, 0, 23, 59, 59, 999);
        break;
      }
      case 'this_year':
      case '1Y':
      case '12m': {
        startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        prevStartDate = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
        prevEndDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
        break;
      }
      case 'last_year': {
        startDate = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
        endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
        prevStartDate = new Date(now.getFullYear() - 2, 0, 1, 0, 0, 0, 0);
        prevEndDate = new Date(now.getFullYear() - 2, 11, 31, 23, 59, 59, 999);
        break;
      }
      case 'custom': {
        if (filter.startDate) {
          const parts = filter.startDate.split('T')[0].split('-').map(Number);
          startDate = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
        } else {
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          startDate.setHours(0, 0, 0, 0);
        }

        if (filter.endDate) {
          const parts = filter.endDate.split('T')[0].split('-').map(Number);
          endDate = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999);
        } else {
          endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        }

        const durationMs = endDate.getTime() - startDate.getTime();
        prevStartDate = new Date(startDate.getTime() - durationMs);
        prevEndDate = new Date(startDate.getTime() - 1);
        break;
      }
      case '30D':
      case '30d':
      case 'last_30_days':
      default: {
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0);
        prevEndDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30, 23, 59, 59, 999);
        prevStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 59, 0, 0, 0, 0);
        break;
      }
    }

    return {
      current: { startDate, endDate },
      previous: { startDate: prevStartDate, endDate: prevEndDate },
      preset,
      startDateStr: formatYMD(startDate),
      endDateStr: formatYMD(endDate),
      prevStartDateStr: formatYMD(prevStartDate),
      prevEndDateStr: formatYMD(prevEndDate),
    };
  }

  /**
   * Helper: Safe Zero-Denominator Percentage Delta Calculation
   */
  calculateDelta(current: number, previous: number): MetricComparison {
    if (previous === 0) {
      return {
        current,
        previous,
        deltaPercentage: current === 0 ? 0 : null, // null safely rendered as 'New' or 'N/A'
        trend: current > 0 ? 'up' : current < 0 ? 'down' : 'neutral',
      };
    }

    const delta = Math.round(((current - previous) / previous) * 1000) / 10;
    return {
      current,
      previous,
      deltaPercentage: delta,
      trend: delta > 0 ? 'up' : delta < 0 ? 'down' : 'neutral',
    };
  }


  /**
   * Get Sales Analytics with Comparisons
   */
  async getSalesAnalytics(filter: AnalyticsDateFilter): Promise<SalesAnalytics> {
    const { current, previous } = this.resolveDateBounds(filter);
    const currMetrics = await analyticsRepository.getSalesMetrics(current);
    const prevMetrics = await analyticsRepository.getSalesMetrics(previous);

    return {
      totalSalesAmount: currMetrics.totalAmount,
      salesCount: currMetrics.count,
      averageSaleValue: currMetrics.count > 0 ? Math.round(currMetrics.totalAmount / currMetrics.count) : 0,
      salesTrend: currMetrics.trend,
      salesByProduct: currMetrics.byProduct,
      salesByCategory: currMetrics.byCategory,
      salesByCustomerType: currMetrics.byCustomerType,
      comparison: {
        amount: this.calculateDelta(currMetrics.totalAmount, prevMetrics.totalAmount),
        count: this.calculateDelta(currMetrics.count, prevMetrics.count),
      },
    };
  }

  /**
   * Get Revenue Analytics (Billed vs Collected vs Outstanding)
   */
  async getRevenueAnalytics(filter: AnalyticsDateFilter): Promise<RevenueAnalytics> {
    const { current, previous } = this.resolveDateBounds(filter);
    const curr = await analyticsRepository.getRevenueMetrics(current);
    const prev = await analyticsRepository.getRevenueMetrics(previous);

    return {
      ...curr,
      comparison: {
        billed: this.calculateDelta(curr.grossBilled, prev.grossBilled),
        collected: this.calculateDelta(curr.amountCollected, prev.amountCollected),
        outstanding: this.calculateDelta(curr.outstandingAmount, prev.outstandingAmount),
      },
    };
  }

  /**
   * Get Payment Analytics
   */
  async getPaymentAnalytics(filter: AnalyticsDateFilter): Promise<PaymentAnalytics> {
    const { current, previous } = this.resolveDateBounds(filter);
    const curr = await analyticsRepository.getPaymentMetrics(current);
    const prev = await analyticsRepository.getPaymentMetrics(previous);

    return {
      ...curr,
      comparison: {
        total: this.calculateDelta(curr.totalPayments, prev.totalPayments),
        count: this.calculateDelta(curr.paymentCount, prev.paymentCount),
      },
    };
  }

  /**
   * Get Customer Analytics
   */
  async getCustomerAnalytics(filter: AnalyticsDateFilter): Promise<CustomerAnalytics> {
    const { current, previous } = this.resolveDateBounds(filter);
    const curr = await analyticsRepository.getCustomerMetrics(current);
    const prev = await analyticsRepository.getCustomerMetrics(previous);

    return {
      ...curr,
      comparison: {
        newCustomers: this.calculateDelta(curr.newCustomers, prev.newCustomers),
        totalCustomers: this.calculateDelta(curr.totalCustomers, prev.totalCustomers),
      },
    };
  }

  /**
   * Get Product Performance Analytics
   */
  async getProductAnalytics(filter: AnalyticsDateFilter): Promise<ProductAnalytics> {
    const { current, previous } = this.resolveDateBounds(filter);
    const curr = await analyticsRepository.getProductMetrics(current);
    const prev = await analyticsRepository.getProductMetrics(previous);

    return {
      ...curr,
      comparison: {
        unitsSold: this.calculateDelta(curr.totalUnitsSold, prev.totalUnitsSold),
        revenue: this.calculateDelta(curr.totalProductRevenue, prev.totalProductRevenue),
      },
    };
  }

  /**
   * Get Inventory Analytics
   */
  async getInventoryAnalytics(): Promise<InventoryAnalytics> {
    return analyticsRepository.getInventoryMetrics();
  }

  /**
   * Get Service Operations Analytics
   */
  async getServiceAnalytics(filter: AnalyticsDateFilter): Promise<ServiceAnalytics> {
    const { current, previous } = this.resolveDateBounds(filter);
    const curr = await analyticsRepository.getServiceMetrics(current);
    const prev = await analyticsRepository.getServiceMetrics(previous);

    return {
      ...curr,
      comparison: {
        total: this.calculateDelta(curr.totalServices, prev.totalServices),
        completed: this.calculateDelta(curr.completedServices, prev.completedServices),
      },
    };
  }

  /**
   * Get Job Card Field Analytics
   */
  async getJobCardAnalytics(filter: AnalyticsDateFilter): Promise<JobCardAnalytics> {
    const { current, previous } = this.resolveDateBounds(filter);
    const curr = await analyticsRepository.getJobCardMetrics(current);
    const prev = await analyticsRepository.getJobCardMetrics(previous);

    return {
      ...curr,
      comparison: {
        total: this.calculateDelta(curr.totalJobCards, prev.totalJobCards),
        completed: this.calculateDelta(curr.completedJobs, prev.completedJobs),
      },
    };
  }

  /**
   * Get Technician Operational Metrics
   */
  async getTechnicianAnalytics(filter: AnalyticsDateFilter): Promise<TechnicianAnalytics> {
    const { current } = this.resolveDateBounds(filter);
    return analyticsRepository.getTechnicianMetrics(current);
  }

  /**
   * Get Warranty Coverage Analytics
   */
  async getWarrantyAnalytics(filter: AnalyticsDateFilter): Promise<WarrantyAnalytics> {
    const { current, previous } = this.resolveDateBounds(filter);
    const curr = await analyticsRepository.getWarrantyMetrics(current);
    const prev = await analyticsRepository.getWarrantyMetrics(previous);

    return {
      ...curr,
      comparison: {
        active: this.calculateDelta(curr.activeWarranties, prev.activeWarranties),
        expiring: this.calculateDelta(curr.expiringWarranties, prev.expiringWarranties),
      },
    };
  }

  /**
   * Get Website Inquiries & Lead Conversion Analytics
   */
  async getInquiryAnalytics(filter: AnalyticsDateFilter): Promise<InquiryAnalytics> {
    const { current, previous } = this.resolveDateBounds(filter);
    const curr = await analyticsRepository.getInquiryMetrics(current);
    const prev = await analyticsRepository.getInquiryMetrics(previous);

    return {
      ...curr,
      comparison: {
        total: this.calculateDelta(curr.totalInquiries, prev.totalInquiries),
        converted: this.calculateDelta(curr.convertedInquiries, prev.convertedInquiries),
        conversionRate: this.calculateDelta(curr.conversionRate, prev.conversionRate),
      },
    };
  }

  /**
   * Consolidated Executive Overview
   */
  async getOverview(filter: AnalyticsDateFilter, userRole?: UserRole): Promise<AnalyticsOverview> {
    const bounds = this.resolveDateBounds(filter);

    const [
      salesData,
      revenueData,
      paymentsData,
      customersData,
      productsData,
      inventoryData,
      servicesData,
      jobsData,
      techData,
      warrantiesData,
      inquiriesData,
    ] = await Promise.all([
      this.getSalesAnalytics(filter),
      this.getRevenueAnalytics(filter),
      this.getPaymentAnalytics(filter),
      this.getCustomerAnalytics(filter),
      this.getProductAnalytics(filter),
      this.getInventoryAnalytics(),
      this.getServiceAnalytics(filter),
      this.getJobCardAnalytics(filter),
      this.getTechnicianAnalytics(filter),
      this.getWarrantyAnalytics(filter),
      this.getInquiryAnalytics(filter),
    ]);

    // Financial permission sanitization
    const hasFinancialAccess = this.checkFinancialPermission(userRole);
    const sanitizedRevenue = hasFinancialAccess
      ? revenueData
      : {
          grossBilled: 0,
          amountCollected: 0,
          outstandingAmount: 0,
          overdueAmount: 0,
          collectionRate: 0,
          totalInvoicesIssued: 0,
          paidInvoicesCount: 0,
          partiallyPaidCount: 0,
          overdueInvoicesCount: 0,
          serviceRevenueBreakdown: {
            partsRevenue: 0,
            labourRevenue: 0,
            feesRevenue: 0,
            totalServiceRevenue: 0,
          },
          revenueTrend: [],
          comparison: {
            billed: { current: 0, previous: 0, deltaPercentage: 0, trend: 'neutral' as const },
            collected: { current: 0, previous: 0, deltaPercentage: 0, trend: 'neutral' as const },
            outstanding: { current: 0, previous: 0, deltaPercentage: 0, trend: 'neutral' as const },
          },
        };

    return {
      period: {
        range: bounds.preset,
        startDate: bounds.startDateStr,
        endDate: bounds.endDateStr,
        previousStartDate: bounds.prevStartDateStr,
        previousEndDate: bounds.prevEndDateStr,
        timezone: filter.timezone || 'Asia/Kolkata',
      },
      kpis: {
        grossBilled: sanitizedRevenue.comparison.billed,
        amountCollected: sanitizedRevenue.comparison.collected,
        outstandingAmount: sanitizedRevenue.comparison.outstanding,
        newCustomers: customersData.comparison.newCustomers,
        servicesCompleted: servicesData.comparison.completed,
        openJobCards: jobsData.comparison.total,
        activeWarranties: warrantiesData.comparison.active,
        inquiriesConverted: inquiriesData.comparison.converted,
        inquiryConversionRate: inquiriesData.comparison.conversionRate,
      },
      sales: salesData,
      revenue: sanitizedRevenue,
      payments: paymentsData,
      customers: customersData,
      products: productsData,
      inventory: inventoryData,
      services: servicesData,
      jobCards: jobsData,
      technicians: techData,
      warranties: warrantiesData,
      inquiries: inquiriesData,
    };
  }

  /**
   * Get Authoritative Financial Summary (Revenue, Payments, Expenses, COGS, Net Profit, Technician Cash)
   */
  async getFinancialSummary(filter: AnalyticsDateFilter, companyId?: string): Promise<FinancialSummaryReport> {
    const { current } = this.resolveDateBounds(filter);
    return analyticsRepository.getFinancialSummary(current, companyId);
  }

  /**
   * Export Analytics Data to CSV string
   */
  async exportToCsv(filter: AnalyticsDateFilter, category: string, userRole?: UserRole): Promise<string> {
    const overview = await this.getOverview(filter, userRole);
    let csv = '';

    switch (category) {
      case 'sales': {
        csv = 'Product Name,Count,Total Amount (INR)\n';
        overview.sales?.salesByProduct?.forEach((p: any) => {
          csv += formatCsvRow([p.productName, p.count, p.totalAmount]);
        });
        break;
      }
      case 'revenue': {
        csv = 'Date,Gross Billed (INR),Amount Collected (INR)\n';
        overview.revenue?.revenueTrend?.forEach((r: any) => {
          csv += formatCsvRow([r.date, r.billed, r.collected]);
        });
        break;
      }
      case 'payments': {
        csv = 'Payment Method,Count,Total Amount (INR),Percentage\n';
        overview.payments?.paymentMethodDistribution?.forEach((m: any) => {
          csv += formatCsvRow([m.method, m.count, m.totalAmount, `${m.percentage}%`]);
        });
        break;
      }
      case 'customers': {
        csv = 'Customer Type,Count,Percentage\n';
        overview.customers?.customerTypeDistribution?.forEach((c: any) => {
          csv += formatCsvRow([c.type, c.count, `${c.percentage}%`]);
        });
        break;
      }
      case 'products': {
        csv = 'Product Name,Units Sold,Revenue (INR)\n';
        overview.products?.topProducts?.forEach((p: any) => {
          csv += formatCsvRow([p.productName, p.unitsSold, p.revenue]);
        });
        break;
      }
      case 'inventory': {
        csv = 'Metric,Value\n';
        csv += formatCsvRow(['Total Stock Units', overview.inventory?.totalStockUnits]);
        csv += formatCsvRow(['Total Inventory Value (INR)', overview.inventory?.totalInventoryValue]);
        csv += formatCsvRow(['Low Stock Count', overview.inventory?.lowStockCount]);
        csv += formatCsvRow(['Out of Stock Count', overview.inventory?.outOfStockCount]);
        break;
      }
      case 'services': {
        csv = 'Service Type,Count,Percentage\n';
        overview.services?.serviceTypeDistribution?.forEach((s: any) => {
          csv += formatCsvRow([s.type, s.count, `${s.percentage}%`]);
        });
        break;
      }
      case 'warranties': {
        csv = 'Warranty Status,Count\n';
        csv += formatCsvRow(['Active Warranties', overview.warranties?.activeWarranties]);
        csv += formatCsvRow(['Expiring in 7 Days', overview.warranties?.expiringIn7Days]);
        csv += formatCsvRow(['Expiring in 15 Days', overview.warranties?.expiringIn15Days]);
        csv += formatCsvRow(['Expiring in 30 Days', overview.warranties?.expiringIn30Days]);
        csv += formatCsvRow(['Expired Warranties', overview.warranties?.expiredWarranties]);
        break;
      }
      case 'inquiries': {
        csv = 'Source,Inquiry Count,Percentage\n';
        overview.inquiries?.inquirySourceDistribution?.forEach((s: any) => {
          csv += formatCsvRow([s.source, s.count, `${s.percentage}%`]);
        });
        break;
      }
      case 'technicians': {
        csv = 'Technician Name,Phone,Assigned Jobs,Completed Jobs,Open Jobs,Completion Rate\n';
        overview.technicians?.technicianBreakdown?.forEach((t: any) => {
          csv += formatCsvRow([t.technicianName, t.phone, t.assignedJobs, t.completedJobs, t.openJobs, `${t.completionRate}%`]);
        });
        break;
      }
      case 'financial': {
        const fin = await this.getFinancialSummary(filter);
        csv = 'Financial Metric,Amount (INR)\n';
        csv += formatCsvRow(['Total Service Revenue', fin.totalServiceRevenue]);
        csv += formatCsvRow(['Total Customer Payments Received', fin.totalCustomerPaymentsReceived]);
        csv += formatCsvRow(['Cost of Goods Sold (Parts COGS)', fin.cogsAmount]);
        csv += formatCsvRow(['Gross Profit', fin.grossProfit]);
        csv += formatCsvRow(['Operating Expenses', fin.totalExpenses]);
        csv += formatCsvRow(['Net Operating Surplus', fin.netProfit]);
        csv += formatCsvRow(['Cash Collected by Technicians', fin.cashCollectedByTechnicians]);
        csv += formatCsvRow(['Cash Handed Over to Owner', fin.cashHandedOverToOwner]);
        csv += formatCsvRow(['Pending Technician Cash', fin.pendingTechnicianCash]);
        csv += formatCsvRow(['Shop Cash Movement Balance', fin.shopCashMovementBalance]);
        break;
      }
      case 'overview':
      default: {
        csv = 'Metric,Current Value,Previous Period,Delta (%)\n';
        csv += formatCsvRow(['Gross Billed (INR)', overview.revenue.grossBilled, overview.revenue.comparison.billed.previous, overview.revenue.comparison.billed.deltaPercentage ?? 'N/A']);
        csv += formatCsvRow(['Amount Collected (INR)', overview.revenue.amountCollected, overview.revenue.comparison.collected.previous, overview.revenue.comparison.collected.deltaPercentage ?? 'N/A']);
        csv += formatCsvRow(['Outstanding Balance (INR)', overview.revenue.outstandingAmount, overview.revenue.comparison.outstanding.previous, overview.revenue.comparison.outstanding.deltaPercentage ?? 'N/A']);
        csv += formatCsvRow(['New Customers', overview.customers.newCustomers, overview.customers.comparison.newCustomers.previous, overview.customers.comparison.newCustomers.deltaPercentage ?? 'N/A']);
        csv += formatCsvRow(['Completed Services', overview.services.completedServices, overview.services.comparison.completed.previous, overview.services.comparison.completed.deltaPercentage ?? 'N/A']);
        csv += formatCsvRow(['Converted Inquiries', overview.inquiries.convertedInquiries, overview.inquiries.comparison.converted.previous, overview.inquiries.comparison.converted.deltaPercentage ?? 'N/A']);
        csv += formatCsvRow(['Conversion Rate (%)', `${overview.inquiries.conversionRate}%`, `${overview.inquiries.comparison.conversionRate.previous}%`, overview.inquiries.comparison.conversionRate.deltaPercentage ?? 'N/A']);
        break;
      }
    }

    return csv;
  }
}

export const analyticsService = new AnalyticsService();
