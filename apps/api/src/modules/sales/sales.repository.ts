import { eq, and, or, ilike, sql, desc, asc, inArray, gte, lte, ne } from 'drizzle-orm';
import { db } from '../../database/client';
import {
  sales,
  saleItems,
  customers,
  customerAssets,
  invoices,
  invoiceItems,
  warranties,
  warrantyEvents,
  products,
  customerActivities,
  auditLogs,
  users,
  payments,
  services,
  jobCards,
} from '../../database/schema/index';
import { generateBusinessNumber } from '../../database/sequences';
import { generateInvoiceNumber } from '../invoices/invoices.numbering';
import { withTransaction } from '../../database/transactions';
import { configService } from '../system/configuration.service';
import type { SalesSettings } from '@crm/types';
import { calculateSaleTotals } from './sales.calculator';
import { inventoryRepository } from '../inventory/inventory.repository';
import { productRepository } from '../products/product.repository';
import { customerRepository } from '../customers/customer.repository';
import { assetsRepository } from '../assets/assets.repository';
import { invoicesRepository, memoryInvoices, memoryInvoiceItems } from '../invoices/invoices.repository';
import { memoryPayments } from '../payments/payments.repository';
import { memoryServices } from '../services/services.repository';
import { randomUUID } from 'crypto';

export function parseNextServiceDate(val: string | Date | undefined | null): Date | null {
  if (!val) return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return val;
  }
  const str = String(val).trim();
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return new Date(`${str}T10:00:00.000Z`);
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}
import type {
  CreateSaleInput,
  UpdateSaleInput,
  ConfirmSaleInput,
  SaleQueryFilter,
} from '@crm/validation';

// Duplicate submission protection (Phase 5 Idempotency)
const recentSalesSubmissions = new Map<string, { timestamp: number; result: any }>();
const inFlightSales = new Map<string, Promise<any>>();

// Resilient memory store for offline desktop and local development
export const memorySales: any[] = [];
const memorySaleItems: any[] = [];

export class SalesRepository {
  private buildFilterConditions(filters: SaleQueryFilter, database = db) {
    const conditions: any[] = [];

    if (filters.status) {
      conditions.push(eq(sales.status, filters.status as any));
    }

    if (filters.customerId) {
      conditions.push(eq(sales.customerId, filters.customerId));
    }

    if (filters.productId) {
      const saleWithProduct = database
        .select({ saleId: saleItems.saleId })
        .from(saleItems)
        .where(eq(saleItems.productId, filters.productId));
      conditions.push(inArray(sales.id, saleWithProduct));
    }

    let start = filters.startDate ? new Date(filters.startDate) : undefined;
    let end = filters.endDate ? new Date(filters.endDate) : undefined;

    if (filters.datePreset) {
      const now = new Date();
      if (filters.datePreset === 'today') {
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      } else if (filters.datePreset === 'this_week') {
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        start = new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth(), diff + 6, 23, 59, 59, 999);
      } else if (filters.datePreset === 'this_month') {
        start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      } else if (filters.datePreset === 'last_month') {
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
        end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      } else if (filters.datePreset === 'this_quarter') {
        const quarter = Math.floor(now.getMonth() / 3);
        start = new Date(now.getFullYear(), quarter * 3, 1, 0, 0, 0, 0);
        end = new Date(now.getFullYear(), quarter * 3 + 3, 0, 23, 59, 59, 999);
      } else if (filters.datePreset === 'this_year') {
        start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
        end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      }
    }

    if (start) {
      conditions.push(sql`${sales.saleDate} >= ${start}`);
    }
    if (end) {
      conditions.push(sql`${sales.saleDate} <= ${end}`);
    }

    if (filters.search?.trim()) {
      const term = `%${filters.search.trim()}%`;
      conditions.push(
        or(
          ilike(sales.saleNumber, term),
          ilike(customers.fullName, term),
          ilike(customers.phone, term),
          ilike(customers.customerNumber, term),
          ilike(sales.notes, term)
        )
      );
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  /**
   * Find paginated sales with search, status filters, date range, and customer join
   */
  async findPaginated(filters: SaleQueryFilter, database = db) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const offset = (page - 1) * limit;

    try {
      const whereClause = this.buildFilterConditions(filters, database);

      let orderByClauses: any[];
      const sortOrder = filters.sortOrder === 'asc' ? asc : desc;
      switch (filters.sortBy) {
        case 'totalAmount':
          orderByClauses = [sortOrder(sales.totalAmount), desc(sales.createdAt)];
          break;
        case 'saleNumber':
          orderByClauses = [sortOrder(sales.saleNumber), desc(sales.createdAt)];
          break;
        case 'createdAt':
          orderByClauses = [sortOrder(sales.createdAt)];
          break;
        case 'saleDate':
        default:
          orderByClauses = [sortOrder(sales.createdAt), sortOrder(sales.saleDate)];
          break;
      }

      const needsCustomerJoinForCount = Boolean(filters.search?.trim());
      const countQuery = needsCustomerJoinForCount
        ? database
            .select({ count: sql<number>`count(*)::int` })
            .from(sales)
            .leftJoin(customers, eq(sales.customerId, customers.id))
            .where(whereClause)
        : database
            .select({ count: sql<number>`count(*)::int` })
            .from(sales)
            .where(whereClause);

      const rowsQuery = database
        .select({
          id: sales.id,
          saleNumber: sales.saleNumber,
          customerId: sales.customerId,
          customerName: customers.fullName,
          customerNumber: customers.customerNumber,
          customerPhone: customers.phone,
          saleDate: sales.saleDate,
          status: sales.status,
          subtotal: sales.subtotal,
          discountAmount: sales.discountAmount,
          taxAmount: sales.taxAmount,
          totalAmount: sales.totalAmount,
          notes: sales.notes,
          createdAt: sales.createdAt,
          cancelledAt: sales.cancelledAt,
          cancelReason: sales.cancelReason,
        })
        .from(sales)
        .leftJoin(customers, eq(sales.customerId, customers.id))
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(...orderByClauses);

      // Execute count and paginated selection concurrently
      const [[totalRes], rows] = await Promise.all([countQuery, rowsQuery]);
      const total = totalRes?.count ?? 0;

      // Fetch linked invoices for these sales
      const saleIds = rows.map((r) => r.id);
      const linkedInvoices =
        saleIds.length > 0
          ? await database
              .select({
                id: invoices.id,
                saleId: invoices.saleId,
                invoiceNumber: invoices.invoiceNumber,
                status: invoices.status,
                totalAmount: invoices.totalAmount,
                dueDate: invoices.dueDate,
              })
              .from(invoices)
              .where(inArray(invoices.saleId, saleIds))
          : [];

      const invoiceIds = linkedInvoices.map((inv) => inv.id);
      const invoicePayments =
        invoiceIds.length > 0
          ? await database
              .select({
                invoiceId: payments.invoiceId,
                amount: payments.amount,
                status: payments.status,
              })
              .from(payments)
              .where(
                and(
                  inArray(payments.invoiceId, invoiceIds),
                  eq(payments.status, 'COMPLETED')
                )
              )
          : [];

      const paidByInvoiceId = new Map<string, number>();
      for (const p of invoicePayments) {
        const current = paidByInvoiceId.get(p.invoiceId) || 0;
        paidByInvoiceId.set(p.invoiceId, current + (parseFloat(p.amount) || 0));
      }

      const linkedItems =
        saleIds.length > 0
          ? await database
              .select({
                saleId: saleItems.saleId,
                productNameSnapshot: saleItems.productNameSnapshot,
                skuSnapshot: saleItems.skuSnapshot,
                quantity: saleItems.quantity,
              })
              .from(saleItems)
              .where(inArray(saleItems.saleId, saleIds))
          : [];

      const invoiceMap = new Map<string, any>(
        linkedInvoices.map((inv) => {
          const paid = paidByInvoiceId.get(inv.id) || 0;
          const total = parseFloat(inv.totalAmount || '0');
          const outstanding = Math.max(0, total - paid);
          const computedStatus =
            inv.status === 'CANCELLED'
              ? 'CANCELLED'
              : outstanding <= 0.001 && paid > 0
              ? 'PAID'
              : paid > 0
              ? 'PARTIALLY_PAID'
              : inv.status;

          return [
            inv.saleId,
            {
              ...inv,
              status: computedStatus,
              paidAmount: paid.toFixed(2),
              outstandingAmount: outstanding.toFixed(2),
            },
          ];
        })
      );

      const itemsMap = new Map<string, any[]>();
      for (const itm of linkedItems) {
        const list = itemsMap.get(itm.saleId) || [];
        list.push(itm);
        itemsMap.set(itm.saleId, list);
      }

      const enrichedData = rows.map((row) => {
        const inv = invoiceMap.get(row.id) ?? null;
        const paid = inv ? parseFloat(inv.paidAmount) || 0 : 0;
        const total = parseFloat(row.totalAmount || '0');
        const outstanding = Math.max(0, total - paid);
        const paymentStatus =
          inv?.status === 'CANCELLED'
            ? 'CANCELLED'
            : outstanding <= 0.001 && paid > 0
            ? 'PAID'
            : paid > 0
            ? 'PARTIALLY_PAID'
            : 'PENDING';

        return {
          ...row,
          invoice: inv,
          paidAmount: paid.toFixed(2),
          outstandingAmount: outstanding.toFixed(2),
          paymentStatus,
          items: itemsMap.get(row.id) || [],
        };
      });

      return {
        data: enrichedData,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1,
        },
      };
    } catch (err: any) {
      console.error('[SalesRepository.findPaginated ERROR]', err?.message || err);
      let filtered = [...memorySales];
      if (filters.status && (filters.status as string) !== 'ALL') {
        filtered = filtered.filter((s) => s.status === filters.status);
      }
      if (filters.customerId) {
        filtered = filtered.filter((s) => s.customerId === filters.customerId);
      }
      if (filters.search?.trim()) {
        const q = filters.search.trim().toLowerCase();
        filtered = filtered.filter(
          (s) =>
            s.saleNumber?.toLowerCase().includes(q) ||
            s.customerName?.toLowerCase().includes(q) ||
            s.customerPhone?.toLowerCase().includes(q) ||
            s.customerNumber?.toLowerCase().includes(q) ||
            s.notes?.toLowerCase().includes(q) ||
            s.totalAmount?.toString().includes(q)
        );
      }
      const total = filtered.length;
      return {
        data: filtered.slice(offset, offset + limit).map((s) => ({
          ...s,
          items: memorySaleItems.filter((i) => i.saleId === s.id),
        })),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1,
        },
      };
    }
  }

  /**
   * Calculate filtered KPI statistics, trends, and product rankings directly from database
   */
  async getSalesStats(filters: SaleQueryFilter, database = db) {
    try {
      const whereClause = this.buildFilterConditions(filters, database);

      // 1. Fetch matching sales with basic fields
      const matchingSales = await database
        .select({
          id: sales.id,
          saleNumber: sales.saleNumber,
          customerId: sales.customerId,
          customerName: customers.fullName,
          customerNumber: customers.customerNumber,
          saleDate: sales.saleDate,
          status: sales.status,
          totalAmount: sales.totalAmount,
          createdAt: sales.createdAt,
        })
        .from(sales)
        .leftJoin(customers, eq(sales.customerId, customers.id))
        .where(whereClause)
        .orderBy(desc(sales.saleDate));

      const saleIds = matchingSales.map((s) => s.id);

      // Linked invoices for matching sales
      const linkedInvoices: any[] =
        saleIds.length > 0
          ? await database
              .select({
                id: invoices.id,
                saleId: invoices.saleId,
                invoiceNumber: invoices.invoiceNumber,
                status: invoices.status,
              })
              .from(invoices)
              .where(inArray(invoices.saleId, saleIds))
          : [];
      const invoiceMap = new Map<string, any>(linkedInvoices.map((inv: any) => [inv.saleId, inv]));

      // Linked items for matching sales
      const linkedItems =
        saleIds.length > 0
          ? await database
              .select({
                saleId: saleItems.saleId,
                productId: saleItems.productId,
                productNameSnapshot: saleItems.productNameSnapshot,
                quantity: saleItems.quantity,
                lineTotal: saleItems.lineTotal,
              })
              .from(saleItems)
              .where(inArray(saleItems.saleId, saleIds))
          : [];

      // Computations
      const validSales = matchingSales.filter((s) => s.status !== 'CANCELLED');
      const totalSalesRaw = validSales.reduce((acc, s) => acc + Number(s.totalAmount || 0), 0);
      const orders = validSales.length;
      const completed = validSales.filter((s) => s.status === 'COMPLETED').length;
      const pending = validSales.filter((s) => s.status === 'DRAFT').length;
      const avgOrderValueRaw = orders > 0 ? totalSalesRaw / orders : 0;

      // Unique customers in filtered set
      const customerIdSet = new Set(validSales.map((s) => s.customerId));
      const totalCustomers = customerIdSet.size;

      // Pending today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const pendingToday = validSales.filter(
        (s) => s.status === 'DRAFT' && new Date(s.saleDate) >= todayStart
      ).length;

      // Top Products breakdown: aggregate by normalized product name so identical products are properly combined
      const productSalesMap = new Map<string, { id: string; name: string; amount: number; count: number }>();
      for (const item of linkedItems) {
        const prodName = (item.productNameSnapshot || 'Equipment').trim();
        const normKey = prodName.toLowerCase();
        const existing = productSalesMap.get(normKey) || {
          id: item.productId || normKey,
          name: prodName,
          amount: 0,
          count: 0,
        };
        existing.amount += Number(item.lineTotal || 0);
        existing.count += Number(item.quantity || 1);
        productSalesMap.set(normKey, existing);
      }

      // If linkedItems is empty but sales exist, fallback to grouping by sale total
      if (productSalesMap.size === 0 && validSales.length > 0) {
        productSalesMap.set('ro-system', {
          id: 'ro-system',
          name: 'RO + UV + UF + TDS Controller',
          amount: totalSalesRaw,
          count: orders,
        });
      }

      const sortedProducts = Array.from(productSalesMap.values()).sort((a, b) => b.amount - a.amount);
      const topProducts = sortedProducts.slice(0, 5).map((p) => {
        const percentage = totalSalesRaw > 0 ? Math.round((p.amount / totalSalesRaw) * 100) : 0;
        const nameLower = p.name.toLowerCase();
        const isFilter = nameLower.includes('filter') || nameLower.includes('pump') || nameLower.includes('membrane') || nameLower.includes('spare') || nameLower.includes('cartridge');
        return {
          id: p.id,
          name: p.name,
          amount: `₹ ${p.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
          amountRaw: p.amount,
          count: p.count,
          percentage,
          type: (isFilter ? 'filter' : 'ro') as 'ro' | 'filter',
        };
      });

      // Recent Sales (up to 4)
      const recentSales = matchingSales.slice(0, 4).map((sale, idx) => {
        const inv = invoiceMap.get(sale.id);
        const dateObj = new Date(sale.saleDate);
        return {
          id: sale.id,
          customerName: sale.customerName || 'Customer',
          amount: `₹ ${parseFloat(sale.totalAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
          invoiceNo: inv?.invoiceNumber || sale.saleNumber,
          time: dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
          iconVariant: (idx % 2 === 0 ? 'emerald' : 'blue') as 'emerald' | 'blue',
        };
      });

      // Trend data points: structured timeline using exact system date and time
      const now = new Date();
      const preset = filters.datePreset || 'this_month';
      const trendPoints: { label: string; fullDate?: string; amount: number; count: number }[] = [];

      if (preset === 'today') {
        const slots = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'];
        const slotTotals = new Array(slots.length).fill(0);
        const slotCounts = new Array(slots.length).fill(0);

        for (const s of validSales) {
          const d = new Date(s.saleDate || s.createdAt);
          const hr = d.getHours();
          const slotIdx = Math.min(slots.length - 1, Math.max(0, Math.floor((hr - 8) / 2)));
          slotTotals[slotIdx] += Number(s.totalAmount || 0);
          slotCounts[slotIdx] += 1;
        }

        slots.forEach((label, idx) => {
          trendPoints.push({
            label,
            fullDate: `Today ${label}`,
            amount: slotTotals[idx],
            count: slotCounts[idx],
          });
        });
      } else if (preset === 'this_week') {
        const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const dayOfWeek = now.getDay();
        const mondayOffset = now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1);
        const monday = new Date(now.getFullYear(), now.getMonth(), mondayOffset);

        for (let i = 0; i < 7; i++) {
          const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
          const dStr = d.toISOString().slice(0, 10);
          const label = `${dayNames[i]} ${d.getDate()}`;
          const fullDate = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

          const matchingDaySales = validSales.filter((s) => {
            const sDate = new Date(s.saleDate || s.createdAt).toISOString().slice(0, 10);
            return sDate === dStr;
          });

          const amount = matchingDaySales.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0);
          trendPoints.push({ label, fullDate, amount, count: matchingDaySales.length });
        }
      } else if (preset === 'this_month') {
        const targetYear = now.getFullYear();
        const targetMonth = now.getMonth();
        const currentDay = now.getDate(); // Exact system day (e.g. 26)
        const monthName = now.toLocaleDateString('en-US', { month: 'short' });

        // Generate 6 milestone days across month ending at current system day (or month-end)
        let milestoneDays: number[];
        if (currentDay <= 6) {
          milestoneDays = [1, 2, 3, 4, 5, Math.max(6, currentDay)];
        } else {
          const step = Math.max(1, Math.floor((currentDay - 1) / 5));
          milestoneDays = [
            1,
            1 + step,
            1 + step * 2,
            1 + step * 3,
            1 + step * 4,
            currentDay,
          ];
        }

        milestoneDays.forEach((day, idx) => {
          const prevDay = idx === 0 ? 1 : milestoneDays[idx - 1] + 1;
          const label = `${day} ${monthName}`;
          const fullDate = `${day} ${monthName} ${targetYear}`;

          const matchingBucketSales = validSales.filter((s) => {
            const sD = new Date(s.saleDate || s.createdAt);
            if (sD.getFullYear() === targetYear && sD.getMonth() === targetMonth) {
              const sDay = sD.getDate();
              return sDay >= prevDay && sDay <= day;
            }
            return false;
          });

          const amount = matchingBucketSales.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0);
          trendPoints.push({ label, fullDate, amount, count: matchingBucketSales.length });
        });
      } else if (preset === 'last_month') {
        const targetYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
        const targetMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
        const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
        const monthName = new Date(targetYear, targetMonth, 1).toLocaleDateString('en-US', { month: 'short' });

        const milestoneDays = [1, 7, 14, 21, 28, daysInMonth];
        milestoneDays.forEach((day, idx) => {
          const prevDay = idx === 0 ? 1 : milestoneDays[idx - 1] + 1;
          const label = `${day} ${monthName}`;
          const fullDate = `${day} ${monthName} ${targetYear}`;

          const matchingBucketSales = validSales.filter((s) => {
            const sD = new Date(s.saleDate || s.createdAt);
            if (sD.getFullYear() === targetYear && sD.getMonth() === targetMonth) {
              const sDay = sD.getDate();
              return sDay >= prevDay && sDay <= day;
            }
            return false;
          });

          const amount = matchingBucketSales.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0);
          trendPoints.push({ label, fullDate, amount, count: matchingBucketSales.length });
        });
      } else if (preset === 'this_quarter') {
        const currentQ = Math.floor(now.getMonth() / 3);
        for (let m = 0; m < 3; m++) {
          const mIdx = currentQ * 3 + m;
          const d = new Date(now.getFullYear(), mIdx, 1);
          const label = d.toLocaleDateString('en-US', { month: 'short' });
          const fullDate = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

          const matchingMonthSales = validSales.filter((s) => {
            const sD = new Date(s.saleDate || s.createdAt);
            return sD.getFullYear() === now.getFullYear() && sD.getMonth() === mIdx;
          });

          const amount = matchingMonthSales.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0);
          trendPoints.push({ label, fullDate, amount, count: matchingMonthSales.length });
        }
      } else {
        // This Year / All Time: 7 rolling months ending at current system month
        for (let i = 6; i >= 0; i--) {
          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const label = d.toLocaleDateString('en-US', { month: 'short' });
          const fullDate = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

          const matchingMonthSales = validSales.filter((s) => {
            const sD = new Date(s.saleDate || s.createdAt);
            return sD.getFullYear() === d.getFullYear() && sD.getMonth() === d.getMonth();
          });

          const amount = matchingMonthSales.reduce((sum, s) => sum + Number(s.totalAmount || 0), 0);
          trendPoints.push({ label, fullDate, amount, count: matchingMonthSales.length });
        }
      }

      // Compute previous period comparison (Last Month)
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      const prevMonthStartStr = prevMonthStart.toISOString().split('T')[0]!;
      const prevMonthEndStr = prevMonthEnd.toISOString().split('T')[0]!;

      let previousSales: Array<{ totalAmount: string | number; status: string }> = [];
      try {
        previousSales = await database
          .select({
            totalAmount: sales.totalAmount,
            status: sales.status,
          })
          .from(sales)
          .where(
            and(
              gte(sales.saleDate, prevMonthStart),
              lte(sales.saleDate, prevMonthEnd),
              ne(sales.status, 'CANCELLED')
            )
          );
      } catch {
        previousSales = memorySales.filter((s) => {
          if (s.status === 'CANCELLED') return false;
          const dStr = (s.saleDate || s.createdAt || '').split('T')[0];
          return dStr >= prevMonthStartStr && dStr <= prevMonthEndStr;
        });
      }

      const prevTotalSalesRaw = previousSales.reduce((acc, s) => acc + Number(s.totalAmount || 0), 0);
      const prevOrders = previousSales.length;
      const prevCompleted = previousSales.filter((s) => s.status === 'COMPLETED').length;
      const prevPending = previousSales.filter((s) => s.status === 'DRAFT').length;
      const prevAvgOrderValueRaw = prevOrders > 0 ? prevTotalSalesRaw / prevOrders : 0;

      const formatTrend = (current: number, previous: number): string => {
        if (previous === 0) {
          if (current === 0) return '0%';
          return '+100%';
        }
        const diff = ((current - previous) / previous) * 100;
        const sign = diff > 0 ? '+' : '';
        return `${sign}${diff.toFixed(1)}%`;
      };

      return {
        kpis: {
          totalSales: `₹ ${totalSalesRaw.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
          totalSalesRaw,
          totalSalesTrend: formatTrend(totalSalesRaw, prevTotalSalesRaw),
          orders,
          ordersTrend: formatTrend(orders, prevOrders),
          avgOrderValue: `₹ ${avgOrderValueRaw.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
          avgOrderTrend: formatTrend(avgOrderValueRaw, prevAvgOrderValueRaw),
          completed,
          completedTrend: formatTrend(completed, prevCompleted),
          pending,
          pendingTrend: formatTrend(pending, prevPending),
        },
        trend: trendPoints,
        topProducts,
        recentSales,
        bottomWidgets: {
          fastMovingCount: Math.min(topProducts.length, 5),
          pendingToday,
          totalCustomers,
          revenueTargetAchieved: totalSalesRaw > 0 ? Math.min(100, Math.round((totalSalesRaw / 1000000) * 100)) : 0,
        },
      };
    } catch (err) {
      return {
        kpis: {
          totalSales: '₹ 0.00',
          totalSalesRaw: 0,
          totalSalesTrend: '0%',
          orders: 0,
          ordersTrend: '0%',
          avgOrderValue: '₹ 0.00',
          avgOrderTrend: '0%',
          completed: 0,
          completedTrend: '0%',
          pending: 0,
          pendingTrend: '0%',
        },
        trend: [],
        topProducts: [],
        recentSales: [],
        bottomWidgets: {
          fastMovingCount: 0,
          pendingToday: 0,
          totalCustomers: 0,
          revenueTargetAchieved: 0,
        },
      };
    }
  }

  /**
   * Find single sale by ID with items, customer details, linked invoice, and customer assets
   */
  async findById(id: string, database = db) {
    try {
      const [sale] = await database
        .select({
          id: sales.id,
          saleNumber: sales.saleNumber,
          customerId: sales.customerId,
          customerName: customers.fullName,
          customerNumber: customers.customerNumber,
          customerPhone: customers.phone,
          customerEmail: customers.email,
          customerType: customers.customerType,
          saleDate: sales.saleDate,
          status: sales.status,
          subtotal: sales.subtotal,
          discountAmount: sales.discountAmount,
          taxAmount: sales.taxAmount,
          totalAmount: sales.totalAmount,
          notes: sales.notes,
          createdBy: sales.createdBy,
          createdAt: sales.createdAt,
          updatedAt: sales.updatedAt,
          cancelledAt: sales.cancelledAt,
          cancelReason: sales.cancelReason,
        })
        .from(sales)
        .leftJoin(customers, eq(sales.customerId, customers.id))
        .where(eq(sales.id, id));

      if (!sale) {
        const memSale = memorySales.find((s) => s.id === id);
        if (!memSale) return null;
        const memItems = memorySaleItems.filter((i) => i.saleId === id);
        const memInv =
          memoryInvoices.find((i) => i.saleId === id || i.id === memSale.invoice?.id) ||
          memSale.invoice ||
          null;
        const memPayments = memInv
          ? memoryPayments.filter((p) => p.invoiceId === memInv.id)
          : [];
        return {
          ...memSale,
          items: memItems,
          invoice: memInv ? { ...memInv, payments: memPayments } : null,
          payments: memPayments,
          assets: [],
        };
      }

      const items = await database
        .select()
        .from(saleItems)
        .where(eq(saleItems.saleId, id));

      const [invoice] = await database
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          customerId: invoices.customerId,
          status: invoices.status,
          totalAmount: invoices.totalAmount,
          dueDate: invoices.dueDate,
          createdAt: invoices.createdAt,
        })
        .from(invoices)
        .where(eq(invoices.saleId, id));

      const linkedPayments = invoice
        ? await database
            .select({
              id: payments.id,
              paymentNumber: payments.paymentNumber,
              paymentDate: payments.paymentDate,
              amount: payments.amount,
              paymentMethod: payments.paymentMethod,
              referenceNumber: payments.referenceNumber,
              status: payments.status,
              notes: payments.notes,
            })
            .from(payments)
            .where(eq(payments.invoiceId, invoice.id))
            .orderBy(desc(payments.paymentDate))
        : [];

      const assets = await database
        .select({
          id: customerAssets.id,
          assetNumber: customerAssets.assetNumber,
          assetType: customerAssets.assetType,
          serialNumber: customerAssets.serialNumber,
          customName: customerAssets.customName,
          status: customerAssets.status,
          purchaseDate: customerAssets.purchaseDate,
        })
        .from(customerAssets)
        .leftJoin(products, eq(customerAssets.productId, products.id))
        .where(eq(customerAssets.customerId, sale.customerId));

      const validPayments = linkedPayments.filter((p) => p.status === 'COMPLETED');
      const paidAmount = validPayments.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);
      const totalAmountNum = parseFloat(sale.totalAmount || (invoice ? invoice.totalAmount : '0') || '0');
      const outstandingAmount = Math.max(0, totalAmountNum - paidAmount);
      const computedInvoiceStatus =
        invoice?.status === 'CANCELLED'
          ? 'CANCELLED'
          : outstandingAmount <= 0.001 && paidAmount > 0
          ? 'PAID'
          : paidAmount > 0
          ? 'PARTIALLY_PAID'
          : invoice?.status || 'ISSUED';
      const paymentStatus =
        invoice?.status === 'CANCELLED'
          ? 'CANCELLED'
          : outstandingAmount <= 0.001 && paidAmount > 0
          ? 'PAID'
          : paidAmount > 0
          ? 'PARTIALLY_PAID'
          : 'PENDING';

      return {
        ...sale,
        items,
        invoice: invoice
          ? {
              ...invoice,
              status: computedInvoiceStatus,
              paidAmount: paidAmount.toFixed(2),
              outstandingAmount: outstandingAmount.toFixed(2),
              payments: linkedPayments,
            }
          : null,
        paidAmount: paidAmount.toFixed(2),
        outstandingAmount: outstandingAmount.toFixed(2),
        paymentStatus,
        payments: linkedPayments,
        assets,
      };
    } catch {
      const memSale = memorySales.find((s) => s.id === id);
      if (!memSale) return null;
      const memItems = memorySaleItems.filter((i) => i.saleId === id);
      const memInv =
        memoryInvoices.find((i) => i.saleId === id || i.id === memSale.invoice?.id) ||
        memSale.invoice ||
        null;
      const memPayments = memInv
        ? memoryPayments.filter((p) => p.invoiceId === memInv.id)
        : [];
      const memValidPayments = memPayments.filter((p) => p.status === 'COMPLETED');
      const memPaid = memValidPayments.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);
      const memTotal = parseFloat(memSale.totalAmount || (memInv ? memInv.totalAmount : '0') || '0');
      const memOutstanding = Math.max(0, memTotal - memPaid);
      const memPaymentStatus =
        memOutstanding <= 0.001 && memPaid > 0 ? 'PAID' : memPaid > 0 ? 'PARTIALLY_PAID' : 'PENDING';

      return {
        ...memSale,
        items: memItems,
        invoice: memInv
          ? {
              ...memInv,
              paidAmount: memPaid.toFixed(2),
              outstandingAmount: memOutstanding.toFixed(2),
              payments: memPayments,
            }
          : null,
        paidAmount: memPaid.toFixed(2),
        outstandingAmount: memOutstanding.toFixed(2),
        paymentStatus: memPaymentStatus,
        payments: memPayments,
        assets: [],
      };
    }
  }

  /**
   * Create Draft or Confirmed Sale with deterministic calculations & snapshots
   */
  async createSale(data: CreateSaleInput, actorId?: string, actorName = 'System') {
    // Phase 5 Idempotency: Protect against rapid double clicks and duplicate submissions
    const dedupeKey = (data as any).idempotencyKey || `${data.customerId}-${data.items.map((i) => `${i.productName || i.productId}-${i.quantity}-${i.unitPrice}`).join('|')}-${data.discountAmount || 0}`;
    const cached = recentSalesSubmissions.get(dedupeKey);
    if (cached && Date.now() - cached.timestamp < 5000) {
      return cached.result;
    }

    if (inFlightSales.has(dedupeKey)) {
      return await inFlightSales.get(dedupeKey)!;
    }

    console.log(`[SALE_CONFIRM_START] Processing sale for customer ${data.customerId}, items: ${data.items?.length}, status: ${data.status}`);

    const executionPromise = (async () => {
      try {
        const createdSale = await withTransaction(async (tx) => {
          // 1. Verify customer exists
          const [customer] = await tx
            .select()
            .from(customers)
            .where(eq(customers.id, data.customerId));

          if (!customer) {
            throw new Error(`Customer with ID ${data.customerId} does not exist`);
          }
          console.log(`[CUSTOMER_VALIDATED] Customer ${customer.fullName} (${customer.id}) confirmed`);

          // 2. Fetch or dynamically auto-provision product records for snapshots
          console.log('[STEP_2_START] Resolving product lines...');
          const resolvedLines: any[] = [];
          for (const item of data.items) {
            let prod: any = null;

            if (item.productId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.productId)) {
              console.log('[STEP_2_PROD_LOOKUP_ID]', item.productId);
              const [found] = await tx
                .select()
                .from(products)
                .where(eq(products.id, item.productId));
              prod = found;
            }

            if (!prod && item.sku && item.sku.trim()) {
              console.log('[STEP_2_PROD_LOOKUP_SKU]', item.sku);
              const [foundBySku] = await tx
                .select()
                .from(products)
                .where(eq(products.sku, item.sku.trim()));
              prod = foundBySku;
            }

            if (!prod) {
              console.log('[STEP_2_PROD_AUTO_PROVISION]', item.productName || item.sku);
              // Auto-provision product in database catalog
              const pType = (item.productType as any) || 'RO_MACHINE';
              const prefix = pType === 'RO_MACHINE' ? 'EQP' : 'SPARE';
              const safeSku = (item.sku && item.sku.trim()) || `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
              const pName = (item.productName && item.productName.trim()) || (pType === 'RO_MACHINE' ? 'Equipment' : 'Spare Part');
              const pBrand = (item.brand && item.brand.trim()) || 'Standard';
              const defaultWar = item.warrantyPeriodMonths !== undefined && item.warrantyPeriodMonths !== null ? Number(item.warrantyPeriodMonths) : (pType === 'RO_MACHINE' ? 12 : 3);

              const [createdProd] = await tx
                .insert(products)
                .values({
                  sku: safeSku,
                  name: pName,
                  productType: pType,
                  brand: pBrand,
                  model: item.model || null,
                  description: item.technology ? `Technology: ${item.technology}` : (item.partCategory ? `Category: ${item.partCategory}` : null),
                  unitPrice: String(item.unitPrice || 0),
                  taxRatePercent: String(item.taxRatePercent !== undefined ? item.taxRatePercent : 18),
                  defaultWarrantyMonths: defaultWar,
                  defaultServiceIntervalMonths: (item as any).serviceIntervalMonths || 6,
                  isActive: true,
                })
                .returning();
              prod = createdProd;
            }

            const unitPrice = item.unitPrice !== undefined ? item.unitPrice : parseFloat(prod.unitPrice);
            const taxRate = item.taxRatePercent !== undefined ? item.taxRatePercent : parseFloat(prod.taxRatePercent);

            const warrantyMonths =
              item.warrantyPeriodMonths !== undefined && item.warrantyPeriodMonths !== null
                ? Number(item.warrantyPeriodMonths)
                : item.warrantyMonths !== undefined && item.warrantyMonths !== null
                ? Number(item.warrantyMonths)
                : (prod.defaultWarrantyMonths || 12);

            resolvedLines.push({
              productId: prod.id,
              productNameSnapshot: item.productName || prod.name,
              skuSnapshot: item.sku || prod.sku,
              quantity: item.quantity,
              unitPrice,
              discountAmount: item.discountAmount || 0,
              taxRatePercent: taxRate,
              warrantyMonths,
              serviceIntervalMonths: prod.defaultServiceIntervalMonths,
              serialNumber: item.serialNumber ?? null,
              productType: prod.productType,
              nextServiceDate: item.nextServiceDate || null,
            });
          }
          console.log('[STEP_2_COMPLETE] Product lines resolved:', resolvedLines.length);

          // 4. Calculate authoritative document totals
          console.log('[STEP_4_START] Calculating totals...');
          const calcResult = calculateSaleTotals(
            resolvedLines.map((l) => ({
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              discountAmount: l.discountAmount,
              taxRatePercent: l.taxRatePercent,
            })),
            data.discountAmount || 0
          );
          console.log('[STEP_4_COMPLETE] Totals calculated:', calcResult.totalAmount);

          // 5. Generate sequential business sale number
          console.log('[STEP_5_START] Generating sale number...');
          const { sequenceNumber: saleNumber } = await generateBusinessNumber(tx, 'SALE', 'SALE');
          console.log('[STEP_5_COMPLETE] Generated sale number:', saleNumber);

          const salesConfig = await configService.get<SalesSettings>('SALES', tx);
          const defaultStatus = salesConfig?.defaultSalesStatus || 'DRAFT';
          const saleStatus = data.status || defaultStatus;
          const isCompleted = saleStatus === 'COMPLETED';

          console.log('[STEP_ACTOR_START] Resolving actor ID...');
          const safeActorId = await this.resolveActorUserId(tx, actorId);
          console.log('[STEP_ACTOR_COMPLETE] Resolved actor:', safeActorId);

          // 6. Insert sale header
          console.log('[STEP_6_START] Inserting sale header...');
          const [sale] = await tx
            .insert(sales)
            .values({
              saleNumber,
              customerId: customer.id,
              saleDate: data.saleDate ? new Date(data.saleDate) : new Date(),
              status: saleStatus,
              subtotal: calcResult.subtotal,
              discountAmount: calcResult.discountAmount,
              taxAmount: calcResult.taxAmount,
              totalAmount: calcResult.totalAmount,
              notes: data.notes ? data.notes.trim() : null,
              createdBy: safeActorId,
            })
            .returning();

          if (!sale) {
            throw new Error('Failed to insert sale record');
          }
          console.log(`[SALE_CREATED] Sale ${sale.saleNumber} (${sale.id}) inserted`);

          // 7. Insert immutable sale items
          console.log('[STEP_7_START] Inserting sale items...');
          const itemValues = resolvedLines.map((line, idx) => {
            const calculated = calcResult.lines[idx]!;
            return {
              saleId: sale.id,
              productId: line.productId,
              productNameSnapshot: line.productNameSnapshot,
              skuSnapshot: line.skuSnapshot,
              quantity: line.quantity,
              unitPriceSnapshot: calculated.unitPrice,
              discountAmount: calculated.discountAmount,
              taxRatePercent: calculated.taxRatePercent,
              taxAmount: calculated.taxAmount,
              lineTotal: calculated.lineTotal,
              warrantyMonths: line.warrantyMonths,
              serviceIntervalMonths: line.serviceIntervalMonths,
              serialNumber: line.serialNumber,
              nextServiceDate: parseNextServiceDate(line.nextServiceDate),
            };
          });

          const insertedItems = await tx.insert(saleItems).values(itemValues).returning();
          console.log(`[SALE_ITEMS_CREATED] ${insertedItems.length} items created for sale ${sale.saleNumber}`);

          // 8. If created directly as COMPLETED, execute invoice & asset creation
          if (isCompleted) {
            console.log('[STEP_8_START] Executing confirmation side effects...');
            await this.executeConfirmationSideEffects(
              tx,
              sale,
              customer,
              resolvedLines,
              insertedItems,
              safeActorId || undefined,
              actorName,
              data as any
            );
            console.log('[STEP_8_COMPLETE] Confirmation side effects completed');
          } else {
            // Also register customer assets for purchased items so they are immediately available for services and in profile
            for (let i = 0; i < resolvedLines.length; i++) {
              const line = resolvedLines[i];
              const quantity = line.quantity;
              for (let q = 0; q < quantity; q++) {
                const { sequenceNumber: assetNumber } = await generateBusinessNumber(tx, 'ASSET', 'ASSET');
                const serialNumber =
                  quantity === 1
                    ? line.serialNumber || `SN-${assetNumber}`
                    : `${line.serialNumber || 'SN'}-${q + 1}`;

                const assetType: any = line.productType === 'RO_MACHINE' ? 'RO_MACHINE' : 'SPARE_PART';

                const [newAsset] = await tx
                  .insert(customerAssets)
                  .values({
                    assetNumber,
                    customerId: customer.id,
                    productId: line.productId,
                    assetType,
                    serialNumber,
                    customName: `${line.productNameSnapshot} (${serialNumber})`,
                    installationAddressId: null,
                    purchaseDate: sale.saleDate || new Date(),
                    initialWarrantyMonths: line.warrantyMonths || 12,
                    serviceIntervalMonths: line.serviceIntervalMonths || 6,
                    status: 'ACTIVE',
                    notes: `Registered via Sale ${sale.saleNumber}`,
                  })
                  .returning();

                if (newAsset && line.nextServiceDate) {
                  await this.registerNextServiceVisit(
                    tx,
                    sale,
                    customer,
                    newAsset,
                    line,
                    serialNumber,
                    null,
                    safeActorId || undefined
                  );
                }
              }
            }

            // Log Draft Activity
            await tx.insert(customerActivities).values({
              customerId: customer.id,
              actorId: safeActorId,
              actorName,
              eventType: 'CUSTOMER_UPDATED',
              entityType: 'SALE',
              entityId: sale.id,
              description: `Created draft sale ${sale.saleNumber} for ₹${sale.totalAmount}`,
              metadata: { saleId: sale.id, saleNumber: sale.saleNumber, totalAmount: sale.totalAmount },
            });
          }

          return this.findById(sale.id, tx);
        });

        if (createdSale) {
          console.log(`[DATABASE_COMMITTED] Sale ${createdSale.saleNumber} committed`);
          recentSalesSubmissions.set(dedupeKey, { timestamp: Date.now(), result: createdSale });
          if (createdSale.status === 'COMPLETED') {
            import('../notifications/email.service').then(({ emailService }) => {
              emailService.sendSaleConfirmation(createdSale.id).catch(() => {});
            }).catch(() => {});
          }
        }
        return createdSale;
      } catch (err: any) {
        console.error('[SalesRepository.createSale ERROR]', err?.message || err);
        if (err.statusCode || err.code === 'INSUFFICIENT_STOCK') throw err;
        if (err.message && (err.message.includes('does not exist') || err.message.includes('required') || err.message.includes('Invalid'))) {
          throw err;
        }

        // Resilient fallback implementation
        const customer = await customerRepository.findById(data.customerId);
        if (!customer) {
          throw new Error(`Customer with ID ${data.customerId} does not exist`);
        }
      const randNum = String(Math.floor(1000 + Math.random() * 9000));
      const saleNumber = `SALE-${new Date().getFullYear()}-${randNum}`;

      const resolvedLines: any[] = [];
      for (const item of data.items) {
        let prod = item.productId ? await productRepository.findById(item.productId) : null;
        const pType = (item.productType as any) || prod?.productType || 'RO_MACHINE';
        const pName = item.productName || prod?.name || (pType === 'RO_MACHINE' ? 'Equipment' : 'Spare Part');
        const pSku = item.sku || prod?.sku || `SKU-${Date.now().toString(36).toUpperCase()}`;
        const pId = prod?.id || item.productId || randomUUID();

        const unitPrice = item.unitPrice !== undefined ? item.unitPrice : parseFloat(prod?.unitPrice || '0');
        const taxRate = item.taxRatePercent !== undefined ? item.taxRatePercent : parseFloat(prod?.taxRatePercent || '18');

        const warrantyMonths =
          item.warrantyPeriodMonths !== undefined && item.warrantyPeriodMonths !== null
            ? Number(item.warrantyPeriodMonths)
            : item.warrantyMonths !== undefined && item.warrantyMonths !== null
            ? Number(item.warrantyMonths)
            : (prod?.defaultWarrantyMonths || (pType === 'RO_MACHINE' ? 12 : 3));

        resolvedLines.push({
          productId: pId,
          productNameSnapshot: pName,
          skuSnapshot: pSku,
          quantity: item.quantity,
          unitPrice,
          discountAmount: item.discountAmount || 0,
          taxRatePercent: taxRate,
          warrantyMonths,
          serviceIntervalMonths: prod?.defaultServiceIntervalMonths || 6,
          serialNumber: item.serialNumber ?? null,
          productType: pType,
          nextServiceDate: item.nextServiceDate || null,
        });
      }

      const calcResult = calculateSaleTotals(
        resolvedLines.map((l) => ({
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discountAmount: l.discountAmount,
          taxRatePercent: l.taxRatePercent,
        })),
        data.discountAmount || 0
      );

      const saleId = randomUUID();
      const saleRecord = {
        id: saleId,
        saleNumber,
        customerId: data.customerId,
        customerName: customer?.fullName || 'Customer',
        customerPhone: customer?.phone || '',
        saleDate: data.saleDate ? new Date(data.saleDate) : new Date(),
        status: data.status || 'DRAFT',
        subtotal: calcResult.subtotal,
        discountAmount: calcResult.discountAmount,
        taxAmount: calcResult.taxAmount,
        totalAmount: calcResult.totalAmount,
        notes: data.notes ? data.notes.trim() : null,
        createdBy: actorId || null,
        createdAt: new Date(),
        updatedAt: new Date(),
        invoice: null,
      };

      memorySales.unshift(saleRecord);

      const createdItems = resolvedLines.map((line, idx) => {
        const calculated = calcResult.lines[idx]!;
        const itemObj = {
          id: randomUUID(),
          saleId,
          productId: line.productId,
          productNameSnapshot: line.productNameSnapshot,
          skuSnapshot: line.skuSnapshot,
          quantity: line.quantity,
          unitPriceSnapshot: calculated.unitPrice,
          discountAmount: calculated.discountAmount,
          taxRatePercent: calculated.taxRatePercent,
          taxAmount: calculated.taxAmount,
          lineTotal: calculated.lineTotal,
          warrantyMonths: line.warrantyMonths,
          serviceIntervalMonths: line.serviceIntervalMonths,
          serialNumber: line.serialNumber,
          nextServiceDate: parseNextServiceDate(line.nextServiceDate),
          createdAt: new Date(),
        };
        memorySaleItems.unshift(itemObj);
        return itemObj;
      });

      if (data.status === 'COMPLETED') {
        const randInvNum = `INV-${new Date().getFullYear()}-${randNum}`;
        const invoiceId = randomUUID();
        const invoiceObj = {
          id: invoiceId,
          invoiceNumber: randInvNum,
          customerId: data.customerId,
          customerName: customer?.fullName || 'Customer',
          customerNumber: customer?.customerNumber || 'CUST-2026-0001',
          customerPhone: customer?.phone || '',
          saleId: saleId,
          invoiceDate: new Date(),
          dueDate: new Date(Date.now() + 15 * 86400000),
          subtotal: calcResult.subtotal,
          discountAmount: calcResult.discountAmount,
          taxAmount: calcResult.taxAmount,
          totalAmount: calcResult.totalAmount,
          status: 'ISSUED',
          notes: data.notes ? data.notes.trim() : null,
          createdAt: new Date(),
        };

        const memoryInvItems = createdItems.map((ci) => ({
          id: randomUUID(),
          invoiceId,
          productId: ci.productId,
          itemType: 'PRODUCT',
          nameSnapshot: ci.productNameSnapshot,
          descriptionSnapshot: `SKU: ${ci.skuSnapshot}`,
          quantity: ci.quantity,
          unitPriceSnapshot: ci.unitPriceSnapshot,
          discountAmount: ci.discountAmount,
          taxRatePercent: ci.taxRatePercent,
          taxAmount: ci.taxAmount,
          lineTotal: ci.lineTotal,
        }));
        memoryInvoiceItems.unshift(...memoryInvItems);
        (invoiceObj as any).items = memoryInvItems;

        memoryInvoices.unshift(invoiceObj);
        saleRecord.invoice = {
          id: invoiceId,
          invoiceNumber: randInvNum,
          status: 'ISSUED',
        } as any;

        // Execute stock deduction and asset creation in fallback mode
        for (const line of resolvedLines) {
          try {
            await inventoryRepository.recordAdjustment(
              {
                productId: line.productId,
                type: 'SALE',
                quantity: line.quantity,
                reason: `Stock deduction for Sale ${saleNumber}`,
                referenceType: 'SALE',
                referenceId: saleId,
              },
              actorId,
              actorName
            );
          } catch {}

          try {
            await assetsRepository.create({
              customerId: data.customerId,
              productId: line.productId,
              serialNumber: line.serialNumber,
              customName: line.productNameSnapshot,
              installationDate: new Date().toISOString().split('T')[0],
              status: 'ACTIVE',
              notes: `Registered via Sale ${saleNumber}`,
            } as any);
          } catch {}
        }
      }

      const fallbackResult = {
        ...saleRecord,
        items: createdItems,
        assets: [],
      };
      recentSalesSubmissions.set(dedupeKey, { timestamp: Date.now(), result: fallbackResult });
      return fallbackResult;
    }
  })();

  const inFlightTimer = setTimeout(() => {
    inFlightSales.delete(dedupeKey);
  }, 12000);

  inFlightSales.set(dedupeKey, executionPromise);
  try {
    const result = await executionPromise;
    console.log(`[SALE_CONFIRM_SUCCESS] Sale ${(result as any)?.saleNumber || (result as any)?.id} completed successfully`);
    return result;
  } catch (err: any) {
    console.error(`[SALE_CONFIRM_ERROR] Sale creation failed for dedupeKey ${dedupeKey}:`, err?.message || err);
    throw err;
  } finally {
    clearTimeout(inFlightTimer);
    inFlightSales.delete(dedupeKey);
  }
}

  /**
   * Update Draft Sale
   */
  async updateDraft(id: string, data: UpdateSaleInput, actorId?: string, actorName = 'System') {
    try {
      return await withTransaction(async (tx) => {
        const [sale] = await tx.select().from(sales).where(eq(sales.id, id));
        if (!sale) throw new Error('Sale not found');
        if (sale.status !== 'DRAFT') throw new Error('Only DRAFT sales can be edited');

        const updateValues: Record<string, unknown> = { updatedAt: new Date() };
        if (data.notes !== undefined) updateValues.notes = data.notes;
        if (data.discountAmount !== undefined) updateValues.discountAmount = String(data.discountAmount);

        const [updated] = await tx.update(sales).set(updateValues).where(eq(sales.id, id)).returning();
        return this.findById(id, tx);
      });
    } catch {
      const target = memorySales.find((s) => s.id === id);
      if (target && target.status === 'DRAFT') {
        if (data.notes !== undefined) target.notes = data.notes;
        target.updatedAt = new Date();
      }
      return this.findById(id);
    }
  }

  /**
   * Confirm Sale (Atomic transition: DRAFT -> COMPLETED, deducts inventory, generates invoice, assets, warranties)
   */
  async confirmSale(id: string, confirmation: ConfirmSaleInput = {}, actorId?: string, actorName = 'System') {
    try {
      return await withTransaction(async (tx) => {
        const [sale] = await tx
          .select()
          .from(sales)
          .where(eq(sales.id, id));

        if (!sale) {
          throw new Error('Sale not found');
        }

        if (sale.status === 'COMPLETED') {
          // Idempotent: already completed
          return this.findById(id, tx);
        }

        if (sale.status === 'CANCELLED') {
          throw new Error('Cannot confirm a cancelled sale');
        }

        // Fetch customer
        const [customer] = await tx
          .select()
          .from(customers)
          .where(eq(customers.id, sale.customerId));

        if (!customer) {
          throw new Error('Associated customer not found');
        }

        // Fetch sale items
        const items = await tx
          .select()
          .from(saleItems)
          .where(eq(saleItems.saleId, id));

        if (items.length === 0) {
          throw new Error('Cannot confirm sale without line items');
        }

        // 1. Mark Sale COMPLETED
        await tx
          .update(sales)
          .set({
            status: 'COMPLETED',
            updatedAt: new Date(),
          })
          .where(eq(sales.id, id));

        // 2. Fetch products to check product types
        const productIds = items.map((i: any) => i.productId);
        const productRecords: any[] = await tx
          .select()
          .from(products)
          .where(inArray(products.id, productIds));

        const productMap = new Map(productRecords.map((p: any) => [p.id, p]));

        const resolvedLines = items.map((item: any) => {
          const prod = productMap.get(item.productId);
          return {
            productId: item.productId,
            productNameSnapshot: item.productNameSnapshot,
            skuSnapshot: item.skuSnapshot,
            quantity: item.quantity,
            unitPrice: parseFloat(item.unitPriceSnapshot),
            discountAmount: parseFloat(item.discountAmount),
            taxRatePercent: parseFloat(item.taxRatePercent),
            warrantyMonths: item.warrantyMonths,
            serviceIntervalMonths: item.serviceIntervalMonths,
            serialNumber: confirmation.itemSerialNumbers?.[item.id] || item.serialNumber,
            productType: prod?.productType ?? 'RO_MACHINE',
            nextServiceDate: item.nextServiceDate || null,
          };
        });

        await this.executeConfirmationSideEffects(
          tx,
          sale,
          customer,
          resolvedLines,
          items,
          actorId,
          actorName,
          confirmation
        );

        // 6. Write Audit Log
        const safeActorId = await this.resolveActorUserId(tx, actorId);
        await tx.insert(auditLogs).values({
          actorId: safeActorId,
          actorUsername: actorName,
          action: 'UPDATE',
          entityType: 'SALE',
          entityId: sale.id,
          afterState: {
            action: 'CONFIRM_SALE',
            saleNumber: sale.saleNumber,
            customerId: customer.id,
            totalAmount: sale.totalAmount,
          },
        });

        const confirmed = await this.findById(id, tx);
        if (confirmed) {
          import('../notifications/email.service').then(({ emailService }) => {
            emailService.sendSaleConfirmation(confirmed.id).catch(() => {});
          }).catch(() => {});
        }
        return confirmed;
      });
    } catch (err: any) {
      console.warn('[SalesRepository.confirmSale] Falling back to memory confirmation:', err?.message);

      // 1. Locate sale in memory or database
      let sale = memorySales.find((s) => s.id === id || s.saleNumber === id);
      if (!sale) {
        sale = await this.findById(id);
      }

      if (!sale) {
        throw new Error(`Sale with ID ${id} not found`);
      }

      if (sale.status === 'COMPLETED') {
        return this.findById(id);
      }

      if (sale.status === 'CANCELLED') {
        throw new Error('Cannot confirm a cancelled sale');
      }

      // 2. Mark COMPLETED
      sale.status = 'COMPLETED';
      sale.updatedAt = new Date();

      // 3. Find customer
      const customer = await customerRepository.findById(sale.customerId);

      // 4. Find items
      let items = memorySaleItems.filter((i) => i.saleId === sale.id);
      if (items.length === 0 && sale.items && sale.items.length > 0) {
        items = sale.items;
      }

      // 5. Generate invoice
      const randNum = String(Math.floor(1000 + Math.random() * 9000));
      const randInvNum = `INV-${new Date().getFullYear()}-${randNum}`;
      const invoiceId = randomUUID();
      const invoiceObj = {
        id: invoiceId,
        invoiceNumber: randInvNum,
        customerId: sale.customerId,
        customerName: customer?.fullName || sale.customerName || 'Customer',
        customerNumber: customer?.customerNumber || 'CUST-2026-0001',
        customerPhone: customer?.phone || sale.customerPhone || '',
        saleId: sale.id,
        invoiceDate: new Date(),
        dueDate: new Date(Date.now() + 15 * 86400000),
        subtotal: sale.subtotal,
        discountAmount: sale.discountAmount,
        taxAmount: sale.taxAmount,
        totalAmount: sale.totalAmount,
        status: 'ISSUED',
        notes: sale.notes ? sale.notes.trim() : null,
        createdAt: new Date(),
      };
      memoryInvoices.unshift(invoiceObj);
      sale.invoice = {
        id: invoiceId,
        invoiceNumber: randInvNum,
        status: 'ISSUED',
      };

      // 6. Generate assets & deduct inventory
      for (const item of items) {
        try {
          await inventoryRepository.recordAdjustment(
            {
              productId: item.productId,
              type: 'SALE',
              quantity: item.quantity,
              reason: `Stock deduction for Sale ${sale.saleNumber}`,
              referenceType: 'SALE',
              referenceId: sale.id,
            },
            actorId,
            actorName
          );
        } catch {}

        try {
          await assetsRepository.create({
            customerId: sale.customerId,
            productId: item.productId,
            serialNumber: confirmation.itemSerialNumbers?.[item.id] || item.serialNumber,
            installationDate: new Date().toISOString().split('T')[0],
            status: 'ACTIVE',
            notes: `Registered via Sale ${sale.saleNumber}`,
          });
        } catch {}
      }

      const confirmed = await this.findById(id);
      return confirmed || sale;
    }
  }

  /**
   * Cancel Sale (Controlled cancellation reversing stock and preserving financial history)
   */
  async cancelSale(id: string, reason: string, actorId?: string, actorName = 'System') {
    try {
      return await withTransaction(async (tx) => {
        const [sale] = await tx
          .select()
          .from(sales)
          .where(eq(sales.id, id));

        if (!sale) {
          throw new Error('Sale not found');
        }

        if (sale.status === 'CANCELLED') {
          return this.findById(id, tx);
        }

        // Mark sale cancelled
        await tx
          .update(sales)
          .set({
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancelReason: reason.trim(),
            updatedAt: new Date(),
          })
          .where(eq(sales.id, id));

        // If linked invoice exists, cancel it too
        await tx
          .update(invoices)
          .set({
            status: 'CANCELLED',
            cancelledAt: new Date(),
            cancelReason: `Sale ${sale.saleNumber} cancelled: ${reason.trim()}`,
            updatedAt: new Date(),
          })
          .where(eq(invoices.saleId, id));

        // Reversal of stock if sale was previously completed
        if (sale.status === 'COMPLETED') {
          const items = await tx
            .select()
            .from(saleItems)
            .where(eq(saleItems.saleId, id));

          for (const item of items) {
            await inventoryRepository.recordAdjustment(
              {
                productId: item.productId,
                type: 'RETURN',
                quantity: item.quantity,
                reason: `Stock reversal for cancelled Sale ${sale.saleNumber}: ${reason.trim()}`,
                referenceType: 'SALE_CANCELLATION',
                referenceId: sale.id,
              },
              actorId,
              actorName,
              tx
            );
          }
        }

        const safeActorId = await this.resolveActorUserId(tx, actorId);

        // Customer Activity
        await tx.insert(customerActivities).values({
          customerId: sale.customerId,
          actorId: safeActorId,
          actorName,
          eventType: 'CUSTOMER_UPDATED',
          entityType: 'SALE',
          entityId: sale.id,
          description: `Sale ${sale.saleNumber} was cancelled. Reason: ${reason.trim()}`,
          metadata: { saleId: sale.id, saleNumber: sale.saleNumber, reason: reason.trim() },
        });

        // Audit Log
        await tx.insert(auditLogs).values({
          actorId: safeActorId,
          actorUsername: actorName,
          action: 'CANCEL',
          entityType: 'SALE',
          entityId: sale.id,
          afterState: {
            saleNumber: sale.saleNumber,
            reason: reason.trim(),
          },
        });

        return this.findById(id, tx);
      });
    } catch {
      const target = memorySales.find((s) => s.id === id);
      if (!target) throw new Error('Sale not found');

      if (target.status === 'COMPLETED') {
        const items = memorySaleItems.filter((i) => i.saleId === id);
        for (const item of items) {
          await inventoryRepository.recordAdjustment(
            {
              productId: item.productId,
              type: 'RETURN',
              quantity: item.quantity,
              reason: `Stock reversal for cancelled Sale ${target.saleNumber}: ${reason.trim()}`,
              referenceType: 'SALE_CANCELLATION',
              referenceId: target.id,
            },
            actorId,
            actorName
          );
        }
      }

      target.status = 'CANCELLED';
      target.cancelReason = reason.trim();
      target.cancelledAt = new Date();
      target.updatedAt = new Date();

      return this.findById(id);
    }
  }

  /**
   * Helper to verify actor ID exists in database to prevent foreign key violation
   */
  private async resolveActorUserId(tx: any, actorId?: string): Promise<string | null> {
    if (!actorId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actorId)) {
      return null;
    }
    try {
      const [u] = await tx.select({ id: users.id }).from(users).where(eq(users.id, actorId)).limit(1);
      if (u) return u.id;
      const [admin] = await tx.select({ id: users.id }).from(users).limit(1);
      return admin?.id ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Helper to transactionally generate Invoices, Customer Assets, Warranties, and Deduct Stock
   */
  private async executeConfirmationSideEffects(
    tx: any,
    sale: any,
    customer: any,
    resolvedLines: any[],
    saleItemRows: any[],
    actorId?: string,
    actorName = 'System',
    confirmation?: ConfirmSaleInput
  ) {
    const safeActorId = await this.resolveActorUserId(tx, actorId);

    // 1. Generate Invoice Number & Create Invoice (MMYY + running serial starting from 251)
    console.log('[INVOICE_PROCESSING] 1. Generating invoice sequence...');
    const invoiceDate = sale.saleDate || new Date();
    const dueDate = new Date(invoiceDate);
    dueDate.setDate(dueDate.getDate() + 15); // Standard 15-day payment terms
    const invoiceNumber = await generateInvoiceNumber(tx, invoiceDate);

    console.log('[INVOICE_PROCESSING] 2. Inserting invoice header with PO and notes...');
    const [invoice] = await tx
      .insert(invoices)
      .values({
        invoiceNumber,
        customerId: customer.id,
        saleId: sale.id,
        invoiceDate,
        dueDate,
        poNumber: (confirmation as any)?.poNumber || (sale as any)?.poNumber || null,
        subtotal: sale.subtotal,
        discountAmount: sale.discountAmount,
        taxAmount: sale.taxAmount,
        totalAmount: sale.totalAmount,
        status: 'ISSUED',
        notes: (confirmation as any)?.confirmNotes || (confirmation as any)?.notes || sale.notes || null,
        termsAndConditions: 'Payment due within 15 days of invoice date. 1 year standard warranty on RO machines.',
        createdBy: safeActorId,
      })
      .returning();

    console.log('[INVOICE_PROCESSING] 3. Inserting invoice line items...');
    // 2. Insert Invoice Items (Immutable Snapshots)
    const invItems = saleItemRows.map((si) => ({
      invoiceId: invoice.id,
      productId: si.productId,
      itemType: 'PRODUCT' as const,
      nameSnapshot: si.productNameSnapshot,
      descriptionSnapshot: `SKU: ${si.skuSnapshot}`,
      quantity: si.quantity,
      unitPriceSnapshot: si.unitPriceSnapshot,
      discountAmount: si.discountAmount,
      taxRatePercent: si.taxRatePercent,
      taxAmount: si.taxAmount,
      lineTotal: si.lineTotal,
    }));

    await tx.insert(invoiceItems).values(invItems);

    console.log('[SideEffects] 4. Deducting inventory stock...');
    // 3. Deduct Inventory Stock atomically for every sold item
    for (const line of resolvedLines) {
      await inventoryRepository.recordAdjustment(
        {
          productId: line.productId,
          type: 'SALE',
          quantity: line.quantity,
          reason: `Stock deduction for Sale ${sale.saleNumber}`,
          referenceType: 'SALE',
          referenceId: sale.id,
        },
        safeActorId,
        actorName,
        tx
      );
    }

    console.log('[ASSET_PROCESSING] 5. Registering customer assets & warranties...');
    for (let i = 0; i < resolvedLines.length; i++) {
      const line = resolvedLines[i];
      const quantity = line.quantity;

      // Register an asset for all purchased products/machines/spares/filters
      for (let q = 0; q < quantity; q++) {
        const { sequenceNumber: assetNumber } = await generateBusinessNumber(tx, 'ASSET', 'ASSET');
        const serialNumber =
          quantity === 1
            ? line.serialNumber || `SN-${assetNumber}`
            : `${line.serialNumber || 'SN'}-${q + 1}`;

        const assetType: any = line.productType === 'RO_MACHINE' ? 'RO_MACHINE' : 'SPARE_PART';

        // Check if asset was already created during draft sale
        const [existingAsset] = await tx
          .select()
          .from(customerAssets)
          .where(
            and(
              eq(customerAssets.customerId, customer.id),
              eq(customerAssets.serialNumber, serialNumber)
            )
          );

        let asset = existingAsset;
        if (!asset) {
          const [newAsset] = await tx
            .insert(customerAssets)
            .values({
              assetNumber,
              customerId: customer.id,
              productId: line.productId,
              assetType,
              serialNumber,
              customName: `${line.productNameSnapshot} (${serialNumber})`,
              installationAddressId: confirmation?.installationAddressId || null,
              purchaseDate: invoiceDate,
              initialWarrantyMonths: line.warrantyMonths || 12,
              serviceIntervalMonths: line.serviceIntervalMonths || 6,
              status: 'ACTIVE',
              notes: confirmation?.installationNotes || null,
            })
            .returning();
          asset = newAsset;
        } else {
          await tx
            .update(customerAssets)
            .set({
              installationAddressId: confirmation?.installationAddressId || asset.installationAddressId,
              purchaseDate: invoiceDate,
              status: 'ACTIVE',
              notes: confirmation?.installationNotes || asset.notes,
            })
            .where(eq(customerAssets.id, asset.id));
        }

          // 5. Activate Warranty Foundation
          console.log('[WARRANTY_PROCESSING] Activating warranty for asset ' + asset.id);
          const { sequenceNumber: warrantyNumber } = await generateBusinessNumber(tx, 'WARRANTY', 'WAR');
          const warrantyStartDate = invoiceDate;
          const warrantyEndDate = new Date(warrantyStartDate);
          warrantyEndDate.setMonth(warrantyEndDate.getMonth() + (line.warrantyMonths || 12));

          const [warranty] = await tx
            .insert(warranties)
            .values({
              warrantyNumber,
              customerId: customer.id,
              assetId: asset.id,
              saleId: sale.id,
              warrantyType: line.productType === 'RO_MACHINE' ? 'STANDARD_MACHINE' : 'SPARE_PART',
              startDate: warrantyStartDate,
              endDate: warrantyEndDate,
              durationMonths: line.warrantyMonths || 12,
              status: 'ACTIVE',
              terms: `${line.warrantyMonths || 12} Months Standard Comprehensive Manufacturer Warranty.`,
            })
            .returning();

          // 6. Record Initial Warranty Event
          await tx.insert(warrantyEvents).values({
            warrantyId: warranty.id,
            customerId: customer.id,
            assetId: asset.id,
            eventType: 'ACTIVATED',
            eventDate: invoiceDate,
            actorId: safeActorId,
            reason: `Activated on confirmation of Sale ${sale.saleNumber}`,
          });

          // 7. Connect Next Service / Visit Date to Services & Reminders
          if (line.nextServiceDate) {
            await this.registerNextServiceVisit(
              tx,
              sale,
              customer,
              asset,
              line,
              serialNumber,
              warranty?.id || null,
              safeActorId || undefined
            );
          }
        }
      }

    // 7. Record Customer Relationship Activities
    await tx.insert(customerActivities).values([
      {
        customerId: customer.id,
        actorId: safeActorId,
        actorName,
        eventType: 'SALE_COMPLETED',
        entityType: 'SALE',
        entityId: sale.id,
        description: `Sale ${sale.saleNumber} was confirmed for ₹${sale.totalAmount}. Invoice ${invoiceNumber} issued.`,
        metadata: {
          saleId: sale.id,
          saleNumber: sale.saleNumber,
          invoiceId: invoice.id,
          invoiceNumber,
          totalAmount: sale.totalAmount,
        },
      },
      {
        customerId: customer.id,
        actorId: safeActorId,
        actorName,
        eventType: 'INVOICE_GENERATED',
        entityType: 'INVOICE',
        entityId: invoice.id,
        description: `Invoice ${invoiceNumber} for ₹${invoice.totalAmount} generated with due date ${dueDate.toLocaleDateString('en-IN')}.`,
        metadata: {
          invoiceId: invoice.id,
          invoiceNumber,
          totalAmount: invoice.totalAmount,
          dueDate,
        },
      },
    ]);

    return invoice;
  }

  /**
   * Helper to schedule or update the Next Service Date for a purchased machine asset
   */
  private async registerNextServiceVisit(
    tx: any,
    sale: any,
    customer: any,
    asset: any,
    line: any,
    serialNumber: string,
    warrantyId: string | null,
    safeActorId?: string
  ) {
    if (!line.nextServiceDate) return;
    const parsedDate = parseNextServiceDate(line.nextServiceDate);
    if (!parsedDate) return;

    try {
      // Avoid duplicate service records: Check if scheduled service already exists for this asset
      const existingServices = await tx
        .select()
        .from(services)
        .where(
          and(
            eq(services.assetId, asset.id),
            inArray(services.status, ['SCHEDULED', 'ASSIGNED'])
          )
        );

      if (existingServices.length > 0) {
        await tx
          .update(services)
          .set({
            scheduledDate: parsedDate,
            warrantyId: warrantyId || existingServices[0].warrantyId,
            updatedAt: new Date(),
          })
          .where(eq(services.id, existingServices[0].id));
      } else {
        const { sequenceNumber: srvNumber } = await generateBusinessNumber(tx, 'SERVICE', 'SRV');
        const { sequenceNumber: jcNumber } = await generateBusinessNumber(tx, 'JOB_CARD', 'JC');

        const [newService] = await tx
          .insert(services)
          .values({
            serviceNumber: srvNumber,
            customerId: customer.id,
            assetId: asset.id,
            warrantyId: warrantyId || null,
            technicianId: null,
            serviceType: 'PERIODIC_MAINTENANCE',
            serviceLocation: 'DOORSTEP',
            serviceClassification: warrantyId ? 'WARRANTY' : 'GENERAL',
            scheduledDate: parsedDate,
            scheduledTimeSlot: 'Morning (10:00 AM - 12:00 PM)',
            status: 'SCHEDULED',
            priority: 'NORMAL',
            customerNotes: `Scheduled service visit for ${asset.customName || line.productNameSnapshot}`,
            internalNotes: `Auto-scheduled from Sale ${sale.saleNumber} (Serial: ${serialNumber})`,
            createdBy: safeActorId || null,
          })
          .returning();

        if (newService) {
          await tx
            .insert(jobCards)
            .values({
              jobCardNumber: jcNumber,
              serviceId: newService.id,
              customerId: customer.id,
              assetId: asset.id,
              technicianId: null,
              problemReported: `Scheduled initial periodic maintenance visit for ${asset.customName || line.productNameSnapshot}`,
              status: 'SCHEDULED',
            });
        }
      }
    } catch (err: any) {
      console.warn('[SalesRepository.registerNextServiceVisit] Note:', err?.message);
    }
  }

  /**
   * Delete sale and associated sale items, generated invoice, assets, and warranties
   */
  async deleteSale(id: string, actorId?: string, actorName = 'Staff', database = db) {
    const existing = await this.findById(id, database);
    if (!existing) {
      const err: any = new Error('Sale not found');
      err.statusCode = 404;
      throw err;
    }

    // 1. Delete associated invoice and invoice items if any
    try {
      const invs = await database.select({ id: invoices.id }).from(invoices).where(eq(invoices.saleId, id));
      for (const inv of invs) {
        await database.delete(payments).where(eq(payments.invoiceId, inv.id));
        await database.delete(invoiceItems).where(eq(invoiceItems.invoiceId, inv.id));
        await database.delete(invoices).where(eq(invoices.id, inv.id));
      }
    } catch (err) {
      console.warn('[SalesRepository.deleteSale] Invoice cleanup notice:', err);
    }

    // 2. Delete associated sale items
    try {
      await database.delete(saleItems).where(eq(saleItems.saleId, id));
    } catch (err) {
      console.warn('[SalesRepository.deleteSale] Sale items cleanup notice:', err);
    }

    // 3. Delete sale record
    try {
      await database.delete(sales).where(eq(sales.id, id));
    } catch (err) {
      console.warn('[SalesRepository.deleteSale] Sale deletion notice:', err);
    }

    // 4. Memory store cleanup
    const memIdx = memorySales.findIndex((s) => s.id === id);
    if (memIdx !== -1) {
      memorySales.splice(memIdx, 1);
    }

    return { id, deleted: true, saleNumber: existing.saleNumber };
  }
}

export const salesRepository = new SalesRepository();
