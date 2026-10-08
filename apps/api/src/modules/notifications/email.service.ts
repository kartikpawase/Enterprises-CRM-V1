import { eq, and, desc, sql, or, ilike } from 'drizzle-orm';
import { db } from '../../database/client';
import {
  sales,
  saleItems,
  invoices,
  invoiceItems,
  payments,
  services,
  warranties,
  customers,
  customerAddresses,
  customerAssets,
  products,
  technicians,
  emailNotifications,
} from '../../database/schema/index';
import { emailQueueWorker } from './email-queue.worker';
import { phpMailerService, type TransactionalEmailPayload, type PhpMailerResult } from './php-mailer.service';

export class EmailService {
  /**
   * Base Send Method - Dispatches through database-backed queue worker with idempotency
   */
  async send(params: {
    customerId?: string | null;
    eventType: TransactionalEmailPayload['eventType'];
    referenceType?: string | null;
    referenceId?: string | null;
    idempotencyKey?: string | null;
    recipientEmail: string;
    recipientName?: string | null;
    subject: string;
    payload: Record<string, any>;
    attachInvoicePdf?: boolean;
  }) {
    return emailQueueWorker.enqueue({
      customerId: params.customerId,
      eventType: params.eventType,
      referenceType: params.referenceType,
      referenceId: params.referenceId,
      idempotencyKey: params.idempotencyKey,
      recipientEmail: params.recipientEmail,
      recipientName: params.recipientName,
      subject: params.subject,
      payload: params.payload,
      attachInvoicePdf: params.attachInvoicePdf,
    });
  }

  /**
   * 1. Sale Confirmation Email
   * Triggered when a sale is confirmed / created as completed
   */
  async sendSaleConfirmation(saleId: string) {
    // 1. Fetch sale record
    const [sale] = await db
      .select({
        id: sales.id,
        saleNumber: sales.saleNumber,
        customerId: sales.customerId,
        saleDate: sales.saleDate,
        status: sales.status,
        subtotal: sales.subtotal,
        discountAmount: sales.discountAmount,
        taxAmount: sales.taxAmount,
        totalAmount: sales.totalAmount,
        notes: sales.notes,
      })
      .from(sales)
      .where(eq(sales.id, saleId));

    if (!sale) return null;

    // 2. Fetch authoritative CURRENT customer record from database (Single Source of Truth)
    let customer: any = null;
    if (sale.customerId) {
      const [c] = await db
        .select({
          id: customers.id,
          fullName: customers.fullName,
          email: customers.email,
          phone: customers.phone,
          customerNumber: customers.customerNumber,
        })
        .from(customers)
        .where(eq(customers.id, sale.customerId));
      customer = c;
    }

    // Fetch sale items
    const items = await db
      .select()
      .from(saleItems)
      .where(eq(saleItems.saleId, saleId));

    // Fetch linked invoice if present
    const [linkedInvoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.saleId, saleId));

    const recipientEmail = customer?.email ? customer.email.trim().toLowerCase() : '';
    const recipientName = customer?.fullName || 'Valued Customer';
    const customerPhone = customer?.phone || '';
    const customerNumber = customer?.customerNumber || '';
    const invoiceNumber = linkedInvoice?.invoiceNumber || undefined;

    const payload = {
      saleNumber: sale.saleNumber,
      saleDate: sale.saleDate ? new Date(sale.saleDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      totalAmount: parseFloat(sale.totalAmount),
      subtotal: parseFloat(sale.subtotal),
      taxAmount: parseFloat(sale.taxAmount),
      discountAmount: parseFloat(sale.discountAmount),
      invoiceNumber,
      customerNumber,
      customerName: recipientName,
      customerEmail: recipientEmail,
      customerPhone,
      items: items.map((i) => ({
        productName: i.productNameSnapshot,
        sku: i.skuSnapshot,
        quantity: i.quantity,
        unitPrice: parseFloat(i.unitPriceSnapshot),
        lineTotal: parseFloat(i.lineTotal),
      })),
      invoiceData: linkedInvoice
        ? {
            invoiceNumber: linkedInvoice.invoiceNumber,
            invoiceDate: linkedInvoice.invoiceDate,
            dueDate: linkedInvoice.dueDate,
            subtotal: parseFloat(linkedInvoice.subtotal),
            discountAmount: parseFloat(linkedInvoice.discountAmount),
            taxAmount: parseFloat(linkedInvoice.taxAmount),
            totalAmount: parseFloat(linkedInvoice.totalAmount),
            customerName: recipientName,
            customerEmail: recipientEmail,
            customerPhone,
            customerNumber,
            items: items.map((i) => ({
              nameSnapshot: i.productNameSnapshot,
              skuSnapshot: i.skuSnapshot,
              quantity: i.quantity,
              unitPriceSnapshot: parseFloat(i.unitPriceSnapshot),
              taxRatePercent: parseFloat(i.taxRatePercent),
              lineTotal: parseFloat(i.lineTotal),
            })),
          }
        : undefined,
    };

    return this.send({
      customerId: sale.customerId,
      eventType: 'SALE_CONFIRMATION',
      referenceType: 'SALE',
      referenceId: sale.id,
      idempotencyKey: `SALE_CONFIRMATION:${sale.id}`,
      recipientEmail,
      recipientName,
      subject: `Order Confirmation: Sale #${sale.saleNumber}`,
      payload,
      attachInvoicePdf: Boolean(linkedInvoice),
    });
  }

  /**
   * 2. Payment Receipt Email
   * Triggered when a payment is recorded against an invoice
   */
  async sendPaymentReceipt(paymentId: string) {
    // 1. Fetch payment with invoice
    const [pay] = await db
      .select({
        id: payments.id,
        paymentNumber: payments.paymentNumber,
        amount: payments.amount,
        paymentDate: payments.paymentDate,
        paymentMethod: payments.paymentMethod,
        referenceNumber: payments.referenceNumber,
        notes: payments.notes,
        invoiceId: payments.invoiceId,
        customerId: payments.customerId,
        invoiceCustomerId: invoices.customerId,
        invoiceNumber: invoices.invoiceNumber,
        invoiceTotal: invoices.totalAmount,
        invoiceSubtotal: invoices.subtotal,
        invoiceDiscount: invoices.discountAmount,
        invoiceTax: invoices.taxAmount,
        saleId: invoices.saleId,
        invoiceStatus: invoices.status,
        dueDate: invoices.dueDate,
      })
      .from(payments)
      .leftJoin(invoices, eq(payments.invoiceId, invoices.id))
      .where(eq(payments.id, paymentId));

    if (!pay) return null;

    const resolvedCustomerId = pay.customerId || pay.invoiceCustomerId;

    // 2. Fetch authoritative CURRENT customer record from database (Single Source of Truth)
    let customer: any = null;
    if (resolvedCustomerId) {
      const [c] = await db
        .select({
          id: customers.id,
          fullName: customers.fullName,
          email: customers.email,
          phone: customers.phone,
          customerNumber: customers.customerNumber,
        })
        .from(customers)
        .where(eq(customers.id, resolvedCustomerId));
      customer = c;
    }

    // 3. Fetch all completed payments for this invoice to calculate previous and total paid
    const allInvoicePayments = await db
      .select({
        id: payments.id,
        amount: payments.amount,
        paymentDate: payments.paymentDate,
        status: payments.status,
      })
      .from(payments)
      .where(
        and(
          eq(payments.invoiceId, pay.invoiceId),
          eq(payments.status, 'COMPLETED')
        )
      );

    const invoiceTotal = parseFloat(pay.invoiceTotal || '0');
    const currentPaymentAmount = parseFloat(pay.amount || '0');

    // Total paid including this payment
    const totalPaidAmount = allInvoicePayments.reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0);
    const previousPaidAmount = Math.max(0, totalPaidAmount - currentPaymentAmount);
    const previousOutstanding = Math.max(0, Number((invoiceTotal - previousPaidAmount).toFixed(2)));
    const remainingBalance = Math.max(0, Number((invoiceTotal - totalPaidAmount).toFixed(2)));
    const paymentStatus = remainingBalance <= 0.01 ? 'PAID' : 'PARTIALLY PAID';

    // 4. Fetch customer default address if available
    let customerAddress = 'Doorstep Service Address';
    if (resolvedCustomerId) {
      try {
        const [addr] = await db
          .select()
          .from(customerAddresses)
          .where(eq(customerAddresses.customerId, resolvedCustomerId));
        if (addr) {
          customerAddress = [addr.addressLine1, addr.addressLine2, addr.landmark, addr.city, addr.state, addr.postalCode]
            .filter(Boolean)
            .join(', ');
        }
      } catch {
        // use default address
      }
    }

    // 5. Fetch invoice line items for PDF generation
    let itemsForPdf: any[] = [];
    try {
      const invItems = await db
        .select()
        .from(invoiceItems)
        .where(eq(invoiceItems.invoiceId, pay.invoiceId));

      if (invItems.length > 0) {
        itemsForPdf = invItems.map((i) => ({
          nameSnapshot: i.nameSnapshot,
          productName: i.nameSnapshot,
          descriptionSnapshot: i.descriptionSnapshot,
          quantity: i.quantity,
          unit: 'PCS',
          unitPriceSnapshot: parseFloat(i.unitPriceSnapshot || '0'),
          unitPrice: parseFloat(i.unitPriceSnapshot || '0'),
          taxRatePercent: parseFloat(i.taxRatePercent || '0'),
          lineTotal: parseFloat(i.lineTotal || '0'),
        }));
      } else if (pay.saleId) {
        const sItems = await db
          .select()
          .from(saleItems)
          .where(eq(saleItems.saleId, pay.saleId));

        if (sItems.length > 0) {
          itemsForPdf = sItems.map((i) => ({
            nameSnapshot: i.productNameSnapshot,
            productName: i.productNameSnapshot,
            descriptionSnapshot: i.skuSnapshot,
            quantity: i.quantity,
            unit: 'PCS',
            unitPriceSnapshot: parseFloat(i.unitPriceSnapshot || '0'),
            unitPrice: parseFloat(i.unitPriceSnapshot || '0'),
            taxRatePercent: parseFloat(i.taxRatePercent || '0'),
            lineTotal: parseFloat(i.lineTotal || '0'),
          }));
        }
      }
    } catch {
      // fallback handled below
    }

    if (itemsForPdf.length === 0) {
      itemsForPdf = [
        {
          nameSnapshot: `Equipment & Services (Invoice #${pay.invoiceNumber})`,
          productName: `Equipment & Services (Invoice #${pay.invoiceNumber})`,
          descriptionSnapshot: 'Commercial & Residential Equipment Spares & Services',
          quantity: 1,
          unit: 'PCS',
          unitPriceSnapshot: invoiceTotal,
          unitPrice: invoiceTotal,
          taxRatePercent: 0,
          lineTotal: invoiceTotal,
        },
      ];
    }

    const recipientEmail = customer?.email ? customer.email.trim().toLowerCase() : '';
    const recipientName = customer?.fullName || 'Valued Customer';
    const customerPhone = customer?.phone || '';
    const customerNumber = customer?.customerNumber || '';
    const formattedPaymentDate = pay.paymentDate
      ? new Date(pay.paymentDate).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    const payload = {
      customerName: recipientName,
      customerEmail: recipientEmail,
      customerPhone,
      customerNumber,
      customerAddress,
      paymentNumber: pay.paymentNumber,
      invoiceNumber: pay.invoiceNumber,
      paymentDate: formattedPaymentDate,
      dueDate: pay.dueDate ? new Date(pay.dueDate).toISOString().split('T')[0] : null,
      nextDueDate: pay.dueDate ? new Date(pay.dueDate).toISOString().split('T')[0] : null,
      amount: currentPaymentAmount,
      previousPaidAmount,
      previousOutstanding,
      totalPaidAmount,
      totalAmount: invoiceTotal,
      remainingBalance,
      paymentStatus,
      paymentMethod: pay.paymentMethod,
      referenceNumber: pay.referenceNumber,
      attachInvoicePdf: true,
      invoiceData: {
        invoiceNumber: pay.invoiceNumber,
        invoiceDate: formattedPaymentDate,
        dueDate: pay.dueDate ? new Date(pay.dueDate).toISOString().split('T')[0] : null,
        nextDueDate: pay.dueDate ? new Date(pay.dueDate).toISOString().split('T')[0] : null,
        subtotal: parseFloat(pay.invoiceSubtotal || '0') || (invoiceTotal - parseFloat(pay.invoiceTax || '0')),
        discountAmount: parseFloat(pay.invoiceDiscount || '0'),
        taxAmount: parseFloat(pay.invoiceTax || '0'),
        totalAmount: invoiceTotal,
        paidAmount: totalPaidAmount,
        outstandingAmount: remainingBalance,
        previousPaidAmount,
        previousOutstanding,
        status: paymentStatus,
        customerName: recipientName,
        customerEmail: recipientEmail,
        customerPhone,
        customerNumber,
        customerAddress,
        items: itemsForPdf,
      },
    };

    return this.send({
      customerId: resolvedCustomerId,
      eventType: 'PAYMENT_RECEIPT',
      referenceType: 'PAYMENT',
      referenceId: pay.id,
      idempotencyKey: `PAYMENT_RECEIPT:${pay.id}`,
      recipientEmail,
      recipientName,
      subject: `Payment Receipt & Invoice — ${pay.invoiceNumber} — Enterprises CRM`,
      payload,
      attachInvoicePdf: true,
    });
  }

  /**
   * 3. Service Completed Email
   */
  async sendServiceCompleted(serviceId: string) {
    const [srv] = await db
      .select({
        id: services.id,
        serviceNumber: services.serviceNumber,
        serviceType: services.serviceType,
        scheduledDate: services.scheduledDate,
        completedAt: services.completedAt,
        customerNotes: services.customerNotes,
        internalNotes: services.internalNotes,
        customerId: services.customerId,
        technicianName: technicians.fullName,
      })
      .from(services)
      .leftJoin(technicians, eq(services.technicianId, technicians.id))
      .where(eq(services.id, serviceId));

    if (!srv) return null;

    // Fetch authoritative CURRENT customer record from database
    let customer: any = null;
    if (srv.customerId) {
      const [c] = await db
        .select({
          id: customers.id,
          fullName: customers.fullName,
          email: customers.email,
          phone: customers.phone,
          customerNumber: customers.customerNumber,
        })
        .from(customers)
        .where(eq(customers.id, srv.customerId));
      customer = c;
    }

    const recipientEmail = customer?.email ? customer.email.trim().toLowerCase() : '';
    const recipientName = customer?.fullName || 'Valued Customer';

    const payload = {
      serviceNumber: srv.serviceNumber,
      serviceType: srv.serviceType,
      serviceDate: srv.scheduledDate ? new Date(srv.scheduledDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      completedDate: srv.completedAt ? new Date(srv.completedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      technicianName: srv.technicianName || 'Certified Technician',
      serviceDescription: srv.internalNotes || srv.customerNotes || 'Complete service inspection & maintenance.',
      customerName: recipientName,
      customerEmail: recipientEmail,
    };

    return this.send({
      customerId: srv.customerId,
      eventType: 'SERVICE_COMPLETED',
      referenceType: 'SERVICE',
      referenceId: srv.id,
      idempotencyKey: `SERVICE_COMPLETED:${srv.id}`,
      recipientEmail,
      recipientName,
      subject: `Service Completed: #${srv.serviceNumber}`,
      payload,
    });
  }

  /**
   * 4. Service Reminder Email
   */
  async sendServiceReminder(serviceId: string) {
    const [srv] = await db
      .select({
        id: services.id,
        serviceNumber: services.serviceNumber,
        serviceType: services.serviceType,
        scheduledDate: services.scheduledDate,
        scheduledTimeSlot: services.scheduledTimeSlot,
        customerId: services.customerId,
        technicianName: technicians.fullName,
        customAssetName: customerAssets.customName,
        serialNumber: customerAssets.serialNumber,
        productName: products.name,
        productBrand: products.brand,
        productModel: products.model,
      })
      .from(services)
      .leftJoin(customerAssets, eq(services.assetId, customerAssets.id))
      .leftJoin(products, eq(customerAssets.productId, products.id))
      .leftJoin(technicians, eq(services.technicianId, technicians.id))
      .where(eq(services.id, serviceId));

    if (!srv) return null;

    // Fetch authoritative CURRENT customer record from database
    let customer: any = null;
    if (srv.customerId) {
      const [c] = await db
        .select({
          id: customers.id,
          fullName: customers.fullName,
          email: customers.email,
          phone: customers.phone,
          customerNumber: customers.customerNumber,
        })
        .from(customers)
        .where(eq(customers.id, srv.customerId));
      customer = c;
    }

    const recipientEmail = customer?.email ? customer.email.trim().toLowerCase() : '';
    const recipientName = customer?.fullName || 'Valued Customer';
    const dateStr = srv.scheduledDate ? new Date(srv.scheduledDate).toISOString().split('T')[0] : '';
    const machineName = srv.customAssetName || srv.productName || (srv.productBrand ? `${srv.productBrand} Equipment` : 'Equipment');

    const payload = {
      serviceNumber: srv.serviceNumber,
      serviceType: srv.serviceType ? srv.serviceType.replace(/_/g, ' ') : 'Periodic Maintenance',
      scheduledDate: dateStr,
      timeSlot: srv.scheduledTimeSlot || 'Morning (10:00 AM - 12:00 PM)',
      technicianName: srv.technicianName || 'Certified Technician',
      machineName,
      serialNumber: srv.serialNumber || 'N/A',
      customerName: recipientName,
      customerEmail: recipientEmail,
    };

    return this.send({
      customerId: srv.customerId,
      eventType: 'SERVICE_REMINDER',
      referenceType: 'SERVICE',
      referenceId: srv.id,
      idempotencyKey: `SERVICE_REMINDER:${srv.id}:${dateStr}`,
      recipientEmail,
      recipientName,
      subject: `Service Reminder: Scheduled for ${dateStr} - #${srv.serviceNumber}`,
      payload,
    });
  }

  /**
   * 5. Payment Pending Reminder Email
   */
  async sendPaymentPendingReminder(invoiceId: string): Promise<(PhpMailerResult & { notificationId?: string }) | null> {
    if (!invoiceId || typeof invoiceId !== 'string' || invoiceId.trim() === '') {
      return null;
    }

    const { invoicesRepository } = await import('../invoices/invoices.repository');
    const inv = await invoicesRepository.findById(invoiceId.trim());

    if (!inv) {
      return {
        success: false,
        status: 'FAILED',
        reason: 'INVOICE_NOT_FOUND',
        error: `Invoice record '${invoiceId}' could not be found.`,
      };
    }

    if (inv.status === 'CANCELLED' || inv.status === 'DRAFT') {
      return {
        success: false,
        status: 'SKIPPED',
        reason: 'INVOICE_NOT_ELIGIBLE',
        error: `Invoice #${inv.invoiceNumber} is in ${inv.status} status and is not eligible for payment reminders.`,
      };
    }

    const totalAmount = parseFloat(inv.totalAmount || '0');
    const paidAmount = parseFloat(inv.paidAmount || '0');
    const outstandingAmount = Math.max(0, Number((totalAmount - paidAmount).toFixed(2)));

    // Do not send reminder if invoice is already settled
    if (outstandingAmount <= 0.01) {
      return {
        success: false,
        status: 'SKIPPED',
        reason: 'INVOICE_ALREADY_PAID',
        error: `Invoice #${inv.invoiceNumber} is already fully paid (Balance: ₹0.00). No reminder is due.`,
      };
    }

    // Authoritative customer lookup (single source of truth)
    let recipientEmail = (inv.customerEmail || '').trim().toLowerCase();
    let recipientName = inv.customerName || 'Valued Customer';
    let customerNumber = inv.customerNumber || '';

    // If customer email not in invoice snapshot, check customers table directly
    if ((!recipientEmail || !recipientEmail.includes('@')) && inv.customerId) {
      const [c] = await db
        .select({
          id: customers.id,
          fullName: customers.fullName,
          email: customers.email,
          phone: customers.phone,
          customerNumber: customers.customerNumber,
        })
        .from(customers)
        .where(eq(customers.id, inv.customerId));
      if (c) {
        if (c.email) recipientEmail = c.email.trim().toLowerCase();
        if (c.fullName) recipientName = c.fullName;
        if (c.customerNumber) customerNumber = c.customerNumber;
      }
    }

    const dueDateStr = inv.dueDate ? new Date(inv.dueDate).toISOString().split('T')[0] : '';

    if (!recipientEmail || !recipientEmail.includes('@')) {
      return {
        success: false,
        status: 'SKIPPED',
        reason: 'EMAIL_SKIPPED_NO_VALID_ADDRESS',
        error: `Customer ${recipientName} has no valid email address in the database.`,
        recipient: recipientEmail,
      };
    }

    const payload = {
      invoiceNumber: inv.invoiceNumber,
      totalAmount,
      paidAmount,
      dueAmount: outstandingAmount,
      dueDate: dueDateStr,
      customerNumber,
      customerName: recipientName,
      customerEmail: recipientEmail,
      eventType: 'PAYMENT_REMINDER' as const,
      toEmail: recipientEmail,
      toName: recipientName,
      subject: `Payment Reminder: Invoice #${inv.invoiceNumber}`,
      customerId: inv.customerId,
      referenceType: 'INVOICE',
      referenceId: inv.id,
    };

    // Execute direct dispatch via PHPMailer to verify actual SMTP acceptance
    const dispatchResult = await phpMailerService.dispatch(payload);

    // Record notification in audit log table
    const status = dispatchResult.success ? 'SENT' : (dispatchResult.status === 'SKIPPED' ? 'SKIPPED' : 'FAILED');
    const sentAt = dispatchResult.success ? new Date() : null;
    const failedAt = dispatchResult.success ? null : new Date();
    const lastError = dispatchResult.success ? null : (dispatchResult.error || dispatchResult.reason || 'Unknown dispatch error');

    try {
      const [record] = await db
        .insert(emailNotifications)
        .values({
          customerId: inv.customerId,
          eventType: 'PAYMENT_REMINDER',
          referenceType: 'INVOICE',
          referenceId: inv.id,
          idempotencyKey: `PAYMENT_REMINDER:${inv.id}:${Date.now()}`,
          recipientEmail,
          recipientName,
          subject: `Payment Reminder: Invoice #${inv.invoiceNumber}`,
          status,
          sentAt,
          failedAt,
          lastError,
          pdfAttached: false,
          metadata: {
            referenceType: 'INVOICE',
            referenceId: inv.id,
            invoiceNumber: inv.invoiceNumber,
          },
        })
        .returning();

      return {
        ...dispatchResult,
        notificationId: record?.id,
      };
    } catch {
      return dispatchResult;
    }
  }

  /**
   * 6. Thank You / Follow-up Email
   */
  async sendThankYou(referenceType: 'SALE' | 'SERVICE', referenceId: string) {
    let targetCustomerId: string | null = null;
    let referenceText = '';

    if (referenceType === 'SALE') {
      const [s] = await db
        .select({ customerId: sales.customerId, saleNumber: sales.saleNumber })
        .from(sales)
        .where(eq(sales.id, referenceId));
      if (s) {
        targetCustomerId = s.customerId;
        referenceText = `Your recent purchase (Order #${s.saleNumber})`;
      }
    } else {
      const [srv] = await db
        .select({ customerId: services.customerId, serviceNumber: services.serviceNumber })
        .from(services)
        .where(eq(services.id, referenceId));
      if (srv) {
        targetCustomerId = srv.customerId;
        referenceText = `Your recent service visit (#${srv.serviceNumber})`;
      }
    }

    if (!targetCustomerId) return null;

    // Fetch authoritative CURRENT customer record from database
    const [customer] = await db
      .select({
        id: customers.id,
        fullName: customers.fullName,
        email: customers.email,
      })
      .from(customers)
      .where(eq(customers.id, targetCustomerId));

    const recipientEmail = customer?.email ? customer.email.trim().toLowerCase() : '';
    const recipientName = customer?.fullName || 'Valued Customer';

    if (!recipientEmail || !recipientEmail.includes('@')) return null;

    return this.send({
      customerId: targetCustomerId,
      eventType: 'THANK_YOU',
      referenceType,
      referenceId,
      idempotencyKey: `THANK_YOU:${referenceType}:${referenceId}`,
      recipientEmail,
      recipientName,
      subject: `Thank You for Choosing Enterprises CRM!`,
      payload: { referenceText, customerName: recipientName, customerEmail: recipientEmail },
    });
  }

  /**
   * 7. Warranty Expiry Reminder Email
   */
  async sendWarrantyExpiryReminder(warrantyId: string, daysRemaining = 30) {
    const [war] = await db
      .select({
        id: warranties.id,
        warrantyNumber: warranties.warrantyNumber,
        startDate: warranties.startDate,
        endDate: warranties.endDate,
        status: warranties.status,
        customerId: warranties.customerId,
        assetName: customerAssets.customName,
        serialNumber: customerAssets.serialNumber,
      })
      .from(warranties)
      .leftJoin(customerAssets, eq(warranties.assetId, customerAssets.id))
      .where(eq(warranties.id, warrantyId));

    if (!war || war.status === 'EXPIRED' || war.status === 'VOID') {
      return null;
    }

    // Fetch authoritative CURRENT customer record from database
    let customer: any = null;
    if (war.customerId) {
      const [c] = await db
        .select({
          id: customers.id,
          fullName: customers.fullName,
          email: customers.email,
          phone: customers.phone,
          customerNumber: customers.customerNumber,
        })
        .from(customers)
        .where(eq(customers.id, war.customerId));
      customer = c;
    }

    const recipientEmail = customer?.email ? customer.email.trim().toLowerCase() : '';
    const recipientName = customer?.fullName || 'Valued Customer';
    const expiryDateStr = war.endDate ? new Date(war.endDate).toISOString().split('T')[0] : '';

    const payload = {
      warrantyNumber: war.warrantyNumber,
      machineModel: war.assetName || 'Equipment',
      serialNumber: war.serialNumber,
      startDate: war.startDate ? new Date(war.startDate).toISOString().split('T')[0] : '',
      endDate: expiryDateStr,
      daysRemaining,
      customerName: recipientName,
      customerEmail: recipientEmail,
    };

    return this.send({
      customerId: war.customerId,
      eventType: 'WARRANTY_EXPIRY_REMINDER',
      referenceType: 'WARRANTY',
      referenceId: war.id,
      idempotencyKey: `WARRANTY_EXPIRY_${daysRemaining}D:${war.id}`,
      recipientEmail,
      recipientName,
      subject: `Warranty Expiry Notice: ${daysRemaining} Days Remaining for ${war.assetName || 'Equipment'}`,
      payload,
    });
  }

  /**
   * 8. Admin Test Email
   */
  async sendAdminTestEmail(targetEmail: string) {
    return phpMailerService.dispatch({
      eventType: 'ADMIN_TEST',
      toEmail: targetEmail,
      toName: 'CRM Administrator',
      subject: '🧪 PHPMailer Diagnostic Test - Enterprises CRM',
    });
  }

  /**
   * List email notifications history for audit
   */
  async listEmailHistory(filter: { page?: number; limit?: number; status?: string; search?: string }) {
    const page = Math.max(1, filter.page ?? 1);
    const limit = Math.min(100, Math.max(1, filter.limit ?? 20));
    const offset = (page - 1) * limit;

    try {
      const conditions: any[] = [];
      if (filter.status && filter.status !== 'ALL') {
        conditions.push(eq(emailNotifications.status, filter.status as any));
      }
      if (filter.search?.trim()) {
        const term = `%${filter.search.trim()}%`;
        conditions.push(
          or(
            ilike(emailNotifications.recipientEmail, term),
            ilike(emailNotifications.recipientName, term),
            ilike(emailNotifications.subject, term)
          )
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [totalRes] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(emailNotifications)
        .where(whereClause);

      const rows = await db
        .select()
        .from(emailNotifications)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(emailNotifications.createdAt));

      return {
        data: rows,
        pagination: {
          total: totalRes?.count ?? 0,
          page,
          limit,
          totalPages: Math.ceil((totalRes?.count ?? 0) / limit),
        },
      };
    } catch {
      return {
        data: [],
        pagination: { total: 0, page: 1, limit, totalPages: 0 },
      };
    }
  }
}

export const emailService = new EmailService();
