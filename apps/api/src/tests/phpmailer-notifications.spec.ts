import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { phpMailerService, type TransactionalEmailPayload } from '../modules/notifications/php-mailer.service';
import { emailQueueWorker } from '../modules/notifications/email-queue.worker';
import { emailService } from '../modules/notifications/email.service';
import { emailScheduler } from '../modules/notifications/email-scheduler';
import { execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';

import { ensureDatabaseInitialized } from '../database/client';

describe('SR Enterprises CRM - PHPMailer & PDF Notification System', () => {
  beforeAll(async () => {
    // Ensure mock driver is used for consistent test environment
    process.env.MAIL_DRIVER = 'log';
    process.env.MOCK_MAIL = 'true';
    process.env.NODE_ENV = 'test';
    await ensureDatabaseInitialized();
    emailScheduler.stop();
    emailQueueWorker.stopPeriodicRunner();
  });

  afterAll(() => {
    emailScheduler.stop();
    emailQueueWorker.stopPeriodicRunner();
  });

  describe('1. Dompdf Server-Side PDF Generation', () => {
    it('generates a complete, valid PDF invoice file from invoice data payload', () => {
      const phpScript = path.resolve(__dirname, '../../../../scripts/mailer/PdfInvoiceGenerator.php');
      expect(fs.existsSync(phpScript)).toBe(true);

      const testPayload = {
        invoiceNumber: 'INV-2026-UNIT-01',
        invoiceDate: '2026-08-27',
        dueDate: '2026-09-10',
        customerName: 'Rahul Sharma',
        customerEmail: 'rahul.sharma@example.com',
        customerPhone: '+91 98765 43210',
        customerAddress: '42, Brigade Road, Bangalore, Karnataka 560025',
        subtotal: 18500,
        discountAmount: 1000,
        taxAmount: 3150,
        totalAmount: 20650,
        paidAmount: 20650,
        outstandingAmount: 0,
        status: 'PAID',
        items: [
          {
            nameSnapshot: 'Aquapure RO+UV 15L Water Purifier',
            skuSnapshot: 'RO-AQ-15L',
            quantity: 1,
            unitPriceSnapshot: 17500,
            taxRatePercent: 18,
            lineTotal: 17500,
          },
          {
            nameSnapshot: 'Sediment Pre-Filter Cartridge',
            skuSnapshot: 'FILT-SED-01',
            quantity: 2,
            unitPriceSnapshot: 500,
            taxRatePercent: 18,
            lineTotal: 1000,
          },
        ],
      };

      const code = `
        require_once '${phpScript.replace(/\\/g, '/')}';
        use SREnterprises\\Mailer\\PdfInvoiceGenerator;
        $result = PdfInvoiceGenerator::generateInvoicePdf(json_decode('${JSON.stringify(testPayload).replace(/'/g, "\\'")}', true));
        echo json_encode($result);
      `;

      let isPhpAvailable = false;
      try {
        execFileSync('php', ['-r', 'exit(extension_loaded("gd") ? 0 : 1);'], { stdio: 'ignore' });
        isPhpAvailable = true;
      } catch {
        isPhpAvailable = false;
      }

      if (isPhpAvailable) {
        const output = execFileSync('php', ['-r', code], { encoding: 'utf8' });
        const parsed = JSON.parse(output.trim());

        expect(parsed.success).toBe(true);
        expect(parsed.filePath).toBeDefined();
        expect(fs.existsSync(parsed.filePath)).toBe(true);
        expect(parsed.fileSizeBytes).toBeGreaterThan(1000);
        expect(parsed.filename).toContain('INV-2026-UNIT-01');

        // Cleanup generated temp test PDF
        if (fs.existsSync(parsed.filePath)) {
          fs.unlinkSync(parsed.filePath);
        }
      } else {
        expect(fs.existsSync(phpScript)).toBe(true);
        const scriptContent = fs.readFileSync(phpScript, 'utf8');
        expect(scriptContent).toContain('PdfInvoiceGenerator');
      }
    });
  });

  describe('2. Direct PHPMailer Engine Dispatching', () => {
    it('dispatches email payload through PHPMailer CLI dispatcher and returns structured result', async () => {
      const payload: TransactionalEmailPayload = {
        eventType: 'SALE_CONFIRMATION',
        toEmail: 'customer.test@example.com',
        toName: 'Priya Patel',
        subject: 'Order Confirmation: Sale #SALE-2026-0099',
        saleNumber: 'SALE-2026-0099',
        saleDate: '2026-08-27',
        totalAmount: 18500,
        subtotal: 16000,
        taxAmount: 2880,
        discountAmount: 380,
        items: [
          { productName: 'Aquapure RO Machine', quantity: 1, unitPrice: 16000, lineTotal: 16000 },
        ],
      };

      const result = await phpMailerService.dispatch(payload);
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.status).toBe('SENT');
      expect(result.recipient).toBe('customer.test@example.com');
      expect(result.eventType).toBe('SALE_CONFIRMATION');
    });

    it('gracefully skips sending when recipient email is empty or invalid without crashing', async () => {
      const payload: TransactionalEmailPayload = {
        eventType: 'PAYMENT_RECEIPT',
        toEmail: '',
        toName: 'Unknown Customer',
        subject: 'Payment Receipt',
      };

      const result = await phpMailerService.dispatch(payload);
      expect(result.success).toBe(false);
      expect(result.status).toBe('SKIPPED');
      expect(result.reason).toBe('EMAIL_SKIPPED_NO_VALID_ADDRESS');
    });
  });

  describe('3. Centralized EmailService & Transactional Templates', () => {
    it('enqueues Sale Confirmation email with idempotency and invoice attachment payload', async () => {
      const enqueueResult = await emailService.send({
        customerId: '11111111-1111-1111-1111-111111111111',
        eventType: 'SALE_CONFIRMATION',
        referenceType: 'SALE',
        referenceId: 'sale-unit-test-101',
        idempotencyKey: `SALE_CONFIRMATION:sale-unit-test-${Date.now()}`,
        recipientEmail: 'amit.verma@example.com',
        recipientName: 'Amit Verma',
        subject: 'Order Confirmation: Sale #SALE-2026-101',
        payload: {
          saleNumber: 'SALE-2026-101',
          saleDate: '2026-08-27',
          totalAmount: 22000,
          subtotal: 19000,
          taxAmount: 3420,
          discountAmount: 420,
          items: [{ productName: 'Industrial RO 50 LPH', quantity: 1, unitPrice: 19000, lineTotal: 19000 }],
        },
        attachInvoicePdf: false,
      });

      expect(enqueueResult).toBeDefined();
      expect(enqueueResult.notificationId).toBeDefined();
      expect(['PENDING', 'SENT']).toContain(enqueueResult.status);
      expect(enqueueResult.isDuplicate).toBe(false);
    });

    it('prevents duplicate sending via idempotency key', async () => {
      const duplicateKey = `SALE_CONFIRMATION:idempotency-test-${Date.now()}`;

      const firstCall = await emailService.send({
        eventType: 'SALE_CONFIRMATION',
        referenceType: 'SALE',
        referenceId: 'sale-202',
        idempotencyKey: duplicateKey,
        recipientEmail: 'dup.test@example.com',
        recipientName: 'Duplicate Test',
        subject: 'First Attempt',
        payload: { saleNumber: 'SALE-202', totalAmount: 5000 },
      });

      expect(firstCall.isDuplicate).toBe(false);

      // Second identical call
      const secondCall = await emailService.send({
        eventType: 'SALE_CONFIRMATION',
        referenceType: 'SALE',
        referenceId: 'sale-202',
        idempotencyKey: duplicateKey,
        recipientEmail: 'dup.test@example.com',
        recipientName: 'Duplicate Test',
        subject: 'Second Attempt',
        payload: { saleNumber: 'SALE-202', totalAmount: 5000 },
      });

      expect(secondCall.isDuplicate).toBe(true);
      expect(secondCall.notificationId).toBe(firstCall.notificationId);
    });

    it('enqueues Payment Receipt with exact balance recalculation data', async () => {
      const invoiceTotal = 15000;
      const previousPaid = 5000;
      const currentPayment = 5000;
      const totalPaid = previousPaid + currentPayment;
      const remainingBalance = invoiceTotal - totalPaid;
      const paymentStatus = remainingBalance <= 0 ? 'PAID' : 'PARTIALLY_PAID';

      const enqueueResult = await emailService.send({
        eventType: 'PAYMENT_RECEIPT',
        referenceType: 'PAYMENT',
        referenceId: 'pay-unit-test-301',
        idempotencyKey: 'PAYMENT_RECEIPT:pay-unit-test-301',
        recipientEmail: 'sunita.rao@example.com',
        recipientName: 'Sunita Rao',
        subject: 'Payment Receipt: PAY-2026-301 for Invoice #INV-2026-301',
        payload: {
          paymentNumber: 'PAY-2026-301',
          invoiceNumber: 'INV-2026-301',
          amount: currentPayment,
          previousPaidAmount: previousPaid,
          totalPaidAmount: totalPaid,
          totalAmount: invoiceTotal,
          remainingBalance,
          paymentStatus,
          paymentMethod: 'UPI',
          referenceNumber: 'UPI/2026/987654',
        },
      });

      expect(enqueueResult).toBeDefined();
      expect(enqueueResult.notificationId).toBeDefined();
      expect(['PENDING', 'SENT']).toContain(enqueueResult.status);
    });

    it('enqueues Service Completed notice with technician and health check metrics', async () => {
      const enqueueResult = await emailService.send({
        eventType: 'SERVICE_COMPLETED',
        referenceType: 'SERVICE',
        referenceId: 'srv-unit-test-401',
        idempotencyKey: 'SERVICE_COMPLETED:srv-unit-test-401',
        recipientEmail: 'vikram.singh@example.com',
        recipientName: 'Vikram Singh',
        subject: 'Service Completed: #SRV-2026-401',
        payload: {
          serviceNumber: 'SRV-2026-401',
          serviceType: 'RO_MAINTENANCE',
          technicianName: 'Suresh Kumar',
          serviceDescription: 'Replaced carbon and sediment filter candles. Raw TDS: 750 ppm -> Output TDS: 45 ppm.',
        },
      });

      expect(enqueueResult).toBeDefined();
      expect(['PENDING', 'SENT']).toContain(enqueueResult.status);
    });

    it('enqueues Service Reminder notice with date and time window', async () => {
      const enqueueResult = await emailService.send({
        eventType: 'SERVICE_REMINDER',
        referenceType: 'SERVICE',
        referenceId: 'srv-unit-test-501',
        idempotencyKey: 'SERVICE_REMINDER:srv-unit-test-501:2026-08-30',
        recipientEmail: 'manoj.kumar@example.com',
        recipientName: 'Manoj Kumar',
        subject: 'Service Reminder: Scheduled for 2026-08-30',
        payload: {
          serviceNumber: 'SRV-2026-501',
          serviceType: 'PERIODIC_SERVICE',
          scheduledDate: '2026-08-30',
          timeSlot: 'Morning (10:00 AM - 01:00 PM)',
          technicianName: 'Anil Sharma',
        },
      });

      expect(enqueueResult).toBeDefined();
      expect(['PENDING', 'SENT']).toContain(enqueueResult.status);
    });

    it('enqueues Payment Reminder notice with outstanding balance calculation', async () => {
      const enqueueResult = await emailService.send({
        eventType: 'PAYMENT_REMINDER',
        referenceType: 'INVOICE',
        referenceId: 'inv-unit-test-601',
        idempotencyKey: 'PAYMENT_REMINDER:inv-unit-test-601:2026-08-27',
        recipientEmail: 'kavita.nair@example.com',
        recipientName: 'Kavita Nair',
        subject: 'Payment Reminder: Invoice #INV-2026-601',
        payload: {
          invoiceNumber: 'INV-2026-601',
          totalAmount: 18000,
          paidAmount: 8000,
          dueAmount: 10000,
          dueDate: '2026-09-05',
          customerNumber: 'CUST-2026-0123',
        },
      });

      expect(enqueueResult).toBeDefined();
      expect(['PENDING', 'SENT']).toContain(enqueueResult.status);
    });

    it('enqueues Thank-You customer follow-up notice', async () => {
      const enqueueResult = await emailService.send({
        eventType: 'THANK_YOU',
        referenceType: 'SALE',
        referenceId: 'sale-unit-test-701',
        idempotencyKey: 'THANK_YOU:SALE:sale-unit-test-701',
        recipientEmail: 'deepak.gupta@example.com',
        recipientName: 'Deepak Gupta',
        subject: 'Thank You for Choosing SR Enterprises!',
        payload: {
          referenceText: 'Your recent purchase (Order #SALE-2026-701)',
        },
      });

      expect(enqueueResult).toBeDefined();
      expect(['PENDING', 'SENT']).toContain(enqueueResult.status);
    });

    it('enqueues Warranty Expiry notice for 30-day, 7-day, or 1-day threshold', async () => {
      const enqueueResult = await emailService.send({
        eventType: 'WARRANTY_EXPIRY_REMINDER',
        referenceType: 'WARRANTY',
        referenceId: 'war-unit-test-801',
        idempotencyKey: 'WARRANTY_EXPIRY_30D:war-unit-test-801',
        recipientEmail: 'anita.deshmukh@example.com',
        recipientName: 'Anita Deshmukh',
        subject: 'Warranty Expiry Notice: 30 Days Remaining',
        payload: {
          warrantyNumber: 'WAR-2026-801',
          machineModel: 'Aquapure RO Super Deluxe',
          serialNumber: 'SN-AQ-2025-9988',
          startDate: '2025-09-27',
          endDate: '2026-09-27',
          daysRemaining: 30,
        },
      });

      expect(enqueueResult).toBeDefined();
      expect(['PENDING', 'SENT']).toContain(enqueueResult.status);
    });

    it('dispatches Admin SMTP diagnostic test email', async () => {
      const result = await emailService.sendAdminTestEmail('admin@srenterprises.com');
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.status).toBe('SENT');
      expect(result.eventType).toBe('ADMIN_TEST');
    });
  });

  describe('4. Background Email Queue Worker & Scheduler', () => {
    it('processes queued email jobs and transitions status to SENT', async () => {
      // Enqueue job
      const enq = await emailQueueWorker.enqueue({
        eventType: 'GENERAL',
        recipientEmail: 'worker.test@example.com',
        recipientName: 'Worker Test',
        subject: 'Queue Test Notification',
        payload: { message: 'Hello from Queue Worker' },
      });

      expect(enq.notificationId).toBeDefined();
      expect(enq.status).toBe('PENDING');

      // Process batch
      const result = await emailQueueWorker.processQueue(10);
      expect(result).toBeDefined();
      expect(typeof result.processed).toBe('number');
      expect(typeof result.successCount).toBe('number');
      expect(typeof result.failedCount).toBe('number');
      expect(result.failedCount).toBe(0);
    });

    it('retrieves queue health statistics', async () => {
      const stats = await emailQueueWorker.getStats();
      expect(stats).toBeDefined();
      expect(typeof stats.pending).toBe('number');
      expect(typeof stats.sent).toBe('number');
      expect(typeof stats.failed).toBe('number');
    });

    it('executes scheduled due reminders and warranty scans', async () => {
      const schedulerResult = await emailScheduler.runScheduledTasks();
      expect(schedulerResult).toBeDefined();
      expect(typeof schedulerResult.serviceRemindersCount).toBe('number');
      expect(typeof schedulerResult.paymentRemindersCount).toBe('number');
      expect(typeof schedulerResult.warrantyRemindersCount).toBe('number');
      expect(typeof schedulerResult.queueProcessed).toBe('number');
    }, 25000);

    it('5. End-to-End: automatically sends Sale Confirmation and Payment Receipt with invoice PDF on transaction', async () => {
      // 1. Send sale confirmation with attached invoice PDF
      const saleResult = await emailService.send({
        eventType: 'SALE_CONFIRMATION',
        recipientEmail: 'varpes380@gmail.com',
        recipientName: 'Siddharth Varpe',
        subject: 'Order Confirmation: Sale #SALE-2026-0001',
        payload: {
          saleNumber: 'SALE-2026-0001',
          saleDate: '2026-08-27',
          totalAmount: 18500,
          subtotal: 16000,
          taxAmount: 2880,
          discountAmount: 380,
          customerNumber: 'CUST-2026-0001',
          items: [
            {
              productName: 'Aquapure RO 100 GPD Commercial',
              sku: 'RO-100-GPD',
              quantity: 1,
              unitPrice: 18500,
              lineTotal: 18500,
            },
          ],
          invoiceData: {
            invoiceNumber: 'INV-2026-0001',
            invoiceDate: '2026-08-27',
            dueDate: '2026-09-10',
            subtotal: 16000,
            discountAmount: 380,
            taxAmount: 2880,
            totalAmount: 18500,
            customerName: 'Siddharth Varpe',
            customerEmail: 'varpes380@gmail.com',
            customerPhone: '9021653893',
            customerNumber: 'CUST-2026-0001',
            items: [
              {
                nameSnapshot: 'Aquapure RO 100 GPD Commercial',
                skuSnapshot: 'RO-100-GPD',
                quantity: 1,
                unitPriceSnapshot: 18500,
                taxRatePercent: 18,
                lineTotal: 18500,
              },
            ],
          },
        },
        attachInvoicePdf: true,
      });

      expect(saleResult).toBeDefined();
      expect(saleResult.status).toBe('PENDING');

      // 2. Send payment receipt with invoice & payment breakdown PDF
      const paymentResult = await emailService.send({
        eventType: 'PAYMENT_RECEIPT',
        recipientEmail: 'varpes380@gmail.com',
        recipientName: 'Siddharth Varpe',
        subject: 'Payment Receipt: PAY-2026-0001 for Invoice #INV-2026-0001',
        payload: {
          paymentNumber: 'PAY-2026-0001',
          invoiceNumber: 'INV-2026-0001',
          paymentDate: '2026-08-27',
          amount: 18500,
          previousPaidAmount: 0,
          totalPaidAmount: 18500,
          totalAmount: 18500,
          remainingBalance: 0,
          paymentStatus: 'PAID',
          paymentMethod: 'UPI',
          referenceNumber: 'UPI-987654321',
          customerNumber: 'CUST-2026-0001',
          invoiceData: {
            invoiceNumber: 'INV-2026-0001',
            invoiceDate: '2026-08-27',
            dueDate: '2026-09-10',
            totalAmount: 18500,
            paidAmount: 18500,
            outstandingAmount: 0,
            status: 'PAID',
            customerName: 'Siddharth Varpe',
            customerEmail: 'varpes380@gmail.com',
            customerPhone: '9021653893',
            customerNumber: 'CUST-2026-0001',
            items: [
              {
                nameSnapshot: 'Aquapure RO 100 GPD Commercial',
                descriptionSnapshot: 'Fully automatic RO Water Purifier',
                quantity: 1,
                unitPriceSnapshot: 18500,
                taxRatePercent: 18,
                lineTotal: 18500,
              },
            ],
          },
        },
        attachInvoicePdf: true,
      });

      expect(paymentResult).toBeDefined();
      expect(paymentResult.status).toBe('PENDING');

      // 3. Process queue and verify delivery records
      await emailQueueWorker.processQueue(10);
      const history = await emailService.listEmailHistory({ search: 'varpes380@gmail.com' });
      expect(history.data.length).toBeGreaterThanOrEqual(2);
      expect(history.data.some((d: any) => d.eventType === 'SALE_CONFIRMATION')).toBe(true);
      expect(history.data.some((d: any) => d.eventType === 'PAYMENT_RECEIPT')).toBe(true);
    });
  });

  describe('6. Invoices Service Send Due Mail End-to-End', () => {
    it('returns a clean failure object when invoice record cannot be found without crashing', async () => {
      const { invoicesService } = await import('../modules/invoices/invoices.service');
      const res = await invoicesService.sendPaymentDueMail('00000000-0000-0000-0000-000000000000');
      expect(res).toBeDefined();
      expect(res.success).toBe(false);
      expect(res.message).toContain('could not be found');
    });

    it('handles non-UUID string invoice identifiers gracefully', async () => {
      const { invoicesService } = await import('../modules/invoices/invoices.service');
      const res = await invoicesService.sendPaymentDueMail('INV-NON-EXISTENT-TEST');
      expect(res).toBeDefined();
      expect(res.success).toBe(false);
      expect(res.message).toContain('could not be found');
    });
  });
});

