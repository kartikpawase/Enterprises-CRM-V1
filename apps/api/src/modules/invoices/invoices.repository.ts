import { eq, and, or, ilike, sql, desc, asc, inArray } from 'drizzle-orm';
import { db } from '../../database/client';
import {
  invoices,
  invoiceItems,
  customers,
  customerAddresses,
  sales,
  saleItems,
  products,
  payments,
  customerActivities,
  auditLogs,
  users,
} from '../../database/schema/index';
import { withTransaction } from '../../database/transactions';
import { generateBusinessNumber } from '../../database/sequences';
import { configService } from '../system/configuration.service';
import type { InvoiceSettings } from '@crm/types';
import { calculateInvoiceTotals } from './invoices.calculator';
import { generateInvoiceNumber } from './invoices.numbering';
import { customerRepository } from '../customers/customer.repository';
import { productRepository } from '../products/product.repository';
import { randomUUID } from 'crypto';
import type {
  CreateInvoiceInput,
  CreateInvoiceFromSaleInput,
  UpdateInvoiceInput,
  InvoiceQueryFilter,
} from '@crm/validation';

// Resilient memory store for offline desktop and local development
export const memoryInvoices: any[] = [];
export const memoryInvoiceItems: any[] = [];

// Idempotency cache for double-click / rapid retry duplicate save protection (60s window)
const recentInvoiceSubmissions = new Map<string, { timestamp: number; result: any }>();

export class InvoicesRepository {
  /**
   * Find paginated invoices with search, status filters, customer join, and payment reconciliation
   */
  async findPaginated(filters: InvoiceQueryFilter, database = db) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const offset = (page - 1) * limit;

    try {
      const conditions: any[] = [];

      if (filters.status && (filters.status as string) !== 'ALL') {
        conditions.push(eq(invoices.status, filters.status as any));
      }

      if (filters.customerId) {
        conditions.push(eq(invoices.customerId, filters.customerId));
      }

      if (filters.saleId) {
        conditions.push(eq(invoices.saleId, filters.saleId));
      }

      if (filters.startDate) {
        conditions.push(sql`${invoices.invoiceDate} >= ${new Date(filters.startDate)}`);
      }

      if (filters.endDate) {
        conditions.push(sql`${invoices.invoiceDate} <= ${new Date(filters.endDate)}`);
      }

      if (filters.overdueOnly) {
        conditions.push(
          and(
            sql`${invoices.dueDate} < NOW()`,
            or(
              eq(invoices.status, 'ISSUED'),
              eq(invoices.status, 'PARTIALLY_PAID'),
              eq(invoices.status, 'OVERDUE')
            )
          )
        );
      }

      if (filters.search?.trim()) {
        const term = `%${filters.search.trim()}%`;
        conditions.push(
          or(
            ilike(invoices.invoiceNumber, term),
            ilike(customers.fullName, term),
            ilike(customers.phone, term),
            ilike(customers.customerNumber, term),
            ilike(customers.companyName, term),
            ilike(invoices.notes, term),
            sql`${invoices.totalAmount}::text LIKE ${term}`
          )
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      let orderByClauses: any[];
      const sortOrder = filters.sortOrder === 'asc' ? asc : desc;
      switch (filters.sortBy) {
        case 'totalAmount':
          orderByClauses = [sortOrder(invoices.totalAmount), desc(invoices.createdAt)];
          break;
        case 'dueDate':
          orderByClauses = [sortOrder(invoices.dueDate), desc(invoices.createdAt)];
          break;
        case 'invoiceNumber':
          orderByClauses = [sortOrder(invoices.invoiceNumber), desc(invoices.createdAt)];
          break;
        case 'invoiceDate':
        default:
          orderByClauses = [sortOrder(invoices.createdAt), sortOrder(invoices.invoiceDate)];
          break;
      }

      const needsCustomerJoinForCount = Boolean(filters.search?.trim());
      const countQuery = needsCustomerJoinForCount
        ? database
            .select({ count: sql<number>`count(*)::int` })
            .from(invoices)
            .leftJoin(customers, eq(invoices.customerId, customers.id))
            .where(whereClause)
        : database
            .select({ count: sql<number>`count(*)::int` })
            .from(invoices)
            .where(whereClause);

      const rowsQuery = database
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          customerId: invoices.customerId,
          customerName: customers.fullName,
          customerNumber: customers.customerNumber,
          customerPhone: customers.phone,
          customerEmail: customers.email,
          saleId: invoices.saleId,
          invoiceDate: invoices.invoiceDate,
          dueDate: invoices.dueDate,
          subtotal: invoices.subtotal,
          discountAmount: invoices.discountAmount,
          taxAmount: invoices.taxAmount,
          totalAmount: invoices.totalAmount,
          status: invoices.status,
          poNumber: invoices.poNumber,
          notes: invoices.notes,
          createdAt: invoices.createdAt,
          cancelledAt: invoices.cancelledAt,
          cancelReason: invoices.cancelReason,
        })
        .from(invoices)
        .leftJoin(customers, eq(invoices.customerId, customers.id))
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(...orderByClauses);

      // Execute count and paginated rows selection concurrently
      const [[totalRes], rows] = await Promise.all([countQuery, rowsQuery]);
      const total = totalRes?.count ?? 0;

      // Fetch payments for these invoices to calculate real collected and outstanding
      const invoiceIds = rows.map((r) => r.id);
      const paymentRecords =
        invoiceIds.length > 0
          ? await database
              .select({
                invoiceId: payments.invoiceId,
                amount: payments.amount,
              })
              .from(payments)
              .where(
                and(
                  inArray(payments.invoiceId, invoiceIds),
                  eq(payments.status, 'COMPLETED')
                )
              )
          : [];

      const paidMap = new Map<string, number>();
      for (const p of paymentRecords) {
        if (!p.invoiceId) continue;
        const current = paidMap.get(p.invoiceId) || 0;
        paidMap.set(p.invoiceId, current + parseFloat(p.amount));
      }

      const enriched = rows.map((row) => {
        const paid = paidMap.get(row.id) || 0;
        const totalAmount = parseFloat(row.totalAmount);
        const outstanding = Math.max(0, totalAmount - paid);

        let dynamicStatus = row.status;
        if (row.status !== 'CANCELLED' && row.status !== 'DRAFT') {
          if (paid <= 0) {
            dynamicStatus = 'ISSUED';
          } else if (paid > 0 && paid < totalAmount) {
            dynamicStatus = 'PARTIALLY_PAID';
          } else if (paid >= totalAmount) {
            dynamicStatus = 'PAID';
          }
        }

        return {
          ...row,
          status: dynamicStatus,
          paidAmount: paid.toFixed(2),
          outstandingAmount: outstanding.toFixed(2),
        };
      });

      return {
        data: enriched,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch {
      let filtered = [...memoryInvoices];
      if (filters.status && (filters.status as string) !== 'ALL') {
        filtered = filtered.filter((i) => i.status === filters.status);
      }
      if (filters.customerId) {
        filtered = filtered.filter((i) => i.customerId === filters.customerId);
      }
      if (filters.saleId) {
        filtered = filtered.filter((i) => i.saleId === filters.saleId);
      }
      if (filters.search?.trim()) {
        const q = filters.search.trim().toLowerCase();
        filtered = filtered.filter(
          (i) =>
            i.invoiceNumber?.toLowerCase().includes(q) ||
            i.customerName?.toLowerCase().includes(q) ||
            i.customerPhone?.toLowerCase().includes(q) ||
            i.customerNumber?.toLowerCase().includes(q) ||
            i.notes?.toLowerCase().includes(q) ||
            i.totalAmount?.toString().includes(q)
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
   * Find single invoice by ID with items, customer snapshots, addresses, and payment logs
   */
  /**
   * Find single invoice by ID with items, customer snapshots, addresses, and payment logs
   */
  /**
   * Find single invoice by ID with items, customer snapshots, addresses, and payment logs
   */
  async findById(id: string, database = db) {
    try {
      if (!id || typeof id !== 'string') return null;
      const cleanId = id.trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);

      let invoice: any = null;

      // 1. If valid UUID, find by invoice.id
      if (isUuid) {
        const [byId] = await database
          .select({
            id: invoices.id,
            invoiceNumber: invoices.invoiceNumber,
            customerId: invoices.customerId,
            customerName: customers.fullName,
            customerNumber: customers.customerNumber,
            customerPhone: customers.phone,
            customerEmail: customers.email,
            customerGst: customers.gstNumber,
            customerType: customers.customerType,
            saleId: invoices.saleId,
            invoiceDate: invoices.invoiceDate,
            dueDate: invoices.dueDate,
            subtotal: invoices.subtotal,
            discountAmount: invoices.discountAmount,
            taxAmount: invoices.taxAmount,
            totalAmount: invoices.totalAmount,
            status: invoices.status,
            poNumber: invoices.poNumber,
            notes: invoices.notes,
            termsAndConditions: invoices.termsAndConditions,
            createdAt: invoices.createdAt,
            updatedAt: invoices.updatedAt,
            cancelledAt: invoices.cancelledAt,
            cancelReason: invoices.cancelReason,
          })
          .from(invoices)
          .leftJoin(customers, eq(invoices.customerId, customers.id))
          .where(eq(invoices.id, cleanId));
        if (byId) invoice = byId;
      }

      // 2. Find by invoiceNumber (e.g. INV-2026-0001)
      if (!invoice) {
        const [byNumber] = await database
          .select({
            id: invoices.id,
            invoiceNumber: invoices.invoiceNumber,
            customerId: invoices.customerId,
            customerName: customers.fullName,
            customerNumber: customers.customerNumber,
            customerPhone: customers.phone,
            customerEmail: customers.email,
            customerGst: customers.gstNumber,
            customerType: customers.customerType,
            saleId: invoices.saleId,
            invoiceDate: invoices.invoiceDate,
            dueDate: invoices.dueDate,
            subtotal: invoices.subtotal,
            discountAmount: invoices.discountAmount,
            taxAmount: invoices.taxAmount,
            totalAmount: invoices.totalAmount,
            status: invoices.status,
            poNumber: invoices.poNumber,
            notes: invoices.notes,
            termsAndConditions: invoices.termsAndConditions,
            createdAt: invoices.createdAt,
            updatedAt: invoices.updatedAt,
            cancelledAt: invoices.cancelledAt,
            cancelReason: invoices.cancelReason,
          })
          .from(invoices)
          .leftJoin(customers, eq(invoices.customerId, customers.id))
          .where(or(eq(invoices.invoiceNumber, cleanId), ilike(invoices.invoiceNumber, cleanId)));
        if (byNumber) invoice = byNumber;
      }

      // 3. If UUID, find by linked sale ID
      if (!invoice && isUuid) {
        const [bySaleId] = await database
          .select({
            id: invoices.id,
            invoiceNumber: invoices.invoiceNumber,
            customerId: invoices.customerId,
            customerName: customers.fullName,
            customerNumber: customers.customerNumber,
            customerPhone: customers.phone,
            customerEmail: customers.email,
            customerGst: customers.gstNumber,
            customerType: customers.customerType,
            saleId: invoices.saleId,
            invoiceDate: invoices.invoiceDate,
            dueDate: invoices.dueDate,
            subtotal: invoices.subtotal,
            discountAmount: invoices.discountAmount,
            taxAmount: invoices.taxAmount,
            totalAmount: invoices.totalAmount,
            status: invoices.status,
            poNumber: invoices.poNumber,
            notes: invoices.notes,
            termsAndConditions: invoices.termsAndConditions,
            createdAt: invoices.createdAt,
            updatedAt: invoices.updatedAt,
            cancelledAt: invoices.cancelledAt,
            cancelReason: invoices.cancelReason,
          })
          .from(invoices)
          .leftJoin(customers, eq(invoices.customerId, customers.id))
          .where(eq(invoices.saleId, cleanId));
        if (bySaleId) invoice = bySaleId;
      }

      // 4. If still not found, check if a sale exists for this ID or saleNumber
      if (!invoice) {
        const [existingSale] = isUuid
          ? await database.select().from(sales).where(eq(sales.id, cleanId))
          : await database.select().from(sales).where(or(eq(sales.saleNumber, cleanId), ilike(sales.saleNumber, cleanId)));

        if (existingSale) {
          // Check if invoice exists for this sale
          const [saleInvoice] = await database
            .select({
              id: invoices.id,
              invoiceNumber: invoices.invoiceNumber,
              customerId: invoices.customerId,
              customerName: customers.fullName,
              customerNumber: customers.customerNumber,
              customerPhone: customers.phone,
              customerEmail: customers.email,
              customerGst: customers.gstNumber,
              customerType: customers.customerType,
              saleId: invoices.saleId,
              invoiceDate: invoices.invoiceDate,
              dueDate: invoices.dueDate,
              subtotal: invoices.subtotal,
              discountAmount: invoices.discountAmount,
              taxAmount: invoices.taxAmount,
              totalAmount: invoices.totalAmount,
              status: invoices.status,
              notes: invoices.notes,
              termsAndConditions: invoices.termsAndConditions,
              createdAt: invoices.createdAt,
              updatedAt: invoices.updatedAt,
              cancelledAt: invoices.cancelledAt,
              cancelReason: invoices.cancelReason,
            })
            .from(invoices)
            .leftJoin(customers, eq(invoices.customerId, customers.id))
            .where(eq(invoices.saleId, existingSale.id));

          if (saleInvoice) {
            invoice = saleInvoice;
          } else {
            const invDate = existingSale.saleDate || new Date();
            const dueDate = new Date(invDate);
            dueDate.setDate(dueDate.getDate() + 15);

            const { sequenceNumber: invoiceNumber } = await generateBusinessNumber(database as any, 'INVOICE', 'INV');

            const [createdInv] = await database
              .insert(invoices)
              .values({
                invoiceNumber,
                customerId: existingSale.customerId,
                saleId: existingSale.id,
                invoiceDate: invDate,
                dueDate,
                subtotal: existingSale.subtotal,
                discountAmount: existingSale.discountAmount,
                taxAmount: existingSale.taxAmount,
                totalAmount: existingSale.totalAmount,
                status: existingSale.status === 'COMPLETED' ? 'ISSUED' : 'DRAFT',
                notes: existingSale.notes,
                termsAndConditions: 'Payment due within 15 days of invoice date. 1 year standard warranty on RO machines.',
              })
              .returning();

            // Copy sale items to invoice items
            const sItems = await database
              .select()
              .from(saleItems)
              .where(eq(saleItems.saleId, existingSale.id));

            if (sItems.length > 0) {
              await database.insert(invoiceItems).values(
                sItems.map((si) => ({
                  invoiceId: createdInv.id,
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
                }))
              );
            }

            const [freshCustomer] = await database
              .select()
              .from(customers)
              .where(eq(customers.id, existingSale.customerId));

            invoice = {
              id: createdInv.id,
              invoiceNumber: createdInv.invoiceNumber,
              customerId: createdInv.customerId,
              customerName: freshCustomer?.fullName || 'Valued Customer',
              customerNumber: freshCustomer?.customerNumber || 'N/A',
              customerPhone: freshCustomer?.phone || '',
              customerEmail: freshCustomer?.email || null,
              customerGst: freshCustomer?.gstNumber || null,
              customerType: freshCustomer?.customerType || 'INDIVIDUAL',
              saleId: createdInv.saleId,
              invoiceDate: createdInv.invoiceDate,
              dueDate: createdInv.dueDate,
              subtotal: createdInv.subtotal,
              discountAmount: createdInv.discountAmount,
              taxAmount: createdInv.taxAmount,
              totalAmount: createdInv.totalAmount,
              status: createdInv.status,
              notes: createdInv.notes,
              termsAndConditions: createdInv.termsAndConditions,
              createdAt: createdInv.createdAt,
              updatedAt: createdInv.updatedAt,
              cancelledAt: createdInv.cancelledAt,
              cancelReason: createdInv.cancelReason,
            };
          }
        }
      }

      if (!invoice) {
        // Resilient memory store fallback
        const mem = memoryInvoices.find((m) => m.id === cleanId || m.invoiceNumber === cleanId || m.saleId === cleanId);
        if (mem) {
          return mem;
        }
        return null;
      }

      // Fetch invoice line items
      const items = await database
        .select()
        .from(invoiceItems)
        .where(eq(invoiceItems.invoiceId, invoice.id));

      // Fetch customer addresses
      const addresses = await database
        .select()
        .from(customerAddresses)
        .where(eq(customerAddresses.customerId, invoice.customerId));

      // Fetch payments
      const paymentsList = await database
        .select()
        .from(payments)
        .where(eq(payments.invoiceId, invoice.id))
        .orderBy(desc(payments.paymentDate));

      const totalPaid = paymentsList
        .filter((p) => p.status === 'COMPLETED')
        .reduce((sum, p) => sum + parseFloat(p.amount), 0);

      const outstandingAmount = Math.max(0, parseFloat(invoice.totalAmount) - totalPaid);

      let dynamicStatus = invoice.status;
      if (invoice.status !== 'CANCELLED' && invoice.status !== 'DRAFT') {
        if (totalPaid <= 0) {
          dynamicStatus = 'ISSUED';
        } else if (totalPaid > 0 && totalPaid < parseFloat(invoice.totalAmount)) {
          dynamicStatus = 'PARTIALLY_PAID';
        } else if (totalPaid >= parseFloat(invoice.totalAmount)) {
          dynamicStatus = 'PAID';
        }
      }

      // Fetch linked sale
      const [sale] = invoice.saleId
        ? await database.select().from(sales).where(eq(sales.id, invoice.saleId))
        : [null];

      let businessDetails: any = null;
      try {
        const { configurationService } = await import('../system/configuration.service');
        const biz: any = await configurationService.getBusinessSettings();
        if (biz) {
          businessDetails = {
            companyName: biz.businessName || biz.legalName || 'Enterprises CRM',
            addressLine1: biz.address || '',
            addressLine2: '',
            city: biz.city || '',
            state: biz.state || '',
            pincode: biz.postalCode || '',
            phone: biz.phone || '',
            email: biz.email || '',
            gstin: biz.gstin || '',
          };
        }
      } catch {}

      return {
        ...invoice,
        status: dynamicStatus,
        items,
        addresses,
        payments: paymentsList,
        paidAmount: totalPaid.toFixed(2),
        outstandingAmount: outstandingAmount.toFixed(2),
        sale: sale ?? null,
        businessDetails,
      };
    } catch (err) {
      console.error('[InvoicesRepository.findById ERROR]', err);
      // Check memory store on database error
      const mem = memoryInvoices.find((m) => m.id === id || m.invoiceNumber === id || m.saleId === id);
      if (mem) {
        const totalPaid = (mem.payments || [])
          .filter((p: any) => p.status === 'COMPLETED')
          .reduce((sum: number, p: any) => sum + parseFloat(p.amount), 0);
        return {
          ...mem,
          items: mem.items || memoryInvoiceItems.filter((i) => i.invoiceId === mem.id) || [],
          addresses: mem.addresses || [],
          payments: mem.payments || [],
          paidAmount: (mem.paidAmount !== undefined ? mem.paidAmount : totalPaid).toString(),
          outstandingAmount: (mem.outstandingAmount !== undefined ? mem.outstandingAmount : Math.max(0, parseFloat(mem.totalAmount) - totalPaid)).toString(),
        };
      }
      return null;
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

  /**
   * Create direct Invoice (DRAFT or ISSUED) with authoritative line calculations
   */
  async createInvoice(data: CreateInvoiceInput, actorId?: string, actorName = 'System') {
    // Double-click / rapid retry deduplication protection
    const dedupeKey = `${data.customerId}_${data.invoiceDate || ''}_${data.poNumber || ''}_${data.notes || ''}_${data.items.length}_${data.items.map(i => `${i.description || (i as any).name}_${i.quantity}_${i.unitPrice}`).join('|')}`;
    const cached = recentInvoiceSubmissions.get(dedupeKey);
    if (cached && Date.now() - cached.timestamp < 15000) {
      return cached.result;
    }

    const invConfig = await configService.get<InvoiceSettings>('INVOICE');
    const paymentTermsDays = invConfig?.paymentTermsDays ?? 15;

    const invoiceDate = data.invoiceDate ? new Date(data.invoiceDate) : new Date();
    const dueDate = data.dueDate
      ? new Date(data.dueDate)
      : new Date(invoiceDate.getTime() + paymentTermsDays * 24 * 60 * 60 * 1000);

    // Validate Due Date cannot be earlier than Invoice Date
    if (new Date(dueDate).setHours(0, 0, 0, 0) < new Date(invoiceDate).setHours(0, 0, 0, 0)) {
      const err: any = new Error('Due Date cannot be before Invoice Date');
      err.statusCode = 400;
      err.code = 'INVALID_DUE_DATE';
      throw err;
    }

    const created = await withTransaction(async (tx) => {
      const validActorId = await this.resolveActorUserId(tx, actorId);
      // 1. Verify customer exists
      const [customer] = await tx
        .select()
        .from(customers)
        .where(eq(customers.id, data.customerId));

      if (!customer) {
        const err: any = new Error(`Customer with ID ${data.customerId} does not exist`);
        err.statusCode = 404;
        throw err;
      }

      // 2. Authoritative line calculations
      const calcResult = calculateInvoiceTotals(
        data.items.map((item) => ({
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount || 0,
          taxRatePercent: item.taxRatePercent ?? 18,
        })),
        data.discountAmount || 0
      );

      // 3. Generate sequential business invoice number in MMYY+serial format (starts from 251)
      const invoiceNumber = await generateInvoiceNumber(tx, invoiceDate);

      const status = data.status || 'ISSUED';

      // 4. Insert Invoice Header
      const [invoice] = await tx
        .insert(invoices)
        .values({
          invoiceNumber,
          customerId: customer.id,
          saleId: data.saleId || null,
          invoiceDate,
          dueDate,
          poNumber: data.poNumber ? data.poNumber.trim() : null,
          subtotal: calcResult.subtotal,
          discountAmount: calcResult.discountAmount,
          taxAmount: calcResult.taxAmount,
          totalAmount: calcResult.totalAmount,
          status,
          notes: data.notes ? data.notes.trim() : (invConfig?.defaultNotes || null),
          termsAndConditions:
            data.termsAndConditions ||
            data.terms ||
            invConfig?.defaultTermsAndConditions ||
            'Payment due within 15 days of invoice date. 1 year standard warranty on RO machines.',
          createdBy: validActorId,
        })
        .returning();

      // 5. Insert Immutable Invoice Items
      const itemRows = data.items.map((item, idx) => {
        const calc = calcResult.lines[idx]!;
        return {
          invoiceId: invoice.id,
          productId: item.productId || null,
          itemType: item.itemType || 'PRODUCT',
          nameSnapshot: item.name || item.description,
          descriptionSnapshot: item.description,
          quantity: item.quantity,
          unitPriceSnapshot: calc.unitPrice,
          discountAmount: calc.discountAmount,
          taxRatePercent: calc.taxRatePercent,
          taxAmount: calc.taxAmount,
          lineTotal: calc.lineTotal,
        };
      });

      await tx.insert(invoiceItems).values(itemRows);

      // 6. Record Customer Activity
      try {
        await tx.insert(customerActivities).values({
          customerId: customer.id,
          actorId: validActorId,
          actorName,
          eventType: 'INVOICE_GENERATED',
          entityType: 'INVOICE',
          entityId: invoice.id,
          description: `Invoice ${invoice.invoiceNumber} for ₹${invoice.totalAmount} was generated.`,
          metadata: {
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            totalAmount: invoice.totalAmount,
            status: invoice.status,
          },
        });
      } catch {}

      // 7. Audit Log
      try {
        await tx.insert(auditLogs).values({
          actorId: validActorId,
          actorUsername: actorName,
          action: 'CREATE',
          entityType: 'INVOICE',
          entityId: invoice.id,
          afterState: {
            invoiceNumber: invoice.invoiceNumber,
            customerId: customer.id,
            totalAmount: invoice.totalAmount,
            status: invoice.status,
          },
        });
      } catch {}

      return this.findById(invoice.id, tx);
    });

    if (created) {
      recentInvoiceSubmissions.set(dedupeKey, { timestamp: Date.now(), result: created });
    }
    return created;
  }

  /**
   * Create authoritative Invoice from existing Sale (with duplicate prevention)
   */
  async createFromSale(saleId: string, options: CreateInvoiceFromSaleInput = {}, actorId?: string, actorName = 'System') {
    return await withTransaction(async (tx) => {
      const validActorId = await this.resolveActorUserId(tx, actorId);
      // 1. Verify sale exists
      const [sale] = await tx
        .select()
        .from(sales)
        .where(eq(sales.id, saleId));

      if (!sale) {
        const err: any = new Error(`Sale with ID ${saleId} not found`);
        err.statusCode = 404;
        err.code = 'NOT_FOUND';
        throw err;
      }

      // 2. Duplicate invoice prevention: Check if active invoice already exists for this sale
      const [existingInvoice] = await tx
        .select()
        .from(invoices)
        .where(and(eq(invoices.saleId, saleId), sql`${invoices.status} != 'CANCELLED'`));

      if (existingInvoice) {
        const err: any = new Error(
          `An active invoice (${existingInvoice.invoiceNumber}) already exists for Sale ${sale.saleNumber}`
        );
        err.statusCode = 409;
        err.code = 'INVOICE_ALREADY_EXISTS';
        err.details = { existingInvoiceId: existingInvoice.id, invoiceNumber: existingInvoice.invoiceNumber };
        throw err;
      }

      // 3. Fetch sale items to create snapshot invoice items
      const sItems = await tx
        .select()
        .from(saleItems)
        .where(eq(saleItems.saleId, saleId));

      if (sItems.length === 0) {
        const err: any = new Error('Cannot create an invoice for a sale without line items');
        err.statusCode = 400;
        err.code = 'EMPTY_SALE_ITEMS';
        throw err;
      }

      // 4. Generate sequential business invoice number in MMYY+serial format (starts from 251)
      const invConfig = await configService.get<InvoiceSettings>('INVOICE');
      const paymentTermsDays = invConfig?.paymentTermsDays ?? 15;
      const invoiceDate = sale.saleDate || new Date();
      const dueDate = options.dueDate
        ? new Date(options.dueDate)
        : new Date(invoiceDate.getTime() + paymentTermsDays * 24 * 60 * 60 * 1000);

      const invoiceNumber = await generateInvoiceNumber(tx, invoiceDate);

      // 5. Insert Invoice Header
      const [invoice] = await tx
        .insert(invoices)
        .values({
          invoiceNumber,
          customerId: sale.customerId,
          saleId: sale.id,
          invoiceDate,
          dueDate,
          poNumber: options.poNumber ? options.poNumber.trim() : null,
          subtotal: sale.subtotal,
          discountAmount: sale.discountAmount,
          taxAmount: sale.taxAmount,
          totalAmount: sale.totalAmount,
          status: 'ISSUED',
          notes: options.notes || sale.notes || invConfig?.defaultNotes || null,
          termsAndConditions:
            options.termsAndConditions ||
            invConfig?.defaultTermsAndConditions ||
            'Payment due within 15 days of invoice date. 1 year standard warranty on RO machines.',
          createdBy: validActorId,
        })
        .returning();

      // 6. Insert Invoice Items Snapshots
      const invItems = sItems.map((si) => ({
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

      // 7. Record Customer Activity
      try {
        await tx.insert(customerActivities).values({
          customerId: sale.customerId,
          actorId: validActorId,
          actorName,
          eventType: 'INVOICE_GENERATED',
          entityType: 'INVOICE',
          entityId: invoice.id,
          description: `Invoice ${invoiceNumber} for ₹${invoice.totalAmount} generated from Sale ${sale.saleNumber}.`,
          metadata: {
            saleId: sale.id,
            saleNumber: sale.saleNumber,
            invoiceId: invoice.id,
            invoiceNumber,
            totalAmount: invoice.totalAmount,
          },
        });
      } catch {}

      // 8. Audit Log
      try {
        await tx.insert(auditLogs).values({
          actorId: validActorId,
          actorUsername: actorName,
          action: 'CREATE',
          entityType: 'INVOICE',
          entityId: invoice.id,
          afterState: {
            saleId: sale.id,
            invoiceNumber: invoice.invoiceNumber,
            totalAmount: invoice.totalAmount,
          },
        });
      } catch {}

      return this.findById(invoice.id, tx);
    });
  }

  /**
   * Update Invoice (Allows updating DRAFT or ISSUED active invoices)
   */
  async updateDraft(id: string, data: UpdateInvoiceInput, actorId?: string, actorName = 'System') {
    return await withTransaction(async (tx) => {
      const validActorId = await this.resolveActorUserId(tx, actorId);
      const [invoice] = await tx
        .select()
        .from(invoices)
        .where(eq(invoices.id, id));

      if (!invoice) {
        const err: any = new Error('Invoice not found');
        err.statusCode = 404;
        throw err;
      }

      if (invoice.status === 'CANCELLED') {
        const err: any = new Error('Cannot edit a cancelled invoice');
        err.statusCode = 400;
        err.code = 'CANCELLED_INVOICE';
        throw err;
      }

      const invDate = data.invoiceDate ? new Date(data.invoiceDate) : new Date(invoice.invoiceDate);
      const dueDate = data.dueDate ? new Date(data.dueDate) : new Date(invoice.dueDate);

      if (new Date(dueDate).setHours(0, 0, 0, 0) < new Date(invDate).setHours(0, 0, 0, 0)) {
        const err: any = new Error('Due Date cannot be before Invoice Date');
        err.statusCode = 400;
        err.code = 'INVALID_DUE_DATE';
        throw err;
      }

      const updateValues: Record<string, unknown> = { updatedAt: new Date() };
      if (data.notes !== undefined) updateValues.notes = data.notes ? data.notes.trim() : null;
      if (data.termsAndConditions !== undefined) updateValues.termsAndConditions = data.termsAndConditions;
      if (data.poNumber !== undefined) updateValues.poNumber = data.poNumber ? data.poNumber.trim() : null;
      if (data.invoiceDate) updateValues.invoiceDate = invDate;
      if (data.dueDate) updateValues.dueDate = dueDate;

      // If items are provided, replace items and recalculate totals (up to 10 items)
      if (data.items && data.items.length > 0) {
        const calcResult = calculateInvoiceTotals(
          data.items.map((item) => ({
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discountAmount: item.discountAmount || 0,
            taxRatePercent: item.taxRatePercent ?? 18,
          })),
          data.discountAmount !== undefined ? data.discountAmount : parseFloat(invoice.discountAmount || '0')
        );

        updateValues.subtotal = calcResult.subtotal;
        updateValues.discountAmount = calcResult.discountAmount;
        updateValues.taxAmount = calcResult.taxAmount;
        updateValues.totalAmount = calcResult.totalAmount;

        // Delete existing items
        await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, invoice.id));

        // Insert updated items
        const itemRows = data.items.map((item, idx) => {
          const calc = calcResult.lines[idx]!;
          return {
            invoiceId: invoice.id,
            productId: item.productId || null,
            itemType: item.itemType || 'PRODUCT',
            nameSnapshot: item.name || item.description,
            descriptionSnapshot: item.description,
            quantity: item.quantity,
            unitPriceSnapshot: calc.unitPrice,
            discountAmount: calc.discountAmount,
            taxRatePercent: calc.taxRatePercent,
            taxAmount: calc.taxAmount,
            lineTotal: calc.lineTotal,
          };
        });
        await tx.insert(invoiceItems).values(itemRows);
      }

      await tx.update(invoices).set(updateValues).where(eq(invoices.id, id));

      // Audit Log
      try {
        await tx.insert(auditLogs).values({
          actorId: validActorId,
          actorUsername: actorName,
          action: 'UPDATE',
          entityType: 'INVOICE',
          entityId: invoice.id,
          afterState: updateValues,
        });
      } catch {}

      return this.findById(id, tx);
    });
  }

  /**
   * Finalize Invoice (DRAFT -> ISSUED)
   */
  async finalize(id: string, notes?: string | null, actorId?: string, actorName = 'System') {
    return await withTransaction(async (tx) => {
      const validActorId = await this.resolveActorUserId(tx, actorId);
      const [invoice] = await tx
        .select()
        .from(invoices)
        .where(eq(invoices.id, id));

      if (!invoice) {
        const err: any = new Error('Invoice not found');
        err.statusCode = 404;
        throw err;
      }

      if (invoice.status === 'ISSUED') {
        // Idempotent: already issued
        return this.findById(id, tx);
      }

      if (invoice.status === 'CANCELLED') {
        const err: any = new Error('Cannot finalize a cancelled invoice');
        err.statusCode = 400;
        err.code = 'INVALID_STATUS_TRANSITION';
        throw err;
      }

      await tx
        .update(invoices)
        .set({
          status: 'ISSUED',
          notes: notes !== undefined ? notes : invoice.notes,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, id));

      // Customer Activity
      try {
        await tx.insert(customerActivities).values({
          customerId: invoice.customerId,
          actorId: validActorId,
          actorName,
          eventType: 'INVOICE_GENERATED',
          entityType: 'INVOICE',
          entityId: invoice.id,
          description: `Invoice ${invoice.invoiceNumber} was finalized and issued.`,
          metadata: {
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            totalAmount: invoice.totalAmount,
          },
        });
      } catch {}

      // Audit Log
      try {
        await tx.insert(auditLogs).values({
          actorId: validActorId,
          actorUsername: actorName,
          action: 'UPDATE',
          entityType: 'INVOICE',
          entityId: invoice.id,
          afterState: {
            action: 'FINALIZE_INVOICE',
            invoiceNumber: invoice.invoiceNumber,
            status: 'ISSUED',
          },
        });
      } catch {}

      return this.findById(id, tx);
    });
  }

  /**
   * Cancel Invoice (Controlled cancellation preserving financial history)
   */
  async cancel(id: string, reason: string, actorId?: string, actorName = 'System') {
    return await withTransaction(async (tx) => {
      const validActorId = await this.resolveActorUserId(tx, actorId);
      const [invoice] = await tx
        .select()
        .from(invoices)
        .where(eq(invoices.id, id));

      if (!invoice) {
        const err: any = new Error('Invoice not found');
        err.statusCode = 404;
        throw err;
      }

      if (invoice.status === 'CANCELLED') {
        return this.findById(id, tx);
      }

      await tx
        .update(invoices)
        .set({
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelReason: reason.trim(),
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, id));

      // Customer Activity
      try {
        await tx.insert(customerActivities).values({
          customerId: invoice.customerId,
          actorId: validActorId,
          actorName,
          eventType: 'CUSTOMER_UPDATED',
          entityType: 'INVOICE',
          entityId: invoice.id,
          description: `Invoice ${invoice.invoiceNumber} was cancelled. Reason: ${reason.trim()}`,
          metadata: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, reason: reason.trim() },
        });
      } catch {}

      // Audit Log
      try {
        await tx.insert(auditLogs).values({
          actorId: validActorId,
          actorUsername: actorName,
          action: 'CANCEL',
          entityType: 'INVOICE',
          entityId: invoice.id,
          afterState: {
            invoiceNumber: invoice.invoiceNumber,
            reason: reason.trim(),
          },
        });
      } catch {}

      return this.findById(id, tx);
    });
  }
}

export const invoicesRepository = new InvoicesRepository();
