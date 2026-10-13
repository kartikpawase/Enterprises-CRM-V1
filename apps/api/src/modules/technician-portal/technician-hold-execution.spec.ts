import { describe, it, expect, beforeEach, vi } from 'vitest';
import { technicianExecutionService } from './technician-execution.service';
import { jobCardsRepository, memoryJobCards } from '../job-cards/job-cards.repository';
import { memoryServices } from '../services/services.repository';
import { inventoryRepository } from '../inventory/inventory.repository';
import { productRepository } from '../products/product.repository';

describe('Technician Job Hold Execution Workflow', () => {
  const mockTechId = 'tech-hold-worker-01';
  const otherTechId = 'tech-hold-worker-99';
  const mockCompanyId = 'comp-001';
  const mockServiceId = 'srv-hold-test-01';
  const mockJobCardId = 'jc-hold-test-01';
  const mockCustomerId = 'cust-hold-test-01';
  const mockProductId = 'prod-part-001';

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock completeJobCard in repository to avoid DB connection in unit test
    vi.spyOn(jobCardsRepository, 'completeJobCard').mockImplementation(
      async (id: string, input: any) => {
        const jc = memoryJobCards.find((j) => j.id === id);
        if (jc) {
          jc.status = 'COMPLETED';
          Object.assign(jc, input);
        }
        return { jobCard: { ...(jc || {}) } } as any;
      }
    );

    // Reset services
    const sIndex = memoryServices.findIndex((s) => s.id === mockServiceId);
    if (sIndex >= 0) memoryServices.splice(sIndex, 1);

    memoryServices.push({
      id: mockServiceId,
      serviceNumber: 'SRV-HOLD-TEST-01',
      serviceType: 'REPAIR',
      serviceLocation: 'DOORSTEP',
      serviceClassification: 'GENERAL',
      scheduledDate: new Date().toISOString(),
      status: 'IN_PROGRESS',
      priority: 'NORMAL',
      customerId: mockCustomerId,
      customerName: 'Hold Test Customer',
      customerPhone: '9876543210',
      technicianId: mockTechId,
      technicianName: 'Tech John',
      technicianPhone: '9123456780',
      jobCardId: mockJobCardId,
      jobCardNumber: 'JC-HOLD-TEST-01',
      jobCardStatus: 'IN_PROGRESS',
      companyId: mockCompanyId,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    // Reset job cards
    const jIndex = memoryJobCards.findIndex((j) => j.id === mockJobCardId);
    if (jIndex >= 0) memoryJobCards.splice(jIndex, 1);

    memoryJobCards.push({
      id: mockJobCardId,
      jobCardNumber: 'JC-HOLD-TEST-01',
      serviceId: mockServiceId,
      customerId: mockCustomerId,
      technicianId: mockTechId,
      companyId: mockCompanyId,
      status: 'IN_PROGRESS',
      problemReported: 'Water purifier stopped filtration',
      partsReplaced: [],
      diagnosis: null,
      workPerformed: null,
      technicianNotes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
  });

  it('successfully records execution progress and spare parts from inventory, placing job ON_HOLD', async () => {
    // Mock product and inventory stock
    vi.spyOn(productRepository, 'findById').mockResolvedValue({
      id: mockProductId,
      name: 'Sediment Filter Cartridge',
      sku: 'SFC-001',
      unitPrice: '450.00',
      isActive: true,
      companyId: mockCompanyId,
    } as any);

    vi.spyOn(inventoryRepository, 'getStockBalance').mockResolvedValue({
      currentStock: 10,
      reservedStock: 0,
      availableStock: 10,
    } as any);

    const recordAdjustmentSpy = vi
      .spyOn(inventoryRepository, 'recordAdjustment')
      .mockResolvedValue({} as any);

    const result = await technicianExecutionService.holdJob(
      mockJobCardId,
      {
        holdReason: 'Awaiting specialized membrane replacement from central warehouse',
        diagnosis: 'Pre-filter clogged and high pressure sediment buildup',
        workPerformed: 'Flushed lines and replaced primary sediment cartridge',
        partsReplaced: [
          {
            productId: mockProductId,
            itemName: 'Sediment Filter Cartridge',
            quantity: 2,
            unitPrice: 450,
          },
        ],
        serviceCharge: 200,
        gstEnabled: true,
        gstRate: 18,
      },
      mockTechId
    );

    expect(result.success).toBe(true);
    expect(result.message).toBe('Job put on hold');

    // Verify inventory deduction was invoked
    expect(recordAdjustmentSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: mockProductId,
        quantity: 2,
        type: 'SALE',
        referenceType: 'JOB_CARD',
      })
    );

    // Verify job card status in memory is ON_HOLD, NOT COMPLETED
    const updatedJob = memoryJobCards.find((j) => j.id === mockJobCardId);
    expect(updatedJob?.status).toBe('ON_HOLD');
    expect(updatedJob?.workPerformed).toBe('Flushed lines and replaced primary sediment cartridge');
    expect(updatedJob?.diagnosis).toBe('Pre-filter clogged and high pressure sediment buildup');
    expect(updatedJob?.partsReplaced).toHaveLength(1);
    expect(updatedJob?.partsReplaced?.[0]).toMatchObject({
      productId: mockProductId,
      itemName: 'Sediment Filter Cartridge',
      quantity: 2,
      inventoryDeducted: true,
    });
    expect(updatedJob?.technicianNotes).toContain(
      '[Hold reason]: Awaiting specialized membrane replacement from central warehouse'
    );

    // Verify service status in memory is ON_HOLD, NOT COMPLETED
    const updatedService = memoryServices.find((s) => s.id === mockServiceId);
    expect(updatedService?.status).toBe('ON_HOLD');
  });

  it('allows putting job on hold when hold reason is omitted or empty (optional field)', async () => {
    const result = await technicianExecutionService.holdJob(
      mockJobCardId,
      {
        workPerformed: 'Partial diagnosis done',
      },
      mockTechId
    );
    expect(result.success).toBe(true);
    const updatedJob = memoryJobCards.find((j) => j.id === mockJobCardId);
    expect(updatedJob?.status).toBe('ON_HOLD');
    expect(updatedJob?.technicianNotes).toContain('[Hold reason]: Work paused / on hold');
  });

  it('rejects hold attempt by an unauthorized technician', async () => {
    await expect(
      technicianExecutionService.holdJob(
        mockJobCardId,
        {
          holdReason: 'Customer not at home',
        },
        otherTechId
      )
    ).rejects.toThrow();
  });

  it('rejects spare part recording if requested quantity exceeds available stock', async () => {
    vi.spyOn(productRepository, 'findById').mockResolvedValue({
      id: mockProductId,
      name: 'Sediment Filter Cartridge',
      unitPrice: '450.00',
      isActive: true,
      companyId: mockCompanyId,
    } as any);

    vi.spyOn(inventoryRepository, 'getStockBalance').mockResolvedValue({
      currentStock: 1,
      availableStock: 1,
    } as any);

    await expect(
      technicianExecutionService.holdJob(
        mockJobCardId,
        {
          holdReason: 'Waiting for additional parts',
          partsReplaced: [
            {
              productId: mockProductId,
              itemName: 'Sediment Filter Cartridge',
              quantity: 5,
              unitPrice: 450,
            },
          ],
        },
        mockTechId
      )
    ).rejects.toThrow(/Insufficient stock/);
  });

  it('does NOT double-deduct inventory when an on-hold job is subsequently completed', async () => {
    // 1. First put job on hold with 1 part deducted
    vi.spyOn(productRepository, 'findById').mockResolvedValue({
      id: mockProductId,
      name: 'Sediment Filter Cartridge',
      unitPrice: '450.00',
      isActive: true,
      companyId: mockCompanyId,
    } as any);

    vi.spyOn(inventoryRepository, 'getStockBalance').mockResolvedValue({
      currentStock: 10,
      availableStock: 10,
    } as any);

    const recordAdjustmentSpy = vi
      .spyOn(inventoryRepository, 'recordAdjustment')
      .mockResolvedValue({} as any);

    await technicianExecutionService.holdJob(
      mockJobCardId,
      {
        holdReason: 'Need membrane',
        workPerformed: 'Replaced sediment filter',
        partsReplaced: [
          {
            productId: mockProductId,
            itemName: 'Sediment Filter Cartridge',
            quantity: 1,
            unitPrice: 450,
          },
        ],
      },
      mockTechId
    );

    expect(recordAdjustmentSpy).toHaveBeenCalledTimes(1);

    // 2. Now resume job to IN_PROGRESS
    const job = memoryJobCards.find((j) => j.id === mockJobCardId);
    if (job) job.status = 'IN_PROGRESS';
    const srv = memoryServices.find((s) => s.id === mockServiceId);
    if (srv) srv.status = 'IN_PROGRESS';

    // Reset spy count
    recordAdjustmentSpy.mockClear();

    // 3. Complete the job with the already-deducted part + a new part
    const newPartId = 'prod-part-002';
    vi.spyOn(productRepository, 'findById').mockImplementation(async (id: string) => {
      if (id === newPartId) {
        return {
          id: newPartId,
          name: 'RO Membrane',
          unitPrice: '1200.00',
          isActive: true,
          companyId: mockCompanyId,
        } as any;
      }
      return {
        id: mockProductId,
        name: 'Sediment Filter Cartridge',
        unitPrice: '450.00',
        isActive: true,
        companyId: mockCompanyId,
      } as any;
    });

    await technicianExecutionService.completeJob(
      mockJobCardId,
      {
        workPerformed: 'Installed membrane and completed all testing',
        partsReplaced: [
          {
            productId: mockProductId,
            itemName: 'Sediment Filter Cartridge',
            quantity: 1,
            unitPrice: 450,
            inventoryDeducted: true, // Previously deducted during hold
          },
          {
            productId: newPartId,
            itemName: 'RO Membrane',
            quantity: 1,
            unitPrice: 1200,
            inventoryDeducted: false, // Newly consumed
          },
        ],
      },
      mockTechId
    );

    // Only the NEW part should have been deducted during completion!
    expect(recordAdjustmentSpy).toHaveBeenCalledTimes(1);
    expect(recordAdjustmentSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: newPartId,
        quantity: 1,
      })
    );
  });

  it('supports manual spare parts entry without inventory link while setting active status', async () => {
    const result = await technicianExecutionService.holdJob(
      mockJobCardId,
      {
        holdReason: 'Awaiting specialized sealant to cure',
        workPerformed: 'Applied non-stock adhesive and silicone seal',
        partsReplaced: [
          {
            itemName: 'Industrial Silicone Sealant Tape',
            quantity: 1,
            unitPrice: 150,
          },
        ],
      },
      mockTechId
    );

    expect(result.success).toBe(true);
    const updatedJob = memoryJobCards.find((j) => j.id === mockJobCardId);
    expect(updatedJob?.status).toBe('ON_HOLD');
    expect(updatedJob?.partsReplaced).toHaveLength(1);
    expect(updatedJob?.partsReplaced?.[0]).toMatchObject({
      itemName: 'Industrial Silicone Sealant Tape',
      quantity: 1,
      unitPrice: 150,
      status: 'ACTIVE',
    });
  });

  it('rejects inactive inventory items when placing job on hold', async () => {
    vi.spyOn(productRepository, 'findById').mockResolvedValue({
      id: mockProductId,
      name: 'Obsolete Filter Cartridge',
      unitPrice: '450.00',
      isActive: false,
      companyId: mockCompanyId,
    } as any);

    await expect(
      technicianExecutionService.holdJob(
        mockJobCardId,
        {
          holdReason: 'Waiting for parts',
          partsReplaced: [
            {
              productId: mockProductId,
              itemName: 'Obsolete Filter Cartridge',
              quantity: 1,
            },
          ],
        },
        mockTechId
      )
    ).rejects.toThrow(/inactive or discontinued/i);
  });

  it('handles multiple ON_HOLD cycles without duplicate stock deduction and preserves all previously recorded parts', async () => {
    const part1Id = 'prod-part-101';
    const part2Id = 'prod-part-102';

    vi.spyOn(productRepository, 'findById').mockImplementation(async (id: string) => {
      if (id === part1Id) {
        return {
          id: part1Id,
          name: 'Filter A',
          unitPrice: '300.00',
          isActive: true,
          companyId: mockCompanyId,
        } as any;
      }
      return {
        id: part2Id,
        name: 'Valve B',
        unitPrice: '500.00',
        isActive: true,
        companyId: mockCompanyId,
      } as any;
    });

    vi.spyOn(inventoryRepository, 'getStockBalance').mockResolvedValue({
      currentStock: 20,
      availableStock: 20,
    } as any);

    const recordAdjustmentSpy = vi
      .spyOn(inventoryRepository, 'recordAdjustment')
      .mockResolvedValue({} as any);

    // 1st Hold: add part 1
    await technicianExecutionService.holdJob(
      mockJobCardId,
      {
        holdReason: 'Hold 1 - Waiting for tools',
        partsReplaced: [
          {
            productId: part1Id,
            itemName: 'Filter A',
            quantity: 1,
          },
        ],
      },
      mockTechId
    );

    expect(recordAdjustmentSpy).toHaveBeenCalledTimes(1);

    // Resume
    const job = memoryJobCards.find((j) => j.id === mockJobCardId);
    if (job) job.status = 'IN_PROGRESS';

    recordAdjustmentSpy.mockClear();

    // 2nd Hold: add part 2 alongside previously recorded part 1 (with inventoryDeducted: true)
    await technicianExecutionService.holdJob(
      mockJobCardId,
      {
        holdReason: 'Hold 2 - Waiting for customer confirmation',
        partsReplaced: [
          {
            productId: part1Id,
            itemName: 'Filter A',
            quantity: 1,
            inventoryDeducted: true,
          },
          {
            productId: part2Id,
            itemName: 'Valve B',
            quantity: 1,
            inventoryDeducted: false,
          },
        ],
      },
      mockTechId
    );

    // Only part 2 should have been deducted in the 2nd hold event
    expect(recordAdjustmentSpy).toHaveBeenCalledTimes(1);
    expect(recordAdjustmentSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: part2Id,
        quantity: 1,
      })
    );

    const jobAfterSecondHold = memoryJobCards.find((j) => j.id === mockJobCardId);
    expect(jobAfterSecondHold?.partsReplaced).toHaveLength(2);
    expect(jobAfterSecondHold?.status).toBe('ON_HOLD');
  });

  it('marks spare parts as CLOSED upon final completion while preserving invoice line items', async () => {
    vi.spyOn(productRepository, 'findById').mockResolvedValue({
      id: mockProductId,
      name: 'Sediment Filter Cartridge',
      unitPrice: '450.00',
      isActive: true,
      companyId: mockCompanyId,
    } as any);

    vi.spyOn(inventoryRepository, 'getStockBalance').mockResolvedValue({
      currentStock: 10,
      availableStock: 10,
    } as any);

    vi.spyOn(inventoryRepository, 'recordAdjustment').mockResolvedValue({} as any);

    // 1. Hold job with 1 part
    await technicianExecutionService.holdJob(
      mockJobCardId,
      {
        holdReason: 'Lunch break and parts verification',
        workPerformed: 'Preliminary cleaning',
        partsReplaced: [
          {
            productId: mockProductId,
            itemName: 'Sediment Filter Cartridge',
            quantity: 1,
            unitPrice: 450,
          },
        ],
      },
      mockTechId
    );

    // 2. Resume
    const job = memoryJobCards.find((j) => j.id === mockJobCardId);
    if (job) job.status = 'IN_PROGRESS';

    // 3. Complete job
    const completeResult = await technicianExecutionService.completeJob(
      mockJobCardId,
      {
        workPerformed: 'Full servicing and membrane flushed',
        partsReplaced: [
          {
            productId: mockProductId,
            itemName: 'Sediment Filter Cartridge',
            quantity: 1,
            unitPrice: 450,
            inventoryDeducted: true,
          },
        ],
        serviceCharge: 150,
      },
      mockTechId
    );

    expect(completeResult.success).toBe(true);
    expect(completeResult.data.status).toBe('COMPLETED');

    // Job card partsReplaced status should now be CLOSED
    const completedJob = memoryJobCards.find((j) => j.id === mockJobCardId);
    expect(completedJob?.status).toBe('COMPLETED');
    expect(completedJob?.partsReplaced?.[0]?.status).toBe('CLOSED');
  });

  it('EXACT SCREENSHOT TEST: Manual spare "pp" Qty 1 @ ₹100 + Labour ₹200 = Total ₹300 (GST OFF)', async () => {
    const completeResult = await technicianExecutionService.completeJob(
      mockJobCardId,
      {
        workPerformed: 'Replaced manual part and tested machine',
        partsReplaced: [
          {
            itemName: 'pp',
            quantity: 1,
            unitPrice: 100,
            isWarrantyCovered: false,
          },
        ],
        serviceCharge: 200,
        gstEnabled: false,
      },
      mockTechId
    );

    expect(completeResult.success).toBe(true);
    const invoice = completeResult.data.invoice;
    expect(invoice).toBeDefined();

    // Verify Subtotal: Labour (200) + Spare (100) = 300
    expect(Number(invoice.subtotal)).toBe(300);
    expect(Number(invoice.taxAmount)).toBe(0);
    expect(Number(invoice.totalAmount)).toBe(300);

    // Verify invoice items contain pp spare part
    const spareItem = invoice.items.find(
      (it: any) => it.itemType === 'SPARE_PART' || it.description === 'pp' || it.nameSnapshot === 'pp'
    );
    expect(spareItem).toBeDefined();
    expect(Number(spareItem.unitPrice || spareItem.unitPriceSnapshot)).toBe(100);
    expect(Number(spareItem.quantity)).toBe(1);

    // Verify service charge item
    const laborItem = invoice.items.find((it: any) => it.itemType === 'SERVICE');
    expect(laborItem).toBeDefined();
    expect(Number(laborItem.unitPrice || laborItem.unitPriceSnapshot)).toBe(200);

    // Verify job card charges summary
    const completedJob = memoryJobCards.find((j) => j.id === mockJobCardId);
    expect(Number(completedJob?.partsCharges)).toBe(100);
    expect(Number(completedJob?.laborCharges)).toBe(200);
    expect(Number(completedJob?.totalCharges)).toBe(300);
  });

  it('SECOND TEST: Inventory catalog spare deducts stock exactly once and bills authoritative amount', async () => {
    vi.spyOn(productRepository, 'findById').mockResolvedValue({
      id: mockProductId,
      name: 'pp',
      sku: 'SKU-972780',
      unitPrice: '100.00',
      isActive: true,
      companyId: mockCompanyId,
    } as any);

    vi.spyOn(inventoryRepository, 'getStockBalance').mockResolvedValue({
      currentStock: 10,
      availableStock: 10,
    } as any);

    const recordAdjustmentSpy = vi
      .spyOn(inventoryRepository, 'recordAdjustment')
      .mockResolvedValue({} as any);

    const completeResult = await technicianExecutionService.completeJob(
      mockJobCardId,
      {
        workPerformed: 'Installed catalog part pp',
        partsReplaced: [
          {
            productId: mockProductId,
            itemName: 'pp',
            quantity: 1,
            unitPrice: 100,
          },
        ],
        serviceCharge: 200,
        gstEnabled: false,
      },
      mockTechId
    );

    expect(completeResult.success).toBe(true);
    expect(recordAdjustmentSpy).toHaveBeenCalledTimes(1);
    expect(recordAdjustmentSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: mockProductId,
        quantity: 1,
        type: 'SALE',
      })
    );

    const invoice = completeResult.data.invoice;
    expect(Number(invoice.subtotal)).toBe(300);
    expect(Number(invoice.totalAmount)).toBe(300);
  });

  it('THIRD TEST: Zero spare parts completes with Labour ₹200 only', async () => {
    const completeResult = await technicianExecutionService.completeJob(
      mockJobCardId,
      {
        workPerformed: 'General inspection, no parts needed',
        partsReplaced: [],
        serviceCharge: 200,
        gstEnabled: false,
      },
      mockTechId
    );

    expect(completeResult.success).toBe(true);
    const invoice = completeResult.data.invoice;
    expect(Number(invoice.subtotal)).toBe(200);
    expect(Number(invoice.totalAmount)).toBe(200);

    const completedJob = memoryJobCards.find((j) => j.id === mockJobCardId);
    expect(Number(completedJob?.partsCharges)).toBe(0);
    expect(Number(completedJob?.laborCharges)).toBe(200);
  });

  it('FOURTH TEST: Multiple spares (pp x 2 @ ₹100 = ₹200, capacitor x 1 @ ₹150 = ₹150, Labour ₹200) = ₹550', async () => {
    const completeResult = await technicianExecutionService.completeJob(
      mockJobCardId,
      {
        workPerformed: 'Replaced pp and capacitor',
        partsReplaced: [
          {
            itemName: 'pp',
            quantity: 2,
            unitPrice: 100,
          },
          {
            itemName: 'capacitor',
            quantity: 1,
            unitPrice: 150,
          },
        ],
        serviceCharge: 200,
        gstEnabled: false,
      },
      mockTechId
    );

    expect(completeResult.success).toBe(true);
    const invoice = completeResult.data.invoice;
    expect(Number(invoice.subtotal)).toBe(550);
    expect(Number(invoice.totalAmount)).toBe(550);
    expect(invoice.items.filter((it: any) => it.itemType === 'SPARE_PART')).toHaveLength(2);
  });

  it('FIFTH TEST: Full workflow ON-HOLD -> Resume -> Complete with additional spare and single deduction', async () => {
    vi.spyOn(productRepository, 'findById').mockResolvedValue({
      id: mockProductId,
      name: 'pp',
      unitPrice: '100.00',
      isActive: true,
      companyId: mockCompanyId,
    } as any);

    vi.spyOn(inventoryRepository, 'getStockBalance').mockResolvedValue({
      currentStock: 10,
      availableStock: 10,
    } as any);

    const recordAdjustmentSpy = vi
      .spyOn(inventoryRepository, 'recordAdjustment')
      .mockResolvedValue({} as any);

    // 1. Put on hold with pp x 1 @ ₹100
    const holdRes = await technicianExecutionService.holdJob(
      mockJobCardId,
      {
        holdReason: 'Need capacitor',
        workPerformed: 'Installed pp',
        partsReplaced: [
          {
            productId: mockProductId,
            itemName: 'pp',
            quantity: 1,
            unitPrice: 100,
          },
        ],
        serviceCharge: 200,
      },
      mockTechId
    );
    expect(holdRes.success).toBe(true);
    expect(recordAdjustmentSpy).toHaveBeenCalledTimes(1);

    // 2. Resume
    const job = memoryJobCards.find((j) => j.id === mockJobCardId);
    if (job) job.status = 'IN_PROGRESS';
    recordAdjustmentSpy.mockClear();

    // 3. Complete with pp (already deducted) + capacitor (manual)
    const completeResult = await technicianExecutionService.completeJob(
      mockJobCardId,
      {
        workPerformed: 'Installed capacitor and finished job',
        partsReplaced: [
          {
            productId: mockProductId,
            itemName: 'pp',
            quantity: 1,
            unitPrice: 100,
            inventoryDeducted: true,
          },
          {
            itemName: 'capacitor',
            quantity: 1,
            unitPrice: 150,
          },
        ],
        serviceCharge: 200,
        gstEnabled: false,
      },
      mockTechId
    );

    expect(completeResult.success).toBe(true);
    // pp was already deducted, capacitor is manual non-inventory, so 0 additional deductions!
    expect(recordAdjustmentSpy).toHaveBeenCalledTimes(0);

    const invoice = completeResult.data.invoice;
    expect(Number(invoice.subtotal)).toBe(450); // 100 + 150 + 200
    expect(Number(invoice.totalAmount)).toBe(450);
  });
});


