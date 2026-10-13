import { eq, and, or, ilike, sql, desc, asc } from 'drizzle-orm';
import { db } from '../../database/client';
import {
  jobCards,
  services,
  customers,
  customerAssets,
  products,
  technicians,
  warranties,
  customerActivities,
  auditLogs,
} from '../../database/schema/index';
import { generateBusinessNumber } from '../../database/sequences';
import { withTransaction } from '../../database/transactions';
import { randomUUID } from 'crypto';
import { memoryServices } from '../services/services.repository';
import { memoryTechnicians } from '../technicians/technicians.repository';
import type {
  JobCardQueryFilter,
  CreateJobCardInput,
  AssignTechnicianInput,
  UpdateJobCardWorkInput,
  CompleteJobCardInput,
  JobCardActionInput,
} from '@crm/validation';

// Resilient memory store for offline and test modes
export const memoryJobCards: any[] = [];

export class JobCardsRepository {
  /**
   * Find paginated job cards with rich joins and multi-criteria filters
   */
  async findPaginated(filters: JobCardQueryFilter, database = db) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 10));
    const offset = (page - 1) * limit;

    try {
      const conditions: any[] = [];

      if (filters.status && (filters.status as string) !== 'ALL') {
        conditions.push(eq(jobCards.status, filters.status as any));
      }

      if (filters.priority && (filters.priority as string) !== 'ALL') {
        conditions.push(eq(services.priority, filters.priority as any));
      }

      if (filters.technicianId) {
        conditions.push(eq(jobCards.technicianId, filters.technicianId));
      }

      if (filters.customerId) {
        conditions.push(eq(jobCards.customerId, filters.customerId));
      }

      if (filters.assetId) {
        conditions.push(eq(jobCards.assetId, filters.assetId));
      }

      if (filters.serviceId) {
        conditions.push(eq(jobCards.serviceId, filters.serviceId));
      }

      if (filters.dateFrom) {
        conditions.push(sql`${jobCards.createdAt} >= ${new Date(filters.dateFrom)}`);
      }

      if (filters.dateTo) {
        conditions.push(sql`${jobCards.createdAt} <= ${new Date(filters.dateTo)}`);
      }

      if (filters.search?.trim()) {
        const term = `%${filters.search.trim()}%`;
        conditions.push(
          or(
            ilike(jobCards.jobCardNumber, term),
            ilike(services.serviceNumber, term),
            ilike(customers.fullName, term),
            ilike(customers.phone, term),
            ilike(customerAssets.serialNumber, term),
            ilike(technicians.fullName, term)
          )
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const isAsc = filters.sortOrder === 'asc';
      let orderExpr = isAsc ? asc(jobCards.createdAt) : desc(jobCards.createdAt);
      if (filters.sortBy === 'scheduledDate') {
        orderExpr = isAsc ? asc(services.scheduledDate) : desc(services.scheduledDate);
      } else if (filters.sortBy === 'status') {
        orderExpr = isAsc ? asc(jobCards.status as any) : desc(jobCards.status as any);
      }

      const [rows, countResult] = await Promise.all([
        database
          .select({
            id: jobCards.id,
            jobCardNumber: jobCards.jobCardNumber,
            problemReported: jobCards.problemReported,
            diagnosis: jobCards.diagnosis,
            workPerformed: jobCards.workPerformed,
            partsReplaced: jobCards.partsReplaced,
            technicianNotes: jobCards.technicianNotes,
            customerRemarks: jobCards.customerRemarks,
            startedAt: jobCards.startedAt,
            completedAt: jobCards.completedAt,
            laborCharges: jobCards.laborCharges,
            partsCharges: jobCards.partsCharges,
            totalCharges: jobCards.totalCharges,
            status: jobCards.status,
            createdAt: jobCards.createdAt,
            updatedAt: jobCards.updatedAt,
            serviceId: services.id,
            serviceNumber: services.serviceNumber,
            serviceType: services.serviceType,
            serviceLocation: services.serviceLocation,
            serviceClassification: services.serviceClassification,
            scheduledDate: services.scheduledDate,
            priority: services.priority,
            customerId: customers.id,
            customerName: customers.fullName,
            customerPhone: customers.phone,
            customerNumber: customers.customerNumber,
            assetId: customerAssets.id,
            assetNumber: customerAssets.assetNumber,
            serialNumber: customerAssets.serialNumber,
            productName: products.name,
            productBrand: products.brand,
            technicianId: technicians.id,
            technicianName: technicians.fullName,
            technicianPhone: technicians.phone,
          })
          .from(jobCards)
          .innerJoin(services, eq(jobCards.serviceId, services.id))
          .innerJoin(customers, eq(jobCards.customerId, customers.id))
          .leftJoin(customerAssets, eq(jobCards.assetId, customerAssets.id))
          .leftJoin(products, eq(customerAssets.productId, products.id))
          .leftJoin(technicians, eq(jobCards.technicianId, technicians.id))
          .where(whereClause)
          .orderBy(orderExpr)
          .limit(limit)
          .offset(offset),
        database
          .select({ count: sql<number>`count(*)` })
          .from(jobCards)
          .innerJoin(services, eq(jobCards.serviceId, services.id))
          .innerJoin(customers, eq(jobCards.customerId, customers.id))
          .leftJoin(customerAssets, eq(jobCards.assetId, customerAssets.id))
          .leftJoin(technicians, eq(jobCards.technicianId, technicians.id))
          .where(whereClause),
      ]);

      const total = Number(countResult[0]?.count || 0);

      return {
        data: rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1,
        },
      };
    } catch {
      let filtered = [...memoryJobCards];
      if (filters.customerId) filtered = filtered.filter((j) => j.customerId === filters.customerId);
      if (filters.assetId) filtered = filtered.filter((j) => j.assetId === filters.assetId);
      if (filters.technicianId) filtered = filtered.filter((j) => j.technicianId === filters.technicianId);
      if (filters.status && (filters.status as string) !== 'ALL') {
        filtered = filtered.filter((j) => j.status === filters.status);
      }
      if (filters.search?.trim()) {
        const q = filters.search.trim().toLowerCase();
        filtered = filtered.filter(
          (j) =>
            j.jobCardNumber?.toLowerCase().includes(q) ||
            j.customerName?.toLowerCase().includes(q) ||
            j.serialNumber?.toLowerCase().includes(q)
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
   * Find single job card by ID with all joins
   */
  async findById(id: string, database = db) {
    try {
      const rows = await database
        .select({
          id: jobCards.id,
          jobCardNumber: jobCards.jobCardNumber,
          problemReported: jobCards.problemReported,
          diagnosis: jobCards.diagnosis,
          workPerformed: jobCards.workPerformed,
          partsReplaced: jobCards.partsReplaced,
          technicianNotes: jobCards.technicianNotes,
          customerRemarks: jobCards.customerRemarks,
          startedAt: jobCards.startedAt,
          completedAt: jobCards.completedAt,
          laborCharges: jobCards.laborCharges,
          partsCharges: jobCards.partsCharges,
          totalCharges: jobCards.totalCharges,
          nextServiceRecommendationMonths: jobCards.nextServiceRecommendationMonths,
          nextServiceNotes: jobCards.nextServiceNotes,
          status: jobCards.status,
          createdAt: jobCards.createdAt,
          updatedAt: jobCards.updatedAt,
          serviceId: services.id,
          serviceNumber: services.serviceNumber,
          serviceType: services.serviceType,
          serviceLocation: services.serviceLocation,
          serviceClassification: services.serviceClassification,
          scheduledDate: services.scheduledDate,
          scheduledTimeSlot: services.scheduledTimeSlot,
          priority: services.priority,
          customerNotes: services.customerNotes,
          internalNotes: services.internalNotes,
          customerId: customers.id,
          customerName: customers.fullName,
          customerPhone: customers.phone,
          customerEmail: customers.email,
          customerNumber: customers.customerNumber,
          assetId: customerAssets.id,
          assetNumber: customerAssets.assetNumber,
          serialNumber: customerAssets.serialNumber,
          productName: products.name,
          productBrand: products.brand,
          productSku: products.sku,
          technicianId: technicians.id,
          technicianName: technicians.fullName,
          technicianPhone: technicians.phone,
          warrantyId: warranties.id,
          warrantyType: warranties.warrantyType,
          warrantyStatus: warranties.status,
          warrantyEndDate: warranties.endDate,
        })
        .from(jobCards)
        .innerJoin(services, eq(jobCards.serviceId, services.id))
        .innerJoin(customers, eq(jobCards.customerId, customers.id))
        .leftJoin(customerAssets, eq(jobCards.assetId, customerAssets.id))
        .leftJoin(products, eq(customerAssets.productId, products.id))
        .leftJoin(technicians, eq(jobCards.technicianId, technicians.id))
        .leftJoin(warranties, eq(services.warrantyId, warranties.id))
        .where(eq(jobCards.id, id))
        .limit(1);

      if (!rows[0]) {
        const mem = memoryJobCards.find((j) => j.id === id);
        return mem || null;
      }

      return rows[0];
    } catch {
      const mem = memoryJobCards.find((j) => j.id === id);
      return mem || null;
    }
  }

  /**
   * Find job card linked to a specific service ID
   */
  async findByServiceId(serviceId: string, database = db) {
    try {
      const rows = await database
        .select({ id: jobCards.id })
        .from(jobCards)
        .where(eq(jobCards.serviceId, serviceId))
        .limit(1);
      if (rows[0]?.id) {
        return await this.findById(rows[0].id, database);
      }
      const mem = memoryJobCards.find((j) => j.serviceId === serviceId);
      return mem || null;
    } catch {
      const mem = memoryJobCards.find((j) => j.serviceId === serviceId);
      return mem || null;
    }
  }

  /**
   * Get High-Level Operational KPIs for Job Cards
   */
  async getKPIs(database = db) {
    try {
      const query = sql`
        SELECT
          COUNT(*)::int AS total_job_cards,
          COUNT(*) FILTER (WHERE ${jobCards.status}::text IN ('SCHEDULED', 'ASSIGNED'))::int AS assigned_scheduled,
          COUNT(*) FILTER (WHERE ${jobCards.status}::text IN ('STARTED', 'DIAGNOSIS', 'IN_PROGRESS'))::int AS in_progress_active,
          COUNT(*) FILTER (WHERE ${jobCards.status}::text = 'ON_HOLD')::int AS on_hold,
          COUNT(*) FILTER (WHERE ${jobCards.status}::text IN ('COMPLETED', 'CUSTOMER_CONFIRMED', 'CLOSED'))::int AS completed_closed,
          COUNT(*) FILTER (WHERE ${jobCards.status}::text = 'CANCELLED')::int AS cancelled
        FROM ${jobCards}
      `;

      const result: any = await database.execute(query);
      const row = (result.rows ? result.rows[0] : result[0]) as any;

      return {
        totalJobCards: Number(row?.total_job_cards || 0),
        assignedCount: Number(row?.assigned_scheduled || 0),
        inProgressCount: Number(row?.in_progress_active || 0),
        onHoldCount: Number(row?.on_hold || 0),
        completedCount: Number(row?.completed_closed || 0),
        cancelledCount: Number(row?.cancelled || 0),
        // Retain backward-compatible keys for any legacy callers
        scheduled: Number(row?.assigned_scheduled || 0),
        assigned: Number(row?.assigned_scheduled || 0),
        inProgress: Number(row?.in_progress_active || 0),
        onHold: Number(row?.on_hold || 0),
        completed: Number(row?.completed_closed || 0),
        cancelled: Number(row?.cancelled || 0),
      };
    } catch (err) {
      console.error('[JobCardsRepository.getKPIs] Error calculating KPIs from database:', err);
      return {
        totalJobCards: memoryJobCards.length,
        assignedCount: memoryJobCards.filter((j) => ['SCHEDULED', 'ASSIGNED'].includes(j.status)).length,
        inProgressCount: memoryJobCards.filter((j) => ['STARTED', 'DIAGNOSIS', 'IN_PROGRESS'].includes(j.status)).length,
        onHoldCount: memoryJobCards.filter((j) => j.status === 'ON_HOLD').length,
        completedCount: memoryJobCards.filter((j) => ['COMPLETED', 'CUSTOMER_CONFIRMED', 'CLOSED'].includes(j.status)).length,
        cancelledCount: memoryJobCards.filter((j) => j.status === 'CANCELLED').length,
        scheduled: memoryJobCards.filter((j) => ['SCHEDULED', 'ASSIGNED'].includes(j.status)).length,
        assigned: memoryJobCards.filter((j) => ['SCHEDULED', 'ASSIGNED'].includes(j.status)).length,
        inProgress: memoryJobCards.filter((j) => ['STARTED', 'DIAGNOSIS', 'IN_PROGRESS'].includes(j.status)).length,
        onHold: memoryJobCards.filter((j) => j.status === 'ON_HOLD').length,
        completed: memoryJobCards.filter((j) => ['COMPLETED', 'CUSTOMER_CONFIRMED', 'CLOSED'].includes(j.status)).length,
        cancelled: memoryJobCards.filter((j) => j.status === 'CANCELLED').length,
      };
    }
  }

  /**
   * Create Job Card for a Service
   */
  async createJobCard(input: CreateJobCardInput, actorId?: string) {
    try {
      return await withTransaction(async (tx) => {
        // Check if a Job Card already exists for this service order
        const [existing] = await tx
          .select()
          .from(jobCards)
          .where(eq(jobCards.serviceId, input.serviceId));

        if (existing) {
          const [updated] = await tx
            .update(jobCards)
            .set({
              customerId: input.customerId,
              assetId: input.assetId || existing.assetId,
              technicianId: input.technicianId || existing.technicianId,
              problemReported: input.problemReported || existing.problemReported,
              status: input.technicianId ? 'ASSIGNED' : existing.status,
              updatedAt: new Date(),
            })
            .where(eq(jobCards.id, existing.id))
            .returning();

          return updated;
        }

        const jcSeq = await generateBusinessNumber(tx, 'JOB_CARD', 'JC');

        const [newJobCard] = await tx
          .insert(jobCards)
          .values({
            jobCardNumber: jcSeq.sequenceNumber,
            serviceId: input.serviceId,
            customerId: input.customerId,
            assetId: input.assetId || '',
            technicianId: input.technicianId || null,
            problemReported: input.problemReported || 'Service request',
            status: input.technicianId ? 'ASSIGNED' : 'SCHEDULED',
          })
          .returning();

        return newJobCard;
      });
    } catch (err: any) {
      if (err.statusCode) throw err;

      const rand = String(Math.floor(1000 + Math.random() * 9000));
      const newJobCard = {
        id: randomUUID(),
        jobCardNumber: `JC-2026-${rand}`,
        serviceId: input.serviceId,
        customerId: input.customerId,
        assetId: input.assetId,
        technicianId: input.technicianId || null,
        problemReported: input.problemReported || 'Service request',
        status: input.technicianId ? 'ASSIGNED' : 'SCHEDULED',
        partsReplaced: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      memoryJobCards.unshift(newJobCard);
      return newJobCard;
    }
  }

  /**
   * Assign Technician to Job Card
   */
  async assignTechnician(id: string, input: AssignTechnicianInput, actorId?: string) {
    try {
      return await withTransaction(async (tx) => {
        const existing = await this.findById(id, tx as any);
        if (!existing) {
          const notFound: any = new Error('Job Card not found');
          notFound.statusCode = 404;
          throw notFound;
        }

        const now = new Date();
        const [updated] = await tx
          .update(jobCards)
          .set({
            technicianId: input.technicianId,
            status: 'ASSIGNED',
            technicianNotes: input.notes ? `${existing.technicianNotes || ''}\n[Assignment note]: ${input.notes}`.trim() : existing.technicianNotes,
            updatedAt: now,
          })
          .where(eq(jobCards.id, id))
          .returning();

        await tx
          .update(services)
          .set({
            technicianId: input.technicianId,
            status: 'ASSIGNED',
            updatedAt: now,
          })
          .where(eq(services.id, existing.serviceId));

        if (!updated) {
          const target = memoryJobCards.find((j) => j.id === id);
          if (target) {
            target.technicianId = input.technicianId;
            target.status = 'ASSIGNED';
            target.updatedAt = now;
            return target;
          }
          return {
            ...existing,
            technicianId: input.technicianId,
            status: 'ASSIGNED',
            updatedAt: now,
          };
        }

        return updated;
      });
    } catch (err: any) {
      const target = memoryJobCards.find((j) => j.id === id);
      if (!target) {
        if (err.statusCode) throw err;
        const notFound: any = new Error('Job Card not found');
        notFound.statusCode = 404;
        throw notFound;
      }

      const tech = memoryTechnicians.find((t) => t.id === input.technicianId);
      const techName = tech?.fullName || 'Technician';
      const techPhone = tech?.phone || '';
      const techSkills = tech?.skills || [];

      target.technicianId = input.technicianId;
      target.technicianName = techName;
      target.technicianPhone = techPhone;
      target.technicianSkills = techSkills;
      target.status = 'ASSIGNED';
      target.updatedAt = new Date();

      const targetSrv = memoryServices.find((s) => s.id === target.serviceId);
      if (targetSrv) {
        targetSrv.technicianId = input.technicianId;
        targetSrv.technicianName = techName;
        targetSrv.technicianPhone = techPhone;
        targetSrv.status = 'ASSIGNED';
        targetSrv.updatedAt = new Date();
      }

      return target;
    }
  }

  /**
   * Centralized Workflow Action (start, hold, resume, cancel, reopen)
   */
  async performWorkflowAction(id: string, actionInput: JobCardActionInput, actorId?: string) {
    try {
      return await withTransaction(async (tx) => {
        const existing = await this.findById(id, tx as any);
        if (!existing) {
          const notFound: any = new Error('Job Card not found');
          notFound.statusCode = 404;
          throw notFound;
        }

        const now = new Date();
        const action = actionInput.action.toLowerCase();
        let targetStatus: any = existing.status;
        const updateData: Record<string, any> = { updatedAt: now };
        let serviceTargetStatus: any = null;

        if (action === 'start') {
          targetStatus = 'IN_PROGRESS';
          serviceTargetStatus = 'IN_PROGRESS';
          updateData.startedAt = now;
        } else if (action === 'hold') {
          targetStatus = 'ON_HOLD';
          serviceTargetStatus = 'ON_HOLD';
          const reason = (actionInput as any).reason || (actionInput as any).holdReason;
          if (reason && typeof reason === 'string' && reason.trim()) {
            const holdNote = `[Hold reason]: ${reason.trim()}`;
            updateData.technicianNotes = existing.technicianNotes
              ? `${existing.technicianNotes}\n${holdNote}`
              : holdNote;
          }
        } else if (action === 'resume') {
          targetStatus = 'IN_PROGRESS';
          serviceTargetStatus = 'IN_PROGRESS';
        } else if (action === 'cancel') {
          targetStatus = 'CANCELLED';
          serviceTargetStatus = 'CANCELLED';
        } else if (action === 'reopen') {
          targetStatus = 'IN_PROGRESS';
          serviceTargetStatus = 'IN_PROGRESS';
        }

        updateData.status = targetStatus;

        const [updated] = await tx
          .update(jobCards)
          .set(updateData)
          .where(eq(jobCards.id, id))
          .returning();

        if (!updated) {
          throw new Error('Not found in DB, fallback to memory');
        }

        if (serviceTargetStatus) {
          await tx
            .update(services)
            .set({
              status: serviceTargetStatus,
              updatedAt: now,
            })
            .where(eq(services.id, existing.serviceId));

          const memService = memoryServices.find((s) => s.id === existing.serviceId);
          if (memService) {
            memService.status = serviceTargetStatus;
            (memService as any).jobCardStatus = targetStatus;
            memService.updatedAt = now;
            if (updateData.technicianNotes) {
              (memService as any).jobCardTechnicianNotes = updateData.technicianNotes;
            }
          }
        }

        const memJob = memoryJobCards.find((j) => j.id === id);
        if (memJob) {
          Object.assign(memJob, updateData);
        }

        return updated;
      });
    } catch (err: any) {
      if (err.statusCode) throw err;
      if (process.env.NODE_ENV === 'production') throw err;
      const target = memoryJobCards.find((j) => j.id === id);
      if (!target) {
        const notFound: any = new Error('Job Card not found');
        notFound.statusCode = 404;
        throw notFound;
      }

      const action = actionInput.action.toLowerCase();
      const now = new Date();
      let serviceTargetStatus: any = null;
      if (action === 'start') {
        target.status = 'IN_PROGRESS';
        serviceTargetStatus = 'IN_PROGRESS';
        target.startedAt = now;
      } else if (action === 'hold') {
        target.status = 'ON_HOLD';
        serviceTargetStatus = 'ON_HOLD';
        const reason = (actionInput as any).reason || (actionInput as any).holdReason;
        if (reason && typeof reason === 'string' && reason.trim()) {
          const holdNote = `[Hold reason]: ${reason.trim()}`;
          target.technicianNotes = target.technicianNotes
            ? `${target.technicianNotes}\n${holdNote}`
            : holdNote;
        }
      } else if (action === 'resume') {
        target.status = 'IN_PROGRESS';
        serviceTargetStatus = 'IN_PROGRESS';
      } else if (action === 'cancel') {
        target.status = 'CANCELLED';
        serviceTargetStatus = 'CANCELLED';
      } else if (action === 'reopen') {
        target.status = 'IN_PROGRESS';
        serviceTargetStatus = 'IN_PROGRESS';
      }
      target.updatedAt = now;

      if (serviceTargetStatus) {
        const memService = memoryServices.find((s) => s.id === target.serviceId);
        if (memService) {
          memService.status = serviceTargetStatus;
          (memService as any).jobCardStatus = target.status;
          memService.updatedAt = now;
          if (target.technicianNotes) {
            (memService as any).jobCardTechnicianNotes = target.technicianNotes;
          }
        }
      }

      return target;
    }
  }

  /**
   * Update work execution details
   */
  async updateWork(id: string, input: UpdateJobCardWorkInput, _actorId?: string) {
    try {
      return await withTransaction(async (tx) => {
        const existing = await this.findById(id, tx as any);
        if (!existing) {
          const notFound: any = new Error('Job Card not found');
          notFound.statusCode = 404;
          throw notFound;
        }

        const updateData: Record<string, any> = { updatedAt: new Date() };

        if (input.diagnosis !== undefined) updateData.diagnosis = input.diagnosis;
        if (input.workPerformed !== undefined) updateData.workPerformed = input.workPerformed;
        if (input.partsReplaced !== undefined) updateData.partsReplaced = input.partsReplaced;
        if (input.technicianNotes !== undefined) updateData.technicianNotes = input.technicianNotes;
        if (input.customerRemarks !== undefined) updateData.customerRemarks = input.customerRemarks;
        if (input.laborCharges !== undefined) updateData.laborCharges = String(input.laborCharges);
        if (input.partsCharges !== undefined) updateData.partsCharges = String(input.partsCharges);
        if (input.totalCharges !== undefined) updateData.totalCharges = String(input.totalCharges);

        const [updated] = await tx
          .update(jobCards)
          .set(updateData)
          .where(eq(jobCards.id, id))
          .returning();

        return updated;
      });
    } catch (err: any) {
      if (err.statusCode) throw err;
      if (process.env.NODE_ENV === 'production') throw err;

      const target = memoryJobCards.find((j) => j.id === id);
      if (!target) {
        const notFound: any = new Error('Job Card not found');
        notFound.statusCode = 404;
        throw notFound;
      }

      if (input.diagnosis !== undefined) target.diagnosis = input.diagnosis;
      if (input.workPerformed !== undefined) target.workPerformed = input.workPerformed;
      if (input.partsReplaced !== undefined) target.partsReplaced = input.partsReplaced;
      target.updatedAt = new Date();
      return target;
    }
  }

  /**
   * Complete Job Card & finalize Service
   */
  async completeJobCard(id: string, input: CompleteJobCardInput, actorId?: string) {
    try {
      return await withTransaction(async (tx) => {
        const existing = await this.findById(id, tx as any);
        if (!existing) {
          const notFound: any = new Error('Job Card not found');
          notFound.statusCode = 404;
          throw notFound;
        }

        const now = new Date();

        const [completedJobCard] = await tx
          .update(jobCards)
          .set({
            diagnosis: input.diagnosis || existing.diagnosis,
            workPerformed: input.workPerformed,
            partsReplaced: input.partsReplaced || [],
            laborCharges: String(input.laborCharges || 0),
            partsCharges: String(input.partsCharges || 0),
            totalCharges: String(input.totalCharges || 0),
            technicianNotes: input.technicianNotes || existing.technicianNotes,
            customerRemarks: input.customerRemarks || existing.customerRemarks,
            nextServiceRecommendationMonths: input.nextServiceRecommendationMonths || null,
            nextServiceNotes: input.nextServiceNotes || null,
            status: 'COMPLETED',
            completedAt: now,
            updatedAt: now,
          })
          .where(eq(jobCards.id, id))
          .returning();

        await tx
          .update(services)
          .set({
            status: 'COMPLETED',
            completedAt: now,
            updatedAt: now,
          })
          .where(eq(services.id, existing.serviceId));

        // Synchronize memory stores
        const memJc = memoryJobCards.find((j) => j.id === id);
        if (memJc) {
          memJc.status = 'COMPLETED';
          memJc.completedAt = now;
          memJc.updatedAt = now;
        }
        if (existing.serviceId) {
          const memSrv = memoryServices.find((s) => s.id === existing.serviceId);
          if (memSrv) {
            memSrv.status = 'COMPLETED';
            memSrv.completedAt = now;
            memSrv.updatedAt = now;
          }
        }

        try {
          const { expensesRepository } = await import('../expenses/expenses.repository');
          await expensesRepository.recordSparePartsExpenseForService(
            {
              serviceId: existing.serviceId,
              jobCardId: id,
              jobCardNumber: existing.jobCardNumber,
              partsReplaced: input.partsReplaced || existing.partsReplaced,
              completedAt: now,
              companyId: (existing as any).companyId || null,
              actorId,
            },
            tx as any
          );
        } catch (spareErr) {
          console.warn('[JobCardsRepository.completeJobCard] Spare expense recording notice:', spareErr);
        }

        return {
          jobCard: completedJobCard,
        };
      });
    } catch (err: any) {
      if (err.statusCode) throw err;
      if (process.env.NODE_ENV === 'production') throw err;

      const target = memoryJobCards.find((j) => j.id === id);
      if (!target) {
        const notFound: any = new Error('Job Card not found');
        notFound.statusCode = 404;
        throw notFound;
      }

      const now = new Date();
      target.status = 'COMPLETED';
      target.workPerformed = input.workPerformed;
      target.diagnosis = input.diagnosis;
      target.partsReplaced = input.partsReplaced || [];
      target.completedAt = now;
      target.updatedAt = now;

      const targetSrv = memoryServices.find((s) => s.id === target.serviceId);
      if (targetSrv) {
        targetSrv.status = 'COMPLETED';
        targetSrv.completedAt = now;
        targetSrv.updatedAt = now;
      }

      try {
        const { expensesRepository } = await import('../expenses/expenses.repository');
        await expensesRepository.recordSparePartsExpenseForService(
          {
            serviceId: target.serviceId,
            jobCardId: id,
            jobCardNumber: target.jobCardNumber,
            partsReplaced: input.partsReplaced || target.partsReplaced,
            completedAt: now,
            companyId: (target as any).companyId || null,
            actorId,
          }
        );
      } catch {}

      return {
        jobCard: target,
      };
    }
  }
}

export const jobCardsRepository = new JobCardsRepository();
