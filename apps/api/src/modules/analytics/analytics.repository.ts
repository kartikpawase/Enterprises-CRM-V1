import { db } from '../../database/client';
import {
  sales,
  saleItems,
  invoices,
  invoiceItems,
  payments,
  customers,
  customerAssets,
  services,
  jobCards,
  technicians,
  warranties,
  inquiries,
  users,
  products,
  inventoryBalances,
  inventoryTransactions,
  expenses,
  cashHandovers,
  inventorySales,
} from '../../database/schema';
import { sql, eq, and, gte, lte, count } from 'drizzle-orm';
import type { FinancialSummaryReport } from '@crm/types';
import { memorySales } from '../sales/sales.repository';
import { memoryInvoices } from '../invoices/invoices.repository';
import { memoryPayments } from '../payments/payments.repository';
import { memoryCustomers } from '../customers/customer.repository';
import { memoryServices } from '../services/services.repository';
import { memoryTechnicians, INITIAL_TECHNICIANS } from '../technicians/technicians.repository';
import { memoryExpenses } from '../expenses/expenses.repository';
import { memoryCashHandovers } from '../payments/cash-handovers.repository';

export interface DateRangeBounds {
  startDate: Date;
  endDate: Date;
}

/**
 * Helper to generate continuous date list between two dates
 */
export function generateDateSeries(startDate: Date, endDate: Date): string[] {
  const dates: string[] = [];
  const curr = new Date(startDate);
  curr.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  let iterations = 0;
  while (curr <= end && iterations < 366) {
    dates.push(curr.toISOString().split('T')[0] ?? '');
    curr.setDate(curr.getDate() + 1);
    iterations++;
  }
  return dates;
}

export class AnalyticsRepository {
  /**
   * Sales Aggregations
   */
  async getSalesMetrics(bounds: DateRangeBounds) {
    try {
      const startIso = bounds.startDate instanceof Date ? bounds.startDate.toISOString() : String(bounds.startDate);
      const endIso = bounds.endDate instanceof Date ? bounds.endDate.toISOString() : String(bounds.endDate);
      const saleDateCol = sql`COALESCE(${sales.saleDate}, ${sales.createdAt})`;

      const [
        [summary],
        trendRaw,
        byProduct,
        byCustomerType,
        byCategoryRaw,
      ] = await Promise.all([
        db
          .select({
            totalAmount: sql<string>`COALESCE(SUM(${sales.totalAmount}), 0)`,
            count: count(sales.id),
          })
          .from(sales)
          .where(
            and(
              gte(saleDateCol, startIso),
              lte(saleDateCol, endIso),
              eq(sales.status, 'COMPLETED')
            )
          ),

        db
          .select({
            date: sql<string>`TO_CHAR(DATE_TRUNC('day', ${saleDateCol}), 'YYYY-MM-DD')`,
            value: sql<string>`COALESCE(SUM(${sales.totalAmount}), 0)`,
            secondaryValue: sql<string>`COUNT(${sales.id})`,
          })
          .from(sales)
          .where(
            and(
              gte(saleDateCol, startIso),
              lte(saleDateCol, endIso),
              eq(sales.status, 'COMPLETED')
            )
          )
          .groupBy(sql`DATE_TRUNC('day', ${saleDateCol})`)
          .orderBy(sql`DATE_TRUNC('day', ${saleDateCol}) ASC`),

        db
          .select({
            productName: saleItems.productNameSnapshot,
            count: sql<string>`COUNT(${saleItems.id})`,
            totalAmount: sql<string>`COALESCE(SUM(${saleItems.lineTotal}), 0)`,
          })
          .from(saleItems)
          .innerJoin(sales, eq(saleItems.saleId, sales.id))
          .where(
            and(
              gte(saleDateCol, startIso),
              lte(saleDateCol, endIso),
              eq(sales.status, 'COMPLETED')
            )
          )
          .groupBy(saleItems.productNameSnapshot)
          .orderBy(sql`SUM(${saleItems.lineTotal}) DESC`, sql`${saleItems.productNameSnapshot} ASC`)
          .limit(10),

        db
          .select({
            type: customers.customerType,
            count: count(sales.id),
            totalAmount: sql<string>`COALESCE(SUM(${sales.totalAmount}), 0)`,
          })
          .from(sales)
          .innerJoin(customers, eq(sales.customerId, customers.id))
          .where(
            and(
              gte(saleDateCol, startIso),
              lte(saleDateCol, endIso),
              eq(sales.status, 'COMPLETED')
            )
          )
          .groupBy(customers.customerType),

        db
          .select({
            productType: products.productType,
            count: count(saleItems.id),
            totalAmount: sql<string>`COALESCE(SUM(${saleItems.lineTotal}), 0)`,
          })
          .from(saleItems)
          .innerJoin(sales, eq(saleItems.saleId, sales.id))
          .innerJoin(products, eq(saleItems.productId, products.id))
          .where(
            and(
              gte(saleDateCol, startIso),
              lte(saleDateCol, endIso),
              eq(sales.status, 'COMPLETED')
            )
          )
          .groupBy(products.productType),
      ]);

      // Ensure continuous date timeline
      const dateMap = new Map<string, { value: number; secondaryValue: number }>();
      const dateSeries = generateDateSeries(bounds.startDate, bounds.endDate);
      for (const d of dateSeries) {
        dateMap.set(d, { value: 0, secondaryValue: 0 });
      }
      for (const t of trendRaw) {
        if (t.date) {
          dateMap.set(t.date, {
            value: Number(t.value || 0),
            secondaryValue: Number(t.secondaryValue || 0),
          });
        }
      }

      const totalSalesAmount = Number(summary?.totalAmount || 0);
      const totalSalesCount = Number(summary?.count || 0);

      const trend = Array.from(dateMap.entries()).map(([date, val]) => ({
        date,
        value: val.value,
        secondaryValue: val.secondaryValue,
      }));

      const categoryMap: Record<string, { count: number; totalAmount: number }> = {
        'RO Machines': { count: 0, totalAmount: 0 },
        'Filters & Spares': { count: 0, totalAmount: 0 },
      };

      byCategoryRaw.forEach((cat) => {
        const catName = cat.productType === 'RO_MACHINE' ? 'RO Machines' : 'Filters & Spares';
        if (!categoryMap[catName]) {
          categoryMap[catName] = { count: 0, totalAmount: 0 };
        }
        categoryMap[catName].count += Number(cat.count || 0);
        categoryMap[catName].totalAmount += Number(cat.totalAmount || 0);
      });

      const byCategory = Object.entries(categoryMap).map(([category, data]) => ({
        category,
        count: data.count,
        totalAmount: data.totalAmount,
      }));

      return {
        totalAmount: totalSalesAmount,
        count: totalSalesCount,
        trend,
        byProduct: byProduct.map((p) => ({
          productName: p.productName || 'General Machine / Spare',
          count: Number(p.count || 0),
          totalAmount: Number(p.totalAmount || 0),
        })),
        byCategory,
        byCustomerType: byCustomerType.map((c) => ({
          type: c.type || 'INDIVIDUAL',
          count: Number(c.count || 0),
          totalAmount: Number(c.totalAmount || 0),
        })),
      };
    } catch (_err) {
      const dateSeries = generateDateSeries(bounds.startDate, bounds.endDate);
      const trend = dateSeries.map((date) => ({ date, value: 0, secondaryValue: 0 }));
      let totalSalesAmount = 0;
      let totalSalesCount = 0;
      for (const s of memorySales) {
        const sDate = s.saleDate ? new Date(s.saleDate) : (s.createdAt ? new Date(s.createdAt) : null);
        if (sDate && sDate >= bounds.startDate && sDate <= bounds.endDate && s.status === 'COMPLETED') {
          totalSalesAmount += Number(s.totalAmount || 0);
          totalSalesCount++;
        }
      }
      return {
        totalAmount: totalSalesAmount,
        count: totalSalesCount,
        trend,
        byProduct: [],
        byCategory: [
          { category: 'RO Machines', count: 0, totalAmount: 0 },
          { category: 'Filters & Spares', count: 0, totalAmount: 0 },
        ],
        byCustomerType: [],
      };
    }
  }

  /**
   * Revenue & Billing Aggregations (Authoritative Gross Billed vs Collected vs Outstanding)
   */
  async getRevenueMetrics(bounds: DateRangeBounds) {
    try {
      const startIso = bounds.startDate instanceof Date ? bounds.startDate.toISOString() : String(bounds.startDate);
      const endIso = bounds.endDate instanceof Date ? bounds.endDate.toISOString() : String(bounds.endDate);
      const invoiceDateCol = sql`COALESCE(${invoices.invoiceDate}, ${invoices.createdAt})`;
      const paymentDateCol = sql`COALESCE(${payments.paymentDate}, ${payments.createdAt})`;

      const [
        [invoiceSummary],
        [paymentSummary],
        [billedAll],
        [paidAll],
        [overdueSummary],
        [serviceInvoiceSummary],
        invoiceStatuses,
        billedTrend,
        collectedTrend,
      ] = await Promise.all([
        // Invoices issued/finalized in period (Excludes DRAFT and CANCELLED)
        db
          .select({
            grossBilled: sql<string>`COALESCE(SUM(${invoices.totalAmount}), 0)`,
            count: count(invoices.id),
          })
          .from(invoices)
          .where(
            and(
              gte(invoiceDateCol, startIso),
              lte(invoiceDateCol, endIso),
              sql`${invoices.status} IN ('ISSUED', 'PAID', 'PARTIALLY_PAID', 'OVERDUE')`,
              sql`${invoices.cancelledAt} IS NULL`
            )
          ),

        // Payments collected in period (Excludes CANCELLED/FAILED)
        db
          .select({
            amountCollected: sql<string>`COALESCE(SUM(${payments.amount}), 0)`,
            count: count(payments.id),
          })
          .from(payments)
          .where(
            and(
              gte(paymentDateCol, startIso),
              lte(paymentDateCol, endIso),
              eq(payments.status, 'COMPLETED')
            )
          ),

        // Overall outstanding calculations: active invoices billed minus payments received
        db
          .select({
            total: sql<string>`COALESCE(SUM(${invoices.totalAmount}), 0)`,
          })
          .from(invoices)
          .where(
            and(
              sql`${invoices.status} IN ('ISSUED', 'PARTIALLY_PAID', 'OVERDUE')`,
              sql`${invoices.cancelledAt} IS NULL`
            )
          ),

        db
          .select({
            total: sql<string>`COALESCE(SUM(${payments.amount}), 0)`,
          })
          .from(payments)
          .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
          .where(
            and(
              eq(payments.status, 'COMPLETED'),
              sql`${invoices.status} IN ('ISSUED', 'PARTIALLY_PAID', 'OVERDUE')`,
              sql`${invoices.cancelledAt} IS NULL`
            )
          ),

        db
          .select({
            overdue: sql<string>`COALESCE(SUM(${invoices.totalAmount}), 0)`,
            count: count(invoices.id),
          })
          .from(invoices)
          .where(
            and(
              sql`(${invoices.status} = 'OVERDUE' OR (${invoices.status} IN ('ISSUED', 'PARTIALLY_PAID') AND ${invoices.dueDate} < CURRENT_DATE))`,
              sql`${invoices.cancelledAt} IS NULL`
            )
          ),

        // Service revenue vs Product revenue breakdown
        db
          .select({
            partsRevenue: sql<string>`COALESCE(SUM(CASE WHEN ${invoiceItems.itemType} = 'SPARE_PART' THEN ${invoiceItems.lineTotal} ELSE 0 END), 0)`,
            labourRevenue: sql<string>`COALESCE(SUM(CASE WHEN ${invoiceItems.itemType} = 'SERVICE' THEN ${invoiceItems.lineTotal} ELSE 0 END), 0)`,
            feesRevenue: sql<string>`COALESCE(SUM(CASE WHEN ${invoiceItems.itemType} = 'CUSTOM' THEN ${invoiceItems.lineTotal} ELSE 0 END), 0)`,
            totalServiceRevenue: sql<string>`COALESCE(SUM(${invoiceItems.lineTotal}), 0)`,
          })
          .from(invoiceItems)
          .innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
          .where(
            and(
              gte(invoiceDateCol, startIso),
              lte(invoiceDateCol, endIso),
              sql`${invoices.status} IN ('ISSUED', 'PAID', 'PARTIALLY_PAID', 'OVERDUE')`,
              sql`${invoices.cancelledAt} IS NULL`,
              sql`(${invoices.jobCardId} IS NOT NULL OR ${invoices.serviceId} IS NOT NULL)`
            )
          ),

        // Invoice status breakdown
        db
          .select({
            status: invoices.status,
            count: count(invoices.id),
          })
          .from(invoices)
          .where(
            and(
              gte(invoiceDateCol, startIso),
              lte(invoiceDateCol, endIso),
              sql`${invoices.cancelledAt} IS NULL`
            )
          )
          .groupBy(invoices.status),

        // Daily revenue trend (Billed vs Collected)
        db
          .select({
            date: sql<string>`TO_CHAR(DATE_TRUNC('day', ${invoiceDateCol}), 'YYYY-MM-DD')`,
            billed: sql<string>`COALESCE(SUM(${invoices.totalAmount}), 0)`,
          })
          .from(invoices)
          .where(
            and(
              gte(invoiceDateCol, startIso),
              lte(invoiceDateCol, endIso),
              sql`${invoices.status} IN ('ISSUED', 'PAID', 'PARTIALLY_PAID', 'OVERDUE')`,
              sql`${invoices.cancelledAt} IS NULL`
            )
          )
          .groupBy(sql`DATE_TRUNC('day', ${invoiceDateCol})`),

        db
          .select({
            date: sql<string>`TO_CHAR(DATE_TRUNC('day', ${paymentDateCol}), 'YYYY-MM-DD')`,
            collected: sql<string>`COALESCE(SUM(${payments.amount}), 0)`,
          })
          .from(payments)
          .where(
            and(
              gte(paymentDateCol, startIso),
              lte(paymentDateCol, endIso),
              eq(payments.status, 'COMPLETED')
            )
          )
          .groupBy(sql`DATE_TRUNC('day', ${paymentDateCol})`),
      ]);

      const totalBilledActive = Number(billedAll?.total || 0);
      const totalPaidActive = Number(paidAll?.total || 0);
      let outstanding = Math.max(0, totalBilledActive - totalPaidActive);
      let paidCount = Number(invoiceStatuses.find((s) => s.status === 'PAID')?.count || 0);
      let partialCount = Number(invoiceStatuses.find((s) => s.status === 'PARTIALLY_PAID')?.count || 0);
      const overdueCount = Number(overdueSummary?.count || 0);

      // Continuous date series
      const dateMap = new Map<string, { billed: number; collected: number }>();
      const dateSeries = generateDateSeries(bounds.startDate, bounds.endDate);
      for (const d of dateSeries) {
        dateMap.set(d, { billed: 0, collected: 0 });
      }
      billedTrend.forEach((b) => {
        if (b.date) {
          const existing = dateMap.get(b.date) || { billed: 0, collected: 0 };
          existing.billed = Number(b.billed || 0);
          dateMap.set(b.date, existing);
        }
      });
      collectedTrend.forEach((c) => {
        if (c.date) {
          const existing = dateMap.get(c.date) || { billed: 0, collected: 0 };
          existing.collected = Number(c.collected || 0);
          dateMap.set(c.date, existing);
        }
      });

      const grossBilled = Number(invoiceSummary?.grossBilled || 0);
      const amountCollected = Number(paymentSummary?.amountCollected || 0);
      const overdue = Number(overdueSummary?.overdue || 0);
      const totalInvoicesIssued = Number(invoiceSummary?.count || 0);

      if (totalBilledActive === 0 && grossBilled > 0) {
        outstanding = Math.max(0, grossBilled - amountCollected);
      }

      const revenueTrend = Array.from(dateMap.entries())
        .map(([date, val]) => ({ date, ...val }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return {
        grossBilled,
        amountCollected,
        outstandingAmount: outstanding,
        overdueAmount: overdue,
        collectionRate: grossBilled > 0 ? Math.round((amountCollected / grossBilled) * 1000) / 10 : 0,
        totalInvoicesIssued,
        paidInvoicesCount: paidCount,
        partiallyPaidCount: partialCount,
        overdueInvoicesCount: overdueCount,
        serviceRevenueBreakdown: {
          partsRevenue: Number(serviceInvoiceSummary?.partsRevenue || 0),
          labourRevenue: Number(serviceInvoiceSummary?.labourRevenue || 0),
          feesRevenue: Number(serviceInvoiceSummary?.feesRevenue || 0),
          totalServiceRevenue: Number(serviceInvoiceSummary?.totalServiceRevenue || 0),
        },
        revenueTrend,
      };
    } catch (_err) {
      const dateSeries = generateDateSeries(bounds.startDate, bounds.endDate);
      const revenueTrend = dateSeries.map((date) => ({ date, billed: 0, collected: 0 }));
      let grossBilled = 0;
      let totalInvoicesIssued = 0;
      for (const inv of memoryInvoices) {
        const iDate = inv.invoiceDate ? new Date(inv.invoiceDate) : (inv.createdAt ? new Date(inv.createdAt) : null);
        if (iDate && iDate >= bounds.startDate && iDate <= bounds.endDate && !inv.cancelledAt) {
          grossBilled += Number(inv.totalAmount || 0);
          totalInvoicesIssued++;
        }
      }
      let amountCollected = 0;
      for (const p of memoryPayments) {
        const pDate = p.paymentDate ? new Date(p.paymentDate) : (p.createdAt ? new Date(p.createdAt) : null);
        if (pDate && pDate >= bounds.startDate && pDate <= bounds.endDate && p.status === 'COMPLETED') {
          amountCollected += Number(p.amount || 0);
        }
      }
      const outstanding = Math.max(0, grossBilled - amountCollected);
      return {
        grossBilled,
        amountCollected,
        outstandingAmount: outstanding,
        overdueAmount: 0,
        collectionRate: grossBilled > 0 ? Math.round((amountCollected / grossBilled) * 1000) / 10 : 0,
        totalInvoicesIssued,
        paidInvoicesCount: 0,
        partiallyPaidCount: 0,
        overdueInvoicesCount: 0,
        serviceRevenueBreakdown: {
          partsRevenue: 0,
          labourRevenue: 0,
          feesRevenue: 0,
          totalServiceRevenue: 0,
        },
        revenueTrend,
      };
    }
  }

  /**
   * Payment Collections Aggregations
   */
  async getPaymentMetrics(bounds: DateRangeBounds) {
    try {
      const startIso = bounds.startDate instanceof Date ? bounds.startDate.toISOString() : String(bounds.startDate);
      const endIso = bounds.endDate instanceof Date ? bounds.endDate.toISOString() : String(bounds.endDate);
      const paymentDateCol = sql`COALESCE(${payments.paymentDate}, ${payments.createdAt})`;

      const [
        [summary],
        methods,
        trendRaw,
      ] = await Promise.all([
        db
          .select({
            totalAmount: sql<string>`COALESCE(SUM(${payments.amount}), 0)`,
            count: count(payments.id),
          })
          .from(payments)
          .where(
            and(
              gte(paymentDateCol, startIso),
              lte(paymentDateCol, endIso),
              eq(payments.status, 'COMPLETED')
            )
          ),

        db
          .select({
            method: payments.paymentMethod,
            count: count(payments.id),
            totalAmount: sql<string>`COALESCE(SUM(${payments.amount}), 0)`,
          })
          .from(payments)
          .where(
            and(
              gte(paymentDateCol, startIso),
              lte(paymentDateCol, endIso),
              eq(payments.status, 'COMPLETED')
            )
          )
          .groupBy(payments.paymentMethod),

        db
          .select({
            date: sql<string>`TO_CHAR(DATE_TRUNC('day', ${paymentDateCol}), 'YYYY-MM-DD')`,
            value: sql<string>`COALESCE(SUM(${payments.amount}), 0)`,
            secondaryValue: sql<string>`COUNT(${payments.id})`,
          })
          .from(payments)
          .where(
            and(
              gte(paymentDateCol, startIso),
              lte(paymentDateCol, endIso),
              eq(payments.status, 'COMPLETED')
            )
          )
          .groupBy(sql`DATE_TRUNC('day', ${paymentDateCol})`)
          .orderBy(sql`DATE_TRUNC('day', ${paymentDateCol}) ASC`),
      ]);

      const totalAmount = Number(summary?.totalAmount || 0);
      const totalCount = Number(summary?.count || 0);

      const dateMap = new Map<string, { value: number; secondaryValue: number }>();
      const dateSeries = generateDateSeries(bounds.startDate, bounds.endDate);
      for (const d of dateSeries) {
        dateMap.set(d, { value: 0, secondaryValue: 0 });
      }
      trendRaw.forEach((t) => {
        if (t.date) {
          dateMap.set(t.date, {
            value: Number(t.value || 0),
            secondaryValue: Number(t.secondaryValue || 0),
          });
        }
      });

      const collectionTrend = Array.from(dateMap.entries()).map(([date, val]) => ({
        date,
        value: val.value,
        secondaryValue: val.secondaryValue,
      }));

      // Real count of partially paid invoices in period
      const invoiceDateCol = sql`COALESCE(${invoices.invoiceDate}, ${invoices.createdAt})`;
      const [partialSummary] = await db
        .select({ count: count(invoices.id) })
        .from(invoices)
        .where(
          and(
            gte(invoiceDateCol, startIso),
            lte(invoiceDateCol, endIso),
            eq(invoices.status, 'PARTIALLY_PAID'),
            sql`${invoices.cancelledAt} IS NULL`
          )
        );

      return {
        totalPayments: totalAmount,
        paymentCount: totalCount,
        averagePaymentAmount: totalCount > 0 ? Math.round(totalAmount / totalCount) : 0,
        paymentMethodDistribution: methods.map((m) => ({
          method: m.method as any,
          count: Number(m.count || 0),
          totalAmount: Number(m.totalAmount || 0),
          percentage: totalAmount > 0 ? Math.round((Number(m.totalAmount || 0) / totalAmount) * 100) : 0,
        })),
        collectionTrend,
        partialPaymentsCount: Number(partialSummary?.count || 0),
      };
    } catch (_err) {
      const dateSeries = generateDateSeries(bounds.startDate, bounds.endDate);
      const collectionTrend = dateSeries.map((date) => ({ date, value: 0, secondaryValue: 0 }));
      let totalAmount = 0;
      let totalCount = 0;
      for (const p of memoryPayments) {
        const pDate = p.paymentDate ? new Date(p.paymentDate) : (p.createdAt ? new Date(p.createdAt) : null);
        if (pDate && pDate >= bounds.startDate && pDate <= bounds.endDate && p.status === 'COMPLETED') {
          totalAmount += Number(p.amount || 0);
          totalCount++;
        }
      }
      return {
        totalPayments: totalAmount,
        paymentCount: totalCount,
        averagePaymentAmount: totalCount > 0 ? Math.round(totalAmount / totalCount) : 0,
        paymentMethodDistribution: [],
        collectionTrend,
        partialPaymentsCount: 0,
      };
    }
  }

  /**
   * Customer Acquisition & Active Accounts
   */
  async getCustomerMetrics(bounds: DateRangeBounds) {
    try {
      const [
        [totalCust],
        [newCust],
        [activeServicesCust],
        trendRaw,
        typeBreakdown,
        [activeAssetsSummary],
        [outstandingBalanceSummary],
      ] = await Promise.all([
        db
          .select({ count: count(customers.id) })
          .from(customers)
          .where(eq(customers.status, 'ACTIVE')),

        db
          .select({ count: count(customers.id) })
          .from(customers)
          .where(
            and(
              gte(customers.createdAt, bounds.startDate),
              lte(customers.createdAt, bounds.endDate)
            )
          ),

        db
          .select({ count: sql<string>`COUNT(DISTINCT ${services.customerId})` })
          .from(services)
          .where(sql`${services.status} IN ('SCHEDULED', 'ASSIGNED', 'IN_PROGRESS')`),

        db
          .select({
            date: sql<string>`TO_CHAR(DATE_TRUNC('day', ${customers.createdAt}), 'YYYY-MM-DD')`,
            value: sql<string>`COUNT(${customers.id})`,
          })
          .from(customers)
          .where(
            and(
              gte(customers.createdAt, bounds.startDate),
              lte(customers.createdAt, bounds.endDate)
            )
          )
          .groupBy(sql`DATE_TRUNC('day', ${customers.createdAt})`)
          .orderBy(sql`DATE_TRUNC('day', ${customers.createdAt}) ASC`),

        db
          .select({
            type: customers.customerType,
            count: count(customers.id),
          })
          .from(customers)
          .groupBy(customers.customerType),

        db
          .select({ count: sql<string>`COUNT(DISTINCT ${customerAssets.customerId})` })
          .from(customerAssets)
          .where(eq(customerAssets.status, 'ACTIVE')),

        db
          .select({ count: sql<string>`COUNT(DISTINCT ${invoices.customerId})` })
          .from(invoices)
          .where(
            and(
              sql`${invoices.status} IN ('ISSUED', 'PARTIALLY_PAID', 'OVERDUE')`,
              sql`${invoices.cancelledAt} IS NULL`
            )
          ),
      ]);

      const dateMap = new Map<string, number>();
      const dateSeries = generateDateSeries(bounds.startDate, bounds.endDate);
      for (const d of dateSeries) {
        dateMap.set(d, 0);
      }
      trendRaw.forEach((t) => {
        if (t.date) {
          dateMap.set(t.date, Number(t.value || 0));
        }
      });

      const acquisitionTrend = Array.from(dateMap.entries()).map(([date, value]) => ({
        date,
        value,
      }));

      let total = Number(totalCust?.count || 0);
      if (total === 0 && memoryCustomers.length > 0) {
        total = memoryCustomers.length;
      }

      return {
        totalCustomers: total,
        newCustomers: Number(newCust?.count || 0),
        activeCustomers: total,
        customersWithActiveAssets: Number(activeAssetsSummary?.count || 0),
        customersWithOutstandingBalance: Number(outstandingBalanceSummary?.count || 0),
        customersWithActiveServices: Number(activeServicesCust?.count || 0),
        acquisitionTrend,
        customerTypeDistribution: typeBreakdown.map((b) => ({
          type: b.type || 'INDIVIDUAL',
          count: Number(b.count || 0),
          percentage: total > 0 ? Math.round((Number(b.count || 0) / total) * 100) : 0,
        })),
      };
    } catch (_err) {
      const dateSeries = generateDateSeries(bounds.startDate, bounds.endDate);
      const acquisitionTrend = dateSeries.map((date) => ({ date, value: 0 }));
      const total = memoryCustomers.length;
      return {
        totalCustomers: total,
        newCustomers: 0,
        activeCustomers: total,
        customersWithActiveAssets: 0,
        customersWithOutstandingBalance: 0,
        customersWithActiveServices: 0,
        acquisitionTrend,
        customerTypeDistribution: [],
      };
    }
  }

  /**
   * Product Performance Aggregations
   */
  async getProductMetrics(bounds: DateRangeBounds) {
    try {
      const startIso = bounds.startDate instanceof Date ? bounds.startDate.toISOString() : String(bounds.startDate);
      const endIso = bounds.endDate instanceof Date ? bounds.endDate.toISOString() : String(bounds.endDate);
      const saleDateCol = sql`COALESCE(${sales.saleDate}, ${sales.createdAt})`;

      const [topProductsRaw, [totalProducts]] = await Promise.all([
        db
          .select({
            productId: saleItems.productId,
            productName: saleItems.productNameSnapshot,
            unitsSold: sql<string>`COALESCE(SUM(${saleItems.quantity}), 0)`,
            revenue: sql<string>`COALESCE(SUM(${saleItems.lineTotal}), 0)`,
          })
          .from(saleItems)
          .innerJoin(sales, eq(saleItems.saleId, sales.id))
          .where(
            and(
              gte(saleDateCol, startIso),
              lte(saleDateCol, endIso),
              eq(sales.status, 'COMPLETED')
            )
          )
          .groupBy(saleItems.productId, saleItems.productNameSnapshot)
          .orderBy(sql`SUM(${saleItems.lineTotal}) DESC`, sql`${saleItems.productNameSnapshot} ASC`)
          .limit(10),

        db
          .select({ count: count(products.id) })
          .from(products)
          .where(eq(products.isActive, true)),
      ]);

      const totalUnitsSold = topProductsRaw.reduce((sum, p) => sum + Number(p.unitsSold || 0), 0);
      const totalProductRevenue = topProductsRaw.reduce((sum, p) => sum + Number(p.revenue || 0), 0);

      return {
        totalProductsCount: Number(totalProducts?.count || 0),
        totalUnitsSold,
        totalProductRevenue,
        topProducts: topProductsRaw.map((p) => ({
          productId: p.productId,
          productName: p.productName || 'RO Product',
          category: 'RO Equipment',
          unitsSold: Number(p.unitsSold || 0),
          revenue: Number(p.revenue || 0),
          trendPercentage: 0,
          stockStatus: 'in_stock' as const,
        })),
      };
    } catch (_err) {
      return {
        totalProductsCount: 0,
        totalUnitsSold: 0,
        totalProductRevenue: 0,
        topProducts: [],
      };
    }
  }

  /**
   * Inventory & Stock Analytics
   */
  async getInventoryMetrics() {
    try {
      const [[stockStats], [valSummary], reorderAlerts] = await Promise.all([
        db
          .select({
            totalUnits: sql<string>`COALESCE(SUM(${inventoryBalances.currentStock}), 0)`,
            lowStockCount: sql<string>`COUNT(CASE WHEN ${inventoryBalances.currentStock} <= ${inventoryBalances.minimumAlertStock} AND ${inventoryBalances.currentStock} > 0 THEN 1 END)`,
            outOfStockCount: sql<string>`COUNT(CASE WHEN ${inventoryBalances.currentStock} = 0 THEN 1 END)`,
            healthyStockCount: sql<string>`COUNT(CASE WHEN ${inventoryBalances.currentStock} > ${inventoryBalances.minimumAlertStock} THEN 1 END)`,
          })
          .from(inventoryBalances),

        db
          .select({
            totalValue: sql<string>`COALESCE(SUM(${inventoryBalances.currentStock} * ${products.unitPrice}), 0)`,
          })
          .from(inventoryBalances)
          .innerJoin(products, eq(inventoryBalances.productId, products.id)),

        db
          .select({
            id: products.id,
            name: products.name,
            sku: products.sku,
            currentStock: inventoryBalances.currentStock,
            minStock: inventoryBalances.minimumAlertStock,
          })
          .from(inventoryBalances)
          .innerJoin(products, eq(inventoryBalances.productId, products.id))
          .where(sql`${inventoryBalances.currentStock} <= ${inventoryBalances.minimumAlertStock}`)
          .limit(10),
      ]);

      return {
        totalStockUnits: Number(stockStats?.totalUnits || 0),
        totalInventoryValue: Number(valSummary?.totalValue || 0),
        lowStockCount: Number(stockStats?.lowStockCount || 0),
        outOfStockCount: Number(stockStats?.outOfStockCount || 0),
        healthyStockCount: Number(stockStats?.healthyStockCount || 0),
        reorderAlerts: reorderAlerts.map((r) => ({
          id: r.id,
          name: r.name,
          sku: r.sku,
          currentStock: Number(r.currentStock || 0),
          minStock: Number(r.minStock || 0),
          deficit: Math.max(0, Number(r.minStock || 0) - Number(r.currentStock || 0)),
        })),
      };
    } catch (_err) {
      return {
        totalStockUnits: 0,
        totalInventoryValue: 0,
        lowStockCount: 0,
        outOfStockCount: 0,
        healthyStockCount: 0,
        reorderAlerts: [],
      };
    }
  }

  /**
   * Service Operations Aggregations
   */
  async getServiceMetrics(bounds: DateRangeBounds) {
    try {
      const [
        [summary],
        [completed],
        [overdue],
        typeBreakdown,
        classBreakdown,
        trendRaw,
      ] = await Promise.all([
        db
          .select({
            total: count(services.id),
          })
          .from(services)
          .where(
            and(
              gte(services.createdAt, bounds.startDate),
              lte(services.createdAt, bounds.endDate)
            )
          ),

        db
          .select({
            count: count(services.id),
          })
          .from(services)
          .where(
            and(
              gte(services.createdAt, bounds.startDate),
              lte(services.createdAt, bounds.endDate),
              eq(services.status, 'COMPLETED')
            )
          ),

        db
          .select({
            count: count(services.id),
          })
          .from(services)
          .where(eq(services.status, 'OVERDUE')),

        db
          .select({
            type: services.serviceType,
            count: count(services.id),
          })
          .from(services)
          .where(
            and(
              gte(services.createdAt, bounds.startDate),
              lte(services.createdAt, bounds.endDate)
            )
          )
          .groupBy(services.serviceType),

        db
          .select({
            classification: services.serviceClassification,
            count: count(services.id),
          })
          .from(services)
          .where(
            and(
              gte(services.createdAt, bounds.startDate),
              lte(services.createdAt, bounds.endDate)
            )
          )
          .groupBy(services.serviceClassification),

        db
          .select({
            date: sql<string>`TO_CHAR(DATE_TRUNC('day', ${services.createdAt}), 'YYYY-MM-DD')`,
            scheduled: sql<string>`COUNT(${services.id})`,
            completed: sql<string>`COUNT(CASE WHEN ${services.status} = 'COMPLETED' THEN 1 END)`,
          })
          .from(services)
          .where(
            and(
              gte(services.createdAt, bounds.startDate),
              lte(services.createdAt, bounds.endDate)
            )
          )
          .groupBy(sql`DATE_TRUNC('day', ${services.createdAt})`)
          .orderBy(sql`DATE_TRUNC('day', ${services.createdAt}) ASC`),
      ]);

      const dateMap = new Map<string, { scheduled: number; completed: number }>();
      const dateSeries = generateDateSeries(bounds.startDate, bounds.endDate);
      for (const d of dateSeries) {
        dateMap.set(d, { scheduled: 0, completed: 0 });
      }
      trendRaw.forEach((t) => {
        if (t.date) {
          dateMap.set(t.date, {
            scheduled: Number(t.scheduled || 0),
            completed: Number(t.completed || 0),
          });
        }
      });

      const serviceTrend = Array.from(dateMap.entries()).map(([date, val]) => ({
        date,
        scheduled: val.scheduled,
        completed: val.completed,
      }));

      const totalCount = Number(summary?.total || 0);
      const completedCount = Number(completed?.count || 0);
      const overdueCount = Number(overdue?.count || 0);

      return {
        totalServices: totalCount,
        completedServices: completedCount,
        pendingServices: Math.max(0, totalCount - completedCount),
        overdueServices: overdueCount,
        completionRate: totalCount > 0 ? Math.round((completedCount / totalCount) * 1000) / 10 : 0,
        serviceTypeDistribution: typeBreakdown.map((t) => ({
          type: t.type || 'PERIODIC_MAINTENANCE',
          count: Number(t.count || 0),
          percentage: totalCount > 0 ? Math.round((Number(t.count || 0) / totalCount) * 100) : 0,
        })),
        classificationDistribution: classBreakdown.map((c) => ({
          classification: (c.classification as 'GENERAL' | 'WARRANTY') || 'GENERAL',
          count: Number(c.count || 0),
          percentage: totalCount > 0 ? Math.round((Number(c.count || 0) / totalCount) * 100) : 0,
        })),
        serviceTrend,
      };
    } catch (_err) {
      const dateSeries = generateDateSeries(bounds.startDate, bounds.endDate);
      const serviceTrend = dateSeries.map((date) => ({ date, scheduled: 0, completed: 0 }));
      return {
        totalServices: 0,
        completedServices: 0,
        pendingServices: 0,
        overdueServices: 0,
        completionRate: 0,
        serviceTypeDistribution: [],
        classificationDistribution: [],
        serviceTrend,
      };
    }
  }

  /**
   * Job Cards Aggregations
   */
  async getJobCardMetrics(bounds: DateRangeBounds) {
    try {
      const [
        [summary],
        statuses,
        priorityBreakdown,
        typeBreakdown,
        trendRaw,
        [avgDuration],
      ] = await Promise.all([
        db
          .select({
            total: count(jobCards.id),
          })
          .from(jobCards)
          .where(
            and(
              gte(jobCards.createdAt, bounds.startDate),
              lte(jobCards.createdAt, bounds.endDate)
            )
          ),

        db
          .select({
            status: jobCards.status,
            count: count(jobCards.id),
          })
          .from(jobCards)
          .where(
            and(
              gte(jobCards.createdAt, bounds.startDate),
              lte(jobCards.createdAt, bounds.endDate)
            )
          )
          .groupBy(jobCards.status),

        db
          .select({
            priority: services.priority,
            count: count(jobCards.id),
          })
          .from(jobCards)
          .innerJoin(services, eq(jobCards.serviceId, services.id))
          .where(
            and(
              gte(jobCards.createdAt, bounds.startDate),
              lte(jobCards.createdAt, bounds.endDate)
            )
          )
          .groupBy(services.priority),

        db
          .select({
            serviceType: services.serviceType,
            count: count(jobCards.id),
          })
          .from(jobCards)
          .innerJoin(services, eq(jobCards.serviceId, services.id))
          .where(
            and(
              gte(jobCards.createdAt, bounds.startDate),
              lte(jobCards.createdAt, bounds.endDate)
            )
          )
          .groupBy(services.serviceType),

        db
          .select({
            date: sql<string>`TO_CHAR(DATE_TRUNC('day', ${jobCards.createdAt}), 'YYYY-MM-DD')`,
            value: count(jobCards.id),
          })
          .from(jobCards)
          .where(
            and(
              gte(jobCards.createdAt, bounds.startDate),
              lte(jobCards.createdAt, bounds.endDate)
            )
          )
          .groupBy(sql`DATE_TRUNC('day', ${jobCards.createdAt})`)
          .orderBy(sql`DATE_TRUNC('day', ${jobCards.createdAt}) ASC`),

        db
          .select({
            avgHours: sql<string>`COALESCE(AVG(EXTRACT(EPOCH FROM (${jobCards.completedAt} - ${jobCards.startedAt})) / 3600), 0)`,
          })
          .from(jobCards)
          .where(
            and(
              gte(jobCards.createdAt, bounds.startDate),
              lte(jobCards.createdAt, bounds.endDate),
              eq(jobCards.status, 'COMPLETED'),
              sql`${jobCards.startedAt} IS NOT NULL`,
              sql`${jobCards.completedAt} IS NOT NULL`
            )
          ),
      ]);

      const total = Number(summary?.total || 0);
      const completedCount = Number(statuses.find((s) => s.status === 'COMPLETED' || s.status === 'CLOSED')?.count || 0);
      const assignedCount = Number(statuses.find((s) => s.status === 'ASSIGNED')?.count || 0);
      const inProgressCount = Number(statuses.find((s) => s.status === 'IN_PROGRESS' || s.status === 'DIAGNOSIS')?.count || 0);
      const cancelledCount = Number(statuses.find((s) => (s.status as string) === 'CANCELLED')?.count || 0);
      const openCount = Math.max(0, total - completedCount - cancelledCount);

      const jobsByType = typeBreakdown.map((t) => ({
        type: (t.serviceType || 'GENERAL_SERVICE').replace(/_/g, ' '),
        count: Number(t.count || 0),
      }));

      const dateMap = new Map<string, number>();
      const dateSeries = generateDateSeries(bounds.startDate, bounds.endDate);
      for (const d of dateSeries) {
        dateMap.set(d, 0);
      }
      trendRaw.forEach((t) => {
        if (t.date) {
          dateMap.set(t.date, Number(t.value || 0));
        }
      });

      const jobStatusTrend = Array.from(dateMap.entries()).map(([date, value]) => ({
        date,
        value,
      }));

      const averageCompletionHours = Math.round(Number(avgDuration?.avgHours || 0) * 10) / 10;

      return {
        totalJobCards: total,
        openJobs: openCount,
        assignedJobs: assignedCount,
        inProgressJobs: inProgressCount,
        completedJobs: completedCount,
        cancelledJobs: cancelledCount,
        reopenedJobs: 0,
        averageCompletionHours,
        jobsByPriority: priorityBreakdown.map((p) => ({
          priority: p.priority || 'NORMAL',
          count: Number(p.count || 0),
        })),
        jobsByType,
        jobStatusTrend,
      };
    } catch (_err) {
      const dateSeries = generateDateSeries(bounds.startDate, bounds.endDate);
      const jobStatusTrend = dateSeries.map((date) => ({ date, value: 0 }));
      return {
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
        jobStatusTrend,
      };
    }
  }

  /**
   * Technician Operational Analytics
   */
  async getTechnicianMetrics(bounds: DateRangeBounds) {
    try {
      const [techList, jobStatsRows] = await Promise.all([
        db
          .select({
            id: technicians.id,
            phone: technicians.phone,
            status: technicians.status,
            fullName: users.displayName,
          })
          .from(technicians)
          .innerJoin(users, eq(technicians.userId, users.id))
          .where(eq(technicians.status, 'ACTIVE')),

        db
          .select({
            technicianId: jobCards.technicianId,
            totalAssigned: count(jobCards.id),
            completed: sql<string>`COUNT(CASE WHEN ${jobCards.status} IN ('COMPLETED', 'CLOSED') THEN 1 END)`,
            avgHours: sql<string>`COALESCE(AVG(CASE WHEN ${jobCards.status} IN ('COMPLETED', 'CLOSED') AND ${jobCards.startedAt} IS NOT NULL AND ${jobCards.completedAt} IS NOT NULL THEN EXTRACT(EPOCH FROM (${jobCards.completedAt} - ${jobCards.startedAt})) / 3600 END), 0)`,
          })
          .from(jobCards)
          .where(
            and(
              sql`${jobCards.technicianId} IS NOT NULL`,
              gte(jobCards.createdAt, bounds.startDate),
              lte(jobCards.createdAt, bounds.endDate)
            )
          )
          .groupBy(jobCards.technicianId),
      ]);

      const statsMap = new Map<string, { totalAssigned: number; completed: number; avgHours: number }>();
      for (const row of jobStatsRows) {
        if (row.technicianId) {
          statsMap.set(row.technicianId, {
            totalAssigned: Number(row.totalAssigned || 0),
            completed: Number(row.completed || 0),
            avgHours: Math.round(Number(row.avgHours || 0) * 10) / 10,
          });
        }
      }

      const techBreakdown = techList.map((t) => {
        const stats = statsMap.get(t.id);
        const assigned = stats?.totalAssigned || 0;
        const completed = stats?.completed || 0;
        const open = Math.max(0, assigned - completed);
        const completionRate = assigned > 0 ? Math.round((completed / assigned) * 100) : 100;
        const avgHours = stats?.avgHours || 0;

        return {
          technicianId: t.id,
          technicianName: t.fullName || 'Technician',
          phone: t.phone || '',
          status: t.status || 'ACTIVE',
          assignedJobs: assigned,
          completedJobs: completed,
          openJobs: open,
          completionRate,
          averageCompletionHours: avgHours,
        };
      });

      const totalAssigned = techBreakdown.reduce((sum, t) => sum + t.assignedJobs, 0);
      const totalCompleted = techBreakdown.reduce((sum, t) => sum + t.completedJobs, 0);
      const completedTechs = techBreakdown.filter((t) => t.completedJobs > 0 && t.averageCompletionHours > 0);
      const workforceAverageCompletionHours = completedTechs.length > 0
        ? Math.round((completedTechs.reduce((sum, t) => sum + t.averageCompletionHours, 0) / completedTechs.length) * 10) / 10
        : 0;

      return {
        activeTechniciansCount: techList.length,
        totalAssignedJobs: totalAssigned,
        totalCompletedJobs: totalCompleted,
        workforceAverageCompletionHours,
        technicianBreakdown: techBreakdown,
      };
    } catch (_err) {
      return {
        activeTechniciansCount: 0,
        totalAssignedJobs: 0,
        totalCompletedJobs: 0,
        workforceAverageCompletionHours: 0,
        technicianBreakdown: [],
      };
    }
  }

  /**
   * Warranty Analytics
   */
  async getWarrantyMetrics(_bounds: DateRangeBounds) {
    try {
      const [
        [active],
        [expiring7],
        [expiring15],
        [expiring30],
        [expired],
        [warrantyServices],
        [paidServices],
      ] = await Promise.all([
        db
          .select({ count: count(warranties.id) })
          .from(warranties)
          .where(and(eq(warranties.status, 'ACTIVE'), sql`${warranties.endDate} >= CURRENT_DATE`)),

        db
          .select({ count: count(warranties.id) })
          .from(warranties)
          .where(sql`${warranties.status} IN ('ACTIVE', 'EXPIRING_SOON') AND ${warranties.endDate} BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`),

        db
          .select({ count: count(warranties.id) })
          .from(warranties)
          .where(sql`${warranties.status} IN ('ACTIVE', 'EXPIRING_SOON') AND ${warranties.endDate} BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '15 days'`),

        db
          .select({ count: count(warranties.id) })
          .from(warranties)
          .where(sql`${warranties.status} IN ('ACTIVE', 'EXPIRING_SOON') AND ${warranties.endDate} BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`),

        db
          .select({ count: count(warranties.id) })
          .from(warranties)
          .where(sql`${warranties.status} = 'EXPIRED' OR ${warranties.endDate} < CURRENT_DATE`),

        db
          .select({ count: count(services.id) })
          .from(services)
          .where(eq(services.serviceClassification, 'WARRANTY')),

        db
          .select({ count: count(services.id) })
          .from(services)
          .where(eq(services.serviceClassification, 'GENERAL')),
      ]);

      const activeCount = Number(active?.count || 0);
      const expiringCount = Number(expiring30?.count || 0);
      const expiredCount = Number(expired?.count || 0);
      const wServicesCount = Number(warrantyServices?.count || 0);
      const pServicesCount = Number(paidServices?.count || 0);
      const totalServices = wServicesCount + pServicesCount;
      const warrantyPercentage = totalServices > 0 ? Math.round((wServicesCount / totalServices) * 100) : 0;

      return {
        activeWarranties: activeCount,
        expiringWarranties: expiringCount,
        expiringIn7Days: Number(expiring7?.count || 0),
        expiringIn15Days: Number(expiring15?.count || 0),
        expiringIn30Days: Number(expiring30?.count || 0),
        expiredWarranties: expiredCount,
        totalWarrantyServices: wServicesCount,
        warrantyVsPaidServiceRatio: {
          warrantyServices: wServicesCount,
          paidServices: pServicesCount,
          warrantyPercentage,
        },
      };
    } catch (_err) {
      return {
        activeWarranties: 0,
        expiringWarranties: 0,
        expiringIn7Days: 0,
        expiringIn15Days: 0,
        expiringIn30Days: 0,
        expiredWarranties: 0,
        totalWarrantyServices: 0,
        warrantyVsPaidServiceRatio: {
          warrantyServices: 0,
          paidServices: 0,
          warrantyPercentage: 0,
        },
      };
    }
  }

  /**
   * Website Inquiries & Lead Conversion Aggregations
   */
  async getInquiryMetrics(bounds: DateRangeBounds) {
    try {
      const [
        [summary],
        statuses,
        sources,
        types,
        trendRaw,
      ] = await Promise.all([
        db
          .select({
            total: count(inquiries.id),
          })
          .from(inquiries)
          .where(
            and(
              gte(inquiries.createdAt, bounds.startDate),
              lte(inquiries.createdAt, bounds.endDate)
            )
          ),

        db
          .select({
            status: inquiries.status,
            count: count(inquiries.id),
          })
          .from(inquiries)
          .where(
            and(
              gte(inquiries.createdAt, bounds.startDate),
              lte(inquiries.createdAt, bounds.endDate)
            )
          )
          .groupBy(inquiries.status),

        db
          .select({
            source: inquiries.source,
            count: count(inquiries.id),
          })
          .from(inquiries)
          .where(
            and(
              gte(inquiries.createdAt, bounds.startDate),
              lte(inquiries.createdAt, bounds.endDate)
            )
          )
          .groupBy(inquiries.source),

        db
          .select({
            type: inquiries.inquiryType,
            count: count(inquiries.id),
          })
          .from(inquiries)
          .where(
            and(
              gte(inquiries.createdAt, bounds.startDate),
              lte(inquiries.createdAt, bounds.endDate)
            )
          )
          .groupBy(inquiries.inquiryType),

        db
          .select({
            date: sql<string>`TO_CHAR(DATE_TRUNC('day', ${inquiries.createdAt}), 'YYYY-MM-DD')`,
            received: sql<string>`COUNT(${inquiries.id})`,
            converted: sql<string>`COUNT(CASE WHEN ${inquiries.status} = 'CONVERTED' THEN 1 END)`,
          })
          .from(inquiries)
          .where(
            and(
              gte(inquiries.createdAt, bounds.startDate),
              lte(inquiries.createdAt, bounds.endDate)
            )
          )
          .groupBy(sql`DATE_TRUNC('day', ${inquiries.createdAt})`)
          .orderBy(sql`DATE_TRUNC('day', ${inquiries.createdAt}) ASC`),
      ]);

      const dateMap = new Map<string, { received: number; converted: number }>();
      const dateSeries = generateDateSeries(bounds.startDate, bounds.endDate);
      for (const d of dateSeries) {
        dateMap.set(d, { received: 0, converted: 0 });
      }
      trendRaw.forEach((t) => {
        if (t.date) {
          dateMap.set(t.date, {
            received: Number(t.received || 0),
            converted: Number(t.converted || 0),
          });
        }
      });

      const inquiryTrend = Array.from(dateMap.entries()).map(([date, val]) => ({
        date,
        received: val.received,
        converted: val.converted,
      }));

      const total = Number(summary?.total || 0);
      const newCount = Number(statuses.find((s) => s.status === 'NEW')?.count || 0);
      const contactedCount = Number(statuses.find((s) => s.status === 'CONTACTED')?.count || 0);
      const qualifiedCount = Number(statuses.find((s) => s.status === 'QUALIFIED')?.count || 0);
      const convertedCount = Number(statuses.find((s) => s.status === 'CONVERTED')?.count || 0);
      const closedCount = Number(statuses.find((s) => s.status === 'CLOSED')?.count || 0);

      const conversionRate = total > 0 ? Math.round((convertedCount / total) * 1000) / 10 : 0;
      const qualifiedConversionRate = qualifiedCount > 0 ? Math.round((convertedCount / qualifiedCount) * 1000) / 10 : 0;

      return {
        totalInquiries: total,
        newInquiries: newCount,
        contactedInquiries: contactedCount,
        qualifiedInquiries: qualifiedCount,
        convertedInquiries: convertedCount,
        closedInquiries: closedCount,
        conversionRate,
        qualifiedConversionRate,
        inquirySourceDistribution: sources.map((s) => ({
          source: s.source || 'WEBSITE',
          count: Number(s.count || 0),
          percentage: total > 0 ? Math.round((Number(s.count || 0) / total) * 100) : 0,
        })),
        inquiryTypeDistribution: types.map((t) => ({
          type: t.type || 'NEW_PURCHASE',
          count: Number(t.count || 0),
          percentage: total > 0 ? Math.round((Number(t.count || 0) / total) * 100) : 0,
        })),
        inquiryTrend,
      };
    } catch (_err) {
      const dateSeries = generateDateSeries(bounds.startDate, bounds.endDate);
      const inquiryTrend = dateSeries.map((date) => ({ date, received: 0, converted: 0 }));
      return {
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
        inquiryTrend,
      };
    }
  }

  /**
   * Financial Summary Report connecting Revenue, Customer Payments, Expenses, COGS, and Technician Cash
   */
  async getFinancialSummary(bounds: DateRangeBounds, companyId?: string | null): Promise<FinancialSummaryReport> {
    const startIso = bounds.startDate instanceof Date ? bounds.startDate.toISOString() : String(bounds.startDate);
    const endIso = bounds.endDate instanceof Date ? bounds.endDate.toISOString() : String(bounds.endDate);
    const invoiceDateCol = sql`COALESCE(${invoices.invoiceDate}, ${invoices.createdAt})`;
    const paymentDateCol = sql`COALESCE(${payments.paymentDate}, ${payments.createdAt})`;

    try {
      const [
        [serviceRevRow],
        [paymentsRow],
        [expensesRow],
        [cogsRow],
        [techCollectedRow],
        [ownerReceivedRow],
        [pendingTechRow],
      ] = await Promise.all([
        // 1. Authoritative Service Revenue in period
        db
          .select({
            total: sql<string>`COALESCE(SUM(${invoices.totalAmount}), 0)`,
          })
          .from(invoices)
          .where(
            and(
              gte(invoiceDateCol, startIso),
              lte(invoiceDateCol, endIso),
              sql`${invoices.status} IN ('ISSUED', 'PAID', 'PARTIALLY_PAID', 'OVERDUE')`,
              sql`${invoices.cancelledAt} IS NULL`,
              sql`(${invoices.jobCardId} IS NOT NULL OR ${invoices.serviceId} IS NOT NULL)`
            )
          ),

        // 2. Total Customer Payments Received in period (Completed)
        db
          .select({
            total: sql<string>`COALESCE(SUM(${payments.amount}), 0)`,
          })
          .from(payments)
          .where(
            and(
              gte(paymentDateCol, startIso),
              lte(paymentDateCol, endIso),
              eq(payments.status, 'COMPLETED')
            )
          ),

        // 3. Total Valid Operating Expenses in period
        db
          .select({
            total: sql<string>`COALESCE(SUM(${expenses.amount}), 0)`,
            cashTotal: sql<string>`COALESCE(SUM(CASE WHEN LOWER(${expenses.paymentMethod}) = 'cash' THEN ${expenses.amount} ELSE 0 END), 0)`,
          })
          .from(expenses)
          .where(
            and(
              gte(expenses.expenseDate, bounds.startDate),
              lte(expenses.expenseDate, bounds.endDate),
              eq(expenses.status, 'RECORDED'),
              companyId ? eq(expenses.companyId, companyId) : sql`1=1`
            )
          ),

        // 4. COGS from Inventory Sales in period
        db
          .select({
            totalCost: sql<string>`COALESCE(SUM(${inventorySales.totalCostAmount}), 0)`,
          })
          .from(inventorySales)
          .where(
            and(
              gte(inventorySales.saleDate, bounds.startDate),
              lte(inventorySales.saleDate, bounds.endDate)
            )
          ),

        // 5. Cash Collected by Technicians in period
        db
          .select({
            total: sql<string>`COALESCE(SUM(${cashHandovers.amount}), 0)`,
          })
          .from(cashHandovers)
          .where(
            and(
              gte(cashHandovers.collectedAt, bounds.startDate),
              lte(cashHandovers.collectedAt, bounds.endDate),
              companyId ? eq(cashHandovers.companyId, companyId) : sql`1=1`
            )
          ),

        // 6. Cash Handed Over to Owner in period (Received)
        db
          .select({
            total: sql<string>`COALESCE(SUM(${cashHandovers.amount}), 0)`,
          })
          .from(cashHandovers)
          .where(
            and(
              eq(cashHandovers.status, 'RECEIVED'),
              gte(cashHandovers.handedOverAt, bounds.startDate),
              lte(cashHandovers.handedOverAt, bounds.endDate),
              companyId ? eq(cashHandovers.companyId, companyId) : sql`1=1`
            )
          ),

        // 7. Pending Technician Cash
        db
          .select({
            total: sql<string>`COALESCE(SUM(${cashHandovers.amount}), 0)`,
          })
          .from(cashHandovers)
          .where(
            and(
              eq(cashHandovers.status, 'PENDING'),
              companyId ? eq(cashHandovers.companyId, companyId) : sql`1=1`
            )
          ),
      ]);

      const totalServiceRevenue = Number(Number(serviceRevRow?.total || 0).toFixed(2));
      const totalCustomerPaymentsReceived = Number(Number(paymentsRow?.total || 0).toFixed(2));
      const totalExpenses = Number(Number(expensesRow?.total || 0).toFixed(2));
      const cashExpenses = Number(Number(expensesRow?.cashTotal || 0).toFixed(2));
      const cogsAmount = Number(Number(cogsRow?.totalCost || 0).toFixed(2));
      const cashCollectedByTechnicians = Number(Number(techCollectedRow?.total || 0).toFixed(2));
      const cashHandedOverToOwner = Number(Number(ownerReceivedRow?.total || 0).toFixed(2));
      const pendingTechnicianCash = Number(Number(pendingTechRow?.total || 0).toFixed(2));

      if (
        (totalExpenses === 0 && memoryExpenses.length > 0) ||
        (cashCollectedByTechnicians === 0 && memoryCashHandovers.length > 0) ||
        (totalCustomerPaymentsReceived === 0 && memoryPayments.length > 0)
      ) {
        throw new Error('Fallback to in-memory financial summary');
      }

      const grossProfit = Number((totalServiceRevenue - cogsAmount).toFixed(2));
      const netProfit = Number((totalCustomerPaymentsReceived - cogsAmount - totalExpenses).toFixed(2));
      const shopCashMovementBalance = Number((cashHandedOverToOwner - cashExpenses).toFixed(2));

      return {
        period: `${startIso.split('T')[0]} to ${endIso.split('T')[0]}`,
        startDate: startIso,
        endDate: endIso,
        totalServiceRevenue,
        totalCustomerPaymentsReceived,
        totalExpenses,
        cogsAmount,
        grossProfit,
        netProfit,
        cashCollectedByTechnicians,
        cashHandedOverToOwner,
        pendingTechnicianCash,
        shopCashMovementBalance,
      };
    } catch (_err) {
      // Memory fallback
      const startMs = bounds.startDate.getTime();
      const endMs = bounds.endDate.getTime();

      let totalServiceRevenue = 0;
      for (const inv of memoryInvoices) {
        const d = new Date(inv.invoiceDate || inv.createdAt).getTime();
        if (
          d >= startMs &&
          d <= endMs &&
          (inv.jobCardId || inv.serviceId) &&
          inv.status !== 'CANCELLED' &&
          inv.status !== 'DRAFT'
        ) {
          totalServiceRevenue += Number(inv.totalAmount || 0);
        }
      }

      let totalCustomerPaymentsReceived = 0;
      for (const p of memoryPayments) {
        const d = new Date(p.paymentDate || p.createdAt).getTime();
        if (d >= startMs && d <= endMs && p.status === 'COMPLETED') {
          totalCustomerPaymentsReceived += Number(p.amount || 0);
        }
      }

      let totalExpenses = 0;
      let cashExpenses = 0;
      for (const e of memoryExpenses) {
        const d = new Date(e.expenseDate).getTime();
        if (d >= startMs && d <= endMs && e.status === 'RECORDED' && (!companyId || e.companyId === companyId)) {
          const amt = Number(e.amount || 0);
          totalExpenses += amt;
          if (e.paymentMethod?.toLowerCase() === 'cash') {
            cashExpenses += amt;
          }
        }
      }

      let cogsAmount = 0;
      for (const s of memorySales) {
        const d = new Date(s.saleDate || s.createdAt).getTime();
        if (d >= startMs && d <= endMs) {
          cogsAmount += Number(s.totalCostAmount || 0);
        }
      }

      let cashCollectedByTechnicians = 0;
      let cashHandedOverToOwner = 0;
      let pendingTechnicianCash = 0;
      for (const h of memoryCashHandovers) {
        if (companyId && h.companyId && h.companyId !== companyId) continue;
        const collD = new Date(h.collectedAt).getTime();
        if (collD >= startMs && collD <= endMs) {
          cashCollectedByTechnicians += Number(h.amount || 0);
        }
        if (h.status === 'RECEIVED' && h.handedOverAt) {
          const handD = new Date(h.handedOverAt).getTime();
          if (handD >= startMs && handD <= endMs) {
            cashHandedOverToOwner += Number(h.amount || 0);
          }
        } else if (h.status === 'PENDING') {
          pendingTechnicianCash += Number(h.amount || 0);
        }
      }

      totalServiceRevenue = Number(totalServiceRevenue.toFixed(2));
      totalCustomerPaymentsReceived = Number(totalCustomerPaymentsReceived.toFixed(2));
      totalExpenses = Number(totalExpenses.toFixed(2));
      cogsAmount = Number(cogsAmount.toFixed(2));
      cashCollectedByTechnicians = Number(cashCollectedByTechnicians.toFixed(2));
      cashHandedOverToOwner = Number(cashHandedOverToOwner.toFixed(2));
      pendingTechnicianCash = Number(pendingTechnicianCash.toFixed(2));

      const grossProfit = Number((totalServiceRevenue - cogsAmount).toFixed(2));
      const netProfit = Number((totalCustomerPaymentsReceived - cogsAmount - totalExpenses).toFixed(2));
      const shopCashMovementBalance = Number((cashHandedOverToOwner - cashExpenses).toFixed(2));

      return {
        period: `${startIso.split('T')[0]} to ${endIso.split('T')[0]}`,
        startDate: startIso,
        endDate: endIso,
        totalServiceRevenue,
        totalCustomerPaymentsReceived,
        totalExpenses,
        cogsAmount,
        grossProfit,
        netProfit,
        cashCollectedByTechnicians,
        cashHandedOverToOwner,
        pendingTechnicianCash,
        shopCashMovementBalance,
      };
    }
  }
}

export const analyticsRepository = new AnalyticsRepository();
