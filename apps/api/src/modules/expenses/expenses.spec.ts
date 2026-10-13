import { describe, it, expect, beforeEach } from 'vitest';
import { expensesService } from './expenses.service';
import { memoryExpenses, memoryExpenseSchedules } from './expenses.repository';
import { cashHandoversService } from '../payments/cash-handovers.service';
import { memoryCashHandovers } from '../payments/cash-handovers.repository';
import { memoryInvoices } from '../invoices/invoices.repository';
import { memoryPayments } from '../payments/payments.repository';
import { analyticsRepository } from '../analytics/analytics.repository';

describe('Expenses, Cash-in-Hand, Handover, and Financial Analytics Suite', () => {
  const companyId = 'comp-sr-001';

  const adminUser = {
    id: 'admin-owner-001',
    companyId,
    role: 'ADMIN',
    email: 'admin@srenterprises.com',
    displayName: 'Admin Owner',
  };

  const technicianUser = {
    id: 'tech-user-002',
    companyId,
    role: 'TECHNICIAN',
    email: 'pawan@srenterprises.com',
    displayName: 'Pawan Technician',
  };

  const otherCompanyAdmin = {
    id: 'admin-other-999',
    companyId: 'comp-other-999',
    role: 'ADMIN',
    email: 'other@competitor.com',
    displayName: 'Other Admin',
  };

  beforeEach(() => {
    // Clear all memory stores
    memoryExpenses.length = 0;
    memoryExpenseSchedules.length = 0;
    memoryCashHandovers.length = 0;
    memoryInvoices.length = 0;
    memoryPayments.length = 0;
  });

  describe('1. Expense Creation & Validation', () => {
    it('creates a valid company expense record with authenticated admin', async () => {
      const res = await expensesService.createExpense(
        {
          title: 'Petrol for service van',
          category: 'Petrol / Fuel',
          amount: 350,
          expenseDate: '2026-10-09',
          paymentMethod: 'Cash',
          notes: 'Van PB-08',
        },
        adminUser
      );

      const expense = res.data;
      expect(expense.id).toBeDefined();
      expect(expense.title).toBe('Petrol for service van');
      expect(expense.amount).toBe(350);
      expect(expense.category).toBe('Petrol / Fuel');
      expect(expense.paymentMethod).toBe('Cash');
      expect(expense.status).toBe('RECORDED');
      expect(expense.recordedBy).toBe(adminUser.id);
      expect(expense.companyId).toBe(companyId);
    });

    it('rejects creation when amount is zero or negative', async () => {
      await expect(
        expensesService.createExpense(
          {
            title: 'Invalid zero amount',
            category: 'Other',
            amount: 0,
            expenseDate: '2026-10-09',
            paymentMethod: 'Cash',
          },
          adminUser
        )
      ).rejects.toThrow(/(?:greater than zero|positive number)/i);

      await expect(
        expensesService.createExpense(
          {
            title: 'Invalid negative amount',
            category: 'Other',
            amount: -500,
            expenseDate: '2026-10-09',
            paymentMethod: 'Cash',
          },
          adminUser
        )
      ).rejects.toThrow(/(?:greater than zero|positive number)/i);
    });

    it('rejects creation when required fields are missing', async () => {
      await expect(
        expensesService.createExpense(
          {
            title: '',
            category: 'Shop Rent',
            amount: 15000,
            expenseDate: '2026-10-09',
            paymentMethod: 'Bank Transfer',
          },
          adminUser
        )
      ).rejects.toThrow(/title is required/i);

      await expect(
        expensesService.createExpense(
          {
            title: 'Shop Rent',
            category: '',
            amount: 15000,
            expenseDate: '2026-10-09',
            paymentMethod: 'Bank Transfer',
          },
          adminUser
        )
      ).rejects.toThrow(/category is required/i);
    });

    it('forbids technicians from creating company expenses', async () => {
      await expect(
        expensesService.createExpense(
          {
            title: 'Technician Expense Attempt',
            category: 'Petrol / Fuel',
            amount: 200,
            expenseDate: '2026-10-09',
            paymentMethod: 'Cash',
          },
          technicianUser
        )
      ).rejects.toThrow(/technicians are not authorized/i);
    });
  });

  describe('2. Expense History & Audited Modification', () => {
    it('filters expenses by category, payment method, and status', async () => {
      await expensesService.createExpense(
        {
          title: 'Petrol 1',
          category: 'Petrol / Fuel',
          amount: 300,
          expenseDate: '2026-10-01',
          paymentMethod: 'Cash',
        },
        adminUser
      );
      await expensesService.createExpense(
        {
          title: 'Electricity',
          category: 'Electricity Bill',
          amount: 2200,
          expenseDate: '2026-10-05',
          paymentMethod: 'UPI',
        },
        adminUser
      );
      await expensesService.createExpense(
        {
          title: 'Petrol 2',
          category: 'Petrol / Fuel',
          amount: 400,
          expenseDate: '2026-10-08',
          paymentMethod: 'Cash',
        },
        adminUser
      );

      const fuelResults = await expensesService.getExpenses(
        { category: 'Petrol / Fuel' },
        companyId
      );
      expect(fuelResults.items).toHaveLength(2);
      expect(fuelResults.items.every((i) => i.category === 'Petrol / Fuel')).toBe(true);

      const upiResults = await expensesService.getExpenses(
        { paymentMethod: 'UPI' },
        companyId
      );
      expect(upiResults.items).toHaveLength(1);
      expect(upiResults.items[0].title).toBe('Electricity');
    });

    it('allows audited updates with change note preservation', async () => {
      const createdRes = await expensesService.createExpense(
        {
          title: 'Initial Title',
          category: 'Maintenance',
          amount: 1000,
          expenseDate: '2026-10-05',
          paymentMethod: 'Cash',
          notes: 'Initial note',
        },
        adminUser
      );

      const updateRes = await expensesService.updateExpense(
        createdRes.data.id,
        {
          amount: 1250,
          notes: 'Updated bill amount as per vendor receipt',
        },
        adminUser
      );

      expect(updateRes.data.amount).toBe(1250);
      expect(updateRes.data.notes).toContain('Updated bill amount');
      expect(updateRes.data.status).toBe('RECORDED');
    });

    it('performs audited soft-delete void without permanent data destruction', async () => {
      const createdRes = await expensesService.createExpense(
        {
          title: 'Erroneous Expense',
          category: 'Office Supplies',
          amount: 800,
          expenseDate: '2026-10-06',
          paymentMethod: 'Cash',
        },
        adminUser
      );

      const voidRes = await expensesService.voidExpense(
        createdRes.data.id,
        {
          reason: 'Duplicate entry entered accidentally by accounts clerk',
        },
        adminUser
      );

      expect(voidRes.data.status).toBe('VOIDED');
      expect(voidRes.data.voidReason).toBe('Duplicate entry entered accidentally by accounts clerk');
      expect(voidRes.data.voidedBy).toBe(adminUser.id);
      expect(voidRes.data.voidedAt).toBeDefined();

      // Check active query excludes voided item
      const activeList = await expensesService.getExpenses({ status: 'RECORDED' }, companyId);
      expect(activeList.items).toHaveLength(0);

      // Check all query includes voided item
      const allList = await expensesService.getExpenses({ status: 'ALL' }, companyId);
      expect(allList.items).toHaveLength(1);
      expect(allList.items[0].status).toBe('VOIDED');
    });
  });

  describe('3. Recurring Expense Schedules & Idempotency', () => {
    it('creates a recurring schedule and generates idempotent occurrences', async () => {
      const scheduleRes = await expensesService.createSchedule(
        {
          title: 'Shop Internet Connection',
          category: 'Internet / Phone',
          amount: 999,
          frequency: 'MONTHLY',
          startDate: '2026-10-01',
          paymentMethod: 'UPI',
          notes: 'Airtel Broadband Fiber',
        },
        adminUser
      );

      const schedule = scheduleRes.data;
      expect(schedule.id).toBeDefined();
      expect(schedule.frequency).toBe('MONTHLY');
      expect(schedule.isActive).toBe(true);

      // First occurrence record
      const occurrence1Res = await expensesService.recordOccurrence(
        schedule.id,
        '2026-10',
        '2026-10-01',
        adminUser
      );
      const occurrence1 = occurrence1Res.data;
      expect(occurrence1.title).toBe('Shop Internet Connection (2026-10)');
      expect(occurrence1.amount).toBe(999);
      expect(occurrence1.recurringScheduleId).toBe(schedule.id);
      expect(occurrence1.occurrencePeriod).toBe('2026-10');

      // Attempt duplicate occurrence for same period: must be idempotent and not create duplicate
      const occurrence2Res = await expensesService.recordOccurrence(
        schedule.id,
        '2026-10',
        '2026-10-05',
        adminUser
      );
      expect(occurrence2Res.data.id).toBe(occurrence1.id);

      const allExpenses = await expensesService.getExpenses({}, companyId);
      expect(allExpenses.items).toHaveLength(1);
    });

    it('ensures unpaid scheduled expenses are not marked paid automatically', async () => {
      const scheduleRes = await expensesService.createSchedule(
        {
          title: 'Annual Shop Insurance',
          category: 'Other',
          amount: 25000,
          frequency: 'YEARLY',
          startDate: '2026-10-01',
          paymentMethod: 'Bank Transfer',
        },
        adminUser
      );

      expect(scheduleRes.data.id).toBeDefined();

      // No occurrence has been recorded yet
      const allExpenses = await expensesService.getExpenses({}, companyId);
      expect(allExpenses.items).toHaveLength(0);

      // Schedule is due but not yet treated as a paid cash outflow
      const overview = await expensesService.getOverview(companyId);
      expect(overview.expensesThisMonth).toBe(0);
      expect(overview.activeSchedulesCount).toBe(1);
    });
  });

  describe('4. Technician Cash Collection & Handover Confirmation', () => {
    it('associates field cash payments with pending handover and updates upon confirmation', async () => {
      const techId = 'tech-pawan-001';

      // 1. Customer pays ₹1,000 cash to Technician Pawan
      memoryCashHandovers.push({
        id: '11111111-2222-4333-8444-555555555555',
        companyId,
        paymentId: 'pay-001',
        serviceId: 'srv-001',
        technicianId: techId,
        technicianName: 'Pawan Kumar',
        serviceNumber: 'SRV-2026-001',
        customerName: 'Rohit Sharma',
        amount: 1000,
        collectedAt: new Date('2026-10-09T09:00:00Z'),
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Check summary
      const summaryBefore = await cashHandoversService.getSummary(companyId);
      expect(summaryBefore.totalCollected).toBe(1000);
      expect(summaryBefore.totalPending).toBe(1000);
      expect(summaryBefore.totalReceived).toBe(0);

      // 2. Admin confirms receipt of ₹1,000
      const res = await cashHandoversService.markReceived(
        '11111111-2222-4333-8444-555555555555',
        adminUser,
        { notes: 'Received cash in shop counter' }
      );

      const received = res.data;
      expect(received.status).toBe('RECEIVED');
      expect(received.receivedBy).toBe(adminUser.id);
      expect(received.handedOverAt).toBeDefined();

      // Check summary after confirmation
      const summaryAfter = await cashHandoversService.getSummary(companyId);
      expect(summaryAfter.totalCollected).toBe(1000);
      expect(summaryAfter.totalPending).toBe(0);
      expect(summaryAfter.totalReceived).toBe(1000);
    });

    it('supports batch handover confirmation across multiple collections', async () => {
      const techId = 'tech-rahul-002';
      const id1 = '22222222-1111-4111-8111-111111111111';
      const id2 = '33333333-1111-4111-8111-111111111111';

      memoryCashHandovers.push(
        {
          id: id1,
          companyId,
          paymentId: 'pay-002',
          technicianId: techId,
          technicianName: 'Rahul Verma',
          amount: 500,
          collectedAt: new Date(),
          status: 'PENDING',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: id2,
          companyId,
          paymentId: 'pay-003',
          technicianId: techId,
          technicianName: 'Rahul Verma',
          amount: 1200,
          collectedAt: new Date(),
          status: 'PENDING',
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      );

      const batchResult = await cashHandoversService.markBatchReceived(adminUser, {
        handoverIds: [id1, id2],
        notes: 'Batch handover for day end',
      });

      expect(batchResult.confirmedCount).toBe(2);
      expect(batchResult.totalAmount).toBe(1700);

      const summary = await cashHandoversService.getSummary(companyId);
      expect(summary.totalPending).toBe(0);
      expect(summary.totalReceived).toBe(1700);
    });

    it('rejects confirmation attempt from unauthorized technician', async () => {
      const id = '44444444-1111-4111-8111-111111111111';
      memoryCashHandovers.push({
        id,
        companyId,
        paymentId: 'pay-004',
        technicianId: technicianUser.id,
        technicianName: 'Pawan',
        amount: 600,
        collectedAt: new Date(),
        status: 'PENDING',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        cashHandoversService.markReceived(id, technicianUser, {})
      ).rejects.toThrow(/technicians are not authorized/i);
    });

    it('verifies technician views only own cash records', async () => {
      memoryCashHandovers.push(
        {
          id: 'handover-own',
          companyId,
          paymentId: 'pay-own',
          technicianId: technicianUser.id,
          technicianName: 'Pawan',
          amount: 750,
          collectedAt: new Date(),
          status: 'PENDING',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'handover-other',
          companyId,
          paymentId: 'pay-other',
          technicianId: 'other-tech-id',
          technicianName: 'Other Tech',
          amount: 1500,
          collectedAt: new Date(),
          status: 'PENDING',
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      );

      const techSummary = await cashHandoversService.getTechnicianSummary(technicianUser.id, companyId);
      expect(techSummary.cashCollected).toBe(750);
      expect(techSummary.pendingHandover).toBe(750);
      expect(techSummary.cashHandedOver).toBe(0);
    });

    it('enforces multi-tenant company isolation on expenses and handovers', async () => {
      await expensesService.createExpense(
        {
          title: 'Company 1 Expense',
          category: 'Shop Rent',
          amount: 5000,
          expenseDate: '2026-10-09',
          paymentMethod: 'Bank Transfer',
        },
        adminUser
      );

      await expensesService.createExpense(
        {
          title: 'Other Company Expense',
          category: 'Shop Rent',
          amount: 9000,
          expenseDate: '2026-10-09',
          paymentMethod: 'Bank Transfer',
        },
        otherCompanyAdmin
      );

      const comp1Expenses = await expensesService.getExpenses({}, companyId);
      expect(comp1Expenses.items).toHaveLength(1);
      expect(comp1Expenses.items[0].title).toBe('Company 1 Expense');

      const otherExpenses = await expensesService.getExpenses({}, otherCompanyAdmin.companyId);
      expect(otherExpenses.items).toHaveLength(1);
      expect(otherExpenses.items[0].title).toBe('Other Company Expense');
    });
  });

  describe('5. Acceptance Test Scenario (Section 21)', () => {
    it('executes the full Section 21 end-to-end acceptance test', async () => {
      const techA = 'tech-a-id';

      // 1. Customer pays ₹1,000 cash to Technician A
      const handoverId = '55555555-5555-4555-8555-555555555555';
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      // Field cash payment in cash handover repository
      memoryCashHandovers.push({
        id: handoverId,
        companyId,
        paymentId: 'payment-cust-1000',
        technicianId: techA,
        technicianName: 'Technician A',
        amount: 1000,
        collectedAt: today,
        status: 'PENDING',
        createdAt: today,
        updatedAt: today,
      });

      // Customer payment transaction in payments repository
      memoryPayments.push({
        id: 'payment-cust-1000',
        companyId,
        invoiceId: 'inv-1000',
        amount: 1000,
        paymentMethod: 'Cash',
        status: 'COMPLETED',
        createdAt: today,
        updatedAt: today,
      });

      // Verify Step 1 Expected Metrics:
      // - Customer payment = ₹1,000
      // - Technician A cash collected = ₹1,000
      // - Pending technician cash = ₹1,000
      // - Owner cash received = ₹0
      let overview = await expensesService.getOverview(companyId);
      expect(overview.pendingTechnicianCash).toBe(1000);
      expect(overview.cashReceivedByOwner).toBe(0);

      // 2. Owner confirms receiving ₹1,000 cash
      await cashHandoversService.markReceived(handoverId, adminUser, {
        notes: 'Received in full from Technician A',
      });

      // Verify Step 2 Expected Metrics:
      // - Customer payment remains ₹1,000
      // - Technician A cash collected remains ₹1,000
      // - Pending technician cash becomes ₹0
      // - Owner cash received increases by ₹1,000
      // - No extra revenue is created
      overview = await expensesService.getOverview(companyId);
      expect(overview.pendingTechnicianCash).toBe(0);
      expect(overview.cashReceivedByOwner).toBe(1000);

      // 3. Admin records:
      // - Petrol paid in cash: ₹300
      // - Shop electricity paid via UPI: ₹2,000
      // - Monthly rent paid by bank transfer: ₹15,000
      await expensesService.createExpense(
        {
          title: 'Petrol for service van',
          category: 'Petrol / Fuel',
          amount: 300,
          expenseDate: todayStr,
          paymentMethod: 'Cash',
        },
        adminUser
      );

      await expensesService.createExpense(
        {
          title: 'Shop Electricity Bill',
          category: 'Electricity Bill',
          amount: 2000,
          expenseDate: todayStr,
          paymentMethod: 'UPI',
        },
        adminUser
      );

      await expensesService.createExpense(
        {
          title: 'Shop Monthly Rent',
          category: 'Shop Rent',
          amount: 15000,
          expenseDate: todayStr,
          paymentMethod: 'Bank Transfer',
        },
        adminUser
      );

      // Verify Step 3 Expected Metrics:
      // - Total recorded expenses = ₹17,300 (300 + 2000 + 15000)
      // - Physical shop cash decreases by ₹300 only
      // - UPI and bank expenses do NOT reduce physical cash
      // - Recorded shop cash movement balance = ₹1,000 received − ₹300 cash expense = ₹700
      overview = await expensesService.getOverview(companyId);
      expect(overview.expensesToday).toBe(17300);
      expect(overview.cashExpensesTotal).toBe(300);
      expect(overview.nonCashExpensesTotal).toBe(17000);
      expect(overview.shopCashMovementBalance).toBe(700);

      // 4. Financial Analytics Report Check (Section 13 & 14)
      const reportBounds = {
        startDate: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0),
        endDate: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999),
      };
      const finReport = await analyticsRepository.getFinancialSummary(reportBounds, companyId);

      expect(finReport.totalCustomerPaymentsReceived).toBe(1000);
      expect(finReport.totalExpenses).toBe(17300);
      expect(finReport.cashCollectedByTechnicians).toBe(1000);
      expect(finReport.cashHandedOverToOwner).toBe(1000);
      expect(finReport.pendingTechnicianCash).toBe(0);
      expect(finReport.shopCashMovementBalance).toBe(700);
    });
  });
});
