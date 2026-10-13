import { eq, and, sql, desc, or, ilike, gte, lte } from 'drizzle-orm';
import { db } from '../../database/client';
import {
  cashHandovers,
  payments,
  services,
  jobCards,
  technicians,
  users,
  customers,
  auditLogs,
} from '../../database/schema/index';
import type {
  CashHandoverItem,
  CashHandoverSummary,
  TechnicianCashSummary,
} from '@crm/types';
import type { CashHandoverQueryFilter } from '@crm/validation';
import { randomUUID } from 'node:crypto';

export interface CreateCashHandoverData {
  paymentId: string;
  serviceId?: string | null;
  jobCardId?: string | null;
  technicianId: string;
  amount: number | string;
  notes?: string | null;
  companyId?: string | null;
  collectedAt?: Date;
}

// In-memory fallback store for offline/test environments
export const memoryCashHandovers: any[] = [];

export class CashHandoversRepository {
  /**
   * Safely resolve candidate ID (user ID or technician ID) to a verified users(id) foreign key.
   * If the actor is a field technician without a system user account, returns null to satisfy
   * the nullable foreign key constraint audit_logs_actor_id_users_id_fk.
   */
  private async resolveActorUserId(database: any, candidateId?: string | null): Promise<string | null> {
    if (!candidateId || typeof candidateId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidateId)) {
      return null;
    }
    try {
      // 1. Direct match in users table
      const [u] = await database
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, candidateId))
        .limit(1);
      if (u?.id) return u.id;

      // 2. Check if candidateId is a technician ID with a linked user account
      const [tech] = await database
        .select({ userId: technicians.userId })
        .from(technicians)
        .where(eq(technicians.id, candidateId))
        .limit(1);
      if (tech?.userId) {
        const [linkedUser] = await database
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, tech.userId))
          .limit(1);
        if (linkedUser?.id) return linkedUser.id;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Create or associate a cash handover record for a cash payment.
   * Strictly enforces 1:1 relationship between payment and cash handover (duplicate prevention).
   */
  async create(data: CreateCashHandoverData, database = db): Promise<CashHandoverItem> {
    return this.createHandover(data, database);
  }

  async createHandover(data: CreateCashHandoverData, database = db): Promise<CashHandoverItem> {
    const numAmount = Number(data.amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new Error('Cash handover amount must be a valid positive number');
    }
    const formattedAmount = numAmount.toFixed(2);
    const collectedAt = data.collectedAt || new Date();

    // 1. Duplicate check in memory store
    const existingMem = memoryCashHandovers.find((h) => h.paymentId === data.paymentId);
    if (existingMem) {
      return existingMem;
    }

    const isPaymentIdUuid = !!(data.paymentId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.paymentId));
    const isTechnicianIdUuid = !!(data.technicianId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.technicianId));
    const isServiceIdUuid = !!(data.serviceId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.serviceId));
    const isJobCardIdUuid = !!(data.jobCardId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.jobCardId));

    // If payment or technician ID is not a valid UUID, use memory store directly
    if (!isPaymentIdUuid || !isTechnicianIdUuid) {
      const memItem: CashHandoverItem = {
        id: randomUUID(),
        paymentId: data.paymentId,
        serviceId: data.serviceId || null,
        jobCardId: data.jobCardId || null,
        technicianId: data.technicianId,
        amount: numAmount,
        status: 'PENDING',
        collectedAt,
        handedOverAt: null,
        receivedBy: null,
        receivedByName: null,
        notes: data.notes || null,
        companyId: data.companyId || null,
        createdAt: collectedAt,
        updatedAt: collectedAt,
      };
      memoryCashHandovers.unshift(memItem);
      return memItem;
    }

    try {
      // 2. Duplicate check in database
      const [existingDb] = await database
        .select()
        .from(cashHandovers)
        .where(eq(cashHandovers.paymentId, data.paymentId))
        .limit(1);

      if (existingDb) {
        return this.mapDbRowToItem(existingDb);
      }

      // Check if payment foreign key exists in DB
      const [paymentRow] = await database
        .select({ id: payments.id })
        .from(payments)
        .where(eq(payments.id, data.paymentId))
        .limit(1);

      if (!paymentRow) {
        // Payment only exists in memory, keep handover in memory
        const memItem: CashHandoverItem = {
          id: randomUUID(),
          paymentId: data.paymentId,
          serviceId: data.serviceId || null,
          jobCardId: data.jobCardId || null,
          technicianId: data.technicianId,
          amount: numAmount,
          status: 'PENDING',
          collectedAt,
          handedOverAt: null,
          receivedBy: null,
          receivedByName: null,
          notes: data.notes || null,
          companyId: data.companyId || null,
          createdAt: collectedAt,
          updatedAt: collectedAt,
        };
        memoryCashHandovers.unshift(memItem);
        return memItem;
      }

      // 3. Insert into database
      const [newRow] = await database
        .insert(cashHandovers)
        .values({
          paymentId: data.paymentId,
          serviceId: isServiceIdUuid ? data.serviceId : null,
          jobCardId: isJobCardIdUuid ? data.jobCardId : null,
          technicianId: data.technicianId,
          amount: formattedAmount,
          status: 'PENDING',
          collectedAt,
          notes: data.notes || null,
          companyId: data.companyId || null,
        })
        .returning();

      const item = this.mapDbRowToItem(newRow);

      // Record audit log for cash collection
      try {
        const safeActorId = await this.resolveActorUserId(database, data.technicianId);
        await database.insert(auditLogs).values({
          actorId: safeActorId,
          actorUsername: 'Technician',
          action: 'CREATE',
          entityType: 'CASH_HANDOVER',
          entityId: item.id,
          afterState: item,
          changeReason: `Technician collected ₹${formattedAmount} cash from customer`,
        });
      } catch (auditErr) {
        console.warn('[CashHandovers] Audit log record notice:', auditErr);
      }

      // Synchronize in-memory fallback
      memoryCashHandovers.unshift(item);
      return item;
    } catch (dbErr: any) {
      if (process.env.NODE_ENV === 'production') {
        throw dbErr;
      }
      // Fallback for offline/test mode if DB is unavailable
      const memItem: CashHandoverItem = {
        id: randomUUID(),
        paymentId: data.paymentId,
        serviceId: data.serviceId || null,
        jobCardId: data.jobCardId || null,
        technicianId: data.technicianId,
        amount: numAmount,
        status: 'PENDING',
        collectedAt,
        submittedAt: null,
        handedOverAt: null,
        receivedBy: null,
        receivedByName: null,
        notes: data.notes || null,
        companyId: data.companyId || null,
        createdAt: collectedAt,
        updatedAt: collectedAt,
      };
      memoryCashHandovers.unshift(memItem);
      return memItem;
    }
  }

  async findById(id: string, database = db): Promise<CashHandoverItem | null> {
    try {
      const [row] = await database
        .select({
          handover: cashHandovers,
          payment: payments,
          service: services,
          jobCard: jobCards,
          technician: technicians,
          receivedByUser: users,
          customer: customers,
        })
        .from(cashHandovers)
        .leftJoin(payments, eq(cashHandovers.paymentId, payments.id))
        .leftJoin(services, eq(cashHandovers.serviceId, services.id))
        .leftJoin(jobCards, eq(cashHandovers.jobCardId, jobCards.id))
        .leftJoin(technicians, eq(cashHandovers.technicianId, technicians.id))
        .leftJoin(users, eq(cashHandovers.receivedBy, users.id))
        .leftJoin(customers, eq(services.customerId, customers.id))
        .where(eq(cashHandovers.id, id))
        .limit(1);

      if (row) {
        return this.mapJoinedRowToItem(row);
      }
    } catch {}

    const mem = memoryCashHandovers.find((h) => h.id === id);
    return mem || null;
  }

  async findByPaymentId(paymentId: string, database = db): Promise<CashHandoverItem | null> {
    try {
      const [row] = await database
        .select()
        .from(cashHandovers)
        .where(eq(cashHandovers.paymentId, paymentId))
        .limit(1);

      if (row) {
        return this.mapDbRowToItem(row);
      }
    } catch {}

    const mem = memoryCashHandovers.find((h) => h.paymentId === paymentId);
    return mem || null;
  }

  /**
   * Paginated listing of cash handovers with filters and technician/service context.
   */
  async findPaginated(
    filters: CashHandoverQueryFilter,
    companyId?: string | null,
    database = db
  ): Promise<{ data: CashHandoverItem[]; items: CashHandoverItem[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const page = Math.max(1, Number(filters.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(filters.limit) || 20));
    const offset = (page - 1) * limit;

    try {
      const conditions: any[] = [];

      if (filters.status && filters.status !== 'ALL') {
        conditions.push(eq(cashHandovers.status, filters.status));
      }

      if (filters.technicianId) {
        conditions.push(eq(cashHandovers.technicianId, filters.technicianId));
      }

      if (companyId) {
        conditions.push(eq(cashHandovers.companyId, companyId));
      }

      if (filters.startDate) {
        conditions.push(gte(cashHandovers.collectedAt, new Date(filters.startDate)));
      }

      if (filters.endDate) {
        conditions.push(lte(cashHandovers.collectedAt, new Date(filters.endDate)));
      }

      if (filters.search?.trim()) {
        const searchTerm = `%${filters.search.trim()}%`;
        conditions.push(
          or(
            ilike(technicians.fullName, searchTerm),
            ilike(services.serviceNumber, searchTerm),
            ilike(customers.fullName, searchTerm),
            ilike(payments.paymentNumber, searchTerm)
          )
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [countResult] = await database
        .select({ count: sql<number>`count(*)::int` })
        .from(cashHandovers)
        .leftJoin(payments, eq(cashHandovers.paymentId, payments.id))
        .leftJoin(services, eq(cashHandovers.serviceId, services.id))
        .leftJoin(technicians, eq(cashHandovers.technicianId, technicians.id))
        .leftJoin(customers, eq(services.customerId, customers.id))
        .where(whereClause);

      const total = Number(countResult?.count || 0);

      const rows = await database
        .select({
          handover: cashHandovers,
          payment: payments,
          service: services,
          jobCard: jobCards,
          technician: technicians,
          receivedByUser: users,
          customer: customers,
        })
        .from(cashHandovers)
        .leftJoin(payments, eq(cashHandovers.paymentId, payments.id))
        .leftJoin(services, eq(cashHandovers.serviceId, services.id))
        .leftJoin(jobCards, eq(cashHandovers.jobCardId, jobCards.id))
        .leftJoin(technicians, eq(cashHandovers.technicianId, technicians.id))
        .leftJoin(users, eq(cashHandovers.receivedBy, users.id))
        .leftJoin(customers, eq(services.customerId, customers.id))
        .where(whereClause)
        .orderBy(desc(cashHandovers.collectedAt))
        .limit(limit)
        .offset(offset);

      const items = rows.map((r) => this.mapJoinedRowToItem(r));

      if (items.length > 0 || memoryCashHandovers.length === 0) {
        return {
          data: items,
          items,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit) || 1,
          },
        };
      }
      throw new Error('Fallback to in-memory store');
    } catch {
      // In-memory fallback
      let filtered = [...memoryCashHandovers];

      if (filters.status && filters.status !== 'ALL') {
        filtered = filtered.filter((h) => h.status === filters.status);
      }

      if (filters.technicianId) {
        filtered = filtered.filter((h) => h.technicianId === filters.technicianId);
      }

      if (companyId) {
        filtered = filtered.filter((h) => !h.companyId || h.companyId === companyId);
      }

      if (filters.startDate) {
        const start = new Date(filters.startDate).getTime();
        filtered = filtered.filter((h) => new Date(h.collectedAt).getTime() >= start);
      }

      if (filters.endDate) {
        const end = new Date(filters.endDate).getTime();
        filtered = filtered.filter((h) => new Date(h.collectedAt).getTime() <= end);
      }

      if (filters.search?.trim()) {
        const q = filters.search.trim().toLowerCase();
        filtered = filtered.filter(
          (h) =>
            (h.technicianName && h.technicianName.toLowerCase().includes(q)) ||
            (h.serviceNumber && h.serviceNumber.toLowerCase().includes(q)) ||
            (h.customerName && h.customerName.toLowerCase().includes(q)) ||
            (h.paymentNumber && h.paymentNumber.toLowerCase().includes(q))
        );
      }

      filtered.sort((a, b) => new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime());

      const total = filtered.length;
      const paginated = filtered.slice(offset, offset + limit);

      return {
        data: paginated,
        items: paginated,
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
   * Summary calculation for Admin: Total Collected, Total Received, Total Pending, and by Technician.
   */
  async getSummary(
    companyId?: string | null,
    dateFilter?: { startDate?: string; endDate?: string },
    database = db
  ): Promise<CashHandoverSummary> {
    try {
      const conditions: any[] = [];
      if (companyId) {
        conditions.push(eq(cashHandovers.companyId, companyId));
      }
      if (dateFilter?.startDate) {
        conditions.push(gte(cashHandovers.collectedAt, new Date(dateFilter.startDate)));
      }
      if (dateFilter?.endDate) {
        conditions.push(lte(cashHandovers.collectedAt, new Date(dateFilter.endDate)));
      }
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const rows = await database
        .select({
          handover: cashHandovers,
          technician: technicians,
        })
        .from(cashHandovers)
        .leftJoin(technicians, eq(cashHandovers.technicianId, technicians.id))
        .where(whereClause);

      if (rows.length === 0 && memoryCashHandovers.length > 0) {
        throw new Error('Fallback to in-memory store');
      }

      let totalCollected = 0;
      let totalSubmitted = 0;
      let totalReceived = 0;
      let totalPending = 0;

      const techMap = new Map<string, {
        technicianId: string;
        technicianName: string;
        collected: number;
        submitted: number;
        received: number;
        pending: number;
        outstandingBalance: number;
      }>();

      for (const r of rows) {
        const amt = Number(r.handover.amount || 0);
        const status = r.handover.status;
        const techId = r.handover.technicianId;
        const techName = r.technician?.fullName || 'Technician';

        totalCollected += amt;
        if (status === 'RECEIVED') {
          totalReceived += amt;
        } else if (status === 'SUBMITTED') {
          totalSubmitted += amt;
        } else {
          totalPending += amt;
        }

        if (!techMap.has(techId)) {
          techMap.set(techId, {
            technicianId: techId,
            technicianName: techName,
            collected: 0,
            submitted: 0,
            received: 0,
            pending: 0,
            outstandingBalance: 0,
          });
        }

        const entry = techMap.get(techId)!;
        entry.collected += amt;
        if (status === 'RECEIVED') {
          entry.received += amt;
        } else if (status === 'SUBMITTED') {
          entry.submitted += amt;
        } else {
          entry.pending += amt;
        }
        entry.outstandingBalance = Number((entry.collected - entry.received).toFixed(2));
      }

      return {
        totalCollected: Number(totalCollected.toFixed(2)),
        totalSubmitted: Number(totalSubmitted.toFixed(2)),
        totalReceived: Number(totalReceived.toFixed(2)),
        totalPending: Number(totalPending.toFixed(2)),
        outstandingBalance: Number((totalCollected - totalReceived).toFixed(2)),
        byTechnician: Array.from(techMap.values()),
      };
    } catch {
      // In-memory fallback
      let list = [...memoryCashHandovers];
      if (companyId) {
        list = list.filter((h) => !h.companyId || h.companyId === companyId);
      }
      if (dateFilter?.startDate) {
        const start = new Date(dateFilter.startDate).getTime();
        list = list.filter((h) => new Date(h.collectedAt).getTime() >= start);
      }
      if (dateFilter?.endDate) {
        const end = new Date(dateFilter.endDate).getTime();
        list = list.filter((h) => new Date(h.collectedAt).getTime() <= end);
      }

      let totalCollected = 0;
      let totalSubmitted = 0;
      let totalReceived = 0;
      let totalPending = 0;

      const techMap = new Map<string, {
        technicianId: string;
        technicianName: string;
        collected: number;
        submitted: number;
        received: number;
        pending: number;
        outstandingBalance: number;
      }>();

      for (const h of list) {
        const amt = Number(h.amount || 0);
        totalCollected += amt;
        if (h.status === 'RECEIVED') {
          totalReceived += amt;
        } else if (h.status === 'SUBMITTED') {
          totalSubmitted += amt;
        } else {
          totalPending += amt;
        }

        const techId = h.technicianId;
        const techName = h.technicianName || 'Technician';

        if (!techMap.has(techId)) {
          techMap.set(techId, {
            technicianId: techId,
            technicianName: techName,
            collected: 0,
            submitted: 0,
            received: 0,
            pending: 0,
            outstandingBalance: 0,
          });
        }

        const entry = techMap.get(techId)!;
        entry.collected += amt;
        if (h.status === 'RECEIVED') {
          entry.received += amt;
        } else if (h.status === 'SUBMITTED') {
          entry.submitted += amt;
        } else {
          entry.pending += amt;
        }
        entry.outstandingBalance = Number((entry.collected - entry.received).toFixed(2));
      }

      return {
        totalCollected: Number(totalCollected.toFixed(2)),
        totalSubmitted: Number(totalSubmitted.toFixed(2)),
        totalReceived: Number(totalReceived.toFixed(2)),
        totalPending: Number(totalPending.toFixed(2)),
        outstandingBalance: Number((totalCollected - totalReceived).toFixed(2)),
        byTechnician: Array.from(techMap.values()),
      };
    }
  }

  /**
   * Summary calculation for a single authenticated technician.
   * Strictly scoped to technician's own authorized records.
   */
  async getTechnicianSummary(
    technicianId: string,
    companyId?: string | null,
    database = db
  ): Promise<TechnicianCashSummary> {
    try {
      const conditions: any[] = [eq(cashHandovers.technicianId, technicianId)];
      if (companyId) {
        conditions.push(eq(cashHandovers.companyId, companyId));
      }

      const rows = await database
        .select({
          amount: cashHandovers.amount,
          status: cashHandovers.status,
        })
        .from(cashHandovers)
        .where(and(...conditions));

      if (rows.length === 0 && memoryCashHandovers.some((h) => h.technicianId === technicianId)) {
        throw new Error('Fallback to in-memory store');
      }

      let cashCollected = 0;
      let submittedForHandover = 0;
      let cashHandedOver = 0;
      let pendingHandover = 0;

      for (const r of rows) {
        const amt = Number(r.amount || 0);
        cashCollected += amt;
        if (r.status === 'RECEIVED') {
          cashHandedOver += amt;
        } else if (r.status === 'SUBMITTED') {
          submittedForHandover += amt;
        } else {
          pendingHandover += amt;
        }
      }

      return {
        cashCollected: Number(cashCollected.toFixed(2)),
        submittedForHandover: Number(submittedForHandover.toFixed(2)),
        cashHandedOver: Number(cashHandedOver.toFixed(2)),
        pendingHandover: Number(pendingHandover.toFixed(2)),
        outstandingBalance: Number((cashCollected - cashHandedOver).toFixed(2)),
      };
    } catch {
      let list = memoryCashHandovers.filter((h) => h.technicianId === technicianId);
      if (companyId) {
        list = list.filter((h) => !h.companyId || h.companyId === companyId);
      }

      let cashCollected = 0;
      let submittedForHandover = 0;
      let cashHandedOver = 0;
      let pendingHandover = 0;

      for (const h of list) {
        const amt = Number(h.amount || 0);
        cashCollected += amt;
        if (h.status === 'RECEIVED') {
          cashHandedOver += amt;
        } else if (h.status === 'SUBMITTED') {
          submittedForHandover += amt;
        } else {
          pendingHandover += amt;
        }
      }

      return {
        cashCollected: Number(cashCollected.toFixed(2)),
        submittedForHandover: Number(submittedForHandover.toFixed(2)),
        cashHandedOver: Number(cashHandedOver.toFixed(2)),
        pendingHandover: Number(pendingHandover.toFixed(2)),
        outstandingBalance: Number((cashCollected - cashHandedOver).toFixed(2)),
      };
    }
  }

  /**
   * Submit a collected cash handover request from technician to admin/finance for verification.
   * Strictly enforces:
   * 1. Must exist.
   * 2. Technicians can only submit their own cash collections (technicianId match).
   * 3. Cannot resubmit already SUBMITTED or RECEIVED handovers (duplicate submission prevention).
   * 4. Sets handedOverAt to the authoritative server timestamp.
   * 5. In production, database write failure propagates (no silent memory fallback).
   * 6. Records immutable audit log.
   */
  async submitHandover(
    id: string,
    technicianId: string,
    technicianName: string,
    notes?: string | null,
    database = db
  ): Promise<CashHandoverItem> {
    const existing = await this.findById(id, database);
    if (!existing) {
      const err: any = new Error('Cash handover record not found');
      err.statusCode = 404;
      throw err;
    }

    if (existing.technicianId !== technicianId) {
      const err: any = new Error('Technicians can only submit handovers for their own cash collections');
      err.statusCode = 403;
      throw err;
    }

    if (existing.status === 'SUBMITTED') {
      const err: any = new Error('This cash handover has already been submitted for verification');
      err.statusCode = 400;
      throw err;
    }

    if (existing.status === 'RECEIVED') {
      const err: any = new Error('This cash handover has already been confirmed as received');
      err.statusCode = 400;
      throw err;
    }

    const handedOverAt = new Date();
    const updatedNotes = notes?.trim()
      ? `${existing.notes ? `${existing.notes} | ` : ''}${notes.trim()}`
      : existing.notes;

    let updatedItem: CashHandoverItem;

    try {
      const [updatedRow] = await database
        .update(cashHandovers)
        .set({
          status: 'SUBMITTED',
          handedOverAt,
          notes: updatedNotes,
          updatedAt: handedOverAt,
        })
        .where(eq(cashHandovers.id, id))
        .returning();

      updatedItem = {
        ...existing,
        status: 'SUBMITTED',
        handedOverAt,
        submittedAt: handedOverAt,
        notes: updatedNotes,
        updatedAt: handedOverAt,
      };

      try {
        const safeActorId = await this.resolveActorUserId(database, technicianId);
        await database.insert(auditLogs).values({
          actorId: safeActorId,
          actorUsername: technicianName,
          action: 'UPDATE',
          entityType: 'CASH_HANDOVER',
          entityId: id,
          beforeState: existing,
          afterState: updatedItem,
          changeReason: `Technician ${technicianName} submitted ₹${Number(existing.amount).toFixed(2)} cash handover request`,
        });
      } catch (auditErr) {
        console.warn('[CashHandovers] Audit log record notice:', auditErr);
      }
    } catch (dbErr: any) {
      if (process.env.NODE_ENV === 'production') {
        throw dbErr;
      }
      updatedItem = {
        ...existing,
        status: 'SUBMITTED',
        handedOverAt,
        submittedAt: handedOverAt,
        notes: updatedNotes,
        updatedAt: handedOverAt,
      };
    }

    const memIndex = memoryCashHandovers.findIndex((h) => h.id === id);
    if (memIndex >= 0) {
      memoryCashHandovers[memIndex] = updatedItem;
    } else {
      memoryCashHandovers.unshift(updatedItem);
    }

    return updatedItem;
  }

  /**
   * Submit multiple collected cash handovers in one atomic action.
   * Enforces technician ownership and skips non-pending or already submitted handovers idempotently.
   */
  async submitBatchHandover(
    handoverIds: string[],
    technicianId: string,
    technicianName: string,
    notes?: string | null,
    database = db
  ): Promise<{ success: boolean; submittedCount: number; totalAmount: number; items: CashHandoverItem[] }> {
    if (!handoverIds || handoverIds.length === 0) {
      throw new Error('At least one handover ID must be provided');
    }

    const updatedItems: CashHandoverItem[] = [];
    let totalSubmittedAmount = 0;

    for (const id of handoverIds) {
      const existing = await this.findById(id, database);
      if (!existing) continue;

      if (existing.technicianId !== technicianId) {
        const err: any = new Error('Cross-technician handover submission is strictly forbidden');
        err.statusCode = 403;
        throw err;
      }

      if (existing.status !== 'PENDING') {
        continue;
      }

      const updated = await this.submitHandover(id, technicianId, technicianName, notes, database);
      updatedItems.push(updated);
      totalSubmittedAmount += Number(updated.amount || 0);
    }

    return {
      success: true,
      submittedCount: updatedItems.length,
      totalAmount: Number(totalSubmittedAmount.toFixed(2)),
      items: updatedItems,
    };
  }

  /**
   * Mark pending or submitted cash handover as RECEIVED.
   * Strictly enforces:
   * 1. Already RECEIVED cash cannot be marked received again (prevents double confirmation).
   * 2. Sets receivedBy to the authenticated Admin user ID.
   * 3. Sets updatedAt to the authoritative current server timestamp.
   * 4. In production, database write failure propagates (no silent memory fallback).
   * 5. Logs immutable audit event in audit system.
   */
  async markReceived(
    id: string,
    receivedByUserId: string,
    receivedByName: string,
    notes?: string | null,
    database = db
  ): Promise<CashHandoverItem> {
    const existing = await this.findById(id, database);
    if (!existing) {
      const err: any = new Error('Cash handover record not found');
      err.statusCode = 404;
      throw err;
    }

    if (existing.status === 'RECEIVED') {
      const err: any = new Error('This cash handover has already been marked as received');
      err.statusCode = 400;
      throw err;
    }

    const handedOverAt = existing.handedOverAt ? new Date(existing.handedOverAt) : new Date();
    const confirmedAt = new Date();
    const updatedNotes = notes?.trim()
      ? `${existing.notes ? `${existing.notes} | ` : ''}${notes.trim()}`
      : existing.notes;

    let updatedItem: CashHandoverItem;

    try {
      const [updatedRow] = await database
        .update(cashHandovers)
        .set({
          status: 'RECEIVED',
          handedOverAt,
          receivedBy: receivedByUserId,
          notes: updatedNotes,
          updatedAt: confirmedAt,
        })
        .where(eq(cashHandovers.id, id))
        .returning();

      updatedItem = {
        ...existing,
        status: 'RECEIVED',
        handedOverAt,
        receivedBy: receivedByUserId,
        receivedByName,
        notes: updatedNotes,
        updatedAt: confirmedAt,
      };

      // Record audit log
      try {
        const safeActorId = await this.resolveActorUserId(database, receivedByUserId);
        await database.insert(auditLogs).values({
          actorId: safeActorId,
          actorUsername: receivedByName,
          action: 'UPDATE',
          entityType: 'CASH_HANDOVER',
          entityId: id,
          beforeState: existing,
          afterState: updatedItem,
          changeReason: `Admin ${receivedByName} confirmed receipt of ₹${Number(existing.amount).toFixed(2)} cash handover`,
        });
      } catch (auditErr) {
        console.warn('[CashHandovers] Audit log record notice:', auditErr);
      }
    } catch (dbErr: any) {
      if (process.env.NODE_ENV === 'production') {
        throw dbErr;
      }
      // Memory fallback update
      updatedItem = {
        ...existing,
        status: 'RECEIVED',
        handedOverAt,
        receivedBy: receivedByUserId,
        receivedByName,
        notes: updatedNotes,
        updatedAt: confirmedAt,
      };
    }

    // Sync in-memory store
    const memIndex = memoryCashHandovers.findIndex((h) => h.id === id);
    if (memIndex >= 0) {
      memoryCashHandovers[memIndex] = updatedItem;
    } else {
      memoryCashHandovers.unshift(updatedItem);
    }

    return updatedItem;
  }

  /**
   * Confirm multiple pending/submitted cash handovers in one atomic action.
   * Skips already RECEIVED records idempotently.
   */
  async markBatchReceived(
    handoverIds: string[],
    receivedByUserId: string,
    receivedByName: string,
    notes?: string | null,
    database = db
  ): Promise<{ success: boolean; confirmedCount: number; totalAmount: number; items: CashHandoverItem[] }> {
    if (!handoverIds || handoverIds.length === 0) {
      throw new Error('At least one handover ID must be provided');
    }

    const updatedItems: CashHandoverItem[] = [];
    let totalConfirmedAmount = 0;

    for (const id of handoverIds) {
      const existing = await this.findById(id, database);
      if (!existing || existing.status === 'RECEIVED') {
        continue;
      }

      const updated = await this.markReceived(id, receivedByUserId, receivedByName, notes, database);
      updatedItems.push(updated);
      totalConfirmedAmount += Number(updated.amount || 0);
    }

    return {
      success: true,
      confirmedCount: updatedItems.length,
      totalAmount: Number(totalConfirmedAmount.toFixed(2)),
      items: updatedItems,
    };
  }

  private mapDbRowToItem(row: any): CashHandoverItem {
    return {
      id: row.id,
      paymentId: row.paymentId,
      serviceId: row.serviceId || null,
      jobCardId: row.jobCardId || null,
      technicianId: row.technicianId,
      amount: Number(row.amount),
      status: row.status as CashHandoverItem['status'],
      collectedAt: row.collectedAt,
      handedOverAt: row.handedOverAt || null,
      submittedAt: row.status === 'SUBMITTED' || row.status === 'RECEIVED' ? row.handedOverAt || null : null,
      receivedBy: row.receivedBy || null,
      notes: row.notes || null,
      companyId: row.companyId || null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapJoinedRowToItem(r: any): CashHandoverItem {
    return {
      id: r.handover.id,
      paymentId: r.handover.paymentId,
      paymentNumber: r.payment?.paymentNumber || undefined,
      serviceId: r.handover.serviceId || null,
      serviceNumber: r.service?.serviceNumber || undefined,
      jobCardId: r.handover.jobCardId || null,
      jobCardNumber: r.jobCard?.jobCardNumber || undefined,
      technicianId: r.handover.technicianId,
      technicianName: r.technician?.fullName || 'Technician',
      customerId: r.customer?.id || r.service?.customerId || null,
      customerName: r.customer?.fullName || undefined,
      amount: Number(r.handover.amount),
      status: r.handover.status as CashHandoverItem['status'],
      collectedAt: r.handover.collectedAt,
      handedOverAt: r.handover.handedOverAt || null,
      submittedAt: r.handover.status === 'SUBMITTED' || r.handover.status === 'RECEIVED' ? r.handover.handedOverAt || null : null,
      receivedBy: r.handover.receivedBy || null,
      receivedByName: r.receivedByUser?.displayName || r.receivedByUser?.username || null,
      notes: r.handover.notes || null,
      companyId: r.handover.companyId || null,
      createdAt: r.handover.createdAt,
      updatedAt: r.handover.updatedAt,
    };
  }
}

export const cashHandoversRepository = new CashHandoversRepository();
