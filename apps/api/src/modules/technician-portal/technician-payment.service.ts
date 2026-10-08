/**
 * SR Enterprises CRM - Technician Portal Phase 7: Payment Collection Service
 * Authoritative integration with the existing CRM payment engine.
 * Strictly adheres to technician-scoped permissions:
 * - Technician can record payments only against invoices for assigned services/jobs.
 * - Re-reads authoritative balance immediately before committing payment (prevents overpayment).
 * - Enforces zero/negative rejection and exact monetary precision.
 * - Idempotency key protection against duplicate submissions and network retries.
 * - Provides read-only technician-scoped payment receipt retrieval.
 * - Zero external gateway dependencies (customer pays business directly).
 */

import { eq, and, or, sql, desc } from 'drizzle-orm';
import { db } from '../../database/client';
import { invoices, jobCards, services, appSettings, payments } from '../../database/schema/index';
import { paymentsService } from '../payments/payments.service';
import { paymentsRepository, memoryPayments } from '../payments/payments.repository';
import { invoicesRepository, memoryInvoices } from '../invoices/invoices.repository';
import { memoryJobCards } from '../job-cards/job-cards.repository';
import { memoryServices } from '../services/services.repository';
import { technicianExecutionService } from './technician-execution.service';
import { TECHNICIAN_ERROR_CODES, HTTP_STATUS } from '@crm/shared';
import type {
  TechnicianRecordPaymentInput,
  TechnicianRecordPaymentResponse,
  TechnicianPaymentReceipt,
  TechnicianSessionData,
} from '@crm/types';

interface IdempotencyEntry {
  timestamp: number;
  response: TechnicianRecordPaymentResponse;
}

export class TechnicianPaymentService {
  private idempotencyStore = new Map<string, IdempotencyEntry>();
  private readonly IDEMPOTENCY_TTL_MS = 15 * 60 * 1000; // 15 minutes
  private paymentLocks = new Map<string, Promise<void>>();

  private async acquireLock(key: string): Promise<() => void> {
    while (this.paymentLocks.has(key)) {
      await this.paymentLocks.get(key);
    }
    let release: () => void = () => {};
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.paymentLocks.set(key, promise);
    return () => {
      this.paymentLocks.delete(key);
      release();
    };
  }

  /**
   * Helper to clean up expired idempotency keys
   */
  private sweepExpiredIdempotency() {
    const now = Date.now();
    for (const [key, entry] of this.idempotencyStore.entries()) {
      if (now - entry.timestamp > this.IDEMPOTENCY_TTL_MS) {
        this.idempotencyStore.delete(key);
      }
    }
  }

  /**
   * Record a payment against an authorized service or job card's linked invoice.
   * Leverages the existing CRM payment engine as the single source of truth.
   */
  async recordPayment(
    jobCardId: string,
    input: TechnicianRecordPaymentInput,
    session: TechnicianSessionData,
    database = db
  ): Promise<{ success: boolean; data: TechnicianRecordPaymentResponse; message: string }> {
    if (!session || !session.technicianId) {
      const error: any = new Error('Technician authentication required to record payment');
      error.statusCode = HTTP_STATUS.UNAUTHORIZED;
      error.code = TECHNICIAN_ERROR_CODES.SESSION_EXPIRED;
      throw error;
    }

    if (!jobCardId || typeof jobCardId !== 'string') {
      const error: any = new Error('Job Card identifier parameter is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      error.code = TECHNICIAN_ERROR_CODES.VALIDATION_ERROR;
      throw error;
    }

    const releaseLock = await this.acquireLock(jobCardId);
    try {
      // 1. Strict Server-Side Authorization:
      // Derives job card from session technicianId; throws 403 if assigned to another technician
      const jobCard = await technicianExecutionService.resolveAuthorizedJobCard(
        jobCardId,
        session.technicianId,
        database
      );

    // 2. Check Idempotency Key
    this.sweepExpiredIdempotency();
    const idempotencyKey = input.idempotencyKey?.trim();
    if (idempotencyKey) {
      const scopedKey = `${session.technicianId}:${idempotencyKey}`;
      const cached = this.idempotencyStore.get(scopedKey);
      if (cached && Date.now() - cached.timestamp < this.IDEMPOTENCY_TTL_MS) {
        return {
          success: true,
          data: cached.response,
          message: 'Payment recorded (idempotent duplicate submission acknowledged)',
        };
      }
    }

    // 3. Locate active linked invoice for this job card or service
    let targetInvoice: any = null;

    try {
      const [invoiceRow] = await database
        .select()
        .from(invoices)
        .where(
          and(
            or(
              eq(invoices.jobCardId, jobCard.id),
              jobCard.serviceId ? eq(invoices.serviceId, jobCard.serviceId) : sql`false`
            ),
            sql`${invoices.status} != 'CANCELLED'`
          )
        )
        .orderBy(desc(invoices.createdAt))
        .limit(1);

      if (invoiceRow) {
        targetInvoice = invoiceRow;
      }
    } catch {
      // Database query failed, check in-memory store
    }

    if (!targetInvoice) {
      const mem = memoryInvoices.find(
        (i: any) =>
          (i.jobCardId === jobCard.id ||
            (jobCard.serviceId && i.serviceId === jobCard.serviceId)) &&
          i.status !== 'CANCELLED'
      );
      if (mem) {
        targetInvoice = mem;
      }
    }

    if (!targetInvoice) {
      const error: any = new Error('No active invoice exists for this service order.');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      error.code = TECHNICIAN_ERROR_CODES.PAYMENT_NOT_ALLOWED;
      throw error;
    }

    // If client supplied invoiceId, verify it matches the authorized invoice
    if (input.invoiceId && input.invoiceId !== targetInvoice.id) {
      const error: any = new Error(
        'The specified invoice ID does not match the invoice associated with this authorized job.'
      );
      error.statusCode = HTTP_STATUS.FORBIDDEN;
      error.code = TECHNICIAN_ERROR_CODES.FORBIDDEN;
      throw error;
    }

    if (targetInvoice.status === 'CANCELLED') {
      const error: any = new Error('Cannot record payment for a cancelled invoice');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      error.code = TECHNICIAN_ERROR_CODES.PAYMENT_NOT_ALLOWED;
      throw error;
    }

    if (targetInvoice.status === 'DRAFT') {
      const error: any = new Error('Cannot record payment for an unissued draft invoice');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      error.code = TECHNICIAN_ERROR_CODES.PAYMENT_NOT_ALLOWED;
      throw error;
    }

    // 4. Re-read Authoritative Balance Immediately Before Committing
    const invDetail = await invoicesRepository.findById(targetInvoice.id, database);
    if (!invDetail) {
      const error: any = new Error('Unable to load authoritative invoice balance');
      error.statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR;
      throw error;
    }

    const currentOutstanding = parseFloat(invDetail.outstandingAmount || '0');
    if (currentOutstanding <= 0.001 || invDetail.status === 'PAID') {
      const error: any = new Error('Invoice is already fully paid. No further payment can be recorded.');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      error.code = TECHNICIAN_ERROR_CODES.PAYMENT_NOT_ALLOWED;
      throw error;
    }

    const paymentAmount = Number(input.amount);
    if (isNaN(paymentAmount) || paymentAmount <= 0) {
      const error: any = new Error('Payment amount must be greater than zero');
      error.statusCode = HTTP_STATUS.UNPROCESSABLE_ENTITY;
      error.code = TECHNICIAN_ERROR_CODES.PAYMENT_AMOUNT_INVALID;
      throw error;
    }

    // Strict Overpayment Prevention
    if (paymentAmount > currentOutstanding + 0.001) {
      const error: any = new Error(
        `Payment amount (₹${paymentAmount.toFixed(2)}) exceeds current outstanding balance (₹${currentOutstanding.toFixed(2)})`
      );
      error.statusCode = HTTP_STATUS.UNPROCESSABLE_ENTITY;
      error.code = 'PAYMENT_EXCEEDS_OUTSTANDING';
      throw error;
    }

    // 5. Invoke Authoritative CRM Payment Engine
    const actorName = session.fullName ? `Technician: ${session.fullName}` : 'Technician';
    const notes = input.notes?.trim()
      ? `[Collected by ${actorName}] ${input.notes.trim()}`
      : `Payment collected in field by ${actorName}`;

    const recordResult = await paymentsService.recordPayment(
      {
        invoiceId: targetInvoice.id,
        customerId: targetInvoice.customerId,
        amount: Number(paymentAmount.toFixed(2)),
        paymentMethod: input.paymentMethod,
        referenceNumber: input.referenceNumber?.trim() || null,
        notes,
      },
      session.technicianId,
      actorName
    );

    const paymentNumber = recordResult.payment.paymentNumber;
    const responseData: TechnicianRecordPaymentResponse = {
      paymentId: recordResult.payment.id,
      paymentNumber,
      invoiceId: targetInvoice.id,
      invoiceNumber: recordResult.invoiceNumber || targetInvoice.invoiceNumber,
      amount: Number(recordResult.payment.amount),
      paymentMethod: recordResult.payment.paymentMethod,
      referenceNumber: recordResult.payment.referenceNumber || null,
      paymentDate: recordResult.payment.paymentDate,
      remainingOutstanding: recordResult.remainingOutstanding,
      paymentStatus: recordResult.newInvoiceStatus,
      receiptNumber: paymentNumber,
      notes: recordResult.payment.notes || null,
    };

    // Cache in idempotency store if key was provided
    if (idempotencyKey) {
      const scopedKey = `${session.technicianId}:${idempotencyKey}`;
      this.idempotencyStore.set(scopedKey, {
        timestamp: Date.now(),
        response: responseData,
      });
    }

      return {
        success: true,
        data: responseData,
        message: 'Payment recorded successfully',
      };
    } finally {
      releaseLock();
    }
  }

  /**
   * GET /api/v1/technician/payments/:id/receipt
   * Authoritative Receipt Generation & Retrieval
   * Strictly enforces that payment belongs to an invoice associated with an authorized service/job
   */
  async getPaymentReceipt(
    paymentId: string,
    technicianId: string,
    database = db
  ): Promise<{ success: boolean; data: TechnicianPaymentReceipt }> {
    if (!technicianId || typeof technicianId !== 'string') {
      const error: any = new Error('Technician authentication required');
      error.statusCode = HTTP_STATUS.UNAUTHORIZED;
      error.code = TECHNICIAN_ERROR_CODES.SESSION_EXPIRED;
      throw error;
    }

    if (!paymentId || typeof paymentId !== 'string') {
      const error: any = new Error('Payment identifier is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      error.code = TECHNICIAN_ERROR_CODES.VALIDATION_ERROR;
      throw error;
    }

    // 1. Fetch payment by ID from authoritative payment repository
    const payment = await paymentsRepository.findById(paymentId, database);
    if (!payment) {
      const error: any = new Error('Payment record not found');
      error.statusCode = HTTP_STATUS.NOT_FOUND;
      error.code = 'PAYMENT_NOT_FOUND';
      throw error;
    }

    // 2. Strict Server-Side Receipt Authorization
    // Verify invoice linked to this payment belongs to a job card or service assigned to this technician
    let isAuthorized = false;

    // Check database invoice linkage
    try {
      const [invRow] = await database
        .select({
          id: invoices.id,
          jobCardId: invoices.jobCardId,
          serviceId: invoices.serviceId,
        })
        .from(invoices)
        .where(eq(invoices.id, payment.invoiceId))
        .limit(1);

      if (invRow) {
        if (invRow.jobCardId) {
          const [jc] = await database
            .select({ technicianId: jobCards.technicianId })
            .from(jobCards)
            .where(eq(jobCards.id, invRow.jobCardId))
            .limit(1);
          if (jc && jc.technicianId === technicianId) {
            isAuthorized = true;
          }
        }

        if (!isAuthorized && invRow.serviceId) {
          const [svc] = await database
            .select({ technicianId: services.technicianId })
            .from(services)
            .where(eq(services.id, invRow.serviceId))
            .limit(1);
          if (svc && svc.technicianId === technicianId) {
            isAuthorized = true;
          }
        }
      }
    } catch {
      // Database check failed, fall through to in-memory check
    }

    // In-memory fallback check
    if (!isAuthorized) {
      const memInv = memoryInvoices.find((i) => i.id === payment.invoiceId);
      if (memInv) {
        if (memInv.jobCardId) {
          const memJc = memoryJobCards.find((j) => j.id === memInv.jobCardId);
          if (memJc && memJc.technicianId === technicianId) {
            isAuthorized = true;
          }
        }
        if (!isAuthorized && memInv.serviceId) {
          const memSvc = memoryServices.find((s) => s.id === memInv.serviceId);
          if (memSvc && memSvc.technicianId === technicianId) {
            isAuthorized = true;
          }
        }
      }
    }

    if (!isAuthorized) {
      const error: any = new Error(
        'Access denied: You are not authorized to view receipt for this payment.'
      );
      error.statusCode = HTTP_STATUS.FORBIDDEN;
      error.code = TECHNICIAN_ERROR_CODES.FORBIDDEN;
      throw error;
    }

    // 3. Load authoritative balance details from invoice repository
    let outstandingBalance = 0;
    try {
      const invDetail = await invoicesRepository.findById(payment.invoiceId, database);
      if (invDetail) {
        outstandingBalance = parseFloat(invDetail.outstandingAmount || '0');
      }
    } catch {}

    // 4. Load business details for receipt rendering
    let businessDetails: any = {
      businessName: 'Enterprises CRM',
    };
    try {
      const [setting] = await database
        .select({ value: appSettings.value })
        .from(appSettings)
        .where(eq(appSettings.category, 'PAYMENT'))
        .limit(1);
      if (setting?.value) {
        businessDetails = setting.value;
      }
    } catch {}

    const receiptData: TechnicianPaymentReceipt = {
      paymentId: payment.id,
      paymentNumber: payment.paymentNumber,
      receiptNumber: payment.paymentNumber,
      invoiceId: payment.invoiceId,
      invoiceNumber: payment.invoiceNumber,
      invoiceTotal: Number(payment.invoiceTotal || 0),
      customerName: payment.customerName || 'Valued Customer',
      customerPhone: payment.customerPhone || undefined,
      customerEmail: payment.customerEmail || undefined,
      amount: Number(payment.amount),
      paymentMethod: payment.paymentMethod,
      referenceNumber: payment.referenceNumber || null,
      outstandingBalance,
      paymentDate: payment.paymentDate,
      paymentStatus: payment.invoiceStatus,
      notes: payment.notes || null,
      receivedByName: payment.receivedByName || undefined,
      businessDetails: {
        businessName: businessDetails.businessName || 'Enterprises CRM',
        phone: businessDetails.phone || '',
        email: businessDetails.email || '',
        address: businessDetails.address || '',
        gstin: businessDetails.gstin || '',
        upiId: businessDetails.upiId || '',
      },
    };

    return {
      success: true,
      data: receiptData,
    };
  }
}

export const technicianPaymentService = new TechnicianPaymentService();
