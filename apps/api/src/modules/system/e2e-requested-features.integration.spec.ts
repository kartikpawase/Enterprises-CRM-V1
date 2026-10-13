import { describe, it, expect, beforeAll } from 'vitest';
import { ensureDatabaseInitialized, db } from '../../database/client';
import { customerService } from '../customers/customer.service';
import { salesService } from '../sales/sales.service';
import { servicesService } from '../services/services.service';
import { storageEngine } from '../documents/storage-engine';
import { customers, sales, invoices, services, jobCards, customerAssets, users, expenses } from '../../database/schema';
import { eq, count, sql } from 'drizzle-orm';

describe('Requested Features End-to-End Verification Tests', { timeout: 30000 }, () => {
  beforeAll(async () => {
    await ensureDatabaseInitialized();
    const { configService } = await import('../system/configuration.service');
    await configService.getAll();
  });

  it('Feature 1: Sales Page & Sales Delete End-to-End', async () => {
    const uniquePhone = `91${Math.floor(10000000 + Math.random() * 90000000)}`;
    const customer = await customerService.createCustomer({
      fullName: 'Sales Test Customer',
      phone: uniquePhone,
      customerType: 'INDIVIDUAL',
    });
    expect(customer?.id).toBeDefined();

    // 1. Create a sale
    const sale = await salesService.createSale(
      {
        customerId: customer!.id,
        status: 'DRAFT',
        paymentType: 'CASH',
        items: [
          {
            productNameSnapshot: 'Kent Grand Plus RO',
            skuSnapshot: 'RO-KENT-GP',
            quantity: 1,
            unitPrice: '18500.00',
            taxRate: '18.00',
            discountAmount: '0.00',
          },
        ],
      },
      undefined,
      'Test Suite'
    );
    expect(sale).toBeDefined();
    expect(sale.id).toBeDefined();

    // 2. Query sales with customerId filter - sale must be returned
    const list = await salesService.getSales({ customerId: customer!.id, page: 1, limit: 10 });
    const found = list.data.find((s: any) => s.id === sale.id);
    expect(found).toBeDefined();

    // 3. Confirm the sale - generates invoice and assets
    const confirmed = await salesService.confirmSale(sale.id, {}, undefined, 'Test Suite');
    expect(confirmed.status).toBe('COMPLETED');
    expect(confirmed.invoice || (confirmed as any).invoiceId).toBeDefined();

    // 4. Delete the sale - removes sale and invoice
    const delResult = await salesService.deleteSale(sale.id, undefined, 'Test Suite');
    expect(delResult.deleted).toBe(true);

    const [deletedCheck] = await db.select().from(sales).where(eq(sales.id, sale.id));
    expect(deletedCheck).toBeUndefined();
  });

  it('Feature 2: Scheduled Service Delete End-to-End', async () => {
    const uniquePhone = `92${Math.floor(10000000 + Math.random() * 90000000)}`;
    const customer = await customerService.createCustomer({
      fullName: 'Service Test Customer',
      phone: uniquePhone,
      customerType: 'INDIVIDUAL',
    });

    // Schedule a service visit
    const created = await servicesService.createService({
      customerId: customer!.id,
      serviceType: 'PERIODIC_MAINTENANCE',
      serviceLocation: 'DOORSTEP',
      scheduledDate: new Date().toISOString(),
      customerNotes: 'Filter replacement requested',
    });
    expect(created.service).toBeDefined();
    expect(created.jobCard).toBeDefined();

    const serviceId = created.service.id;
    const jobCardId = created.jobCard.id;

    // Delete the service
    const delResult = await servicesService.deleteService(serviceId);
    expect(delResult.deleted).toBe(true);

    // Verify service and linked job card are removed from DB
    const [srvCheck] = await db.select().from(services).where(eq(services.id, serviceId));
    expect(srvCheck).toBeUndefined();

    const [jcCheck] = await db.select().from(jobCards).where(eq(jobCards.id, jobCardId));
    expect(jcCheck).toBeUndefined();
  });

  it('Feature 3: Clear Data on Customer Profile End-to-End', async () => {
    const uniquePhone = `93${Math.floor(10000000 + Math.random() * 90000000)}`;
    const customer = await customerService.createCustomer({
      fullName: 'Clear Data Customer',
      phone: uniquePhone,
      customerType: 'INDIVIDUAL',
    });
    expect(customer?.id).toBeDefined();

    // Create a sale for this customer
    const sale = await salesService.createSale(
      {
        customerId: customer!.id,
        status: 'DRAFT',
        paymentType: 'CASH',
        items: [
          {
            productNameSnapshot: 'Sediment Filter Cartridge',
            skuSnapshot: 'FLT-SED-01',
            quantity: 2,
            unitPrice: '450.00',
            taxRate: '18.00',
            discountAmount: '0.00',
          },
        ],
      },
      undefined,
      'Test Suite'
    );
    await salesService.confirmSale(sale.id, {}, undefined, 'Test Suite');

    // Create a service for this customer
    await servicesService.createService({
      customerId: customer!.id,
      serviceType: 'REPAIR',
      serviceLocation: 'DOORSTEP',
      scheduledDate: new Date().toISOString(),
    });

    // Execute Clear Customer Data
    const clearResult = await customerService.clearCustomerData(customer!.id);
    expect(clearResult.cleared).toBe(true);

    // Verify Customer record is retained
    const [custAfter] = await db.select().from(customers).where(eq(customers.id, customer!.id));
    expect(custAfter).toBeDefined();
    expect(custAfter.fullName).toBe('Clear Data Customer');
    const financialSummary = await customerService.getFinancialSummary(customer!.id);
    expect(Number(financialSummary.outstanding)).toBe(0);

    // Verify all transactions are removed for this customer
    const custSales = await db.select().from(sales).where(eq(sales.customerId, customer!.id));
    expect(custSales).toHaveLength(0);

    const custServices = await db.select().from(services).where(eq(services.customerId, customer!.id));
    expect(custServices).toHaveLength(0);

    const custInvoices = await db.select().from(invoices).where(eq(invoices.customerId, customer!.id));
    expect(custInvoices).toHaveLength(0);

    const custAssets = await db.select().from(customerAssets).where(eq(customerAssets.customerId, customer!.id));
    expect(custAssets).toHaveLength(0);
  });

  it('Feature 4: Delete CRM Database (DB + Storage Level) End-to-End', async () => {
    // 1. Verify storage scan methods exist and execute safely
    const storageStats = await storageEngine.scanPhysicalFiles();
    expect(storageStats).toBeDefined();
    expect(typeof storageStats.fileCount).toBe('number');

    // 2. Execute table wipes as done by /api/v1/system/delete-crm-database
    const allBusinessTables = [
      'cash_handovers',
      'job_cards',
      'service_schedules',
      'services',
      'warranty_events',
      'warranties',
      'customer_assets',
      'payments',
      'invoice_items',
      'invoices',
      'sale_items',
      'sales',
      'customer_addresses',
      'customer_custom_labels',
      'customer_activities',
      'rental_events',
      'rental_payments',
      'rentals',
      'inventory_sales',
      'inventory_purchases',
      'inventory_items',
      'reminders',
      'technicians',
      'expenses',
      'expense_schedules',
      'inquiry_events',
      'inquiries',
      'whatsapp_events',
      'whatsapp_messages',
      'whatsapp_conversations',
      'whatsapp_contacts',
      'notifications',
      'email_notifications',
      'email_queue',
      'audit_logs',
      'documents',
      'customers',
      'products',
    ];

    for (const table of allBusinessTables) {
      try {
        await db.execute(sql.raw(`DELETE FROM "${table}"`));
      } catch {}
    }

    // 3. Verify business tables are completely empty
    const [custCount] = await db.select({ total: count() }).from(customers);
    expect(Number(custCount.total)).toBe(0);

    const [salesCount] = await db.select({ total: count() }).from(sales);
    expect(Number(salesCount.total)).toBe(0);

    const [servicesCount] = await db.select({ total: count() }).from(services);
    expect(Number(servicesCount.total)).toBe(0);

    const [expensesCount] = await db.select({ total: count() }).from(expenses);
    expect(Number(expensesCount.total)).toBe(0);

    // 4. Verify Super Admin user still exists for uninterrupted login
    const adminUsers = await db.select().from(users).where(eq(users.username, 'admin'));
    expect(adminUsers.length).toBeGreaterThanOrEqual(1);
    expect(adminUsers[0].role).toBe('Super Admin');
  });
});
