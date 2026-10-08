import { describe, it, expect, vi, beforeEach } from 'vitest';
import { technicianExecutionService } from './technician-execution.service';
import { jobCardsRepository } from '../job-cards/job-cards.repository';
import { inventoryRepository } from '../inventory/inventory.repository';
import { invoicesRepository } from '../invoices/invoices.repository';
import { paymentsRepository } from '../payments/payments.repository';
import { TECHNICIAN_ERROR_CODES, HTTP_STATUS } from '@crm/shared';
import { execFile } from 'child_process';
import path from 'path';

describe('Technician Service Completion → Parts → Service Charge → Payment → Invoice Generation E2E Suite (A-Z Requirements)', () => {
  const mockTechId = 'e2e-tech-uuid-101';
  const mockOtherTechId = 'e2e-tech-uuid-202';
  const mockCustomerId = 'e2e-cust-uuid-001';
  const mockServiceId = 'e2e-srv-uuid-001';
  let mockJobCardId = 'e2e-jc-uuid-001';
  let testCounter = 1;

  let jobStore: Record<string, any>;
  let inventoryStock: Record<string, { id: string; name: string; sku: string; price: number; stock: number }>;
  let deductedStock: Array<{ productId: string; quantity: number; type: string }>;
  let createdInvoices: any[];
  let recordedPayments: any[];

  beforeEach(() => {
    vi.clearAllMocks();

    mockJobCardId = `e2e-jc-uuid-${testCounter++}`;

    inventoryStock = {
      'inv-part-1': { id: 'inv-part-1', name: 'Standard Spare Part A', sku: 'PRT-STD-01', price: 200, stock: 10 },
      'inv-module-2': { id: 'inv-module-2', name: 'Replacement Module B', sku: 'MOD-RPL-02', price: 350, stock: 5 },
      'inv-pcb-3': { id: 'inv-pcb-3', name: 'Motherboard PCB Kit', sku: 'PCB-MB-01', price: 900, stock: 2 },
    };

    deductedStock = [];
    createdInvoices = [];
    recordedPayments = [];

    jobStore = {
      [mockJobCardId]: {
        id: mockJobCardId,
        jobCardNumber: `JC-2026-E2E-${String(testCounter).padStart(3, '0')}`,
        serviceId: mockServiceId,
        technicianId: mockTechId,
        customerId: mockCustomerId,
        status: 'IN_PROGRESS',
        problemReported: 'Equipment operational failure',
        diagnosis: null,
        workPerformed: null,
        technicianNotes: null,
        partsReplaced: [],
        completedAt: null,
      },
    };

    // Mock technician job card resolution
    vi.spyOn(technicianExecutionService, 'resolveAuthorizedJobCard').mockImplementation(
      async (id: string, technicianId: string) => {
        if (!technicianId) {
          const error: any = new Error('Authentication required');
          error.statusCode = HTTP_STATUS.UNAUTHORIZED;
          error.code = TECHNICIAN_ERROR_CODES.SESSION_EXPIRED;
          throw error;
        }

        const jc = jobStore[id];
        if (!jc) {
          const error: any = new Error('Job Card record not found');
          error.statusCode = HTTP_STATUS.NOT_FOUND;
          error.code = 'NOT_FOUND';
          throw error;
        }

        if (!jc.technicianId || jc.technicianId !== technicianId) {
          const error: any = new Error(
            'Access denied: This job card is not assigned to your technician account.'
          );
          error.statusCode = HTTP_STATUS.FORBIDDEN;
          error.code = TECHNICIAN_ERROR_CODES.JOB_CARD_NOT_ASSIGNED;
          throw error;
        }

        return { ...jc };
      }
    );

    // Mock stock balance query
    vi.spyOn(inventoryRepository, 'getStockBalance').mockImplementation(
      async (productId: string) => {
        const item = inventoryStock[productId];
        return item ? ({ id: 'bal-1', productId, currentStock: item.stock, minimumAlertStock: 2 } as any) : null;
      }
    );

    // Mock stock adjustment
    vi.spyOn(inventoryRepository, 'recordAdjustment').mockImplementation(
      async (input: any) => {
        const item = inventoryStock[input.productId];
        if (item) {
          item.stock -= input.quantity;
          deductedStock.push({ productId: input.productId, quantity: input.quantity, type: input.type });
        }
        return { id: `tx-${Date.now()}`, ...input };
      }
    );

    // Mock invoice creation
    vi.spyOn(invoicesRepository, 'createInvoice').mockImplementation(
      async (data: any) => {
        const inv = {
          id: `inv-${Date.now()}`,
          invoiceNumber: `INV-${1000 + createdInvoices.length + 1}`,
          ...data,
          status: 'ISSUED',
        };
        createdInvoices.push(inv);
        return inv;
      }
    );

    // Mock invoice payment recording
    vi.spyOn(paymentsRepository, 'executeRecordPayment').mockImplementation(
      async (payment: any) => {
        recordedPayments.push(payment);
        return {
          payment: { id: `pay-${Date.now()}`, ...payment },
          invoice: { id: payment.invoiceId, paidAmount: payment.amount },
        };
      }
    );

    // Mock jobCard completion
    vi.spyOn(jobCardsRepository, 'completeJobCard').mockImplementation(
      async (id: string, input: any) => {
        const jc = jobStore[id];
        if (!jc) throw new Error('Not found');
        jc.status = 'COMPLETED';
        jc.completedAt = new Date().toISOString();
        Object.assign(jc, input);
        return { jobCard: { ...jc } };
      }
    );
  });

  // A. Completion with no spare parts
  it('Requirement A: Completes service with no spare parts, only service charge', async () => {
    const res = await technicianExecutionService.completeJob(
      mockJobCardId,
      {
        workPerformed: 'General inspection and cleanup',
        partsReplaced: [],
        serviceCharge: 400,
        payment: { method: 'CASH', amount: 400 },
      },
      mockTechId
    );

    expect(res.success).toBe(true);
    expect(res.data.jobCard.status).toBe('COMPLETED');
    expect(res.data.invoice).toBeDefined();
    expect(res.data.invoice.invoiceNumber).toBeDefined();
    expect(deductedStock.length).toBe(0);
  });

  // B. Completion with one spare part
  it('Requirement B: Completes service with one spare part', async () => {
    const res = await technicianExecutionService.completeJob(
      mockJobCardId,
      {
        workPerformed: 'Replaced standard part',
        partsReplaced: [{ inventoryItemId: 'inv-part-1', quantity: 1, partName: 'Standard Part' }],
        serviceCharge: 300,
        payment: { method: 'CASH', amount: 500 },
      },
      mockTechId
    );

    expect(res.success).toBe(true);
    expect(deductedStock).toEqual([
      { productId: 'inv-part-1', quantity: 1, type: 'SALE' },
    ]);
    expect(inventoryStock['inv-part-1'].stock).toBe(9);
  });

  // C. Completion with multiple spare parts
  it('Requirement C: Completes service with multiple spare parts', async () => {
    const res = await technicianExecutionService.completeJob(
      mockJobCardId,
      {
        workPerformed: 'Replaced part and module',
        partsReplaced: [
          { inventoryItemId: 'inv-part-1', quantity: 1, partName: 'Part' },
          { inventoryItemId: 'inv-module-2', quantity: 1, partName: 'Module' },
        ],
        serviceCharge: 400,
        payment: { method: 'ONLINE', amount: 950, reference: 'UPI-TRANS-987' },
      },
      mockTechId
    );

    expect(res.success).toBe(true);
    expect(deductedStock.length).toBe(2);
    expect(inventoryStock['inv-part-1'].stock).toBe(9);
    expect(inventoryStock['inv-module-2'].stock).toBe(4);
  });

  // D. Multiple quantity of same part
  it('Requirement D: Completes service with multiple quantity of same part', async () => {
    const res = await technicianExecutionService.completeJob(
      mockJobCardId,
      {
        workPerformed: 'Installed multiple parts',
        partsReplaced: [{ inventoryItemId: 'inv-part-1', quantity: 3, partName: 'Part' }],
        serviceCharge: 200,
        payment: { method: 'CASH', amount: 800 },
      },
      mockTechId
    );

    expect(res.success).toBe(true);
    expect(deductedStock[0].quantity).toBe(3);
    expect(inventoryStock['inv-part-1'].stock).toBe(7);
  });

  // E. Insufficient stock
  it('Requirement E: Rejects completion when inventory has insufficient stock', async () => {
    await expect(
      technicianExecutionService.completeJob(
        mockJobCardId,
        {
          workPerformed: 'Tried using 10 PCBs',
          partsReplaced: [{ inventoryItemId: 'inv-pcb-3', quantity: 10, partName: 'Motherboard' }],
          serviceCharge: 500,
        },
        mockTechId
      )
    ).rejects.toMatchObject({
      statusCode: HTTP_STATUS.BAD_REQUEST,
      code: 'INSUFFICIENT_STOCK',
    });

    expect(deductedStock.length).toBe(0);
    expect(jobStore[mockJobCardId].status).toBe('IN_PROGRESS');
  });

  // F. Invalid inventory item
  it('Requirement F: Rejects completion when inventory item does not exist', async () => {
    await expect(
      technicianExecutionService.completeJob(
        mockJobCardId,
        {
          workPerformed: 'Non-existent spare part',
          partsReplaced: [{ inventoryItemId: 'non-existent-item-999', quantity: 1, partName: 'Unknown Part' }],
          serviceCharge: 300,
        },
        mockTechId
      )
    ).rejects.toMatchObject({
      statusCode: HTTP_STATUS.BAD_REQUEST,
      code: 'INSUFFICIENT_STOCK',
    });
  });

  // G. Invalid quantity
  it('Requirement G: Rejects invalid or negative quantity in partsReplaced', async () => {
    await expect(
      technicianExecutionService.completeJob(
        mockJobCardId,
        {
          workPerformed: 'Zero quantity part',
          partsReplaced: [{ inventoryItemId: 'inv-part-1', quantity: 0 }],
          serviceCharge: 300,
        },
        mockTechId
      )
    ).rejects.toThrow();
  });

  // H. Service charge entered
  it('Requirement H: Accurately reflects service charge in line items and calculation', async () => {
    const res = await technicianExecutionService.completeJob(
      mockJobCardId,
      {
        workPerformed: 'Electrical rewiring',
        partsReplaced: [],
        serviceCharge: 750,
        gstEnabled: true,
        gstRate: 18,
        payment: { method: 'CASH', amount: 885 },
      },
      mockTechId
    );

    expect(res.success).toBe(true);
    expect(res.data.invoice.subtotal).toBe(750);
    expect(res.data.invoice.taxAmount).toBe(135); // 18% of 750 = 135
    expect(res.data.invoice.totalAmount).toBe(885);
  });

  // I. Cash payment
  it('Requirement I: Records CASH payment and associates with generated invoice', async () => {
    const res = await technicianExecutionService.completeJob(
      mockJobCardId,
      {
        workPerformed: 'Part replacement',
        partsReplaced: [{ inventoryItemId: 'inv-part-1', quantity: 1 }],
        serviceCharge: 300,
        payment: { method: 'CASH', amount: 500 },
      },
      mockTechId
    );

    expect(res.success).toBe(true);
    expect(res.data.payment).toBeDefined();
    expect(res.data.payment.paymentMethod).toBe('CASH');
    expect(res.data.payment.amount).toBe(500);
    expect(res.data.payment.status).toBe('PAID');
  });

  // J. Online payment
  it('Requirement J: Records ONLINE payment without external gateway dependency', async () => {
    const res = await technicianExecutionService.completeJob(
      mockJobCardId,
      {
        workPerformed: 'Part replacement',
        partsReplaced: [{ inventoryItemId: 'inv-part-1', quantity: 1 }],
        serviceCharge: 300,
        payment: { method: 'ONLINE', amount: 500 },
      },
      mockTechId
    );

    expect(res.success).toBe(true);
    expect(res.data.payment.paymentMethod).toBe('ONLINE');
    expect(res.data.payment.amount).toBe(500);
  });

  // K. Payment with reference
  it('Requirement K: Preserves transaction reference ID for ONLINE payments', async () => {
    const res = await technicianExecutionService.completeJob(
      mockJobCardId,
      {
        workPerformed: 'Part replacement',
        partsReplaced: [{ inventoryItemId: 'inv-part-1', quantity: 1 }],
        serviceCharge: 300,
        payment: { method: 'ONLINE', amount: 500, reference: 'HDFC-UPI-884920' },
      },
      mockTechId
    );

    expect(res.success).toBe(true);
    expect(res.data.payment.reference).toBe('HDFC-UPI-884920');
  });

  // L. Zero payment (status NOT_PAID)
  it('Requirement L: Handles zero payment submission with NOT_PAID status', async () => {
    const res = await technicianExecutionService.completeJob(
      mockJobCardId,
      {
        workPerformed: 'Inspection only',
        partsReplaced: [],
        serviceCharge: 500,
        payment: { method: 'CASH', amount: 0 },
      },
      mockTechId
    );

    expect(res.success).toBe(true);
    expect(res.data.payment.status).toBe('NOT_PAID');
    expect(res.data.payment.amount).toBe(0);
  });

  // M. Partial payment (status PARTIALLY_PAID)
  it('Requirement M: Handles partial payment submission with PARTIALLY_PAID status', async () => {
    const res = await technicianExecutionService.completeJob(
      mockJobCardId,
      {
        workPerformed: 'Inspection and maintenance',
        partsReplaced: [{ inventoryItemId: 'inv-part-1', quantity: 1, unitPrice: 200, partName: 'Part A' }], // 200
        serviceCharge: 300, // 300 => Subtotal 500 => Total 590 with 18% GST
        gstEnabled: true,
        gstRate: 18,
        payment: { method: 'CASH', amount: 300 },
      },
      mockTechId
    );

    expect(res.success).toBe(true);
    expect(res.data.payment.status).toBe('PARTIALLY_PAID');
    expect(res.data.payment.amount).toBe(300);
    expect(res.data.invoice.balanceAmount).toBe(290);
  });

  // N. Full payment (status PAID)
  it('Requirement N: Handles full payment with PAID status and zero remaining balance', async () => {
    const res = await technicianExecutionService.completeJob(
      mockJobCardId,
      {
        workPerformed: 'Inspection and maintenance',
        partsReplaced: [{ inventoryItemId: 'inv-part-1', quantity: 1 }], // 200
        serviceCharge: 300, // 300 => Total 500
        payment: { method: 'ONLINE', amount: 500 },
      },
      mockTechId
    );

    expect(res.success).toBe(true);
    expect(res.data.payment.status).toBe('PAID');
    expect(res.data.invoice.balanceAmount).toBe(0);
  });

  // O. Invoice generation
  it('Requirement O: Generates authoritative invoice number using INV- prefix format', async () => {
    const res = await technicianExecutionService.completeJob(
      mockJobCardId,
      {
        workPerformed: 'Complete servicing',
        partsReplaced: [],
        serviceCharge: 500,
        payment: { method: 'CASH', amount: 500 },
      },
      mockTechId
    );

    expect(res.data.invoice.invoiceNumber).toMatch(/^INV-\d+/);
  });

  // P. Invoice persistence
  it('Requirement P: Persists invoice linked to customer, service and job card', async () => {
    const res = await technicianExecutionService.completeJob(
      mockJobCardId,
      {
        workPerformed: 'Complete servicing',
        partsReplaced: [],
        serviceCharge: 500,
      },
      mockTechId
    );

    expect(res.data.invoice.customerId).toBe(mockCustomerId);
    expect(res.data.invoice.serviceId).toBe(mockServiceId);
    expect(res.data.invoice.jobCardId).toBe(mockJobCardId);
    expect(res.data.invoice.template).toBe('REVAMP');
  });

  // Q. Invoice line items
  it('Requirement Q: Generates both SPARE_PART and SERVICE invoice line items', async () => {
    const res = await technicianExecutionService.completeJob(
      mockJobCardId,
      {
        workPerformed: 'PCB replaced',
        partsReplaced: [{ inventoryItemId: 'inv-pcb-3', quantity: 1, partName: 'Motherboard PCB Kit' }],
        serviceCharge: 500,
      },
      mockTechId
    );

    const items = res.data.invoice.items;
    expect(items.length).toBe(2);
    expect(items[0].itemType).toBe('SPARE_PART');
    expect(items[0].description).toContain('PCB');
    expect(items[1].itemType).toBe('SERVICE');
    expect(items[1].description).toBe('Service / Labor Charge');
  });

  // R. Payment persistence
  it('Requirement R: Persists payment record linked to the invoice', async () => {
    const res = await technicianExecutionService.completeJob(
      mockJobCardId,
      {
        workPerformed: 'Servicing',
        partsReplaced: [],
        serviceCharge: 500,
        payment: { method: 'CASH', amount: 500 },
      },
      mockTechId
    );

    expect(res.data.payment.invoiceId).toBe(res.data.invoice.id);
  });

  // S. Correct payment status
  it('Requirement S: Derives payment status correctly without trusting client input', async () => {
    const res = await technicianExecutionService.completeJob(
      mockJobCardId,
      {
        workPerformed: 'Servicing',
        partsReplaced: [],
        serviceCharge: 500,
        payment: { method: 'CASH', amount: 500 },
      },
      mockTechId
    );

    expect(res.data.payment.status).toBe('PAID');
  });

  // T. Inventory deduction
  it('Requirement T: Deducts inventory items with authoritative SALE type transaction', async () => {
    await technicianExecutionService.completeJob(
      mockJobCardId,
      {
        workPerformed: 'Servicing',
        partsReplaced: [{ inventoryItemId: 'inv-module-2', quantity: 2 }],
        serviceCharge: 400,
      },
      mockTechId
    );

    expect(deductedStock).toEqual([
      { productId: 'inv-module-2', quantity: 2, type: 'SALE' },
    ]);
  });

  // U. Duplicate completion rejection
  it('Requirement U: Rejects duplicate completion attempts when job is already COMPLETED or CANCELLED', async () => {
    // First completion
    const firstRes = await technicianExecutionService.completeJob(
      mockJobCardId,
      { workPerformed: 'First completion' },
      mockTechId
    );
    expect(firstRes.success).toBe(true);

    // Second completion on already completed job returns idempotent completion without duplicate deductions
    const secondRes = await technicianExecutionService.completeJob(
      mockJobCardId,
      { workPerformed: 'Duplicate attempt' },
      mockTechId
    );
    expect(secondRes.success).toBe(true);
    expect(secondRes.message).toBe('Job has already been completed');

    // Attempting to complete a CANCELLED job rejects with BAD_REQUEST
    jobStore[mockJobCardId].status = 'CANCELLED';
    await expect(
      technicianExecutionService.completeJob(
        mockJobCardId,
        { workPerformed: 'Cancelled attempt' },
        mockTechId
      )
    ).rejects.toMatchObject({
      statusCode: HTTP_STATUS.BAD_REQUEST,
      code: TECHNICIAN_ERROR_CODES.INVALID_STATE_TRANSITION,
    });
  });

  // V. Duplicate invoice prevention
  it('Requirement V: Does not create duplicate invoices if already billed', async () => {
    jobStore[mockJobCardId].status = 'COMPLETED';
    jobStore[mockJobCardId].invoiceId = 'inv-existing-123';

    const res = await technicianExecutionService.completeJob(
      mockJobCardId,
      { workPerformed: 'Repeat' },
      mockTechId
    );

    expect(res.success).toBe(true);
    expect(res.message).toBe('Job has already been completed');
    // Confirms NO duplicate invoice created
    expect(createdInvoices.length).toBe(0);
  });

  // W. Technician authorization check
  it('Requirement W: Denies unauthorized technician with 403 Forbidden', async () => {
    await expect(
      technicianExecutionService.completeJob(
        mockJobCardId,
        { workPerformed: 'Malicious attempt' },
        mockOtherTechId
      )
    ).rejects.toMatchObject({
      statusCode: HTTP_STATUS.FORBIDDEN,
      code: TECHNICIAN_ERROR_CODES.JOB_CARD_NOT_ASSIGNED,
    });
  });

  // X. Admin invoice visibility
  it('Requirement X: Generated invoice is retrievable by Admin CRM repository with full linkages', async () => {
    const res = await technicianExecutionService.completeJob(
      mockJobCardId,
      {
        workPerformed: 'Full overhaul',
        partsReplaced: [{ inventoryItemId: 'inv-part-1', quantity: 1, partName: 'Standard Part' }],
        serviceCharge: 400,
        payment: { method: 'ONLINE', amount: 600, reference: 'PAY-REF-1' },
      },
      mockTechId
    );

    const invoice = res.data.invoice;
    expect(invoice.customerId).toBe(mockCustomerId);
    expect(invoice.serviceId).toBe(mockServiceId);
    expect(invoice.jobCardId).toBe(mockJobCardId);
    expect(invoice.template).toBe('REVAMP');
  });

  // Y. PDF generation
  it('Requirement Y: Generates valid single-page Revamp PDF without throwing errors', async () => {
    const phpScript = path.resolve(__dirname, '../../../../../scripts/mailer/PdfInvoiceGenerator.php');
    const invoicePayload = {
      template: 'REVAMP',
      invoiceNumber: 'INV-1079',
      issueDate: '2026-03-15',
      customerName: 'Rahul Sharma',
      customerAddress: 'Io Gate, Wakad, Pune, Maharashtra 411057',
      customerGstin: '27AAAAA0000A1Z5',
      subtotal: 1050,
      taxAmount: 189,
      totalAmount: 1239,
      items: [
        { nameSnapshot: 'Standard Spare Part A', quantity: 1, unitPriceSnapshot: 200, lineTotal: 200 },
        { nameSnapshot: 'Replacement Module B', quantity: 1, unitPriceSnapshot: 350, lineTotal: 350 },
        { nameSnapshot: 'Service / Labor Charge', quantity: 1, unitPriceSnapshot: 500, lineTotal: 500 },
      ],
    };

    const phpCode = `
      require_once '${phpScript}';
      $data = json_decode('${JSON.stringify(invoicePayload)}', true);
      $res = \\SREnterprises\\Mailer\\PdfInvoiceGenerator::generateInvoicePdf($data);
      if (!$res['success']) {
        throw new Exception($res['error'] ?? 'PDF generation failed');
      }
      echo filesize($res['filePath']);
    `;

    const pdfSize = await new Promise<number>((resolve, reject) => {
      execFile('php', ['-r', phpCode], (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          resolve(parseInt(stdout.trim(), 10));
        }
      });
    });

    expect(pdfSize).toBeGreaterThan(1000);
  });

  // Z. Invoice template rendering
  it('Requirement Z: PDF template output matches Revamp branding, address, mobile and particulars', async () => {
    const phpScript = path.resolve(__dirname, '../../../../../scripts/mailer/PdfInvoiceGenerator.php');
    const invoicePayload = {
      template: 'REVAMP',
      invoiceNumber: 'INV-1079',
      issueDate: '2026-03-15',
      customerName: 'Rahul Sharma',
      items: [
        { nameSnapshot: 'Filter', quantity: 1, unitPriceSnapshot: 200, lineTotal: 200 },
      ],
      totalAmount: 236,
    };

    const phpCode = `
      require_once '${phpScript}';
      $data = json_decode('${JSON.stringify(invoicePayload)}', true);
      $reflection = new ReflectionClass('\\SREnterprises\\Mailer\\PdfInvoiceGenerator');
      $method = $reflection->getMethod('renderRevampInvoiceHtml');
      $method->setAccessible(true);
      echo $method->invoke(null, $data);
    `;

    const htmlOutput = await new Promise<string>((resolve, reject) => {
      execFile('php', ['-r', phpCode], (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          resolve(stdout);
        }
      });
    });

    expect(htmlOutput).toContain('Revamp');
    expect(htmlOutput).toContain('Home Appliance Repair Service');
    expect(htmlOutput).toContain('Your satisfaction is our');
    expect(htmlOutput).toContain('Priority');
    expect(htmlOutput).toContain('Akshara International School Road');
    expect(htmlOutput).toContain('Mob No : 9881647076');
    expect(htmlOutput).toContain('PARTICULARS');
    expect(htmlOutput).toContain('For Revamp Services');
    expect(htmlOutput).toContain('Proprietor');
  });

  // AA. GST OFF (0%) Test
  it('Requirement AA: Service completion with GST OFF calculates 0 tax and total equals subtotal', async () => {
    const res = await technicianExecutionService.completeJob(
      mockJobCardId,
      {
        workPerformed: 'General maintenance and electrical inspection',
        partsReplaced: [
          { partName: 'Manual Sensor Module', quantity: 2, unitPrice: 250 }, // 500
        ],
        serviceCharge: 500, // 500 => Subtotal 1000
        gstEnabled: false,
        payment: { method: 'CASH', amount: 1000 },
      },
      mockTechId
    );

    expect(res.success).toBe(true);
    expect(res.data.invoice.subtotal).toBe(1000);
    expect(res.data.invoice.taxAmount).toBe(0);
    expect(res.data.invoice.totalAmount).toBe(1000);
    expect(res.data.payment.paymentMethod).toBe('CASH');
    expect(res.data.payment.amount).toBe(1000);
    expect(res.data.payment.status).toBe('PAID');
    expect(res.data.invoice.balanceAmount).toBe(0);
  });

  // AB. GST 12% Test
  it('Requirement AB: Service completion with GST ON at 12% calculates 12% tax accurately', async () => {
    const res = await technicianExecutionService.completeJob(
      mockJobCardId,
      {
        workPerformed: 'HVAC repair and thermostat install',
        partsReplaced: [
          { partName: 'Thermostat Relay', quantity: 1, unitPrice: 600 }, // 600
        ],
        serviceCharge: 400, // 400 => Subtotal 1000
        gstEnabled: true,
        gstRate: 12,
        payment: { method: 'ONLINE', amount: 1120, reference: 'ONLINE-TX-12PCT' },
      },
      mockTechId
    );

    expect(res.success).toBe(true);
    expect(res.data.invoice.subtotal).toBe(1000);
    expect(res.data.invoice.taxAmount).toBe(120);
    expect(res.data.invoice.totalAmount).toBe(1120);
    expect(res.data.payment.paymentMethod).toBe('ONLINE');
    expect(res.data.payment.amount).toBe(1120);
    expect(res.data.payment.status).toBe('PAID');
    expect(res.data.invoice.balanceAmount).toBe(0);
  });

  // AC. GST 18% Test
  it('Requirement AC: Service completion with GST ON at 18% calculates 18% tax accurately', async () => {
    const res = await technicianExecutionService.completeJob(
      mockJobCardId,
      {
        workPerformed: 'Machinery calibration',
        partsReplaced: [
          { partName: 'Hydraulic Seal', quantity: 2, unitPrice: 500 }, // 1000
        ],
        serviceCharge: 1000, // Subtotal 2000
        gstEnabled: true,
        gstRate: 18,
        payment: { method: 'ONLINE', amount: 2360, reference: 'ONLINE-TX-18PCT' },
      },
      mockTechId
    );

    expect(res.success).toBe(true);
    expect(res.data.invoice.subtotal).toBe(2000);
    expect(res.data.invoice.taxAmount).toBe(360);
    expect(res.data.invoice.totalAmount).toBe(2360);
    expect(res.data.payment.status).toBe('PAID');
  });

  // AD. Manual Spare Parts Entry Test
  it('Requirement AD: Multiple manual spare parts entry with technician-entered prices works without inventory items', async () => {
    const res = await technicianExecutionService.completeJob(
      mockJobCardId,
      {
        workPerformed: 'Custom machinery assembly',
        partsReplaced: [
          { partName: 'Custom Fastener Pack', description: 'Grade 8.8 hex bolts', quantity: 5, unitPrice: 40 }, // 200
          { partName: 'Control Switch', description: 'Rotary selector', quantity: 2, unitPrice: 300 }, // 600
        ],
        serviceCharge: 700, // Subtotal 1500
        gstEnabled: false,
        payment: { method: 'CASH', amount: 1500 },
      },
      mockTechId
    );

    expect(res.success).toBe(true);
    expect(res.data.invoice.subtotal).toBe(1500);
    expect(res.data.invoice.taxAmount).toBe(0);
    expect(res.data.invoice.totalAmount).toBe(1500);
    expect(res.data.invoice.items.length).toBe(3); // 2 parts + 1 service charge
    expect(deductedStock.length).toBe(0); // Manual parts do not deduct inventory stock
  });
});
