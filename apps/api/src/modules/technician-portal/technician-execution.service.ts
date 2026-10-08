import { eq, or, and, sql, ilike } from 'drizzle-orm';
import { db } from '../../database/client';
import {
  jobCards,
  services,
  invoices,
  invoiceItems,
  payments,
  products,
  warranties,
  customerActivities,
  auditLogs,
  technicians,
  users,
} from '../../database/schema/index';
import { jobCardsRepository, memoryJobCards } from '../job-cards/job-cards.repository';
import { memoryServices } from '../services/services.repository';
import { memoryInvoices, memoryInvoiceItems } from '../invoices/invoices.repository';
import { memoryPayments } from '../payments/payments.repository';
import { productRepository } from '../products/product.repository';
import { inventoryRepository } from '../inventory/inventory.repository';
import { generateInvoiceNumber } from '../invoices/invoices.numbering';
import { generateBusinessNumber } from '../../database/sequences';
import { withTransaction } from '../../database/transactions';
import { TECHNICIAN_ERROR_CODES, HTTP_STATUS } from '@crm/shared';
import { randomUUID } from 'crypto';
import type {
  TechnicianJobExecutionInput,
  TechnicianJobHoldInput,
  TechnicianJobCompleteInput,
} from '@crm/validation';

export class TechnicianExecutionService {
  /**
   * Resolve and verify that a job card exists and belongs strictly to the authenticated technician
   * Supports resolving by Job Card ID, Job Card Number, or linked Service ID
   */
  async resolveAuthorizedJobCard(
    id: string,
    technicianId: string,
    database = db
  ): Promise<any> {
    if (!technicianId || typeof technicianId !== 'string') {
      const error: any = new Error('Authentication required');
      error.statusCode = HTTP_STATUS.UNAUTHORIZED;
      error.code = TECHNICIAN_ERROR_CODES.SESSION_EXPIRED;
      throw error;
    }

    if (!id || typeof id !== 'string') {
      const error: any = new Error('Job Card identifier is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      error.code = TECHNICIAN_ERROR_CODES.VALIDATION_ERROR;
      throw error;
    }

    try {
      // 1. Check if id directly matches a job card
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        const [directJc] = await database
          .select()
          .from(jobCards)
          .where(isUuid ? or(eq(jobCards.id, id), eq(jobCards.jobCardNumber, id)) : eq(jobCards.jobCardNumber, id))
          .limit(1);

        if (directJc) {
          if (!directJc.technicianId || directJc.technicianId !== technicianId) {
            const error: any = new Error(
              'Access denied: This job card is not assigned to your technician account.'
            );
            error.statusCode = HTTP_STATUS.FORBIDDEN;
            error.code = TECHNICIAN_ERROR_CODES.JOB_CARD_NOT_ASSIGNED;
            throw error;
          }
          return directJc;
        }
      } catch (dbErr: any) {
        if (dbErr.statusCode) throw dbErr;
      }

      // 2. Check if id matches a linked service
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        const [serviceRow] = await database
          .select()
          .from(services)
          .where(isUuid ? or(eq(services.id, id), eq(services.serviceNumber, id)) : eq(services.serviceNumber, id))
          .limit(1);

        if (serviceRow) {
          if (!serviceRow.technicianId || serviceRow.technicianId !== technicianId) {
            const error: any = new Error(
              'Access denied: This service is not assigned to your technician account.'
            );
            error.statusCode = HTTP_STATUS.FORBIDDEN;
            error.code = TECHNICIAN_ERROR_CODES.SERVICE_NOT_ASSIGNED;
            throw error;
          }

          // Find linked job card for this service
          const [linkedJc] = await database
            .select()
            .from(jobCards)
            .where(eq(jobCards.serviceId, serviceRow.id))
            .limit(1);

          if (linkedJc) {
            if (!linkedJc.technicianId || linkedJc.technicianId !== technicianId) {
              const error: any = new Error(
                'Access denied: This job card is not assigned to your technician account.'
              );
              error.statusCode = HTTP_STATUS.FORBIDDEN;
              error.code = TECHNICIAN_ERROR_CODES.JOB_CARD_NOT_ASSIGNED;
              throw error;
            }
            return linkedJc;
          }

          // Create job card on demand for this service if one does not exist yet
          const createdJc = await jobCardsRepository.createJobCard({
            serviceId: serviceRow.id,
            customerId: serviceRow.customerId,
            assetId: serviceRow.assetId || '',
            technicianId,
            problemReported: serviceRow.customerNotes || 'Service order execution',
          });
          return createdJc;
        }
      } catch (dbErr: any) {
        if (dbErr.statusCode) throw dbErr;
      }

      // 3. Fallback to memoryJobCards for tests / offline mode
      const memJc = memoryJobCards.find(
        (j) => j.id === id || j.jobCardNumber === id || j.serviceId === id
      );
      if (memJc) {
        if (!memJc.technicianId || memJc.technicianId !== technicianId) {
          const error: any = new Error(
            'Access denied: This job card is not assigned to your technician account.'
          );
          error.statusCode = HTTP_STATUS.FORBIDDEN;
          error.code = TECHNICIAN_ERROR_CODES.JOB_CARD_NOT_ASSIGNED;
          throw error;
        }
        return memJc;
      }

      const memSrv = memoryServices.find((s) => s.id === id || s.serviceNumber === id);
      if (memSrv) {
        if (!memSrv.technicianId || memSrv.technicianId !== technicianId) {
          const error: any = new Error(
            'Access denied: This service is not assigned to your technician account.'
          );
          error.statusCode = HTTP_STATUS.FORBIDDEN;
          error.code = TECHNICIAN_ERROR_CODES.SERVICE_NOT_ASSIGNED;
          throw error;
        }
        return {
          id: `jc-${memSrv.id}`,
          jobCardNumber: `JC-${memSrv.serviceNumber || '2026-0001'}`,
          serviceId: memSrv.id,
          technicianId,
          status: memSrv.status === 'COMPLETED' ? 'COMPLETED' : (memSrv.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'ASSIGNED'),
          problemReported: memSrv.customerNotes || 'Service order execution',
          diagnosis: null,
          workPerformed: null,
          partsReplaced: [],
        };
      }

      const error: any = new Error('Job Card record not found');
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      error.code = 'NOT_FOUND';
      throw error;
    } catch (err: any) {
      if (err.statusCode) throw err;
      const notFound: any = new Error('Job Card record not found');
      notFound.statusCode = HTTP_STATUS.NOT_FOUND;
      notFound.code = 'NOT_FOUND';
      throw notFound;
    }
  }

  /**
   * POST /api/v1/technician/job-cards/:id/start
   * Start execution on an authorized assigned job card
   * Authoritative server timestamp is attached
   */
  async startJob(id: string, technicianId: string) {
    const jobCard = await this.resolveAuthorizedJobCard(id, technicianId);

    // Concurrency / Duplicate Start Protection:
    // If already in progress, return existing active state idempotently
    if (['IN_PROGRESS', 'STARTED', 'DIAGNOSIS'].includes(jobCard.status)) {
      return {
        success: true,
        message: 'Job is already in progress',
        data: jobCard,
      };
    }

    // Invalid transition guards
    if (['COMPLETED', 'CUSTOMER_CONFIRMED', 'CLOSED'].includes(jobCard.status)) {
      const error: any = new Error('Cannot start a completed or closed job card');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      error.code = TECHNICIAN_ERROR_CODES.INVALID_STATE_TRANSITION;
      throw error;
    }

    if (jobCard.status === 'CANCELLED') {
      const error: any = new Error('Cannot start a cancelled job card');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      error.code = TECHNICIAN_ERROR_CODES.INVALID_STATE_TRANSITION;
      throw error;
    }

    const updated = await jobCardsRepository.performWorkflowAction(
      jobCard.id,
      { action: 'start' },
      technicianId
    );

    return {
      success: true,
      message: 'Job started successfully',
      data: updated,
    };
  }

  /**
   * POST /api/v1/technician/job-cards/:id/hold
   * Put an active job on hold with optional hold reason
   */
  async holdJob(id: string, input: TechnicianJobHoldInput, technicianId: string) {
    const jobCard = await this.resolveAuthorizedJobCard(id, technicianId);

    // Duplicate Hold Protection: idempotent if already on hold
    if (jobCard.status === 'ON_HOLD') {
      return {
        success: true,
        message: 'Job is already on hold',
        data: jobCard,
      };
    }

    // Must be in progress to be put on hold
    if (!['IN_PROGRESS', 'STARTED', 'DIAGNOSIS'].includes(jobCard.status)) {
      const error: any = new Error(
        `Job cannot be put on hold from its current status: ${jobCard.status}. Job must be started first.`
      );
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      error.code = TECHNICIAN_ERROR_CODES.INVALID_STATE_TRANSITION;
      throw error;
    }

    const reason = input?.reason || input?.holdReason || '';
    if (reason.trim()) {
      await jobCardsRepository.updateWork(
        jobCard.id,
        {
          technicianNotes: jobCard.technicianNotes
            ? `${jobCard.technicianNotes}\n[Hold reason]: ${reason.trim()}`
            : `[Hold reason]: ${reason.trim()}`,
        },
        technicianId
      );
    }

    const updated = await jobCardsRepository.performWorkflowAction(
      jobCard.id,
      { action: 'hold' },
      technicianId
    );

    return {
      success: true,
      message: 'Job put on hold',
      data: updated,
    };
  }

  /**
   * POST /api/v1/technician/job-cards/:id/resume
   * Resume an on-hold job card
   */
  async resumeJob(id: string, technicianId: string) {
    const jobCard = await this.resolveAuthorizedJobCard(id, technicianId);

    // Duplicate Resume Protection: idempotent if already active
    if (['IN_PROGRESS', 'STARTED', 'DIAGNOSIS'].includes(jobCard.status)) {
      return {
        success: true,
        message: 'Job is already active',
        data: jobCard,
      };
    }

    // Must be on hold to be resumed
    if (jobCard.status !== 'ON_HOLD') {
      const error: any = new Error(
        `Only on-hold jobs can be resumed. Current status is ${jobCard.status}.`
      );
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      error.code = TECHNICIAN_ERROR_CODES.INVALID_STATE_TRANSITION;
      throw error;
    }

    const updated = await jobCardsRepository.performWorkflowAction(
      jobCard.id,
      { action: 'resume' },
      technicianId
    );

    return {
      success: true,
      message: 'Job resumed successfully',
      data: updated,
    };
  }

  /**
   * PATCH /api/v1/technician/job-cards/:id
   * Save partial execution data (diagnosis, notes, parts consumed, business fields)
   * Strictly enforces whitelist: technician cannot alter administrative fields
   */
  async updateExecution(
    id: string,
    input: TechnicianJobExecutionInput,
    technicianId: string
  ) {
    const jobCard = await this.resolveAuthorizedJobCard(id, technicianId);

    // Guard: completed or cancelled jobs cannot be updated
    if (['COMPLETED', 'CUSTOMER_CONFIRMED', 'CLOSED', 'CANCELLED'].includes(jobCard.status)) {
      const error: any = new Error(
        `Cannot update execution data for a ${jobCard.status.toLowerCase()} job card.`
      );
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      error.code = TECHNICIAN_ERROR_CODES.INVALID_STATE_TRANSITION;
      throw error;
    }

    // Whitelist extraction (no administrative fields permitted)
    const updatePayload: Record<string, any> = {};

    if (input.diagnosis !== undefined) updatePayload.diagnosis = input.diagnosis;
    if (input.workPerformed !== undefined) updatePayload.workPerformed = input.workPerformed;
    if (input.technicianNotes !== undefined) updatePayload.technicianNotes = input.technicianNotes;
    if (input.customerRemarks !== undefined) updatePayload.customerRemarks = input.customerRemarks;
    if (input.problemReported !== undefined) updatePayload.problemReported = input.problemReported;

    // Validate parts consumed (Item & Quantity)
    if (input.partsReplaced !== undefined) {
      if (!Array.isArray(input.partsReplaced)) {
        const error: any = new Error('Parts replaced must be a valid array');
        error.statusCode = HTTP_STATUS.BAD_REQUEST;
        error.code = TECHNICIAN_ERROR_CODES.VALIDATION_ERROR;
        throw error;
      }

      for (const part of input.partsReplaced) {
        if (!part.itemName || typeof part.itemName !== 'string') {
          const error: any = new Error('Each consumed part must have a valid item name');
          error.statusCode = HTTP_STATUS.BAD_REQUEST;
          error.code = TECHNICIAN_ERROR_CODES.VALIDATION_ERROR;
          throw error;
        }
        if (!part.quantity || typeof part.quantity !== 'number' || part.quantity <= 0) {
          const error: any = new Error(`Quantity for part "${part.itemName}" must be greater than 0`);
          error.statusCode = HTTP_STATUS.BAD_REQUEST;
          error.code = TECHNICIAN_ERROR_CODES.VALIDATION_ERROR;
          throw error;
        }
      }
      updatePayload.partsReplaced = input.partsReplaced;
    }

    // Support configurable business-specific fields generically (JSON representation)
    if (input.businessFields && typeof input.businessFields === 'object') {
      const existingNotes = updatePayload.technicianNotes || jobCard.technicianNotes || '';
      const customFieldEntries = Object.entries(input.businessFields)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      if (customFieldEntries) {
        updatePayload.technicianNotes = `${existingNotes}\n[Business Fields]: { ${customFieldEntries} }`.trim();
      }
    }

    if (input.customerSignatureFileId) {
      updatePayload.customerSignatureFileId = input.customerSignatureFileId;
    }

    const updated = await jobCardsRepository.updateWork(jobCard.id, updatePayload, technicianId);

    return {
      success: true,
      message: 'Execution details saved successfully',
      data: updated,
    };
  }

  /**
   * POST /api/v1/technician/job-cards/:id/complete
   * Complete job card atomically, update linked service, and validate mandatory execution fields
   */
  /**
   * POST /api/v1/technician/job-cards/:id/complete
   * Complete job card atomically, update linked service, deduct inventory,
   * calculate authoritative bill, generate invoice, record payment, and link entities.
   */
  async completeJob(
    id: string,
    input: TechnicianJobCompleteInput,
    technicianId: string
  ) {
    const jobCard = await this.resolveAuthorizedJobCard(id, technicianId);

    // Duplicate Completion Protection (Idempotent):
    // If already completed and billed, return existing completed record, invoice, and payment
    if (['COMPLETED', 'CUSTOMER_CONFIRMED', 'CLOSED'].includes(jobCard.status)) {
      let existingInvoice: any = null;
      let existingPayment: any = null;
      try {
        const isJcUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobCard.id);
        if (isJcUuid) {
          const [inv] = await db
            .select()
            .from(invoices)
            .where(
              and(
                jobCard.serviceId
                  ? or(eq(invoices.jobCardId, jobCard.id), eq(invoices.serviceId, jobCard.serviceId))
                  : eq(invoices.jobCardId, jobCard.id),
                sql`${invoices.status} != 'CANCELLED'`
              )
            )
            .limit(1);
          if (inv) {
            const items = await db
              .select()
              .from(invoiceItems)
              .where(eq(invoiceItems.invoiceId, inv.id));
            const [pmt] = await db
              .select()
              .from(payments)
              .where(and(eq(payments.invoiceId, inv.id), eq(payments.status, 'COMPLETED')))
              .limit(1);
            existingInvoice = {
              ...inv,
              items: items || [],
              template: 'REVAMP',
            };
            existingPayment = pmt || null;
          }
        }
      } catch {}

      if (!existingInvoice) {
        existingInvoice = memoryInvoices.find(
          (i) => (i.jobCardId === jobCard.id || (jobCard.serviceId && i.serviceId === jobCard.serviceId)) && i.status !== 'CANCELLED'
        ) || null;
        if (existingInvoice) {
          existingPayment = memoryPayments.find((p) => p.invoiceId === existingInvoice.id && p.status === 'COMPLETED') || null;
        }
      }

      if (existingInvoice) {
        return {
          success: true,
          message: 'Job has already been completed',
          data: {
            ...jobCard,
            status: 'COMPLETED',
            jobCard,
            invoice: existingInvoice,
            payment: existingPayment,
          },
        };
      }
    }

    if (jobCard.status === 'CANCELLED') {
      const error: any = new Error('Cannot complete a cancelled job card');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      error.code = TECHNICIAN_ERROR_CODES.INVALID_STATE_TRANSITION;
      throw error;
    }

    // Validate mandatory completion fields per specification:
    // Work performed is required for completing a job
    const workPerformed = input.workPerformed?.trim();
    if (!workPerformed) {
      const error: any = new Error(
        'Work performed description is required to complete this job card.'
      );
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      error.code = TECHNICIAN_ERROR_CODES.VALIDATION_ERROR;
      throw error;
    }

    // Validate parts if provided & pre-validate stock
    const rawParts = input.partsReplaced || [];
    if (Array.isArray(rawParts)) {
      for (const part of rawParts) {
        const itemName = part.itemName || (part as any).partName || (part.productId || (part as any).inventoryItemId ? 'Spare Part' : undefined);
        if (!itemName || typeof itemName !== 'string') {
          const error: any = new Error('Each consumed part must have a valid item name');
          error.statusCode = HTTP_STATUS.BAD_REQUEST;
          error.code = TECHNICIAN_ERROR_CODES.VALIDATION_ERROR;
          throw error;
        }
        part.itemName = itemName;
        const qty = Number(part.quantity);
        if (!qty || qty <= 0) {
          const error: any = new Error(`Quantity for part "${part.itemName}" must be greater than 0`);
          error.statusCode = HTTP_STATUS.BAD_REQUEST;
          error.code = TECHNICIAN_ERROR_CODES.VALIDATION_ERROR;
          throw error;
        }

        // Validate stock if product exists
        const productId = part.productId || part.itemId || part.inventoryItemId;
        if (productId) {
          const balance = await inventoryRepository.getStockBalance(productId);
          const currentStock = balance?.currentStock ?? 0;
          if (currentStock < qty) {
            const error: any = new Error(
              `Insufficient stock for "${part.itemName}". Available: ${currentStock}, Requested: ${qty}`
            );
            error.statusCode = HTTP_STATUS.BAD_REQUEST;
            error.code = 'INSUFFICIENT_STOCK';
            throw error;
          }
        }
      }
    }

    const isJobCardUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobCard.id);

    // ==========================================
    // REAL DATABASE EXECUTION (ACID TRANSACTION)
    // ==========================================
    if (isJobCardUuid) {
      try {
        const transactionResult = await withTransaction(async (tx) => {
          // 1. Fetch fresh Job Card and Service
          const [currentJc] = await tx
            .select()
            .from(jobCards)
            .where(eq(jobCards.id, jobCard.id));

          if (!currentJc) {
            const notFound: any = new Error('Job Card record not found');
            notFound.statusCode = 404;
            throw notFound;
          }

          const [srv] = currentJc.serviceId
            ? await tx.select().from(services).where(eq(services.id, currentJc.serviceId))
            : [null];

          // 2. Resolve Warranty Status
          let isUnderWarranty = false;
          if (srv?.warrantyId) {
            const [war] = await tx
              .select()
              .from(warranties)
              .where(eq(warranties.id, srv.warrantyId));
            if (war && war.status === 'ACTIVE' && new Date(war.endDate) >= new Date()) {
              isUnderWarranty = true;
            }
          }

          const gstEnabled = Boolean(input.gstEnabled);
          const rawGstRate = typeof input.gstRate === 'number' ? input.gstRate : Number(input.gstRate);
          const effectiveGstRate = gstEnabled && !isNaN(rawGstRate) && rawGstRate >= 0 ? rawGstRate : 0;

          // 3. Process Authoritative Parts & Stock Validation
          const validatedParts: any[] = [];
          let partsSubtotal = 0;
          let partsTax = 0;

          for (const part of rawParts) {
            const prodId = part.productId || (part as any).itemId || (part as any).inventoryItemId || null;
            const prodName = String(part.itemName || (part as any).partName || 'Spare Part').trim();
            const manualUnitPrice = Math.max(0, Number(part.unitPrice ?? part.price ?? 0));
            const qty = Math.max(1, Number(part.quantity) || 1);

            // Verify stock only if existing catalog ID was provided
            if (prodId) {
              const balance = await inventoryRepository.getStockBalance(prodId, tx as any);
              if (balance && balance.currentStock < qty) {
                const err: any = new Error(
                  `Insufficient stock for "${prodName}". Available: ${balance.currentStock}, Requested: ${qty}`
                );
                err.statusCode = 400;
                err.code = 'INSUFFICIENT_STOCK';
                throw err;
              }
            }

            const isCovered = isUnderWarranty || part.isWarrantyCovered === true;
            const billableUnitPrice = isCovered ? 0 : manualUnitPrice;
            const lineSubtotal = billableUnitPrice * qty;
            const lineTax = gstEnabled ? Number(((lineSubtotal * effectiveGstRate) / 100).toFixed(2)) : 0;
            const lineTotal = lineSubtotal + lineTax;

            partsSubtotal += lineSubtotal;
            partsTax += lineTax;

            validatedParts.push({
              productId: prodId,
              itemName: prodName,
              partName: prodName,
              description: part.description || (isCovered ? 'Warranty Covered Spare Part' : 'Spare Part'),
              quantity: qty,
              regularPrice: manualUnitPrice,
              unitPrice: billableUnitPrice,
              isWarrantyCovered: isCovered,
              taxRatePercent: effectiveGstRate,
              taxAmount: lineTax,
              lineTotal,
            });
          }

          // 4. Calculate Service / Labor Charges
          const rawLabor = Math.max(0, Number(input.serviceCharge ?? input.laborCharges ?? 0));
          const isLaborCovered = isUnderWarranty && srv?.serviceClassification === 'WARRANTY';
          const billableLabor = isLaborCovered ? 0 : rawLabor;
          const laborTax = gstEnabled ? Number(((billableLabor * effectiveGstRate) / 100).toFixed(2)) : 0;
          const laborTotal = billableLabor + laborTax;

          const subtotal = partsSubtotal + billableLabor;
          const totalTax = gstEnabled ? partsTax + laborTax : 0;
          const totalAmount = Math.max(0, subtotal + totalTax);

          const now = new Date();

          // Resolve authorized user ID for audit/ledger columns referencing users(id)
          let resolvedUserId: string | null = null;
          let creatorName = 'Technician';

          if (technicianId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(technicianId)) {
            const [techRec] = await tx
              .select({ userId: technicians.userId, fullName: technicians.fullName })
              .from(technicians)
              .where(eq(technicians.id, technicianId))
              .limit(1);

            if (techRec) {
              resolvedUserId = techRec.userId || null;
              creatorName = techRec.fullName || creatorName;
            } else {
              const [userRec] = await tx
                .select({ id: users.id, displayName: users.displayName })
                .from(users)
                .where(eq(users.id, technicianId))
                .limit(1);
              if (userRec) {
                resolvedUserId = userRec.id;
                creatorName = userRec.displayName || creatorName;
              }
            }
          }

          // 5. Deduct Inventory for Physical Parts
          for (const part of validatedParts) {
            if (part.productId) {
              await inventoryRepository.recordAdjustment(
                {
                  productId: part.productId,
                  type: 'SALE',
                  quantity: part.quantity,
                  reason: `Service Spare Replacement for Job Card ${currentJc.jobCardNumber}`,
                  referenceType: 'JOB_CARD',
                  referenceId: currentJc.id,
                },
                resolvedUserId,
                creatorName,
                tx as any
              );
            }
          }

          // 6. Update Job Card status to COMPLETED
          const [updatedJc] = await tx
            .update(jobCards)
            .set({
              diagnosis: input.diagnosis || currentJc.diagnosis || 'Standard service completed',
              workPerformed,
              partsReplaced: validatedParts,
              laborCharges: String(rawLabor),
              partsCharges: String(partsSubtotal),
              totalCharges: String(totalAmount),
              technicianNotes: input.technicianNotes || currentJc.technicianNotes,
              customerRemarks: input.customerRemarks || currentJc.customerRemarks,
              customerSignatureFileId: input.customerSignatureFileId || null,
              status: 'COMPLETED',
              completedAt: now,
              updatedAt: now,
            })
            .where(eq(jobCards.id, currentJc.id))
            .returning();

          // 7. Update linked Service status to COMPLETED
          if (currentJc.serviceId) {
            await tx
              .update(services)
              .set({
                status: 'COMPLETED',
                completedAt: now,
                updatedAt: now,
              })
              .where(eq(services.id, currentJc.serviceId));
          }

          // 8. Generate exactly ONE Invoice (prevent duplicates)
          const [existingInv] = await tx
            .select()
            .from(invoices)
            .where(
              and(
                currentJc.serviceId
                  ? or(eq(invoices.jobCardId, currentJc.id), eq(invoices.serviceId, currentJc.serviceId))
                  : eq(invoices.jobCardId, currentJc.id),
                sql`${invoices.status} != 'CANCELLED'`
              )
            );

          let generatedInvoice: any = existingInv;
          let recordedPayment: any = null;

          if (existingInv) {
            const existingItems = await tx
              .select()
              .from(invoiceItems)
              .where(eq(invoiceItems.invoiceId, existingInv.id));
            const [existingPmt] = await tx
              .select()
              .from(payments)
              .where(and(eq(payments.invoiceId, existingInv.id), eq(payments.status, 'COMPLETED')))
              .limit(1);
            generatedInvoice = {
              ...existingInv,
              items: existingItems || [],
              template: 'REVAMP',
            };
            recordedPayment = existingPmt || null;
          } else {
            const invoiceNumber = await generateInvoiceNumber(tx, now);
            const paymentInput = input.payment;
            const amountPaid = Number(paymentInput?.amount || 0);

            let initialInvoiceStatus: any = 'ISSUED';
            if (amountPaid >= totalAmount && totalAmount > 0) {
              initialInvoiceStatus = 'PAID';
            } else if (amountPaid > 0) {
              initialInvoiceStatus = 'PARTIALLY_PAID';
            }

            const [newInv] = await tx
              .insert(invoices)
              .values({
                invoiceNumber,
                customerId: currentJc.customerId || srv?.customerId,
                saleId: null,
                jobCardId: currentJc.id,
                serviceId: currentJc.serviceId,
                invoiceDate: now,
                dueDate: now,
                subtotal: subtotal.toFixed(2),
                discountAmount: '0.00',
                taxAmount: totalTax.toFixed(2),
                totalAmount: totalAmount.toFixed(2),
                status: initialInvoiceStatus,
                notes: input.technicianNotes || `Service Invoice for Job Card ${currentJc.jobCardNumber}`,
                termsAndConditions: 'Payment due upon completion of service.',
                createdBy: resolvedUserId,
              })
              .returning();

            const createdLineItems: any[] = [];

            // Insert line items for spare parts
            for (const part of validatedParts) {
              const [insertedItem] = await tx
                .insert(invoiceItems)
                .values({
                  invoiceId: newInv.id,
                  productId: part.productId,
                  itemType: 'SPARE_PART',
                  nameSnapshot: part.itemName,
                  descriptionSnapshot: part.isWarrantyCovered ? 'Warranty Covered Spare Part' : 'Billable Spare Part',
                  quantity: part.quantity,
                  unitPriceSnapshot: (Number(part.unitPrice) || 0).toFixed(2),
                  discountAmount: '0.00',
                  taxRatePercent: (part.taxRatePercent !== undefined ? Number(part.taxRatePercent) : effectiveGstRate).toFixed(2),
                  taxAmount: (Number(part.taxAmount) || 0).toFixed(2),
                  lineTotal: (Number(part.lineTotal) || 0).toFixed(2),
                })
                .returning();
              if (insertedItem) createdLineItems.push(insertedItem);
            }

            // Insert line item for labor / service charge
            if (rawLabor > 0 || isLaborCovered) {
              const [insertedLabor] = await tx
                .insert(invoiceItems)
                .values({
                  invoiceId: newInv.id,
                  productId: null,
                  itemType: 'SERVICE',
                  nameSnapshot: 'Labor & Technical Service Charge',
                  descriptionSnapshot: isLaborCovered ? 'Warranty Covered Service Labor' : 'Billable Doorstep Service Labor',
                  quantity: 1,
                  unitPriceSnapshot: billableLabor.toFixed(2),
                  discountAmount: '0.00',
                  taxRatePercent: effectiveGstRate.toFixed(2),
                  taxAmount: laborTax.toFixed(2),
                  lineTotal: laborTotal.toFixed(2),
                })
                .returning();
              if (insertedLabor) createdLineItems.push(insertedLabor);
            }

            generatedInvoice = {
              ...newInv,
              items: createdLineItems,
              template: 'REVAMP',
              paidAmount: amountPaid,
              outstandingAmount: Math.max(0, totalAmount - amountPaid),
              balanceAmount: Math.max(0, totalAmount - amountPaid),
            };

            // 9. Record Payment if provided
            if (paymentInput) {
              const validDbMethods = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'];
              let pmtMethod: any = 'CASH';
              if (paymentInput.method && validDbMethods.includes(paymentInput.method)) {
                pmtMethod = paymentInput.method;
              } else if (paymentInput.method === 'ONLINE') {
                pmtMethod = 'UPI';
              }

              let payNum = `PAY-${now.getFullYear()}-${String(Date.now() % 10000).padStart(4, '0')}`;
              try {
                const paySeq = await generateBusinessNumber(tx, 'PAYMENT', 'PAY');
                if (paySeq?.sequenceNumber) {
                  payNum = paySeq.sequenceNumber;
                }
              } catch {}

              let pmtStatus = 'NOT_PAID';
              if (amountPaid >= totalAmount && totalAmount > 0) {
                pmtStatus = 'PAID';
              } else if (amountPaid > 0) {
                pmtStatus = 'PARTIALLY_PAID';
              }

              const [newPmt] = await tx
                .insert(payments)
                .values({
                  paymentNumber: payNum,
                  customerId: currentJc.customerId || srv?.customerId,
                  invoiceId: newInv.id,
                  amount: String(amountPaid),
                  paymentDate: now,
                  paymentMethod: pmtMethod,
                  status: amountPaid > 0 ? 'COMPLETED' : 'PENDING',
                  referenceNumber: paymentInput.reference || paymentInput.referenceNumber || null,
                  notes: paymentInput.notes || `Service payment collected by technician via ${paymentInput.method}`,
                  createdBy: resolvedUserId,
                })
                .returning();

              recordedPayment = {
                ...newPmt,
                method: paymentInput.method,
                status: pmtStatus,
                reference: paymentInput.reference || paymentInput.referenceNumber || null,
              };
            }

            // Customer Activity & Audit Trail
            await tx.insert(customerActivities).values({
              customerId: currentJc.customerId || srv?.customerId,
              eventType: 'INVOICE_GENERATED',
              entityType: 'INVOICE',
              entityId: newInv.id,
              description: `Generated service invoice of ₹${totalAmount.toFixed(2)} for Job Card ${currentJc.jobCardNumber}`,
              metadata: {
                invoiceId: newInv.id,
                invoiceNumber: newInv.invoiceNumber,
                jobCardId: currentJc.id,
                serviceId: currentJc.serviceId,
                totalAmount,
                amountPaid,
              },
              actorId: resolvedUserId,
              actorName: creatorName,
            });
          }

          return {
            jobCard: updatedJc || currentJc,
            service: srv,
            invoice: generatedInvoice,
            payment: recordedPayment,
          };
        });

        // Tracking Termination: Clear active tracking context upon job completion
        try {
          const { mapsTrackingRedisService } = await import('../maps/maps-tracking.redis.js');
          const { broadcastTechnicianTrackingStopped } = await import('../maps/maps-socket.service.js');
          const activeDest = await mapsTrackingRedisService.getActiveDestination(technicianId);
          if (activeDest && (activeDest.serviceId === jobCard.serviceId || activeDest.jobCardId === jobCard.id)) {
            await mapsTrackingRedisService.clearTracking(technicianId);
            broadcastTechnicianTrackingStopped(technicianId);
          }
        } catch {}

        return {
          success: true,
          message: 'Job completed successfully',
          data: {
            ...(transactionResult.jobCard || {}),
            status: 'COMPLETED',
            completedAt: transactionResult.jobCard?.completedAt || new Date(),
            jobCard: transactionResult.jobCard,
            service: transactionResult.service,
            invoice: transactionResult.invoice,
            payment: transactionResult.payment,
          },
        };
      } catch (dbErr: any) {
        console.error('[TechnicianExecution.completeJob DB ERROR]', dbErr);
        if (dbErr.statusCode) throw dbErr;
        const error: any = new Error(dbErr.message || 'Failed to complete job in database');
        error.statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
        error.code = dbErr.code || 'DATABASE_ERROR';
        throw error;
      }
    }

    // ==========================================
    // RESILIENT IN-MEMORY FALLBACK (TESTS/OFFLINE)
    // ==========================================
    const now = new Date();
    const gstEnabled = Boolean(input.gstEnabled);
    const rawGstRate = typeof input.gstRate === 'number' ? input.gstRate : Number(input.gstRate);
    const effectiveGstRate = gstEnabled && !isNaN(rawGstRate) && rawGstRate >= 0 ? rawGstRate : 0;
    const rawLabor = Number(input.serviceCharge ?? input.laborCharges ?? 0);
    const laborTax = (rawLabor * effectiveGstRate) / 100;

    let partsSubtotal = 0;
    let partsTax = 0;
    const validatedParts = rawParts.map((p) => {
      const qty = Number(p.quantity) || 1;
      const unitPrice = Number(p.price ?? p.unitPrice ?? 0);
      const isCovered = Boolean(p.isWarrantyCovered);
      const billPrice = isCovered ? 0 : unitPrice;
      const lineTax = (billPrice * qty * effectiveGstRate) / 100;
      partsSubtotal += billPrice * qty;
      partsTax += lineTax;
      return {
        ...p,
        quantity: qty,
        unitPrice: billPrice,
        taxRatePercent: effectiveGstRate,
        taxAmount: lineTax,
        lineTotal: billPrice * qty + lineTax,
      };
    });

    const subtotal = partsSubtotal + rawLabor;
    const totalTax = partsTax + laborTax;
    const totalAmount = subtotal + totalTax;

    // Update memory job card
    let memJob = memoryJobCards.find((j) => j.id === jobCard.id || j.serviceId === jobCard.serviceId || j.serviceId === id);
    if (!memJob) {
      memJob = {
        ...jobCard,
      };
      memoryJobCards.push(memJob);
    }
    memJob.status = 'COMPLETED';
    memJob.completedAt = now;
    memJob.workPerformed = workPerformed;
    memJob.diagnosis = input.diagnosis || memJob.diagnosis;
    memJob.partsReplaced = validatedParts;
    memJob.laborCharges = String(rawLabor);
    memJob.partsCharges = String(partsSubtotal);
    memJob.totalCharges = String(totalAmount);
    memJob.technicianNotes = input.technicianNotes || memJob.technicianNotes;

    try {
      await jobCardsRepository.completeJobCard(
        jobCard.id,
        {
          workPerformed,
          diagnosis: input.diagnosis,
          partsReplaced: validatedParts,
          laborCharges: rawLabor,
          technicianNotes: input.technicianNotes,
          customerRemarks: input.customerRemarks,
          customerSignatureFileId: input.customerSignatureFileId,
        } as any,
        technicianId
      );
    } catch {}

    const memSrv = memoryServices.find((s) => s.id === jobCard.serviceId || s.id === id);
    if (memSrv) {
      memSrv.status = 'COMPLETED';
      memSrv.completedAt = now;
      (memSrv as any).jobCardStatus = 'COMPLETED';
    }

    // Deduct stock in memory balances
    for (const part of validatedParts) {
      const prodId = part.productId || part.itemId || part.inventoryItemId;
      if (prodId) {
        await inventoryRepository.recordAdjustment({
          productId: prodId,
          type: 'SALE',
          quantity: part.quantity,
          reason: `Service Spare Replacement for Job Card ${jobCard.jobCardNumber}`,
          referenceType: 'JOB_CARD',
          referenceId: jobCard.id,
        });
      }
    }

    // Create memory invoice if not already created
    let memInvoice = memoryInvoices.find((i) => i.jobCardId === jobCard.id && i.status !== 'CANCELLED');
    let memPayment: any = null;

    if (!memInvoice) {
      const paymentInput = input.payment;
      const amountPaid = Number(paymentInput?.amount || 0);
      let initialInvoiceStatus: any = 'ISSUED';
      if (amountPaid >= totalAmount && totalAmount > 0) {
        initialInvoiceStatus = 'PAID';
      } else if (amountPaid > 0) {
        initialInvoiceStatus = 'PARTIALLY_PAID';
      }

      const invoiceItemsList = [
        ...validatedParts.map((p) => ({
          id: randomUUID(),
          itemType: 'SPARE_PART',
          description: p.itemName,
          quantity: p.quantity,
          unitPrice: p.unitPrice,
          total: p.lineTotal,
        })),
        ...(rawLabor > 0 ? [{
          id: randomUUID(),
          itemType: 'SERVICE',
          description: 'Service / Labor Charge',
          quantity: 1,
          unitPrice: rawLabor,
          total: rawLabor,
        }] : []),
      ];

      const invNum = `INV-${now.getFullYear()}-${String(Date.now() % 10000).padStart(4, '0')}`;
      memInvoice = {
        id: randomUUID(),
        invoiceNumber: invNum,
        customerId: jobCard.customerId || memSrv?.customerId || 'cust-fallback',
        jobCardId: jobCard.id,
        serviceId: jobCard.serviceId,
        invoiceDate: now,
        dueDate: now,
        subtotal: subtotal,
        taxAmount: totalTax,
        totalAmount: totalAmount,
        paidAmount: amountPaid,
        outstandingAmount: Math.max(0, totalAmount - amountPaid),
        balanceAmount: Math.max(0, totalAmount - amountPaid),
        status: initialInvoiceStatus,
        paymentMethod: paymentInput?.method || 'CASH',
        template: 'REVAMP',
        items: invoiceItemsList,
        notes: input.technicianNotes || `Service Invoice for Job Card ${jobCard.jobCardNumber}`,
        createdAt: now,
        updatedAt: now,
      } as any;
      memoryInvoices.push(memInvoice);

      // Record memory payment if provided
      if (paymentInput) {
        const pmtMethod = paymentInput.method === 'CASH' ? 'CASH' : 'ONLINE';
        let pmtStatus = 'NOT_PAID';
        if (amountPaid >= totalAmount && totalAmount > 0) {
          pmtStatus = 'PAID';
        } else if (amountPaid > 0) {
          pmtStatus = 'PARTIALLY_PAID';
        }
        memPayment = {
          id: randomUUID(),
          paymentNumber: `PAY-${now.getFullYear()}-${String(Date.now() % 10000).padStart(4, '0')}`,
          customerId: memInvoice.customerId,
          invoiceId: memInvoice.id,
          amount: amountPaid,
          paymentDate: now,
          paymentMethod: pmtMethod,
          method: paymentInput.method,
          status: pmtStatus,
          reference: paymentInput.reference || paymentInput.referenceNumber || null,
          referenceNumber: paymentInput.reference || paymentInput.referenceNumber || null,
          notes: paymentInput.notes || `Service payment collected by technician via ${paymentInput.method}`,
          createdAt: now,
          updatedAt: now,
        };
        memoryPayments.unshift(memPayment);
      }
    }

    return {
      success: true,
      message: 'Job completed successfully',
      data: {
        ...(memJob || jobCard || {}),
        status: 'COMPLETED',
        completedAt: now,
        jobCard: memJob || jobCard,
        service: memSrv || null,
        invoice: memInvoice,
        payment: memPayment,
      },
    };
  }

  /**
   * GET /api/v1/technician/catalog/materials
   * Returns list of spare parts and materials available for selection
   * Strictly includes authoritative unit prices and stock levels
   */
  async getAvailableMaterials(search?: string) {
    try {
      const result = await productRepository.findPaginated({
        search,
        limit: 50,
        page: 1,
        isActive: true,
      });

      const items = await Promise.all(
        (result.data || []).map(async (p: any) => {
          const balance = await inventoryRepository.getStockBalance(p.id);
          return {
            id: p.id,
            name: p.name,
            sku: p.sku,
            brand: p.brand,
            model: p.model,
            productType: p.productType,
            unitPrice: Number(p.unitPrice || 0),
            currentStock: Number(balance?.currentStock || 0),
          };
        })
      );

      return items;
    } catch {
      return [];
    }
  }
}

export const technicianExecutionService = new TechnicianExecutionService();
