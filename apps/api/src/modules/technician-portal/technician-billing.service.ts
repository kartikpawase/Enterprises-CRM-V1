import { eq, or, and, sql, desc } from 'drizzle-orm';
import { db } from '../../database/client';
import { invoices, appSettings } from '../../database/schema/index';
import { invoicesRepository, memoryInvoices } from '../invoices/invoices.repository';
import { technicianExecutionService } from './technician-execution.service';
import { TECHNICIAN_ERROR_CODES, HTTP_STATUS } from '@crm/shared';
import type { TechnicianBillingSummary } from '@crm/types';

export class TechnicianBillingService {
  /**
   * Resolve authoritative billing summary for an assigned service or job card.
   * Strictly verifies server-side technician authorization before accessing any financial records.
   * Returns exact CRM billing values (Invoice Number, Total, Paid, Outstanding, Payment Status)
   * with zero duplicate calculations.
   */
  async getBillingSummary(
    id: string,
    technicianId: string,
    database = db
  ): Promise<TechnicianBillingSummary | null> {
    if (!technicianId || typeof technicianId !== 'string') {
      const error: any = new Error('Authentication required to access billing data');
      error.statusCode = HTTP_STATUS.UNAUTHORIZED;
      error.code = TECHNICIAN_ERROR_CODES.SESSION_EXPIRED;
      throw error;
    }

    if (!id || typeof id !== 'string') {
      const error: any = new Error('Identifier parameter is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      error.code = TECHNICIAN_ERROR_CODES.VALIDATION_ERROR;
      throw error;
    }

    // 1. Authorize: Resolves job card/service and enforces technicianId === sessionTechnicianId
    // Throws 403 FORBIDDEN if assigned to another technician or unassigned
    const jobCard = await technicianExecutionService.resolveAuthorizedJobCard(
      id,
      technicianId,
      database
    );

    // 2. Locate linked invoice for this job card or service
    let targetInvoiceId: string | null = null;

    try {
      const [invoiceRow] = await database
        .select({
          id: invoices.id,
          status: invoices.status,
        })
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
        targetInvoiceId = invoiceRow.id;
      }
    } catch {
      // Fall through to memory store check on error or offline
    }

    // Fallback for resilient memory store in testing / offline desktop mode
    if (!targetInvoiceId) {
      const mem = memoryInvoices.find(
        (i: any) =>
          (i.jobCardId === jobCard.id ||
            (jobCard.serviceId && i.serviceId === jobCard.serviceId)) &&
          i.status !== 'CANCELLED'
      );
      if (mem) {
        targetInvoiceId = mem.id;
      }
    }

    // If no invoice exists yet for this service/job, return null gracefully (not an error)
    if (!targetInvoiceId) {
      return null;
    }

    // 3. Obtain authoritative financial values from existing CRM Invoices Repository
    // (Preserves exact rounding, payment ledger aggregation, and dynamic payment statuses)
    const inv = await invoicesRepository.findById(targetInvoiceId, database);
    if (!inv) {
      return null;
    }

    const totalAmount = parseFloat(inv.totalAmount || '0');
    const paidAmount = parseFloat(inv.paidAmount || '0');
    const outstandingAmount = parseFloat(inv.outstandingAmount || '0');
    const paymentStatus = inv.status || 'ISSUED';

    return {
      jobCardId: jobCard.id,
      serviceId: jobCard.serviceId,
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      totalAmount,
      paidAmount,
      outstandingAmount,
      paymentStatus,
      status: paymentStatus,
      dueDate: inv.dueDate ? new Date(inv.dueDate).toISOString() : null,
      invoiceDate: inv.invoiceDate ? new Date(inv.invoiceDate).toISOString() : null,
    };
  }

  /**
   * GET /api/v1/technician/job-cards/:id/payment-summary
   * Phase 6: Read-Only Billing Visibility Endpoint
   * Returns authoritative Invoice Number, Total, Paid, Outstanding, and Payment Status
   */
  async getPaymentSummary(id: string, technicianId: string) {
    const billing = await this.getBillingSummary(id, technicianId);

    if (!billing) {
      return {
        success: true,
        data: null,
        message: 'Invoice not yet available for this service order.',
      };
    }

    let businessSettings: any = {};
    try {
      const [setting] = await db
        .select({ value: appSettings.value })
        .from(appSettings)
        .where(eq(appSettings.category, 'PAYMENT'))
        .limit(1);
      if (setting?.value) businessSettings = setting.value;
    } catch {}

    return {
      success: true,
      data: {
        ...billing,
        businessName: businessSettings.businessName || 'Enterprises CRM',
        upiId: businessSettings.upiId || null,
        upiQr: businessSettings.upiQr || null,
        accountName: businessSettings.accountName || null,
        bankName: businessSettings.bankName || null,
        accountNumber: businessSettings.accountNumber || null,
        ifsc: businessSettings.ifsc || null,
      },
    };
  }
}

export const technicianBillingService = new TechnicianBillingService();
