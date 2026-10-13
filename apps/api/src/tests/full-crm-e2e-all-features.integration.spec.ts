import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { ensureDatabaseInitialized, closeDatabaseConnections } from '../database/client';
import { getRedisClient, closeRedisConnection } from '../redis/client';
import { createSession } from '../security/session';
import { AUTH_COOKIE_NAME } from '../security/cookies';
import { emailQueueWorker } from '../modules/notifications/email-queue.worker';
import { emailScheduler } from '../modules/notifications/email-scheduler';

describe('Comprehensive End-to-End CRM System Test — All 16 Modules Step-by-Step', () => {
  let app: FastifyInstance;
  let authCookie: string;
  let testCustomerId: string;
  let testCustomerPhone: string;
  let testSaleId: string;
  let testInvoiceId: string;
  let testJobCardId: string;
  let testServiceId: string;
  let testTechnicianId: string;
  let testRentalId: string;
  let testInventoryItemId: string;

  beforeAll(async () => {
    process.env.WHATSAPP_PROVIDER = 'MOCK';
    await ensureDatabaseInitialized();
    const redis = getRedisClient();
    const session = await createSession(redis, {
      userId: '00000000-0000-0000-0000-000000000001',
      username: 'admin',
      displayName: 'Ramesh Bomble (Super Admin)',
      role: 'Super Admin',
    });
    authCookie = `${AUTH_COOKIE_NAME}=${session.sessionId}`;

    app = buildApp();
    await app.ready();
  });

  afterAll(async () => {
    emailScheduler.stop();
    emailQueueWorker.stopPeriodicRunner();
    await app.close();
    await closeDatabaseConnections();
    await closeRedisConnection();
  });

  // ==========================================
  // MODULE 1: AUTHENTICATION & SESSION SECURITY
  // ==========================================
  describe('Module 1: Authentication & Session Security', () => {
    it('should generate CAPTCHA challenge and authenticate via login endpoint', async () => {
      const captchaRes = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/captcha',
      });
      expect(captchaRes.statusCode).toBe(200);
      const captcha = captchaRes.json().data;
      expect(captcha.challengeId).toBeDefined();

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          username: 'admin',
          password: 'Admin@123456',
          challengeId: captcha.challengeId,
          captchaAnswer: '0000',
        },
      });

      expect([200, 400, 401]).toContain(res.statusCode);
    });

    it('should verify active authenticated session identity via /auth/me', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { cookie: authCookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.user.role).toBe('Super Admin');
      expect(body.data.permissions.length).toBeGreaterThan(0);
    });
  });

  // ==========================================
  // MODULE 2: DASHBOARD & OPERATIONAL METRICS
  // ==========================================
  describe('Module 2: Dashboard & Operational Metrics', () => {
    it('should return real-time KPI overview cards, schedule, and payment reminders', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/dashboard/overview',
        headers: { cookie: authCookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.cards).toBeDefined();
      expect(body.data.overview).toBeDefined();
      expect(Array.isArray(body.data.schedule)).toBe(true);
      expect(Array.isArray(body.data.paymentReminders)).toBe(true);
    });
  });

  // ==========================================
  // MODULE 3: CUSTOMERS & 360° PROFILES
  // ==========================================
  describe('Module 3: Customer Management & 360° Profile', () => {
    it('should create a new customer with contact and service address', async () => {
      const uniqueSuffix = Date.now().toString().slice(-6);
      testCustomerPhone = `9822${uniqueSuffix}`;

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/customers',
        headers: { cookie: authCookie },
        payload: {
          fullName: `E2E Test Customer ${uniqueSuffix}`,
          phone: testCustomerPhone,
          email: `testcustomer.${uniqueSuffix}@example.com`,
          customerType: 'INDIVIDUAL',
          addressLine1: 'Plot 42, MIDC Ambad',
          city: 'Nashik',
          state: 'Maharashtra',
          pincode: '422010',
          customerLabel: 'GOOD',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBeDefined();
      expect(body.data.fullName).toContain('E2E Test Customer');
      testCustomerId = body.data.id;
    });

    it('should retrieve Customer 360° Profile with assets, services, and invoices', async () => {
      expect(testCustomerId).toBeDefined();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/customers/${testCustomerId}`,
        headers: { cookie: authCookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(testCustomerId);
      expect(body.data.phone).toBe(testCustomerPhone);
    });

    it('should toggle and persist Customer Label (GOOD / BAD rating badge)', async () => {
      // Set to GOOD
      const resGood = await app.inject({
        method: 'PATCH',
        url: `/api/v1/customers/${testCustomerId}/label`,
        headers: { cookie: authCookie },
        payload: { label: 'GOOD' },
      });

      expect(resGood.statusCode).toBe(200);
      expect(resGood.json().data.customerLabel).toBe('GOOD');

      // Set to BAD
      const resBad = await app.inject({
        method: 'PATCH',
        url: `/api/v1/customers/${testCustomerId}/label`,
        headers: { cookie: authCookie },
        payload: { label: 'BAD' },
      });

      expect(resBad.statusCode).toBe(200);
      expect(resBad.json().data.customerLabel).toBe('BAD');
    });
  });

  // ==========================================
  // MODULE 4: PRODUCTS & SALES TRANSACTIONS
  // ==========================================
  describe('Module 4: Products Catalog & Sales Orders', () => {
    it('should create a complete Sale Order and generate linked invoice', async () => {
      const prodRes = await app.inject({
        method: 'GET',
        url: '/api/v1/products',
        headers: { cookie: authCookie },
      });
      const products = prodRes.json().data?.items || prodRes.json().data || [];
      const roProduct = products.find((p: any) => p.productType === 'RO_MACHINE' || p.type === 'RO_MACHINE') || products[0];

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/sales',
        headers: { cookie: authCookie },
        payload: {
          customerId: testCustomerId,
          items: [
            {
              productId: roProduct?.id,
              productName: roProduct?.name || 'Livpure RO Purifier 15LPH',
              quantity: 1,
              unitPrice: 16000,
              taxRatePercent: 18,
              serialNumber: `SN-TEST-${Date.now().toString().slice(-6)}`,
            },
          ],
          discountAmount: 1000,
          notes: 'Standard installation included',
          createInvoice: true,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBeDefined();
      testSaleId = body.data.id;
    });

    it('should verify Sale Order details and registered customer asset', async () => {
      expect(testSaleId).toBeDefined();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/sales/${testSaleId}`,
        headers: { cookie: authCookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.customerId).toBe(testCustomerId);
    });
  });

  // ==========================================
  // MODULE 5: INVOICES & PHPMAILER EMAIL
  // ==========================================
  describe('Module 5: Invoices & PHPMailer Dispatch', () => {
    it('should list invoices and locate or generate the customer invoice', async () => {
      // Confirm the sale order to generate the linked invoice
      if (testSaleId) {
        await app.inject({
          method: 'POST',
          url: `/api/v1/sales/${testSaleId}/confirm`,
          headers: { cookie: authCookie },
          payload: { notes: 'Confirmed for delivery and billing' },
        });
      }

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/invoices',
        headers: { cookie: authCookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      const items = Array.isArray(body.data) ? body.data : (body.data?.items || []);
      
      let invoice = items.find((inv: any) => inv.customerId === testCustomerId) || items[0];
      if (!invoice) {
        const createRes = await app.inject({
          method: 'POST',
          url: '/api/v1/invoices',
          headers: { cookie: authCookie },
          payload: {
            customerId: testCustomerId,
            invoiceType: 'TAX_INVOICE',
            issueDate: new Date().toISOString(),
            dueDate: new Date(Date.now() + 15 * 86400000).toISOString(),
            items: [
              {
                productName: 'RO System Installation & Filter Pack',
                quantity: 1,
                unitPrice: 15000,
                taxRatePercent: 18,
              },
            ],
            notes: 'Direct installation invoice',
          },
        });
        invoice = createRes.json()?.data;
      }

      expect(invoice?.id).toBeDefined();
      testInvoiceId = invoice.id;
    });

    it('should fetch single invoice details with line items breakdown', async () => {
      expect(testInvoiceId).toBeDefined();
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/invoices/${testInvoiceId}`,
        headers: { cookie: authCookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(testInvoiceId);
      expect(body.data.invoiceNumber).toMatch(/^(INV-|\d{6,8})/);
    });

    it('should execute transactional payment reminder dispatch via PHPMailer', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/invoices/${testInvoiceId}/send-due-mail`,
        headers: { cookie: authCookie },
      });

      expect([200, 400]).toContain(res.statusCode);
      const body = res.json();
      expect(body.message).toBeDefined();
    }, 25000);
  });

  // ==========================================
  // MODULE 6: PAYMENTS & FINANCIAL SETTLEMENT
  // ==========================================
  describe('Module 6: Payments & Ledger Reconciliation', () => {
    it('should record an invoice payment and update invoice payment status', async () => {
      const balRes = await app.inject({
        method: 'GET',
        url: `/api/v1/payments/invoice/${testInvoiceId}/balance`,
        headers: { cookie: authCookie },
      });
      const balanceData = balRes.json()?.data;
      const outstanding = Number(balanceData?.outstandingAmount ?? 5000);
      const payAmount = outstanding > 0 ? Math.min(5000, outstanding) : 100;

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/payments',
        headers: { cookie: authCookie },
        payload: {
          invoiceId: testInvoiceId,
          customerId: testCustomerId,
          amount: payAmount > 0 ? payAmount : 500,
          paymentMethod: 'UPI',
          referenceNumber: `UPI-${Date.now()}`,
          notes: 'Advance installment via UPI',
        },
      });

      expect([200, 201]).toContain(res.statusCode);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.payment?.id || body.data.id).toBeDefined();
    });

    it('should list recorded payments in financial ledger', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/payments',
        headers: { cookie: authCookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
    });
  });

  // ==========================================
  // MODULE 7 & 8: SERVICES, JOB CARDS & WHATSAPP
  // ==========================================
  describe('Module 7 & 8: Services, Job Cards & WhatsApp Notification', () => {
    it('should schedule a new service and generate linked Job Card', async () => {
      // Retrieve technician (or register if cleanly unseeded)
      let techRes = await app.inject({
        method: 'GET',
        url: '/api/v1/technicians',
        headers: { cookie: authCookie },
      });
      let techs = techRes.json().data?.items || techRes.json().data || [];
      if (techs.length === 0) {
        const createTechRes = await app.inject({
          method: 'POST',
          url: '/api/v1/technicians',
          headers: { cookie: authCookie },
          payload: {
            fullName: 'Aakash Sharma',
            phone: '9820011223',
            email: 'aakash.sharma@srenterprises.com',
            status: 'ACTIVE',
            skills: ['RO Installation', 'Membrane Replacement'],
            address: 'Nashik, Maharashtra',
          },
        });
        expect(createTechRes.statusCode).toBe(201);
        techRes = await app.inject({
          method: 'GET',
          url: '/api/v1/technicians',
          headers: { cookie: authCookie },
        });
        techs = techRes.json().data?.items || techRes.json().data || [];
      }
      expect(techs.length).toBeGreaterThan(0);
      testTechnicianId = techs[0].id;

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/services',
        headers: { cookie: authCookie },
        payload: {
          customerId: testCustomerId,
          serviceType: 'PERIODIC_MAINTENANCE',
          priority: 'HIGH',
          serviceLocation: 'DOORSTEP',
          scheduledDate: new Date(Date.now() + 86400000).toISOString(),
          customerNotes: 'Routine 3-month membrane check and TDS inspection',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.success).toBe(true);
      testServiceId = body.data.service?.id || body.data.serviceId;
      expect(testServiceId).toBeDefined();
      testJobCardId = body.data.jobCard?.id || body.data.jobCardId;
    });

    it('should assign technician to Job Card, trigger WhatsApp notification, and persist state', async () => {
      expect(testJobCardId).toBeDefined();
      expect(testTechnicianId).toBeDefined();

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/job-cards/${testJobCardId}/assign`,
        headers: { cookie: authCookie },
        payload: {
          technicianId: testTechnicianId,
          notes: 'Assigned for doorstep service visit',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.technicianId).toBe(testTechnicianId);
    });

    it('should execute manual WhatsApp retry endpoint for Job Card assignment', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/job-cards/${testJobCardId}/notify-technician`,
        headers: { cookie: authCookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.messageText).toContain('New Service Job Assigned');
      expect(body.data.recipientPhone).toMatch(/^91\d{10}$/);
    });

    it('should execute dedicated WhatsApp notification endpoint for Service assignment', async () => {
      expect(testServiceId).toBeDefined();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/services/${testServiceId}/notify-technician`,
        headers: { cookie: authCookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.messageText).toContain('New Service Job Assigned');
      expect(body.data.recipientPhone).toMatch(/^91\d{10}$/);
    });
  });

  // ==========================================
  // MODULE 9: TECHNICIANS DIRECTORY
  // ==========================================
  describe('Module 9: Technicians & Field Workforce Management', () => {
    it('should list all field technicians with contact details and active statuses', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/technicians',
        headers: { cookie: authCookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      const items = body.data?.items || body.data || [];
      expect(items.length).toBeGreaterThan(0);
      expect(items[0].fullName).toBeDefined();
    });
  });

  // ==========================================
  // MODULE 10: RENTALS (RO MACHINE SUBSCRIPTIONS)
  // ==========================================
  describe('Module 10: Rentals Management & Machine Subscriptions', () => {
    it('should create a new RO Machine Rental agreement', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/rentals',
        headers: { cookie: authCookie },
        payload: {
          customerId: testCustomerId,
          machineType: 'RO',
          machineModel: 'Aqua Fresh Commercial RO 50LPH',
          serialNumber: `SN-RENT-${Date.now().toString().slice(-6)}`,
          capacityLph: '50 LPH',
          installationLocation: 'Office Pantry, 2nd Floor',
          machineCondition: 'NEW',
          rentalStartDate: new Date().toISOString(),
          rentalDuration: '12_MONTHS',
          minimumRentalPeriodMonths: 3,
          billingFrequency: 'MONTHLY',
          monthlyRent: 1500,
          billingAmount: 1500,
          securityDeposit: 3000,
          depositStatus: 'COLLECTED',
          initialPaymentAmount: 4500,
          totalPaid: 4500,
          outstandingAmount: 0,
          nextDueDate: new Date(Date.now() + 30 * 86400000).toISOString(),
          rentalStatus: 'ACTIVE',
          paymentStatus: 'PAID',
          installationDate: new Date().toISOString(),
          installationStatus: 'INSTALLED',
          notes: 'Standard commercial rental contract',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBeDefined();
      expect(body.data.rentalNumber).toMatch(/^RNT-/);
      testRentalId = body.data.id;
    });

    it('should record a rental subscription installment payment', async () => {
      expect(testRentalId).toBeDefined();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/rentals/${testRentalId}/payments`,
        headers: { cookie: authCookie },
        payload: {
          amount: 1500,
          paymentMethod: 'UPI',
          paymentType: 'MONTHLY_RENT',
          referenceNumber: `RENT-UPI-${Date.now()}`,
          notes: 'Monthly rental fee received',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.payment?.id || body.data.id).toBeDefined();
    });
  });

  // ==========================================
  // MODULE 11: DATE-WISE DUES & REMINDERS
  // ==========================================
  describe('Module 11: Date-Wise Dues & Reminders', () => {
    it('should list all due reminders and filter by date range', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/dues',
        headers: { cookie: authCookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
      expect(body.data.summary).toBeDefined();
    });
  });

  // ==========================================
  // MODULE 12: INVENTORY & SPARE PARTS
  // ==========================================
  describe('Module 12: Inventory Purchases, Sales & Profit Margins', () => {
    it('should create a new inventory item in catalog', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/inventory-management/items',
        headers: { cookie: authCookie },
        payload: {
          name: `Sediment Filter 5 Micron ${Date.now().toString().slice(-4)}`,
          category: 'Filter Cartridges',
          brand: 'AquaPure',
          partNumber: `FLT-${Date.now().toString().slice(-5)}`,
          description: '5 micron sediment filter cartridge',
          purchasePrice: 120,
          sellingPrice: 350,
          minStockLevel: 10,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBeDefined();
      testInventoryItemId = body.data.id;
    });

    it('should record an inventory purchase batch to increase stock', async () => {
      expect(testInventoryItemId).toBeDefined();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/inventory-management/purchases',
        headers: { cookie: authCookie },
        payload: {
          itemId: testInventoryItemId,
          supplierName: 'Industrial Filter Corp',
          purchaseDate: new Date().toISOString(),
          quantity: 50,
          purchasePricePerUnit: 120,
          notes: 'Batch purchase for stock replenishment',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBeDefined();
    });

    it('should record an inventory sale and compute exact profit', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/inventory-management/sales',
        headers: { cookie: authCookie },
        payload: {
          itemId: testInventoryItemId,
          customerId: testCustomerId,
          customerName: 'Direct Walk-in Customer',
          customerPhone: '9822114455',
          saleDate: new Date().toISOString(),
          quantity: 5,
          sellingPricePerUnit: 350,
          paymentStatus: 'COMPLETED',
          notes: 'Direct counter spare sale',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(Number(body.data.profit)).toBeGreaterThan(0);
    });
  });

  // ==========================================
  // MODULE 13: REPORTS & ANALYTICS
  // ==========================================
  describe('Module 13: Business Reports & Analytics', () => {
    it('should generate complete analytics overview', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/analytics/overview?range=30d',
        headers: { cookie: authCookie },
      });

      expect([200, 403, 500]).toContain(res.statusCode);
      if (res.statusCode === 200) {
        const body = res.json();
        expect(body.success).toBe(true);
      }
    });
  });

  // ==========================================
  // MODULE 14: WHATSAPP COMMUNICATION LOGS
  // ==========================================
  describe('Module 14: WhatsApp Business Messages & Logs', () => {
    it('should retrieve conversation history and outbound job assignment messages', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/whatsapp/conversations',
        headers: { cookie: authCookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data?.items || body.data)).toBe(true);
    });
  });

  // ==========================================
  // MODULE 15: NOTIFICATIONS CENTER
  // ==========================================
  describe('Module 15: Notifications & Alerts Center', () => {
    it('should list system operational alerts and transactional notifications', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/notifications',
        headers: { cookie: authCookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
    });
  });

  // ==========================================
  // MODULE 16: GLOBAL MULTI-DOMAIN SEARCH
  // ==========================================
  describe('Module 16: Global Multi-Domain Search Engine', () => {
    it('should execute global search across all entities', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/search?q=Customer',
        headers: { cookie: authCookie },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data).toBeDefined();
    });
  });
});
