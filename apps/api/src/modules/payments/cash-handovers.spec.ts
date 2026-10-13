import { describe, it, expect, beforeEach } from 'vitest';
import { cashHandoversService } from './cash-handovers.service';
import { cashHandoversRepository, memoryCashHandovers } from './cash-handovers.repository';
import { technicianPaymentService } from '../technician-portal/technician-payment.service';
import { technicianExecutionService } from '../technician-portal/technician-execution.service';
import { technicianPortalRepository } from '../technician-portal/technician-portal.repository';
import { memoryServices } from '../services/services.repository';
import { memoryJobCards } from '../job-cards/job-cards.repository';
import { memoryInvoices } from '../invoices/invoices.repository';
import { memoryPayments } from './payments.repository';
import { memoryTechnicians } from '../technicians/technicians.repository';
import type { TechnicianSessionData } from '@crm/types';

describe('Technician Cash Collection -> Owner Cash Handover Verification Suite', () => {
  const companyId = 'comp-001';
  const technicianId = '11111111-1111-4111-8111-111111111111';
  const techSession: TechnicianSessionData = {
    sessionId: 'tech-session-123',
    technicianId,
    fullName: 'Pawan Kumar',
    phone: '9876543210',
    email: 'pawan@example.com',
    role: 'Technician',
    portalEnabled: true,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  };

  const adminUser = {
    id: 'admin-user-001',
    companyId,
    role: 'ADMIN',
    email: 'kartik@example.com',
    displayName: 'Kartik Owner',
  };

  const otherCompanyAdmin = {
    id: 'admin-other-002',
    companyId: 'comp-other-999',
    role: 'ADMIN',
    email: 'other@example.com',
    displayName: 'Other Owner',
  };

  beforeEach(() => {
    // Reset all in-memory repositories
    memoryServices.length = 0;
    memoryJobCards.length = 0;
    memoryInvoices.length = 0;
    memoryPayments.length = 0;
    memoryCashHandovers.length = 0;
    memoryTechnicians.length = 0;

    memoryTechnicians.push({
      id: technicianId,
      fullName: 'Pawan Kumar',
      phone: '9876543210',
      email: 'pawan@example.com',
      status: 'ACTIVE',
      skills: ['AC Repair'],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Seed a standard service and job card with unique IDs
    memoryServices.push({
      id: 'svc-cash-handover-999',
      serviceNumber: 'SRV-CASH-999',
      companyId,
      customerId: 'cust-cash-999',
      status: 'IN_PROGRESS',
      technicianId,
      assignedTechnicianId: technicianId,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    memoryJobCards.push({
      id: 'jc-cash-handover-999',
      jobCardNumber: 'JC-CASH-999',
      serviceId: 'svc-cash-handover-999',
      technicianId,
      assignedTechnicianId: technicianId,
      status: 'IN_PROGRESS',
      companyId,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    memoryInvoices.push({
      id: 'inv-cash-handover-999',
      invoiceNumber: 'INV-CASH-999',
      jobCardId: 'jc-cash-handover-999',
      serviceId: 'svc-cash-handover-999',
      companyId,
      customerId: 'cust-cash-999',
      customerName: 'ABC Customer',
      customerPhone: '9876543210',
      totalAmount: '1200.00',
      paidAmount: '0.00',
      outstandingAmount: '1200.00',
      status: 'ISSUED',
      lineItems: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
  });

  it('TEST 1 & 3 & 4: CASH payment creates PENDING handover with correct technician and authoritative amount', async () => {
    const paymentResult = await technicianPaymentService.recordPayment(
      'jc-cash-handover-999',
      {
        paymentMethod: 'CASH',
        amount: 1200,
        customerConfirmed: true,
      },
      techSession
    );

    expect(paymentResult.success).toBe(true);
    expect(paymentResult.data.paymentId).toBeDefined();
    expect(paymentResult.data.amount).toBe(1200);

    // Verify cash handover record exists in repository
    const handovers = await cashHandoversRepository.findPaginated({}, companyId);
    expect(handovers.items.length).toBe(1);

    const handover = handovers.items[0];
    expect(handover.technicianId).toBe(technicianId);
    expect(handover.amount).toBe(1200);
    expect(handover.status).toBe('PENDING');
    expect(handover.serviceId).toBe('svc-cash-handover-999');
    expect(handover.receivedBy).toBeNull();
    expect(handover.handedOverAt).toBeNull();
    expect(handover.collectedAt).toBeDefined();

    // Verify invoice status is PAID and amount paid is 1200
    const invoice = memoryInvoices.find((i) => i.id === 'inv-cash-handover-999');
    expect(invoice?.status).toBe('PAID');
    expect(Number(invoice?.paidAmount)).toBe(1200);
  });

  it('TEST 2 & 7: NON-CASH payment (UPI / CARD) does NOT create a cash handover record', async () => {
    const paymentResult = await technicianPaymentService.recordPayment(
      'jc-cash-handover-999',
      {
        paymentMethod: 'UPI',
        amount: 1200,
        customerConfirmed: true,
        referenceNumber: 'UPI-REF-9999',
      },
      techSession
    );

    expect(paymentResult.success).toBe(true);
    expect(paymentResult.data.paymentId).toBeDefined();
    expect(paymentResult.data.amount).toBe(1200);

    // Verify NO cash handover record was created
    const handovers = await cashHandoversRepository.findPaginated({}, companyId);
    expect(handovers.items.length).toBe(0);
  });

  it('TEST 5 & 6: Technician can see own cash summary and cannot mark cash received', async () => {
    // Record a 1200 cash payment
    await technicianPaymentService.recordPayment(
      'jc-cash-handover-999',
      {
        paymentMethod: 'CASH',
        amount: 1200,
        customerConfirmed: true,
      },
      techSession
    );

    // Fetch technician cash summary
    const summary = await cashHandoversService.getTechnicianSummary(technicianId, companyId);
    expect(summary.cashCollected).toBe(1200);
    expect(summary.cashHandedOver).toBe(0);
    expect(summary.pendingHandover).toBe(1200);

    // Verify profile includes this summary
    const profile = await technicianPortalRepository.getTechnician360Profile(technicianId);
    expect(profile.cashSummary).toBeDefined();
    expect(profile.cashSummary?.cashCollected).toBe(1200);
    expect(profile.cashSummary?.pendingHandover).toBe(1200);
    expect(profile.cashSummary?.cashHandedOver).toBe(0);

    // Attempt marking cash received as Technician -> MUST throw 403 FORBIDDEN
    const handovers = await cashHandoversRepository.findPaginated({}, companyId);
    const handoverId = handovers.items[0].id;

    await expect(
      cashHandoversService.markReceived(
        handoverId,
        {
          id: technicianId,
          role: 'Technician',
          displayName: 'Pawan Kumar',
        },
        { notes: 'Collected from customer' }
      )
    ).rejects.toThrow(/Technicians are not authorized/);
  });

  it('TEST 8, 9, 10, 11: Admin can see pending cash, mark received with authenticated session & server timestamp', async () => {
    await technicianPaymentService.recordPayment(
      'jc-cash-handover-999',
      {
        paymentMethod: 'CASH',
        amount: 1200,
        customerConfirmed: true,
      },
      techSession
    );

    // Admin lists handovers
    const pendingList = await cashHandoversService.getHandovers(
      { status: 'PENDING', page: 1, limit: 10 },
      adminUser.companyId
    );
    expect(pendingList.data.length).toBe(1);
    expect(pendingList.data[0].status).toBe('PENDING');

    const handoverId = pendingList.data[0].id;

    // Admin marks cash received
    const result = await cashHandoversService.markReceived(
      handoverId,
      adminUser,
      { notes: 'Received at counter' }
    );

    expect(result.data.status).toBe('RECEIVED');
    expect(result.data.receivedBy).toBe('admin-user-001');
    expect(result.data.handedOverAt).toBeDefined();
    expect(result.data.receivedByName).toBe('Kartik Owner');

    // Verify technician summary updates
    const techSummaryAfter = await cashHandoversService.getTechnicianSummary(technicianId, companyId);
    expect(techSummaryAfter.cashCollected).toBe(1200);
    expect(techSummaryAfter.cashHandedOver).toBe(1200);
    expect(techSummaryAfter.pendingHandover).toBe(0);
  });

  it('TEST 12: Double confirmation is strictly prevented', async () => {
    await technicianPaymentService.recordPayment(
      'jc-cash-handover-999',
      {
        paymentMethod: 'CASH',
        amount: 1200,
        customerConfirmed: true,
      },
      techSession
    );

    const handovers = await cashHandoversRepository.findPaginated({}, companyId);
    const handoverId = handovers.items[0].id;

    // First receive -> SUCCESS
    await cashHandoversService.markReceived(handoverId, adminUser);

    // Second receive -> MUST fail
    await expect(
      cashHandoversService.markReceived(handoverId, adminUser)
    ).rejects.toThrow(/already been marked as received/);
  });

  it('TEST 13: Duplicate handover is prevented for the same payment', async () => {
    // Record payment 1
    const p1 = await technicianPaymentService.recordPayment(
      'jc-cash-handover-999',
      {
        paymentMethod: 'CASH',
        amount: 1200,
        customerConfirmed: true,
      },
      techSession
    );

    // Attempt creating handover for the same payment ID directly
    const duplicate = await cashHandoversRepository.create({
      paymentId: p1.data.paymentId,
      serviceId: 'svc-cash-handover-999',
      technicianId,
      amount: 1200,
      status: 'PENDING',
      collectedAt: new Date(),
      companyId,
    });

    // Should return existing record, not duplicate
    const all = await cashHandoversRepository.findPaginated({}, companyId);
    expect(all.items.length).toBe(1);
    expect(duplicate.id).toBe(all.items[0].id);
  });

  it('TEST 14: Tenant isolation prevents cross-company cash access', async () => {
    await technicianPaymentService.recordPayment(
      'jc-cash-handover-999',
      {
        paymentMethod: 'CASH',
        amount: 1200,
        customerConfirmed: true,
      },
      techSession
    );

    const handovers = await cashHandoversRepository.findPaginated({}, companyId);
    const handoverId = handovers.items[0].id;

    // Other company admin lists handovers
    const otherList = await cashHandoversService.getHandovers(
      { status: 'PENDING', page: 1, limit: 10 },
      otherCompanyAdmin.companyId
    );
    expect(otherList.data.length).toBe(0);

    // Verify company ID on handover record
    const handover = await cashHandoversRepository.findById(handoverId);
    expect(handover?.companyId).toBe(companyId);
    expect(handover?.companyId).not.toBe(otherCompanyAdmin.companyId);
  });

  it('TEST 15 & 16: Marking cash received does NOT change invoice status, total amount, or payment records', async () => {
    await technicianPaymentService.recordPayment(
      'jc-cash-handover-999',
      {
        paymentMethod: 'CASH',
        amount: 1200,
        customerConfirmed: true,
      },
      techSession
    );

    const invoiceBefore = { ...memoryInvoices.find((i) => i.id === 'inv-cash-handover-999')! };
    const paymentBefore = { ...memoryPayments[0] };

    const handovers = await cashHandoversRepository.findPaginated({}, companyId);
    await cashHandoversService.markReceived(handovers.items[0].id, adminUser);

    const invoiceAfter = memoryInvoices.find((i) => i.id === 'inv-cash-handover-999')!;
    const paymentAfter = memoryPayments[0];

    // INVOICE INVARIANTS
    expect(invoiceAfter.totalAmount).toBe(invoiceBefore.totalAmount);
    expect(invoiceAfter.paidAmount).toBe(invoiceBefore.paidAmount);
    expect(invoiceAfter.status).toBe(invoiceBefore.status);

    // PAYMENT INVARIANTS
    expect(paymentAfter.amount).toBe(paymentBefore.amount);
    expect(paymentAfter.paymentMethod).toBe(paymentBefore.paymentMethod);
    expect(paymentAfter.status).toBe(paymentBefore.status);
  });

  it('Job Completion with CASH payment automatically creates PENDING cash handover', async () => {
    // Reset service & job card for completeJob test
    memoryServices[0].status = 'IN_PROGRESS';
    memoryJobCards[0].status = 'IN_PROGRESS';
    memoryInvoices[0].status = 'ISSUED';
    memoryInvoices[0].paidAmount = '0.00';
    memoryInvoices[0].outstandingAmount = '1200.00';

    const completeResult = await technicianExecutionService.completeJob(
      'jc-cash-handover-999',
      {
        workPerformed: 'Repaired machine and checked operation',
        customerSignature: 'data:image/png;base64,mockSig',
        customerFeedback: 'Good work',
        payment: {
          amount: 1200,
          method: 'CASH',
        },
      },
      technicianId
    );

    expect(completeResult.success).toBe(true);
    expect(completeResult.data.status).toBe('COMPLETED');

    const handovers = await cashHandoversRepository.findPaginated({}, companyId);
    expect(handovers.items.length).toBe(1);
    expect(handovers.items[0].status).toBe('PENDING');
    expect(handovers.items[0].amount).toBe(1200);
    expect(handovers.items[0].technicianId).toBe(technicianId);
  });

  /* -------------------------------------------------------------------------- */
  /* PHASE 05 INTEGRITY TESTS                                                   */
  /* -------------------------------------------------------------------------- */

  const techActor = {
    id: technicianId,
    technicianId,
    displayName: 'Pawan Kumar',
    role: 'Technician',
  };

  it('PHASE 05: Technician submits handover request (PENDING -> SUBMITTED) with audit history and timestamps', async () => {
    // 1. Record cash collection
    await technicianPaymentService.recordPayment(
      'jc-cash-handover-999',
      { paymentMethod: 'CASH', amount: 1200, customerConfirmed: true },
      techSession
    );

    const handovers = await cashHandoversRepository.findPaginated({}, companyId);
    const handover = handovers.items[0];
    expect(handover.status).toBe('PENDING');

    // 2. Technician submits handover
    const submitResult = await cashHandoversService.submitHandover(
      handover.id,
      techActor,
      { notes: 'Submitted ₹1200 cash collected in morning shift' }
    );

    expect(submitResult.success).toBe(true);
    expect(submitResult.data.status).toBe('SUBMITTED');
    expect(submitResult.data.submittedAt).toBeDefined();
    expect(submitResult.data.notes).toContain('Submitted ₹1200 cash collected in morning shift');
    expect(submitResult.data.technicianId).toBe(technicianId);

    // 3. Verify technician summary updates
    const summary = await cashHandoversService.getTechnicianSummary(technicianId, companyId);
    expect(summary.cashCollected).toBe(1200);
    expect(summary.submittedForHandover).toBe(1200);
    expect(summary.pendingHandover).toBe(0);
    expect(summary.cashHandedOver).toBe(0);
    expect(summary.outstandingBalance).toBe(1200);
  });

  it('PHASE 05: Batch handover submission transitions all selected handovers to SUBMITTED', async () => {
    // Seed second job
    memoryServices.push({
      id: 'svc-cash-handover-888',
      serviceNumber: 'SRV-CASH-888',
      companyId,
      customerId: 'cust-cash-888',
      status: 'IN_PROGRESS',
      technicianId,
      assignedTechnicianId: technicianId,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
    memoryJobCards.push({
      id: 'jc-cash-handover-888',
      jobCardNumber: 'JC-CASH-888',
      serviceId: 'svc-cash-handover-888',
      technicianId,
      assignedTechnicianId: technicianId,
      status: 'IN_PROGRESS',
      companyId,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
    memoryInvoices.push({
      id: 'inv-cash-handover-888',
      invoiceNumber: 'INV-CASH-888',
      jobCardId: 'jc-cash-handover-888',
      serviceId: 'svc-cash-handover-888',
      companyId,
      customerId: 'cust-cash-888',
      totalAmount: '800.00',
      paidAmount: '0.00',
      outstandingAmount: '800.00',
      status: 'ISSUED',
      lineItems: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    // Record two cash payments
    await technicianPaymentService.recordPayment(
      'jc-cash-handover-999',
      { paymentMethod: 'CASH', amount: 1200, customerConfirmed: true },
      techSession
    );
    await technicianPaymentService.recordPayment(
      'jc-cash-handover-888',
      { paymentMethod: 'CASH', amount: 800, customerConfirmed: true },
      techSession
    );

    const handovers = await cashHandoversRepository.findPaginated({}, companyId);
    expect(handovers.items.length).toBe(2);

    const ids = handovers.items.map((h) => h.id);
    const batchResult = await cashHandoversService.submitBatchHandover(
      techActor,
      { handoverIds: ids, notes: 'End of day batch handover' }
    );

    expect(batchResult.success).toBe(true);
    expect(batchResult.items.length).toBe(2);
    expect(batchResult.items.every((h) => h.status === 'SUBMITTED')).toBe(true);

    const summary = await cashHandoversService.getTechnicianSummary(technicianId, companyId);
    expect(summary.cashCollected).toBe(2000);
    expect(summary.submittedForHandover).toBe(2000);
    expect(summary.pendingHandover).toBe(0);
    expect(summary.outstandingBalance).toBe(2000);
  });

  it('PHASE 05: Cross-technician submission denial (Technician A cannot submit Technician B collections)', async () => {
    const techBId = '22222222-2222-4222-8222-222222222222';
    const techBActor = {
      id: techBId,
      technicianId: techBId,
      displayName: 'Ramesh Sharma',
      role: 'Technician',
    };
    memoryTechnicians.push({
      id: techBId,
      fullName: 'Ramesh Sharma',
      phone: '9876543211',
      email: 'ramesh@example.com',
      status: 'ACTIVE',
      skills: ['AC Repair'],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Payment collected by Technician A (Pawan)
    await technicianPaymentService.recordPayment(
      'jc-cash-handover-999',
      { paymentMethod: 'CASH', amount: 1200, customerConfirmed: true },
      techSession
    );

    const handovers = await cashHandoversRepository.findPaginated({}, companyId);
    const handoverId = handovers.items[0].id;

    // Technician B attempts to submit Technician A\'s handover -> MUST throw 403 Forbidden
    await expect(
      cashHandoversService.submitHandover(handoverId, techBActor, { notes: 'Fraudulent submission' })
    ).rejects.toThrow(/Technicians can only submit handovers for their own cash collections/i);
  });

  it('PHASE 05: Cross-technician viewing denial (Technician cannot access another technician records)', async () => {
    const techBId = '22222222-2222-4222-8222-222222222222';
    const techBActor = {
      id: techBId,
      technicianId: techBId,
      displayName: 'Ramesh Sharma',
      role: 'Technician',
    };

    // Payment collected by Technician A
    await technicianPaymentService.recordPayment(
      'jc-cash-handover-999',
      { paymentMethod: 'CASH', amount: 1200, customerConfirmed: true },
      techSession
    );

    const handovers = await cashHandoversRepository.findPaginated({}, companyId);
    const handoverId = handovers.items[0].id;

    // Technician B queries handover by ID -> MUST throw 403 Forbidden
    await expect(
      cashHandoversService.getHandoverById(handoverId, techBActor)
    ).rejects.toThrow(/Technicians can only access their own cash handover records/);

    // Technician B lists handovers with technicianId of Technician A -> MUST throw 403 Forbidden
    await expect(
      cashHandoversService.getHandovers(
        { technicianId, page: 1, limit: 10 },
        companyId,
        techBActor
      )
    ).rejects.toThrow(/Technicians can only access their own cash handover records/);
  });

  it('PHASE 05: Admin confirms SUBMITTED handover to RECEIVED with full audit trail', async () => {
    // 1. Record cash collection
    await technicianPaymentService.recordPayment(
      'jc-cash-handover-999',
      { paymentMethod: 'CASH', amount: 1200, customerConfirmed: true },
      techSession
    );

    const handovers = await cashHandoversRepository.findPaginated({}, companyId);
    const handoverId = handovers.items[0].id;

    // 2. Submit handover
    await cashHandoversService.submitHandover(handoverId, techActor, { notes: 'Physical envelope handed over' });

    // 3. Admin confirms receipt
    const confirmResult = await cashHandoversService.markReceived(
      handoverId,
      adminUser,
      { notes: 'Counted and verified 1200 in counter register' }
    );

    expect(confirmResult.success).toBe(true);
    expect(confirmResult.data.status).toBe('RECEIVED');
    expect(confirmResult.data.receivedBy).toBe(adminUser.id);
    expect(confirmResult.data.receivedByName).toBe(adminUser.displayName);
    expect(confirmResult.data.handedOverAt).toBeDefined();

    // 4. Check summary
    const techSummary = await cashHandoversService.getTechnicianSummary(technicianId, companyId);
    expect(techSummary.cashCollected).toBe(1200);
    expect(techSummary.submittedForHandover).toBe(0);
    expect(techSummary.pendingHandover).toBe(0);
    expect(techSummary.cashHandedOver).toBe(1200);
    expect(techSummary.outstandingBalance).toBe(0);
  });

  it('PHASE 05: Self-confirmation denial (Admin cannot confirm cash collected by themselves as technician)', async () => {
    // Collect payment with technicianId
    await technicianPaymentService.recordPayment(
      'jc-cash-handover-999',
      { paymentMethod: 'CASH', amount: 1200, customerConfirmed: true },
      techSession
    );

    const handovers = await cashHandoversRepository.findPaginated({}, companyId);
    const handoverId = handovers.items[0].id;

    // Submit handover
    await cashHandoversService.submitHandover(handoverId, techActor);

    // Admin who has technicianId equal to the collecting technician tries to confirm receipt
    const selfAdmin = {
      id: 'admin-self-tech',
      companyId,
      role: 'ADMIN',
      displayName: 'Self Tech Admin',
      technicianId, // Same technicianId
    };

    await expect(
      cashHandoversService.markReceived(handoverId, selfAdmin, { notes: 'Attempting self-confirmation' })
    ).rejects.toThrow(/not permitted to confirm receipt of their own cash collections/i);
  });

  it('PHASE 05: Duplicate submission is strictly prevented for SUBMITTED and RECEIVED handovers', async () => {
    await technicianPaymentService.recordPayment(
      'jc-cash-handover-999',
      { paymentMethod: 'CASH', amount: 1200, customerConfirmed: true },
      techSession
    );

    const handovers = await cashHandoversRepository.findPaginated({}, companyId);
    const handoverId = handovers.items[0].id;

    // 1st submission -> Success
    await cashHandoversService.submitHandover(handoverId, techActor);

    // 2nd submission on SUBMITTED handover -> Rejects
    await expect(
      cashHandoversService.submitHandover(handoverId, techActor)
    ).rejects.toThrow(/already been submitted/i);

    // Mark as RECEIVED
    await cashHandoversService.markReceived(handoverId, adminUser);

    // Submission on RECEIVED handover -> Rejects
    await expect(
      cashHandoversService.submitHandover(handoverId, techActor)
    ).rejects.toThrow(/already been confirmed as received/i);
  });

  it('PHASE 05: Four pillars financial summary accurately calculates collected, submitted, pending, received, and outstanding', async () => {
    // Create 3 job cards and invoices
    const jobs = [
      { id: 'jc-cash-1', svc: 'svc-1', inv: 'inv-1', amount: 500 },
      { id: 'jc-cash-2', svc: 'svc-2', inv: 'inv-2', amount: 700 },
      { id: 'jc-cash-3', svc: 'svc-3', inv: 'inv-3', amount: 800 },
    ];

    for (const j of jobs) {
      memoryServices.push({
        id: j.svc,
        serviceNumber: `SRV-${j.id}`,
        companyId,
        customerId: 'cust-test',
        status: 'IN_PROGRESS',
        technicianId,
        assignedTechnicianId: technicianId,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      memoryJobCards.push({
        id: j.id,
        jobCardNumber: `JC-${j.id}`,
        serviceId: j.svc,
        technicianId,
        assignedTechnicianId: technicianId,
        status: 'IN_PROGRESS',
        companyId,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      memoryInvoices.push({
        id: j.inv,
        invoiceNumber: `INV-${j.id}`,
        jobCardId: j.id,
        serviceId: j.svc,
        companyId,
        customerId: 'cust-test',
        totalAmount: `${j.amount}.00`,
        paidAmount: '0.00',
        outstandingAmount: `${j.amount}.00`,
        status: 'ISSUED',
        lineItems: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      await technicianPaymentService.recordPayment(
        j.id,
        { paymentMethod: 'CASH', amount: j.amount, customerConfirmed: true },
        techSession
      );
    }

    const handovers = await cashHandoversRepository.findPaginated({}, companyId);
    expect(handovers.items.length).toBe(3);

    // Job 1 (500) remains PENDING in field
    // Job 2 (700) is SUBMITTED
    const handover2 = handovers.items.find((h) => h.amount === 700)!;
    await cashHandoversService.submitHandover(handover2.id, techActor);

    // Job 3 (800) is SUBMITTED then RECEIVED
    const handover3 = handovers.items.find((h) => h.amount === 800)!;
    await cashHandoversService.submitHandover(handover3.id, techActor);
    await cashHandoversService.markReceived(handover3.id, adminUser);

    // Verify Overall Summary
    const overallSummary = await cashHandoversService.getSummary(companyId);
    expect(overallSummary.totalCollected).toBe(2000);
    expect(overallSummary.totalPending).toBe(500);
    expect(overallSummary.totalSubmitted).toBe(700);
    expect(overallSummary.totalReceived).toBe(800);
    expect(overallSummary.outstandingBalance).toBe(1200);

    // Verify Technician Summary
    const techSummary = await cashHandoversService.getTechnicianSummary(technicianId, companyId);
    expect(techSummary.cashCollected).toBe(2000);
    expect(techSummary.pendingHandover).toBe(500);
    expect(techSummary.submittedForHandover).toBe(700);
    expect(techSummary.cashHandedOver).toBe(800);
    expect(techSummary.outstandingBalance).toBe(1200);
  });

  it('PHASE 05: Granular partial handovers across multiple collection records', async () => {
    // Technician has 2 jobs: ₹1500 and ₹500
    memoryServices.push({
      id: 'svc-part-1',
      serviceNumber: 'SRV-PART-1',
      companyId,
      customerId: 'cust-1',
      status: 'IN_PROGRESS',
      technicianId,
      assignedTechnicianId: technicianId,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
    memoryJobCards.push({
      id: 'jc-part-1',
      jobCardNumber: 'JC-PART-1',
      serviceId: 'svc-part-1',
      technicianId,
      assignedTechnicianId: technicianId,
      status: 'IN_PROGRESS',
      companyId,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
    memoryInvoices.push({
      id: 'inv-part-1',
      invoiceNumber: 'INV-PART-1',
      jobCardId: 'jc-part-1',
      serviceId: 'svc-part-1',
      companyId,
      customerId: 'cust-1',
      totalAmount: '1500.00',
      paidAmount: '0.00',
      outstandingAmount: '1500.00',
      status: 'ISSUED',
      lineItems: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    await technicianPaymentService.recordPayment(
      'jc-part-1',
      { paymentMethod: 'CASH', amount: 1500, customerConfirmed: true },
      techSession
    );

    // Second job ₹500
    await technicianPaymentService.recordPayment(
      'jc-cash-handover-999',
      { paymentMethod: 'CASH', amount: 500, customerConfirmed: true },
      techSession
    );

    const handovers = await cashHandoversRepository.findPaginated({}, companyId);
    const item1500 = handovers.items.find((h) => h.amount === 1500)!;

    // Technician hands over ONLY Job 1 (₹1500), keeping Job 2 (₹500) in hand
    await cashHandoversService.submitHandover(item1500.id, techActor, { notes: 'Partial day handover' });
    await cashHandoversService.markReceived(item1500.id, adminUser);

    const summary = await cashHandoversService.getTechnicianSummary(technicianId, companyId);
    expect(summary.cashCollected).toBe(2000);
    expect(summary.cashHandedOver).toBe(1500);
    expect(summary.pendingHandover).toBe(500);
    expect(summary.submittedForHandover).toBe(0);
    expect(summary.outstandingBalance).toBe(500);
  });

  it('PHASE 05: Production database write failures throw instead of falling back to memory', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      // Attempting to submit a handover with non-existent ID or failing DB in production
      await expect(
        cashHandoversRepository.submitHandover('non-existent-id-000', technicianId, 'Pawan', 'notes')
      ).rejects.toThrow();
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
