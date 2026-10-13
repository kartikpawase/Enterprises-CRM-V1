import { eq, and, or, ilike, sql, desc, asc, inArray } from 'drizzle-orm';
import { db } from '../../database/client';
import {
  payments,
  invoices,
  customers,
  users,
  reminders,
  customerActivities,
  auditLogs,
  services,
  jobCards,
  technicians,
} from '../../database/schema/index';
import { cashHandoversRepository } from './cash-handovers.repository';
import { generateBusinessNumber } from '../../database/sequences';
import { withTransaction } from '../../database/transactions';
import { invoicesRepository, memoryInvoices } from '../invoices/invoices.repository';
import { memoryServices } from '../services/services.repository';
import { memoryJobCards } from '../job-cards/job-cards.repository';
import { customerRepository } from '../customers/customer.repository';
import { randomUUID } from 'crypto';
import type {
  PaymentQueryFilter,
  CreatePaymentInput,
  CancelPaymentInput,
  RefundPaymentInput,
} from '@crm/validation';

// Resilient memory store for offline desktop and local development
export const memoryPayments: any[] = [];

export class PaymentsRepository {
  private buildFilterConditions(filters: PaymentQueryFilter, _database = db) {
    const conditions: any[] = [];

    if (filters.status && (filters.status as string) !== 'ALL') {
      conditions.push(eq(payments.status, filters.status as any));
    }

    if (filters.paymentMethod && (filters.paymentMethod as string) !== 'ALL') {
      conditions.push(eq(payments.paymentMethod, filters.paymentMethod as any));
    }

    if (filters.customerId) {
      conditions.push(eq(payments.customerId, filters.customerId));
    }

    if (filters.invoiceId) {
      conditions.push(eq(payments.invoiceId, filters.invoiceId));
    }

    if (filters.dateFrom) {
      conditions.push(sql`${payments.paymentDate} >= ${new Date(filters.dateFrom)}`);
    }

    if (filters.dateTo) {
      conditions.push(sql`${payments.paymentDate} <= ${new Date(filters.dateTo)}`);
    }

    if (filters.minAmount !== undefined) {
      conditions.push(sql`${payments.amount} >= ${filters.minAmount}`);
    }

    if (filters.maxAmount !== undefined) {
      conditions.push(sql`${payments.amount} <= ${filters.maxAmount}`);
    }

    if (filters.search?.trim()) {
      const term = `%${filters.search.trim()}%`;
      conditions.push(
        or(
          ilike(payments.paymentNumber, term),
          ilike(payments.referenceNumber, term),
          ilike(invoices.invoiceNumber, term),
          ilike(customers.fullName, term),
          ilike(customers.phone, term)
        )
      );
    }

    return conditions.length > 0 ? and(...conditions) : undefined;
  }

  /**
   * Find paginated payments with rich joins and multi-criteria filters
   */
  async findPaginated(filters: PaymentQueryFilter, database = db) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 10));
    const offset = (page - 1) * limit;

    try {
      if (filters.status === 'PENDING') {
        // Pending tab: Query all pending payment records + all unpaid & partially paid invoices
        const rawPayments = await database
          .select({
            id: payments.id,
            paymentNumber: payments.paymentNumber,
            amount: payments.amount,
            paymentDate: payments.paymentDate,
            paymentMethod: payments.paymentMethod,
            status: payments.status,
            referenceNumber: payments.referenceNumber,
            notes: payments.notes,
            createdAt: payments.createdAt,
            updatedAt: payments.updatedAt,
            invoiceId: payments.invoiceId,
            invoiceNumber: invoices.invoiceNumber,
            invoiceTotal: invoices.totalAmount,
            invoiceStatus: invoices.status,
            dueDate: invoices.dueDate,
            customerId: payments.customerId,
            customerName: customers.fullName,
            customerPhone: customers.phone,
            customerEmail: customers.email,
            customerNumber: customers.customerNumber,
            receivedById: users.id,
            receivedByName: users.displayName,
          })
          .from(payments)
          .leftJoin(invoices, eq(payments.invoiceId, invoices.id))
          .leftJoin(customers, eq(payments.customerId, customers.id))
          .leftJoin(users, eq(payments.createdBy, users.id))
          .where(eq(payments.status, 'PENDING'));

        const unpaidInvoices = await database
          .select({
            id: invoices.id,
            invoiceNumber: invoices.invoiceNumber,
            invoiceDate: invoices.invoiceDate,
            dueDate: invoices.dueDate,
            subtotal: invoices.subtotal,
            discountAmount: invoices.discountAmount,
            taxAmount: invoices.taxAmount,
            totalAmount: invoices.totalAmount,
            status: invoices.status,
            notes: invoices.notes,
            createdAt: invoices.createdAt,
            updatedAt: invoices.updatedAt,
            customerId: invoices.customerId,
            customerName: customers.fullName,
            customerPhone: customers.phone,
            customerEmail: customers.email,
            customerNumber: customers.customerNumber,
          })
          .from(invoices)
          .leftJoin(customers, eq(invoices.customerId, customers.id))
          .where(
            and(
              inArray(invoices.status, ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE']),
              filters.customerId ? eq(invoices.customerId, filters.customerId) : undefined
            )
          );

        // Get paid amounts for unpaid/partially paid invoices
        const invIds = unpaidInvoices.map((inv) => inv.id);
        const paymentsForInvs =
          invIds.length > 0
            ? await database
                .select({
                  invoiceId: payments.invoiceId,
                  paidSum: sql<string>`COALESCE(SUM(${payments.amount}), 0)`,
                })
                .from(payments)
                .where(
                  and(
                    inArray(payments.invoiceId, invIds),
                    eq(payments.status, 'COMPLETED')
                  )
                )
                .groupBy(payments.invoiceId)
            : [];

        const paidMap = new Map<string, number>();
        for (const p of paymentsForInvs) {
          paidMap.set(p.invoiceId, parseFloat(p.paidSum || '0'));
        }

        const pendingFromInvoices: any[] = [];
        for (const inv of unpaidInvoices) {
          const totalAmt = parseFloat(inv.totalAmount || '0');
          const paidAmt = paidMap.get(inv.id) || 0;
          const outstanding = Math.max(0, totalAmt - paidAmt);

          if (outstanding > 0.001) {
            const isPartial = inv.status === 'PARTIALLY_PAID' || paidAmt > 0.001;
            pendingFromInvoices.push({
              id: `pending-inv-${inv.id}`,
              paymentNumber: `DUE-${inv.invoiceNumber}`,
              amount: outstanding.toFixed(2),
              paymentDate: inv.dueDate ? new Date(inv.dueDate) : (inv.invoiceDate ? new Date(inv.invoiceDate) : new Date(inv.createdAt)),
              paymentMethod: 'PENDING' as any,
              status: isPartial ? 'PARTIALLY_PAID' : 'PENDING',
              referenceNumber: isPartial
                ? `Balance Due (Paid: ₹${paidAmt.toFixed(2)})`
                : `Pending Due: ₹${outstanding.toFixed(2)}`,
              notes: isPartial
                ? `Partially paid: ₹${paidAmt.toFixed(2)} collected of ₹${totalAmt.toFixed(2)} total`
                : (inv.notes || `Pending collection for invoice ${inv.invoiceNumber}`),
              createdAt: inv.createdAt,
              updatedAt: inv.updatedAt,
              invoiceId: inv.id,
              invoiceNumber: inv.invoiceNumber,
              invoiceTotal: inv.totalAmount,
              invoiceStatus: isPartial ? 'PARTIALLY_PAID' : inv.status,
              dueDate: inv.dueDate,
              customerId: inv.customerId,
              customerName: inv.customerName,
              customerPhone: inv.customerPhone,
              customerEmail: inv.customerEmail,
              customerNumber: inv.customerNumber,
              receivedById: null,
              receivedByName: null,
              paidAmount: paidAmt.toFixed(2),
              outstandingAmount: outstanding.toFixed(2),
            });
          }
        }

        // Combine raw pending payments + pending/partially-paid invoices
        let allPending = [...rawPayments, ...pendingFromInvoices];

        // Apply search filter if specified
        if (filters.search?.trim()) {
          const q = filters.search.trim().toLowerCase();
          allPending = allPending.filter(
            (item) =>
              item.paymentNumber?.toLowerCase().includes(q) ||
              item.invoiceNumber?.toLowerCase().includes(q) ||
              item.customerName?.toLowerCase().includes(q) ||
              item.customerPhone?.toLowerCase().includes(q) ||
              item.customerNumber?.toLowerCase().includes(q) ||
              item.referenceNumber?.toLowerCase().includes(q)
          );
        }

        if (filters.paymentMethod && (filters.paymentMethod as string) !== 'ALL') {
          allPending = allPending.filter((item) => item.paymentMethod === filters.paymentMethod);
        }

        if (filters.minAmount !== undefined) {
          allPending = allPending.filter((item) => parseFloat(item.amount) >= filters.minAmount!);
        }

        if (filters.maxAmount !== undefined) {
          allPending = allPending.filter((item) => parseFloat(item.amount) <= filters.maxAmount!);
        }

        allPending.sort((a: any, b: any) => {
          if (filters.sortBy === 'amount') {
            const amountA = Number(a.amount || 0);
            const amountB = Number(b.amount || 0);
            return filters.sortOrder === 'asc' ? amountA - amountB : amountB - amountA;
          }
          if (filters.sortBy === 'paymentDate') {
            const timeA = new Date(a.paymentDate || 0).getTime();
            const timeB = new Date(b.paymentDate || 0).getTime();
            return filters.sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
          }
          const timeA = new Date(a.createdAt || 0).getTime();
          const timeB = new Date(b.createdAt || 0).getTime();
          return filters.sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
        });

        const total = allPending.length;
        const totalPages = Math.ceil(total / limit) || 1;
        const pagedData = allPending.slice(offset, offset + limit);

        return {
          data: pagedData,
          pagination: {
            page,
            limit,
            total,
            totalPages,
          },
        };
      }

      const whereClause = this.buildFilterConditions(filters, database);

      let orderByClauses: any[];
      const sortOrder = filters.sortOrder === 'asc' ? asc : desc;
      switch (filters.sortBy) {
        case 'amount':
          orderByClauses = [sortOrder(payments.amount), desc(payments.paymentNumber), desc(payments.createdAt)];
          break;
        case 'status':
          orderByClauses = [sortOrder(payments.status), desc(payments.paymentNumber), desc(payments.createdAt)];
          break;
        case 'createdAt':
          orderByClauses = [sortOrder(payments.createdAt), desc(payments.paymentNumber)];
          break;
        case 'paymentDate':
          orderByClauses = [sortOrder(payments.paymentDate), desc(payments.paymentNumber), desc(payments.createdAt)];
          break;
        case 'paymentNumber':
        default:
          orderByClauses = [sortOrder(payments.paymentNumber), desc(payments.createdAt)];
          break;
      }

      const allRows = await database
        .select({
          id: payments.id,
          paymentNumber: payments.paymentNumber,
          amount: payments.amount,
          paymentDate: payments.paymentDate,
          paymentMethod: payments.paymentMethod,
          status: payments.status,
          referenceNumber: payments.referenceNumber,
          notes: payments.notes,
          createdAt: payments.createdAt,
          updatedAt: payments.updatedAt,
          invoiceId: payments.invoiceId,
          invoiceNumber: invoices.invoiceNumber,
          invoiceTotal: invoices.totalAmount,
          invoiceStatus: invoices.status,
          dueDate: invoices.dueDate,
          customerId: payments.customerId,
          customerName: customers.fullName,
          customerPhone: customers.phone,
          customerEmail: customers.email,
          customerNumber: customers.customerNumber,
        })
        .from(payments)
        .leftJoin(invoices, eq(payments.invoiceId, invoices.id))
        .leftJoin(customers, eq(payments.customerId, customers.id))
        .where(whereClause)
        .orderBy(...orderByClauses);

      // Ensure natural alphanumeric ordering by paymentNumber when sorted by paymentNumber or default
      allRows.sort((a, b) => {
        if (!filters.sortBy || filters.sortBy === 'paymentNumber') {
          const numA = a.paymentNumber || '';
          const numB = b.paymentNumber || '';
          const comp = numA.localeCompare(numB, undefined, { numeric: true, sensitivity: 'base' });
          return filters.sortOrder === 'asc' ? comp : -comp;
        }
        if (filters.sortBy === 'paymentDate') {
          const timeA = new Date(a.paymentDate || 0).getTime();
          const timeB = new Date(b.paymentDate || 0).getTime();
          if (timeA !== timeB) {
            return filters.sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
          }
          const numA = a.paymentNumber || '';
          const numB = b.paymentNumber || '';
          return -numA.localeCompare(numB, undefined, { numeric: true, sensitivity: 'base' });
        }
        return 0;
      });

      const total = allRows.length;
      const totalPages = Math.ceil(total / limit) || 1;
      const pagedData = allRows.slice(offset, offset + limit);

      return {
        data: pagedData,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      };
    } catch (err) {
      console.error('[PaymentsRepository.findPaginated Error]', err);
      let filtered = [...memoryPayments];
      if (filters.status && (filters.status as string) !== 'ALL') {
        filtered = filtered.filter((p) => p.status === filters.status);
      }
      if (filters.paymentMethod && (filters.paymentMethod as string) !== 'ALL') {
        filtered = filtered.filter((p) => p.paymentMethod === filters.paymentMethod);
      }
      if (filters.customerId) {
        filtered = filtered.filter((p) => p.customerId === filters.customerId);
      }
      if (filters.invoiceId) {
        filtered = filtered.filter((p) => p.invoiceId === filters.invoiceId);
      }
      if (filters.search?.trim()) {
        const q = filters.search.trim().toLowerCase();
        filtered = filtered.filter(
          (p) =>
            p.paymentNumber?.toLowerCase().includes(q) ||
            p.invoiceNumber?.toLowerCase().includes(q) ||
            p.customerName?.toLowerCase().includes(q) ||
            p.customerPhone?.toLowerCase().includes(q)
        );
      }

      const total = filtered.length;
      return {
        data: filtered.slice(offset, offset + limit),
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
   * Find single payment by ID
   */
  async findById(id: string, database = db) {
    try {
      const rows = await database
        .select({
          id: payments.id,
          paymentNumber: payments.paymentNumber,
          amount: payments.amount,
          paymentDate: payments.paymentDate,
          paymentMethod: payments.paymentMethod,
          status: payments.status,
          referenceNumber: payments.referenceNumber,
          notes: payments.notes,
          createdAt: payments.createdAt,
          updatedAt: payments.updatedAt,
          invoiceId: payments.invoiceId,
          invoiceNumber: invoices.invoiceNumber,
          invoiceTotal: invoices.totalAmount,
          invoiceStatus: invoices.status,
          dueDate: invoices.dueDate,
          customerId: payments.customerId,
          customerName: customers.fullName,
          customerPhone: customers.phone,
          customerEmail: customers.email,
          customerNumber: customers.customerNumber,
          receivedById: users.id,
          receivedByName: users.displayName,
        })
        .from(payments)
        .leftJoin(invoices, eq(payments.invoiceId, invoices.id))
        .leftJoin(customers, eq(payments.customerId, customers.id))
        .leftJoin(users, eq(payments.createdBy, users.id))
        .where(eq(payments.id, id))
        .limit(1);

      if (rows[0]) return rows[0];

      const mem = memoryPayments.find((p) => p.id === id);
      return mem || null;
    } catch {
      const mem = memoryPayments.find((p) => p.id === id);
      return mem || null;
    }
  }

  /**
   * Financial KPIs Dashboard (Total Collected, Today's Collected, Receivables, Overdue Count)
   */
  async getKPIs(database = db) {
    try {
      const allPayments = await database.select().from(payments);
      const allInvoices = await database.select().from(invoices);

      const todayStr = new Date().toISOString().split('T')[0];

      let totalCollected = 0;
      let todayCollected = 0;
      let completedPaymentsCount = 0;
      let pendingPaymentsCount = 0;

      for (const p of allPayments) {
        const amt = parseFloat(p.amount || '0');
        if (p.status === 'COMPLETED') {
          totalCollected += amt;
          completedPaymentsCount++;
          const pDateStr = p.paymentDate instanceof Date
            ? p.paymentDate.toISOString().split('T')[0]
            : String(p.paymentDate || '').split('T')[0];
          if (pDateStr === todayStr) {
            todayCollected += amt;
          }
        } else if (p.status === 'PENDING') {
          pendingPaymentsCount++;
        }
      }

      let totalInvoiced = 0;
      let overdueInvoicesCount = 0;
      let pendingInvoicesCount = 0;

      for (const inv of allInvoices) {
        if (inv.status !== 'CANCELLED' && inv.status !== 'DRAFT') {
          totalInvoiced += parseFloat(inv.totalAmount || '0');
        }
        if (inv.status === 'OVERDUE') {
          overdueInvoicesCount++;
        }
        if (['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'].includes(inv.status)) {
          pendingInvoicesCount++;
        }
      }

      const totalOutstanding = Math.max(0, totalInvoiced - totalCollected);

      return {
        totalCollected,
        todayCollected,
        totalInvoiced,
        totalOutstanding,
        completedPaymentsCount,
        pendingPaymentsCount: pendingInvoicesCount + pendingPaymentsCount,
        overdueInvoicesCount,
      };
    } catch {
      let totalCollected = 0;
      let todayCollected = 0;
      let completedPaymentsCount = 0;
      let pendingPaymentsCount = 0;
      const todayStr = new Date().toISOString().split('T')[0];

      for (const p of memoryPayments) {
        if (p.status === 'COMPLETED') {
          const amt = parseFloat(p.amount) || 0;
          totalCollected += amt;
          completedPaymentsCount++;
          if (new Date(p.paymentDate).toISOString().split('T')[0] === todayStr) {
            todayCollected += amt;
          }
        } else if (p.status === 'PENDING') {
          pendingPaymentsCount++;
        }
      }

      let totalInvoiced = 0;
      let overdueCount = 0;
      for (const inv of (memoryInvoices || [])) {
        if (inv.status !== 'CANCELLED' && inv.status !== 'DRAFT') {
          totalInvoiced += parseFloat(inv.totalAmount) || 0;
        }
        if (inv.status === 'OVERDUE' || (new Date(inv.dueDate) < new Date() && parseFloat(inv.outstandingAmount || '0') > 0)) {
          overdueCount++;
        }
      }

      const totalOutstanding = Math.max(0, totalInvoiced - totalCollected);

      return {
        totalCollected,
        todayCollected,
        totalInvoiced,
        totalOutstanding,
        completedPaymentsCount,
        pendingPaymentsCount,
        overdueInvoicesCount: overdueCount,
      };
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
      const [firstUser] = await tx.select({ id: users.id }).from(users).limit(1);
      return firstUser?.id ?? null;
    } catch {
      return null;
    }
  }

  private async executeRecordPayment(executor: any, input: CreatePaymentInput, actorId?: string, actorName = 'System') {
    const safeActorId = await this.resolveActorUserId(executor, actorId);
    // 1. Fetch invoice by ID or invoiceNumber
    let invoice: any = null;
    const isInputIdUuid = typeof input.invoiceId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.invoiceId);

    if (isInputIdUuid) {
      try {
        const [byUuid] = await executor
          .select()
          .from(invoices)
          .where(eq(invoices.id, input.invoiceId));
        if (byUuid) invoice = byUuid;
      } catch {}
    }

    if (!invoice && typeof input.invoiceId === 'string') {
      try {
        const [byNumber] = await executor
          .select()
          .from(invoices)
          .where(eq(invoices.invoiceNumber, input.invoiceId));
        if (byNumber) invoice = byNumber;
      } catch {}
    }

    if (!invoice) {
      const memInv = memoryInvoices.find(
        (i) =>
          i.id === input.invoiceId ||
          i.invoiceNumber === input.invoiceId ||
          i.saleId === input.invoiceId
      );
      if (memInv) {
        invoice = memInv as any;
      }
    }

    if (!invoice) {
      const err: any = new Error(`Invoice with ID ${input.invoiceId} not found`);
      err.statusCode = 404;
      err.code = 'NOT_FOUND';
      throw err;
    }

    if (invoice.status === 'CANCELLED') {
      const err: any = new Error('Cannot record payment for a cancelled invoice');
      err.statusCode = 400;
      err.code = 'CANCELLED_INVOICE';
      throw err;
    }

    if (invoice.status === 'DRAFT') {
      const err: any = new Error('Cannot record payment for an unissued draft invoice');
      err.statusCode = 400;
      err.code = 'DRAFT_INVOICE';
      throw err;
    }

    const invoiceTotal = parseFloat(invoice.totalAmount || '0');
    const customerId = input.customerId || invoice.customerId;

    // 2. Calculate existing valid completed payments from database
    let existingPayments: { amount: string }[] = [];
    const isInvoiceIdUuid = typeof invoice.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invoice.id);

    if (isInvoiceIdUuid) {
      try {
        existingPayments = await executor
          .select({ amount: payments.amount })
          .from(payments)
          .where(
            and(
              eq(payments.invoiceId, invoice.id),
              eq(payments.status, 'COMPLETED')
            )
          );
      } catch {
        existingPayments = memoryPayments
          .filter((p) => p.invoiceId === invoice.id && p.status === 'COMPLETED')
          .map((p) => ({ amount: String(p.amount) }));
      }
    } else {
      existingPayments = memoryPayments
        .filter((p) => p.invoiceId === invoice.id && p.status === 'COMPLETED')
        .map((p) => ({ amount: String(p.amount) }));
    }

    const currentPaid = existingPayments.reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0);
    const currentOutstanding = Math.max(0, Number((invoiceTotal - currentPaid).toFixed(2)));

    // 3. Strict financial validation
    const paymentAmount = Number(input.amount.toFixed(2));
    if (paymentAmount <= 0) {
      const err: any = new Error('Payment amount must be greater than zero');
      err.statusCode = 422;
      throw err;
    }

    // Reject overpayment
    if (paymentAmount > currentOutstanding + 0.001) {
      const err: any = new Error(
        `Payment amount (₹${paymentAmount.toFixed(2)}) exceeds outstanding balance (₹${currentOutstanding.toFixed(2)})`
      );
      err.statusCode = 422;
      err.code = 'PAYMENT_EXCEEDS_OUTSTANDING';
      err.details = { currentOutstanding, requestedAmount: paymentAmount };
      throw err;
    }

    // 4. Generate sequential PAY-YYYY-XXXX number
    let paymentNumber = `PAY-${new Date().getFullYear()}-${String(Date.now() % 10000).padStart(4, '0')}`;
    try {
      const paySeq = await generateBusinessNumber(executor, 'PAYMENT', 'PAY');
      if (paySeq?.sequenceNumber) {
        paymentNumber = paySeq.sequenceNumber;
      }
    } catch {}

    const paymentDate = input.paymentDate ? new Date(input.paymentDate) : new Date();

    // 5. Insert payment record
    let newPayment: any = null;

    if (isInvoiceIdUuid) {
      try {
        const [inserted] = await executor
          .insert(payments)
          .values({
            paymentNumber,
            customerId,
            invoiceId: invoice.id,
            amount: String(paymentAmount),
            paymentDate,
            paymentMethod: input.paymentMethod,
            status: 'COMPLETED',
            referenceNumber: input.referenceNumber || null,
            notes: input.notes || null,
            createdBy: safeActorId,
          })
          .returning();
        newPayment = inserted;
      } catch {
        newPayment = {
          id: randomUUID(),
          paymentNumber,
          customerId,
          invoiceId: invoice.id,
          amount: String(paymentAmount),
          paymentDate,
          paymentMethod: input.paymentMethod,
          status: 'COMPLETED',
          referenceNumber: input.referenceNumber || null,
          notes: input.notes || null,
          createdBy: safeActorId,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
    } else {
      newPayment = {
        id: randomUUID(),
        paymentNumber,
        customerId,
        invoiceId: invoice.id,
        amount: String(paymentAmount),
        paymentDate,
        paymentMethod: input.paymentMethod,
        status: 'COMPLETED',
        referenceNumber: input.referenceNumber || null,
        notes: input.notes || null,
        createdBy: safeActorId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    // 6. Recalculate new total paid and update invoice status
    const newTotalPaid = Number((currentPaid + paymentAmount).toFixed(2));
    const remainingOutstanding = Math.max(0, Number((invoiceTotal - newTotalPaid).toFixed(2)));

    const now = new Date();
    const dueDate = new Date(invoice.dueDate);
    let newInvoiceStatus: any = 'PARTIALLY_PAID';

    if (remainingOutstanding <= 0.001) {
      newInvoiceStatus = 'PAID';
    } else if (newTotalPaid <= 0) {
      newInvoiceStatus = dueDate < now ? 'OVERDUE' : 'ISSUED';
    } else {
      newInvoiceStatus = 'PARTIALLY_PAID';
    }

    const nextDueDateInput = (input as any).nextPaymentDueDate || (input as any).nextPaymentDate;
    const updatedDueDate = nextDueDateInput ? new Date(nextDueDateInput) : invoice.dueDate;

    if (isInvoiceIdUuid) {
      try {
        await executor
          .update(invoices)
          .set({
            status: newInvoiceStatus,
            dueDate: updatedDueDate,
            updatedAt: now,
          })
          .where(eq(invoices.id, invoice.id));
      } catch {}
    }

    // Also sync to memoryInvoices
    const memInv = memoryInvoices.find((i) => i.id === invoice.id);
    if (memInv) {
      memInv.status = newInvoiceStatus;
      memInv.paidAmount = String(newTotalPaid);
      memInv.outstandingAmount = String(remainingOutstanding);
      memInv.dueDate = updatedDueDate;
      memInv.updatedAt = now;
    }

    // 7. Auto-complete related payment follow-up reminders if invoice is fully paid
    if (newInvoiceStatus === 'PAID' && isInvoiceIdUuid) {
      try {
        await executor
          .update(reminders)
          .set({
            status: 'COMPLETED',
            completedBy: safeActorId,
            completedAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(reminders.invoiceId, invoice.id),
              eq(reminders.status, 'PENDING')
            )
          );
      } catch {}
    }

    // 8. Record Customer Activity
    if (isInvoiceIdUuid) {
      try {
        await executor.insert(customerActivities).values({
          customerId,
          actorId: safeActorId,
          actorName,
          eventType: 'PAYMENT_RECEIVED',
          entityType: 'INVOICE',
          entityId: invoice.id,
          description: `Payment of ₹${paymentAmount.toFixed(2)} received via ${input.paymentMethod} (Ref: ${paymentNumber})`,
          metadata: {
            paymentNumber,
            amount: paymentAmount,
            invoiceNumber: invoice.invoiceNumber,
            remainingOutstanding,
            invoiceStatus: newInvoiceStatus,
          },
        });
      } catch {}
    }

    // 9. Audit Log
    if (isInvoiceIdUuid) {
      try {
        await executor.insert(auditLogs).values({
          actorId: safeActorId,
          actorUsername: actorName,
          action: 'CREATE',
          entityType: 'PAYMENT' as any,
          entityId: newPayment.id,
          afterState: newPayment,
        });
      } catch {}
    }

    // Authoritative Cash Handover Tracking:
    // If payment method is CASH and the invoice is associated with a technician or service
    if (newPayment.paymentMethod === 'CASH') {
      try {
        let techId: string | null = null;
        const invServiceId = (invoice as any).serviceId;
        const invJobCardId = (invoice as any).jobCardId;

        const isActorIdUuid = !!(actorId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actorId));
        const isInvServiceIdUuid = !!(invServiceId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invServiceId));
        const isInvJobCardIdUuid = !!(invJobCardId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invJobCardId));

        if (actorId) {
          if (isActorIdUuid && isInvoiceIdUuid) {
            try {
              const [techRow] = await executor
                .select({ id: technicians.id })
                .from(technicians)
                .where(or(eq(technicians.id, actorId), eq(technicians.userId, actorId)))
                .limit(1);
              if (techRow) {
                techId = techRow.id;
              }
            } catch {}
          }
          if (!techId) {
            techId = actorId;
          }
        }

        if (!techId && invServiceId) {
          if (isInvServiceIdUuid && isInvoiceIdUuid) {
            try {
              const [srvRow] = await executor
                .select({ technicianId: services.technicianId })
                .from(services)
                .where(eq(services.id, invServiceId))
                .limit(1);
              if (srvRow?.technicianId) {
                techId = srvRow.technicianId;
              }
            } catch {}
          }
          if (!techId) {
            const memSrv = memoryServices.find((s) => s.id === invServiceId);
            if (memSrv?.technicianId) {
              techId = memSrv.technicianId;
            }
          }
        }

        if (!techId && invJobCardId) {
          if (isInvJobCardIdUuid && isInvoiceIdUuid) {
            try {
              const [jcRow] = await executor
                .select({ technicianId: jobCards.technicianId })
                .from(jobCards)
                .where(eq(jobCards.id, invJobCardId))
                .limit(1);
              if (jcRow?.technicianId) {
                techId = jcRow.technicianId;
              }
            } catch {}
          }
          if (!techId) {
            const memJc = memoryJobCards.find((j) => j.id === invJobCardId);
            if (memJc?.technicianId) {
              techId = memJc.technicianId;
            }
          }
        }

        if (techId) {
          await cashHandoversRepository.createHandover(
            {
              paymentId: newPayment.id,
              serviceId: invServiceId || null,
              jobCardId: invJobCardId || null,
              technicianId: techId,
              amount: Number(newPayment.amount),
              notes: newPayment.notes,
              collectedAt: newPayment.paymentDate ? new Date(newPayment.paymentDate) : now,
              companyId: (invoice as any).companyId || null,
            },
            isInvoiceIdUuid ? executor : undefined
          );
        }
      } catch (chErr) {
        // Non-blocking cash handover creation
      }
    }

    // Resilient sync to in-memory store
    memoryPayments.unshift({
      id: newPayment.id,
      paymentNumber: newPayment.paymentNumber,
      amount: newPayment.amount,
      paymentDate: newPayment.paymentDate,
      paymentMethod: newPayment.paymentMethod,
      status: newPayment.status,
      referenceNumber: newPayment.referenceNumber,
      notes: newPayment.notes,
      createdAt: newPayment.createdAt,
      updatedAt: newPayment.updatedAt,
      invoiceId: newPayment.invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      invoiceTotal: invoice.totalAmount,
      invoiceStatus: newInvoiceStatus,
      dueDate: updatedDueDate,
      customerId: newPayment.customerId,
      customerName: (invoice as any).customerName || 'Valued Customer',
      customerPhone: (invoice as any).customerPhone || '',
      customerNumber: (invoice as any).customerNumber || '',
      receivedByName: actorName || 'Admin',
    });

    return {
      payment: newPayment,
      invoiceNumber: invoice.invoiceNumber,
      newInvoiceStatus,
      remainingOutstanding,
    };
  }

  /**
   * Record a New Payment with ACID Transaction and Resilient Fallback
   */
  async recordPayment(input: CreatePaymentInput, actorId?: string, actorName = 'System') {
    try {
      return await withTransaction(async (tx) => {
        return await this.executeRecordPayment(tx, input, actorId, actorName);
      });
    } catch (err: any) {
      if (err?.code === 'NOT_FOUND' || err?.code === 'CANCELLED_INVOICE' || err?.code === 'DRAFT_INVOICE' || err?.code === 'PAYMENT_EXCEEDS_OUTSTANDING') {
        throw err;
      }
      return await this.executeRecordPayment(db, input, actorId, actorName);
    }
  }

  /**
   * Cancel / Reverse Payment with Atomic Status Recalculation
   */
  async cancelPayment(id: string, input: CancelPaymentInput, actorId?: string, actorName = 'System') {
    return await withTransaction(async (tx) => {
      const safeActorId = await this.resolveActorUserId(tx, actorId);
      const existing = await this.findById(id, tx as any);
      if (!existing) {
        const err: any = new Error('Payment not found');
        err.statusCode = 404;
        throw err;
      }

      if (existing.status === 'CANCELLED') {
        const err: any = new Error('Payment is already cancelled');
        err.statusCode = 400;
        throw err;
      }

      const now = new Date();

      // 1. Mark payment as CANCELLED
      const [updatedPayment] = await tx
        .update(payments)
        .set({
          status: 'CANCELLED',
          notes: `${existing.notes || ''}\n[Cancellation Reason]: ${input.reason}`.trim(),
          updatedAt: now,
        })
        .where(eq(payments.id, id))
        .returning();

      // 2. Recalculate remaining valid payments for invoice
      const existingPayments = await tx
        .select({ amount: payments.amount })
        .from(payments)
        .where(
          and(
            eq(payments.invoiceId, existing.invoiceId),
            eq(payments.status, 'COMPLETED')
          )
        );

      const validPaid = existingPayments.reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0);
      const invoiceTotal = parseFloat(existing.invoiceTotal || '0');
      const remainingBalance = Math.max(0, invoiceTotal - validPaid);

      const dueDate = new Date(existing.dueDate);
      let targetStatus: any = 'ISSUED';
      if (remainingBalance <= 0) {
        targetStatus = 'PAID';
      } else if (validPaid > 0) {
        targetStatus = 'PARTIALLY_PAID';
      } else {
        targetStatus = dueDate < now ? 'OVERDUE' : 'ISSUED';
      }

      // Update Invoice
      await tx
        .update(invoices)
        .set({
          status: targetStatus,
          updatedAt: now,
        })
        .where(eq(invoices.id, existing.invoiceId));

      // Customer Activity
      try {
        await tx.insert(customerActivities).values({
          customerId: existing.customerId,
          actorId: safeActorId,
          actorName,
          eventType: 'PAYMENT_CANCELLED',
          entityType: 'INVOICE',
          entityId: existing.invoiceId,
          description: `Payment ${existing.paymentNumber} of ₹${parseFloat(existing.amount).toFixed(2)} cancelled. Reason: ${input.reason}`,
          metadata: {
            paymentNumber: existing.paymentNumber,
            cancelledAmount: existing.amount,
            newInvoiceStatus: targetStatus,
          },
        });
      } catch {}

      // Audit Log
      try {
        await tx.insert(auditLogs).values({
          actorId: safeActorId,
          actorUsername: actorName,
          action: 'CANCEL',
          entityType: 'PAYMENT' as any,
          entityId: id,
          beforeState: { status: existing.status },
          afterState: { status: 'CANCELLED', reason: input.reason },
        });
      } catch {}

      return {
        payment: updatedPayment,
        newInvoiceStatus: targetStatus,
        remainingBalance,
      };
    });
  }

  /**
   * Refund Payment (Atomic Status Recalculation)
   */
  async refundPayment(id: string, input: RefundPaymentInput, actorId?: string, actorName = 'System') {
    return await withTransaction(async (tx) => {
      const safeActorId = await this.resolveActorUserId(tx, actorId);
      const existing = await this.findById(id, tx as any);
      if (!existing) {
        const err: any = new Error('Payment not found');
        err.statusCode = 404;
        throw err;
      }

      if (existing.status === 'REFUNDED' || existing.status === 'CANCELLED') {
        const err: any = new Error(`Cannot refund a payment with status "${existing.status}"`);
        err.statusCode = 400;
        throw err;
      }

      const now = new Date();

      const [refunded] = await tx
        .update(payments)
        .set({
          status: 'REFUNDED',
          notes: `${existing.notes || ''}\n[Refund Reason]: ${input.reason}`.trim(),
          updatedAt: now,
        })
        .where(eq(payments.id, id))
        .returning();

      // Recalculate invoice status
      const existingPayments = await tx
        .select({ amount: payments.amount })
        .from(payments)
        .where(
          and(
            eq(payments.invoiceId, existing.invoiceId),
            eq(payments.status, 'COMPLETED')
          )
        );

      const validPaid = existingPayments.reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0);
      const invoiceTotal = parseFloat(existing.invoiceTotal || '0');
      const remainingBalance = Math.max(0, invoiceTotal - validPaid);

      const dueDate = new Date(existing.dueDate);
      let targetStatus: any = 'ISSUED';
      if (remainingBalance <= 0) {
        targetStatus = 'PAID';
      } else if (validPaid > 0) {
        targetStatus = 'PARTIALLY_PAID';
      } else {
        targetStatus = dueDate < now ? 'OVERDUE' : 'ISSUED';
      }

      await tx
        .update(invoices)
        .set({
          status: targetStatus,
          updatedAt: now,
        })
        .where(eq(invoices.id, existing.invoiceId));

      // Audit Log
      try {
        await tx.insert(auditLogs).values({
          actorId: safeActorId,
          actorUsername: actorName,
          action: 'UPDATE',
          entityType: 'PAYMENT' as any,
          entityId: id,
          beforeState: { status: existing.status },
          afterState: { status: 'REFUNDED', reason: input.reason },
        });
      } catch {}

      return {
        payment: refunded,
        newInvoiceStatus: targetStatus,
        remainingBalance,
      };
    });
  }

  /**
   * Get all payments for a specific invoice
   */
  async getPaymentsByInvoice(invoiceId: string, database = db) {
    return await database
      .select({
        id: payments.id,
        paymentNumber: payments.paymentNumber,
        amount: payments.amount,
        paymentDate: payments.paymentDate,
        paymentMethod: payments.paymentMethod,
        status: payments.status,
        referenceNumber: payments.referenceNumber,
        notes: payments.notes,
        createdAt: payments.createdAt,
        receivedByName: users.displayName,
      })
      .from(payments)
      .leftJoin(users, eq(payments.createdBy, users.id))
      .where(eq(payments.invoiceId, invoiceId))
      .orderBy(desc(payments.paymentDate));
  }

  /**
   * Get authoritative Invoice balance breakdown
   */
  async getInvoiceBalance(invoiceId: string, database = db) {
    const invoice = await invoicesRepository.findById(invoiceId, database);
    if (!invoice) {
      const err: any = new Error('Invoice not found');
      err.statusCode = 404;
      throw err;
    }

    const paymentsList = await this.getPaymentsByInvoice(invoiceId, database);
    const validPayments = paymentsList.filter((p) => p.status === 'COMPLETED');
    const paidAmount = validPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const invoiceTotal = parseFloat(invoice.totalAmount);
    const outstandingAmount = Math.max(0, invoiceTotal - paidAmount);

    const now = new Date();
    const isOverdue = invoice.dueDate ? new Date(invoice.dueDate) < now && outstandingAmount > 0 : false;

    let financialStatus: 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' = 'UNPAID';
    if (outstandingAmount <= 0) {
      financialStatus = 'PAID';
    } else if (isOverdue) {
      financialStatus = 'OVERDUE';
    } else if (paidAmount > 0) {
      financialStatus = 'PARTIALLY_PAID';
    }

    return {
      invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      invoiceTotal: invoiceTotal.toFixed(2),
      paidAmount: paidAmount.toFixed(2),
      outstandingAmount: outstandingAmount.toFixed(2),
      financialStatus,
      status: invoice.status,
      dueDate: invoice.dueDate,
      isOverdue,
      paymentCount: validPayments.length,
    };
  }

  /**
   * Authoritative Customer Financial Summary (Total Billed, Total Paid, Total Outstanding, Overdue)
   */
  async getCustomerFinancialSummary(customerId: string, database = db) {
    try {
      const custInvoices = await database
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.customerId, customerId),
            sql`${invoices.status} != 'CANCELLED'`,
            sql`${invoices.status} != 'DRAFT'`
          )
        );

      const custPayments = await database
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.customerId, customerId),
            eq(payments.status, 'COMPLETED')
          )
        );

      const totalBilled = custInvoices.reduce((sum, inv) => sum + (parseFloat(inv.totalAmount || '0') || 0), 0);
      const totalPaid = custPayments.reduce((sum, p) => sum + (parseFloat(p.amount || '0') || 0), 0);
      const totalOutstanding = Math.max(0, totalBilled - totalPaid);
      const overdueAmount = custInvoices
        .filter((inv) => inv.status === 'OVERDUE')
        .reduce((sum, inv) => sum + (parseFloat(inv.totalAmount || '0') || 0), 0);

      // Fetch recent 10 payments with leftJoin so no payment is omitted
      const recentPayments = await database
        .select({
          id: payments.id,
          paymentNumber: payments.paymentNumber,
          amount: payments.amount,
          paymentDate: payments.paymentDate,
          paymentMethod: payments.paymentMethod,
          status: payments.status,
          invoiceNumber: invoices.invoiceNumber,
        })
        .from(payments)
        .leftJoin(invoices, eq(payments.invoiceId, invoices.id))
        .where(eq(payments.customerId, customerId))
        .orderBy(desc(payments.paymentDate))
        .limit(10);

      return {
        totalBilled,
        totalPaid,
        totalOutstanding,
        overdueAmount,
        recentPayments,
      };
    } catch {
      // Resilient fallback from memory store
      const custInvoices = memoryInvoices.filter(
        (inv) => inv.customerId === customerId && inv.status !== 'CANCELLED' && inv.status !== 'DRAFT'
      );
      const custPayments = memoryPayments.filter(
        (p) => p.customerId === customerId && p.status === 'COMPLETED'
      );

      const totalBilled = custInvoices.reduce((sum, inv) => sum + (parseFloat(inv.totalAmount) || 0), 0);
      const totalPaid = custPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
      const totalOutstanding = Math.max(0, totalBilled - totalPaid);
      const overdueAmount = custInvoices
        .filter((inv) => inv.status === 'OVERDUE')
        .reduce((sum, inv) => sum + (parseFloat(inv.totalAmount) || 0), 0);

      const recentPayments = memoryPayments
        .filter((p) => p.customerId === customerId)
        .sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime())
        .slice(0, 10)
        .map((p) => {
          const inv = memoryInvoices.find((i) => i.id === p.invoiceId);
          return {
            id: p.id,
            paymentNumber: p.paymentNumber,
            amount: p.amount,
            paymentDate: p.paymentDate,
            paymentMethod: p.paymentMethod,
            status: p.status,
            invoiceNumber: inv?.invoiceNumber || p.invoiceNumber || '—',
          };
        });

      return {
        totalBilled,
        totalPaid,
        totalOutstanding,
        overdueAmount,
        recentPayments,
      };
    }
  }
}

export const paymentsRepository = new PaymentsRepository();
