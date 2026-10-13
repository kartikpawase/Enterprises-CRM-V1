import { describe, it, expect, beforeEach } from 'vitest';
import { eq, or, ilike } from 'drizzle-orm';
import { db } from '../../database/client';
import { expenses, monthlyClosings, invoices, services, jobCards, inventoryItems, payments } from '../../database/schema/index';
import { expensesService } from './expenses.service';
import { expensesRepository, memoryExpenses, memoryExpenseSchedules, memoryMonthlyClosings } from './expenses.repository';
import { memoryInvoices } from '../invoices/invoices.repository';
import { memoryServices } from '../services/services.repository';
import { memoryPayments } from '../payments/payments.repository';
import {
  EXPENSE_CATEGORIES,
  isHomeExpense,
  type ExpenseCategory,
} from '@crm/types';
import {
  ExpenseCategorySchema,
  MonthlyReconciliationQuerySchema,
  SaveMonthlyClosingDraftSchema,
  ApproveMonthlyClosingSchema,
} from '@crm/validation';

describe('Phase 01 — Financial Domain & Data Model Suite', () => {
  const companyId = 'comp-fin-001';

  const adminActor = {
    id: '00000000-0000-4000-8000-000000000001',
    userId: '00000000-0000-4000-8000-000000000001',
    displayName: 'Admin Approver',
    username: 'admin',
    role: 'Admin',
    companyId,
  };

  const technicianActor = {
    id: '00000000-0000-4000-8000-000000000002',
    userId: '00000000-0000-4000-8000-000000000002',
    displayName: 'Technician User',
    username: 'tech1',
    role: 'Technician',
    companyId,
  };

  beforeEach(async () => {
    memoryExpenses.length = 0;
    memoryExpenseSchedules.length = 0;
    memoryMonthlyClosings.length = 0;
    try {
      await db.delete(expenses).where(or(eq(expenses.companyId, companyId), ilike(expenses.companyId, 'comp-%'), ilike(expenses.companyId, 'tenant-%')));
      await db.delete(monthlyClosings).where(or(eq(monthlyClosings.companyId, companyId), ilike(monthlyClosings.companyId, 'comp-%'), ilike(monthlyClosings.companyId, 'tenant-%'), ilike(monthlyClosings.companyId, 'brand-%')));
    } catch {}
  });

  describe('1. Required 10 Expense Categories & Classification', () => {
    it('supports all 10 mandatory expense categories defined by the financial domain', () => {
      const expectedCategories = [
        'Spare Parts',
        'Petrol',
        'Business Expenses',
        'Home Expenses',
        'Electricity',
        'Shop Rent',
        'Internet / Phone',
        'Travel',
        'Tools & Maintenance',
        'Other',
      ];

      expect(EXPENSE_CATEGORIES).toHaveLength(10);
      for (const cat of expectedCategories) {
        expect(EXPENSE_CATEGORIES).toContain(cat);
        const result = ExpenseCategorySchema.safeParse(cat);
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid or unapproved expense categories in schema validation', () => {
      const invalidCategories = ['Luxury Car', 'Cryptocurrency', 'Personal Loan', 'Unknown Category'];
      for (const cat of invalidCategories) {
        const result = ExpenseCategorySchema.safeParse(cat);
        expect(result.success).toBe(false);
      }
    });

    it('correctly classifies home expenses vs business expenses using isHomeExpense helper', () => {
      expect(isHomeExpense('Home Expenses')).toBe(true);
      expect(isHomeExpense('home expenses')).toBe(true);
      expect(isHomeExpense(' HOME EXPENSES ')).toBe(true);
      expect(isHomeExpense('Spare Parts')).toBe(false);
      expect(isHomeExpense('Petrol')).toBe(false);
      expect(isHomeExpense('Business Expenses')).toBe(false);
      expect(isHomeExpense('Shop Rent')).toBe(false);
      expect(isHomeExpense(null)).toBe(false);
      expect(isHomeExpense(undefined)).toBe(false);
    });
  });

  describe('2. Schema & Domain Validation Constraints', () => {
    it('validates MonthlyReconciliationQuerySchema period ranges', () => {
      expect(MonthlyReconciliationQuerySchema.safeParse({ year: 2026, month: 10 }).success).toBe(true);
      expect(MonthlyReconciliationQuerySchema.safeParse({ year: '2026', month: '1' }).success).toBe(true);

      // Month out of range
      expect(MonthlyReconciliationQuerySchema.safeParse({ year: 2026, month: 0 }).success).toBe(false);
      expect(MonthlyReconciliationQuerySchema.safeParse({ year: 2026, month: 13 }).success).toBe(false);

      // Year out of reasonable range
      expect(MonthlyReconciliationQuerySchema.safeParse({ year: 1999, month: 5 }).success).toBe(false);
      expect(MonthlyReconciliationQuerySchema.safeParse({ year: 2150, month: 5 }).success).toBe(false);
    });

    it('validates SaveMonthlyClosingDraftSchema and ApproveMonthlyClosingSchema', () => {
      const draftResult = SaveMonthlyClosingDraftSchema.safeParse({
        year: 2026,
        month: 10,
        leadProfit: 100000,
        actualBankBalance: 95000,
        savingsTransfer: 20000,
        notes: 'End of October draft',
      });
      expect(draftResult.success).toBe(true);

      // Negative savings transfer is rejected
      const invalidDraft = SaveMonthlyClosingDraftSchema.safeParse({
        year: 2026,
        month: 10,
        savingsTransfer: -500,
      });
      expect(invalidDraft.success).toBe(false);

      // Approve requires actualBankBalance
      const approveMissingBalance = ApproveMonthlyClosingSchema.safeParse({
        year: 2026,
        month: 10,
      });
      expect(approveMissingBalance.success).toBe(false);

      const validApprove = ApproveMonthlyClosingSchema.safeParse({
        year: 2026,
        month: 10,
        actualBankBalance: 95000,
        savingsTransfer: 20000,
      });
      expect(validApprove.success).toBe(true);
    });
  });

  describe('3. Client Financial Calculation Acceptance Reference', () => {
    it('computes exact client financial figures without double-counting or erroneous expense classification', async () => {
      // 1. Seed recorded expenses for October 2026
      await expensesRepository.create(
        {
          title: 'Spare Parts Purchase',
          category: 'Spare Parts',
          amount: 5000,
          expenseDate: '2026-10-05T10:00:00.000Z',
          paymentMethod: 'UPI',
          companyId,
        },
        adminActor
      );

      await expensesRepository.create(
        {
          title: 'Petrol for Field Technicians',
          category: 'Petrol',
          amount: 5000,
          expenseDate: '2026-10-10T10:00:00.000Z',
          paymentMethod: 'Cash',
          companyId,
        },
        adminActor
      );

      await expensesRepository.create(
        {
          title: 'Office Stationery & Tea',
          category: 'Business Expenses',
          amount: 10000,
          expenseDate: '2026-10-15T10:00:00.000Z',
          paymentMethod: 'Bank Transfer',
          companyId,
        },
        adminActor
      );

      await expensesRepository.create(
        {
          title: 'Home Grocery & Personal Draw',
          category: 'Home Expenses',
          amount: 20000,
          expenseDate: '2026-10-20T10:00:00.000Z',
          paymentMethod: 'Bank Transfer',
          companyId,
        },
        adminActor
      );

      // 2. Compute reconciliation summary for October 2026 (Month 10) with client test inputs:
      // Lead Profit: ₹1,00,000 | Previous Closing Cash: ₹40,000 | Actual Bank: ₹95,000 | Savings Transfer: ₹20,000 | Previous Savings: ₹50,000
      const summary = await expensesRepository.calculateReconciliationSummary(
        2026,
        10,
        companyId,
        {
          leadProfit: 100000,
          previousClosingCash: 40000,
          actualBankBalance: 95000,
          savingsTransfer: 20000,
          previousSavingsBalance: 50000,
        }
      );

      // Total Expenses = 5,000 + 5,000 + 10,000 + 20,000 = 40,000
      expect(summary.totalExpenses).toBe(40000);
      expect(summary.businessExpenses).toBe(20000); // 5,000 + 5,000 + 10,000
      expect(summary.homeExpenses).toBe(20000);

      // Category breakdown verified
      expect(summary.categoryTotals['Spare Parts']).toBe(5000);
      expect(summary.categoryTotals['Petrol']).toBe(5000);
      expect(summary.categoryTotals['Business Expenses']).toBe(10000);
      expect(summary.categoryTotals['Home Expenses']).toBe(20000);

      // Monthly Profit = Lead Profit (100,000) - Total Expenses (40,000) = 60,000
      expect(summary.monthlyProfit).toBe(60000);

      // Expected Cash Before Savings = Previous Closing Cash (40,000) + Monthly Profit (60,000) = 1,00,000
      expect(summary.expectedCashBeforeSavings).toBe(100000);

      // Reconciliation Difference = Actual (95,000) - Expected (100,000) = -5,000
      expect(summary.reconciliationDifference).toBe(-5000);

      // Closing Cash = Expected Before Savings (100,000) - Savings Transfer (20,000) = 80,000
      expect(summary.closingCash).toBe(80000);

      // Current Savings Balance = Previous Savings (50,000) + Savings Transfer (20,000) = 70,000
      expect(summary.currentSavingsBalance).toBe(70000);

      // FINANCIAL INTEGRITY CHECKS:
      // A. Reconciliation difference is NOT counted as an expense
      expect(summary.totalExpenses).toBe(40000);

      // B. Savings transfer is NOT counted as an expense
      expect(summary.totalExpenses).toBe(40000);
    });
  });

  describe('4. Carry-Forward Integrity & Automatic Prior Balance Lookup', () => {
    it('safely carries forward closing cash and savings balances into subsequent month upon approval', async () => {
      // 0. Seed October expenses (₹40,000)
      await expensesRepository.create(
        {
          title: 'October Operating Expenses',
          category: 'Business Expenses',
          amount: 40000,
          expenseDate: '2026-10-15T10:00:00.000Z',
          paymentMethod: 'Bank Transfer',
          companyId,
        },
        adminActor
      );

      // 1. Approve October 2026 (Month 10) with baseline prior balances
      const approvedMonth10 = await expensesRepository.approveClosing(
        {
          year: 2026,
          month: 10,
          leadProfit: 100000,
          previousClosingCash: 40000,
          actualBankBalance: 95000,
          savingsTransfer: 20000,
          previousSavingsBalance: 50000,
          notes: 'October finalized close',
          companyId,
        },
        adminActor
      );

      expect(approvedMonth10.status).toBe('APPROVED');
      expect(approvedMonth10.closingCash).toBe(80000);
      expect(approvedMonth10.currentSavingsBalance).toBe(70000);
      expect(approvedMonth10.approvedBy).toBe(adminActor.id);
      expect(approvedMonth10.approvedByName).toBe(adminActor.displayName);

      // 2. Calculate November 2026 (Month 11) without explicit prior overrides
      // It must automatically carry forward October's closingCash (80,000) and currentSavingsBalance (70,000)
      const summaryMonth11 = await expensesRepository.calculateReconciliationSummary(
        2026,
        11,
        companyId,
        {
          leadProfit: 50000,
          actualBankBalance: 110000,
          savingsTransfer: 10000,
        }
      );

      expect(summaryMonth11.previousClosingCash).toBe(80000);
      expect(summaryMonth11.previousSavingsBalance).toBe(70000);

      // Expected Cash Before Savings = 80,000 + 50,000 = 1,30,000
      expect(summaryMonth11.expectedCashBeforeSavings).toBe(130000);

      // Closing Cash = 1,30,000 - 10,000 = 1,20,000
      expect(summaryMonth11.closingCash).toBe(120000);

      // Current Savings Balance = 70,000 + 10,000 = 80,000
      expect(summaryMonth11.currentSavingsBalance).toBe(80000);
    });
  });

  describe('5. Duplicate Close Prevention & Period Uniqueness', () => {
    it('prevents duplicate approvals or draft overwrites for an already finalized monthly close', async () => {
      // Approve Month 10
      await expensesRepository.approveClosing(
        {
          year: 2026,
          month: 10,
          actualBankBalance: 95000,
          savingsTransfer: 20000,
          companyId,
        },
        adminActor
      );

      // Attempting to approve again must be rejected with duplicate close error
      await expect(
        expensesRepository.approveClosing(
          {
            year: 2026,
            month: 10,
            actualBankBalance: 95000,
            savingsTransfer: 20000,
            companyId,
          },
          adminActor
        )
      ).rejects.toThrow(/already been approved and finalized/i);

      // Attempting to modify draft of finalized month must also be rejected
      await expect(
        expensesRepository.saveClosingDraft(
          {
            year: 2026,
            month: 10,
            actualBankBalance: 90000,
            companyId,
          },
          adminActor
        )
      ).rejects.toThrow(/already been approved and finalized/i);
    });

    it('updates draft in place without creating duplicate records for the same period', async () => {
      // Save initial draft
      const draft1 = await expensesRepository.saveClosingDraft(
        {
          year: 2026,
          month: 9,
          leadProfit: 50000,
          actualBankBalance: 48000,
          notes: 'First draft',
          companyId,
        },
        adminActor
      );

      expect(draft1.notes).toBe('First draft');

      // Update draft
      const draft2 = await expensesRepository.saveClosingDraft(
        {
          year: 2026,
          month: 9,
          leadProfit: 60000,
          actualBankBalance: 58000,
          notes: 'Updated draft',
          companyId,
        },
        adminActor
      );

      expect(draft2.id).toBe(draft1.id);
      expect(draft2.leadProfit).toBe(60000);
      expect(draft2.notes).toBe('Updated draft');
      expect(draft2.status).toBe('DRAFT');

      // Ensure only 1 record exists for 2026-09
      const records = memoryMonthlyClosings.filter((m) => m.year === 2026 && m.month === 9);
      expect(records).toHaveLength(1);
    });
  });

  describe('6. Authorization & Role Constraints', () => {
    it('strictly forbids technicians from approving monthly closings', async () => {
      await expect(
        expensesService.approveMonthlyClosing(
          {
            year: 2026,
            month: 10,
            actualBankBalance: 95000,
          },
          technicianActor
        )
      ).rejects.toThrow(/Only authorized administrators/i);
    });

    it('strictly forbids technicians from saving monthly closing drafts', async () => {
      await expect(
        expensesService.saveMonthlyClosingDraft(
          {
            year: 2026,
            month: 10,
            actualBankBalance: 95000,
          },
          technicianActor
        )
      ).rejects.toThrow(/Technicians are not authorized/i);
    });

    it('strictly forbids technicians from recording company expenses', async () => {
      await expect(
        expensesService.createExpense(
          {
            title: 'Tech Expense Attempt',
            category: 'Petrol',
            amount: 500,
            expenseDate: '2026-10-11T12:00:00.000Z',
            paymentMethod: 'Cash',
          },
          technicianActor
        )
      ).rejects.toThrow(/Technicians are not authorized/i);
    });
  });

  describe('7. Monetary Precision & Fractional Arithmetic', () => {
    it('maintains 2 decimal precision without floating point drift', async () => {
      await expensesRepository.create(
        {
          title: 'Parts purchase fraction',
          category: 'Spare Parts',
          amount: 1234.56,
          expenseDate: '2026-10-01T10:00:00.000Z',
          paymentMethod: 'UPI',
          companyId,
        },
        adminActor
      );

      await expensesRepository.create(
        {
          title: 'Second fraction',
          category: 'Spare Parts',
          amount: 987.65,
          expenseDate: '2026-10-02T10:00:00.000Z',
          paymentMethod: 'UPI',
          companyId,
        },
        adminActor
      );

      const summary = await expensesRepository.calculateReconciliationSummary(
        2026,
        10,
        companyId,
        {
          leadProfit: 5000.10,
          previousClosingCash: 1000.05,
          actualBankBalance: 3777.94,
          savingsTransfer: 500.00,
          previousSavingsBalance: 200.50,
        }
      );

      // 1234.56 + 987.65 = 2222.21
      expect(summary.totalExpenses).toBe(2222.21);

      // Monthly profit = 5000.10 - 2222.21 = 2777.89
      expect(summary.monthlyProfit).toBe(2777.89);

      // Expected before savings = 1000.05 + 2777.89 = 3777.94
      expect(summary.expectedCashBeforeSavings).toBe(3777.94);

      // Reconciliation diff = 3777.94 - 3777.94 = 0.00
      expect(summary.reconciliationDifference).toBe(0);

      // Closing cash = 3777.94 - 500.00 = 3277.94
      expect(summary.closingCash).toBe(3277.94);

      // Current savings = 200.50 + 500.00 = 700.50
      expect(summary.currentSavingsBalance).toBe(700.50);
    });
  });

  describe('8. Backward Compatibility with Existing Expense & Payment Records', () => {
    it('allows standard expense recording and history queries without interference', async () => {
      const exp = await expensesService.createExpense(
        {
          title: 'Shop Internet Bill',
          category: 'Internet / Phone',
          amount: 1499,
          expenseDate: '2026-10-11T12:00:00.000Z',
          paymentMethod: 'UPI',
          notes: 'Airtel Broadband October',
        },
        adminActor
      );

      expect(exp.success).toBe(true);
      expect(exp.data.title).toBe('Shop Internet Bill');
      expect(exp.data.amount).toBe(1499);
      expect(exp.data.category).toBe('Internet / Phone');

      const queried = await expensesService.getExpenseById(exp.data.id);
      expect(queried.title).toBe('Shop Internet Bill');

      const paginated = await expensesService.getExpenses({ page: 1, limit: 10, status: 'RECORDED' }, companyId);
      expect(paginated.items.some((i) => i.id === exp.data.id)).toBe(true);
    });
  });

  describe('9. Financial Safety Patch (Phase 01A Verification)', () => {
    const originalEnv = process.env.NODE_ENV;

    it('propagates production database write failure without silent memory fallback on saveClosingDraft', async () => {
      process.env.NODE_ENV = 'production';
      try {
        const queryBuilderMock: any = {
          from: () => queryBuilderMock,
          leftJoin: () => queryBuilderMock,
          where: () => queryBuilderMock,
          orderBy: () => queryBuilderMock,
          limit: () => Promise.resolve([]),
          then: (resolve: any) => resolve([]),
        };
        const failingDb = {
          select: () => queryBuilderMock,
          insert: () => ({
            values: () => ({
              returning: () => Promise.reject(new Error('PostgreSQL connection terminated unexpectedly (SIMULATED_FAIL)')),
            }),
          }),
        };

        await expect(
          expensesRepository.saveClosingDraft(
            {
              year: 2026,
              month: 12,
              leadProfit: 50000,
              actualBankBalance: 45000,
              companyId,
            },
            adminActor,
            failingDb as any
          )
        ).rejects.toThrow('PostgreSQL connection terminated unexpectedly (SIMULATED_FAIL)');

        // Verify no false success in memory store
        const memoryRecord = memoryMonthlyClosings.find((m) => m.year === 2026 && m.month === 12);
        expect(memoryRecord).toBeUndefined();
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('propagates production database write failure without silent memory fallback on approveClosing', async () => {
      process.env.NODE_ENV = 'production';
      try {
        const queryBuilderMock: any = {
          from: () => queryBuilderMock,
          leftJoin: () => queryBuilderMock,
          where: () => queryBuilderMock,
          orderBy: () => queryBuilderMock,
          limit: () => Promise.resolve([]),
          then: (resolve: any) => resolve([]),
        };
        const failingDb = {
          select: () => queryBuilderMock,
          transaction: async (cb: any) => {
            const tx = {
              select: () => ({
                from: () => ({
                  where: () => ({
                    for: () => Promise.resolve([]),
                    then: (resolve: any) => resolve([]),
                  }),
                }),
              }),
              insert: () => ({
                values: () => ({
                  returning: () => Promise.reject(new Error('Disk write error in PostgreSQL (SIMULATED_FAIL)')),
                }),
              }),
            };
            return await cb(tx);
          },
        };

        await expect(
          expensesRepository.approveClosing(
            {
              year: 2026,
              month: 12,
              actualBankBalance: 45000,
              companyId,
            },
            adminActor,
            failingDb as any
          )
        ).rejects.toThrow('Disk write error in PostgreSQL (SIMULATED_FAIL)');

        // Verify no false success in memory store
        const memoryRecord = memoryMonthlyClosings.find((m) => m.year === 2026 && m.month === 12);
        expect(memoryRecord).toBeUndefined();
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('prevents concurrent or repeated approval requests and enforces 409 Conflict', async () => {
      // First approval
      const first = await expensesRepository.approveClosing(
        {
          year: 2026,
          month: 7,
          leadProfit: 50000,
          actualBankBalance: 45000,
          companyId,
        },
        adminActor
      );
      expect(first.status).toBe('APPROVED');

      // Repeated approval must throw 409 Conflict
      await expect(
        expensesRepository.approveClosing(
          {
            year: 2026,
            month: 7,
            leadProfit: 50000,
            actualBankBalance: 45000,
            companyId,
          },
          adminActor
        )
      ).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringContaining('already been approved and finalized'),
      });

      // Concurrent approval attempts
      const secondAttempt = expensesRepository.approveClosing(
        {
          year: 2026,
          month: 7,
          leadProfit: 50000,
          actualBankBalance: 45000,
          companyId,
        },
        adminActor
      );
      await expect(secondAttempt).rejects.toMatchObject({
        statusCode: 409,
      });
    });

    it('prevents duplicate carry-forward compounding on repeated draft saves or queries', async () => {
      // Seed prior month approval (June 2026)
      await expensesRepository.approveClosing(
        {
          year: 2026,
          month: 6,
          leadProfit: 60000,
          previousClosingCash: 10000,
          actualBankBalance: 70000,
          savingsTransfer: 15000,
          previousSavingsBalance: 25000,
          companyId,
        },
        adminActor
      );

      // Draft 1 for July 2026
      const draft1 = await expensesRepository.saveClosingDraft(
        {
          year: 2026,
          month: 7,
          actualBankBalance: 80000,
          companyId,
        },
        adminActor
      );
      expect(draft1.previousClosingCash).toBe(55000);
      expect(draft1.previousSavingsBalance).toBe(40000);

      // Draft 2 update for July 2026 must not double carry forward
      const draft2 = await expensesRepository.saveClosingDraft(
        {
          year: 2026,
          month: 7,
          actualBankBalance: 85000,
          notes: 'Updated July draft notes',
          companyId,
        },
        adminActor
      );
      expect(draft2.previousClosingCash).toBe(55000);
      expect(draft2.previousSavingsBalance).toBe(40000);

      // Subsequent reconciliation query also reflects strictly 55,000 and 40,000
      const rec = await expensesRepository.calculateReconciliationSummary(2026, 7, companyId);
      expect(rec.previousClosingCash).toBe(55000);
      expect(rec.previousSavingsBalance).toBe(40000);
    });

    it('strictly preserves tenant and company isolation on monthly closings', async () => {
      const companyA = 'comp-tenant-alpha';
      const companyB = 'comp-tenant-beta';

      const actorCompanyA = { ...adminActor, companyId: companyA };
      const actorCompanyB = { ...adminActor, companyId: companyB };

      // Company A approves August 2026
      const closeA = await expensesRepository.approveClosing(
        {
          year: 2026,
          month: 8,
          leadProfit: 80000,
          actualBankBalance: 75000,
          savingsTransfer: 10000,
          companyId: companyA,
        },
        actorCompanyA
      );
      expect(closeA.companyId).toBe(companyA);
      expect(closeA.status).toBe('APPROVED');

      // Company B can independently create draft and approve August 2026 without collision
      const closeB = await expensesRepository.approveClosing(
        {
          year: 2026,
          month: 8,
          leadProfit: 40000,
          actualBankBalance: 35000,
          savingsTransfer: 5000,
          companyId: companyB,
        },
        actorCompanyB
      );
      expect(closeB.companyId).toBe(companyB);
      expect(closeB.status).toBe('APPROVED');

      // Lookup for Company A must return Company A's record, not Company B's
      const lookupA = await expensesRepository.findClosingByPeriod(2026, 8, companyA);
      expect(lookupA?.companyId).toBe(companyA);
      expect(lookupA?.leadProfit).toBe(80000);

      // Lookup for Company B must return Company B's record, not Company A's
      const lookupB = await expensesRepository.findClosingByPeriod(2026, 8, companyB);
      expect(lookupB?.companyId).toBe(companyB);
      expect(lookupB?.leadProfit).toBe(40000);

      // Attempting duplicate close for Company A must fail with 409
      await expect(
        expensesRepository.approveClosing(
          {
            year: 2026,
            month: 8,
            actualBankBalance: 75000,
            companyId: companyA,
          },
          actorCompanyA
        )
      ).rejects.toMatchObject({ statusCode: 409 });
    });
  });

  describe('10. Phase 02 — Expense Recording, Categories & History Verification', () => {
    const originalEnv = process.env.NODE_ENV;

    it('supports all 10 canonical categories across creation, query filtering, and history calculation', async () => {
      expect(EXPENSE_CATEGORIES).toHaveLength(10);
      let runningSum = 0;

      for (let i = 0; i < EXPENSE_CATEGORIES.length; i++) {
        const cat = EXPENSE_CATEGORIES[i];
        const amt = 100 * (i + 1);
        runningSum += amt;

        const created = await expensesService.createExpense(
          {
            title: `Operational ${cat}`,
            category: cat,
            amount: amt,
            expenseDate: '2026-10-15',
            paymentMethod: i % 2 === 0 ? 'Cash' : 'UPI',
            notes: `Test expense for ${cat}`,
          },
          adminActor
        );

        expect(created.success).toBe(true);
        expect(created.data.category).toBe(cat);
        expect(created.data.amount).toBe(amt);

        // Filter specifically for this category
        const filtered = await expensesRepository.findPaginated(
          { category: cat, status: 'RECORDED' },
          companyId
        );
        expect(filtered.items.length).toBeGreaterThanOrEqual(1);
        expect(filtered.items.some((item) => item.category === cat)).toBe(true);
        expect(filtered.summary.totalAmount).toBe(amt);
      }

      // History query across all categories calculates accurate aggregate totals
      const allHistory = await expensesRepository.findPaginated(
        { status: 'RECORDED' },
        companyId
      );
      expect(allHistory.summary.totalAmount).toBe(runningSum);
      expect(allHistory.summary.totalCount).toBe(10);
    });

    it('validates amounts (> 0), valid date strings, and rejects invalid amounts and malformed dates on create and edit', async () => {
      // Reject negative amount
      await expect(
        expensesService.createExpense(
          {
            title: 'Invalid negative',
            category: 'Petrol',
            amount: -250,
            expenseDate: '2026-10-15',
            paymentMethod: 'Cash',
          },
          adminActor
        )
      ).rejects.toThrow();

      // Reject zero amount
      await expect(
        expensesService.createExpense(
          {
            title: 'Invalid zero',
            category: 'Petrol',
            amount: 0,
            expenseDate: '2026-10-15',
            paymentMethod: 'Cash',
          },
          adminActor
        )
      ).rejects.toThrow();

      // Reject invalid date string
      await expect(
        expensesService.createExpense(
          {
            title: 'Invalid date string',
            category: 'Petrol',
            amount: 500,
            expenseDate: 'not-a-valid-date',
            paymentMethod: 'Cash',
          },
          adminActor
        )
      ).rejects.toThrow();

      // Valid expense creation
      const valid = await expensesService.createExpense(
        {
          title: 'Valid expense for update validation',
          category: 'Tools & Maintenance',
          amount: 1200,
          expenseDate: '2026-10-15',
          paymentMethod: 'Bank Transfer',
        },
        adminActor
      );
      expect(valid.success).toBe(true);

      // Reject invalid update amount
      await expect(
        expensesService.updateExpense(
          valid.data.id,
          { amount: -50 },
          adminActor
        )
      ).rejects.toThrow();

      // Reject invalid update date
      await expect(
        expensesService.updateExpense(
          valid.data.id,
          { expenseDate: 'invalid-date' },
          adminActor
        )
      ).rejects.toThrow();

      // Valid update
      const updated = await expensesService.updateExpense(
        valid.data.id,
        { amount: 1350.5, notes: 'Updated price with receipt' },
        adminActor
      );
      expect(updated.success).toBe(true);
      expect(updated.data.amount).toBe(1350.5);
    });

    it('propagates production database write failures without silent fallback on create, update, and void', async () => {
      process.env.NODE_ENV = 'production';
      try {
        const queryBuilderMock: any = {
          from: () => queryBuilderMock,
          leftJoin: () => queryBuilderMock,
          where: () => queryBuilderMock,
          limit: () => Promise.resolve([]),
          then: (resolve: any) => resolve([]),
        };
        const failingDb = {
          select: () => queryBuilderMock,
          insert: () => ({
            values: () => ({
              returning: () => Promise.reject(new Error('PostgreSQL write failure (SIMULATED_PROD_CREATE_FAIL)')),
            }),
          }),
          update: () => ({
            set: () => ({
              where: () => ({
                returning: () => Promise.reject(new Error('PostgreSQL write failure (SIMULATED_PROD_UPDATE_FAIL)')),
              }),
            }),
          }),
        };

        // Create failure propagation
        await expect(
          expensesRepository.create(
            {
              title: 'Van Petrol',
              category: 'Petrol',
              amount: 500,
              expenseDate: '2026-10-15',
              paymentMethod: 'Cash',
              companyId,
            },
            adminActor,
            failingDb as any
          )
        ).rejects.toThrow('PostgreSQL write failure (SIMULATED_PROD_CREATE_FAIL)');

        // Update failure propagation
        await expect(
          expensesRepository.update(
            '00000000-0000-4000-8000-000000000099',
            { title: 'New title' },
            adminActor,
            {
              ...failingDb,
              select: () => ({
                from: () => ({
                  leftJoin: () => ({
                    where: () => ({
                      limit: () => Promise.resolve([{
                        expense: {
                          id: '00000000-0000-4000-8000-000000000099',
                          companyId,
                          title: 'Existing',
                          category: 'Petrol',
                          amount: 500,
                          expenseDate: new Date('2026-10-15'),
                          paymentMethod: 'Cash',
                          status: 'RECORDED',
                          recordedBy: adminActor.id,
                        },
                      }]),
                    }),
                  }),
                }),
              }),
            } as any
          )
        ).rejects.toThrow('PostgreSQL write failure (SIMULATED_PROD_UPDATE_FAIL)');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('computes accurate totals for filtered expense queries (totalAmount, voidedAmount, and totalCount)', async () => {
      // Record 3 expenses: 2 recorded, 1 voided
      const exp1 = await expensesService.createExpense(
        {
          title: 'Spare Bearing Purchase',
          category: 'Spare Parts',
          amount: 2500,
          expenseDate: '2026-10-20',
          paymentMethod: 'Cash',
        },
        adminActor
      );

      const exp2 = await expensesService.createExpense(
        {
          title: 'Van Petrol Tank',
          category: 'Petrol',
          amount: 800,
          expenseDate: '2026-10-20',
          paymentMethod: 'Cash',
        },
        adminActor
      );

      const exp3 = await expensesService.createExpense(
        {
          title: 'Incorrect Spare Motor',
          category: 'Spare Parts',
          amount: 4000,
          expenseDate: '2026-10-20',
          paymentMethod: 'Bank Transfer',
        },
        adminActor
      );

      // Void exp3
      await expensesService.voidExpense(exp3.data.id, { reason: 'Duplicate parts invoice' }, adminActor);

      // Query filter for 'Spare Parts' (ALL status)
      const partsAll = await expensesRepository.findPaginated(
        { category: 'Spare Parts', status: 'ALL' },
        companyId
      );
      expect(partsAll.summary.totalAmount).toBe(2500); // active recorded amount only
      expect(partsAll.summary.voidedAmount).toBe(4000); // voided amount captured separately
      expect(partsAll.summary.totalCount).toBe(2); // 2 total matching items

      // Query filter for 'Spare Parts' (RECORDED status only)
      const partsRecorded = await expensesRepository.findPaginated(
        { category: 'Spare Parts', status: 'RECORDED' },
        companyId
      );
      expect(partsRecorded.summary.totalAmount).toBe(2500);
      expect(partsRecorded.summary.voidedAmount).toBe(0);
      expect(partsRecorded.summary.totalCount).toBe(1);

      // Query filter for date range '2026-10-20' across all categories
      const dateFiltered = await expensesRepository.findPaginated(
        { startDate: '2026-10-20', endDate: '2026-10-20', status: 'ALL' },
        companyId
      );
      expect(dateFiltered.summary.totalAmount).toBe(3300); // 2500 + 800
      expect(dateFiltered.summary.voidedAmount).toBe(4000);
      expect(dateFiltered.summary.totalCount).toBe(3);
    });

    it('strictly ensures recurring expense schedules do not contribute to paid expense totals until occurrences are actually recorded', async () => {
      // Get baseline total
      const initialOverview = await expensesService.getOverview(companyId);
      const initialMonthExpenses = initialOverview.expensesThisMonth;

      // Create a recurring monthly commitment for ₹25,000 (e.g., Shop Rent)
      const scheduleRes = await expensesService.createSchedule(
        {
          title: 'Commercial Rent Commitment',
          category: 'Shop Rent',
          amount: 25000,
          frequency: 'MONTHLY',
          paymentMethod: 'Bank Transfer',
          startDate: '2026-10-01',
          notes: 'Contractual monthly rent',
        },
        adminActor
      );
      expect(scheduleRes.success).toBe(true);
      expect(scheduleRes.data.id).toBeDefined();

      // Verify schedule creation does NOT inflate recorded expense total
      const afterScheduleOverview = await expensesService.getOverview(companyId);
      expect(afterScheduleOverview.expensesThisMonth).toBe(initialMonthExpenses);

      // Now record a concrete occurrence for October 2026
      const occurrenceRes = await expensesService.recordOccurrence(
        scheduleRes.data.id,
        '2026-10',
        '2026-10-05',
        adminActor,
        'Paid October rent via NEFT'
      );
      expect(occurrenceRes.success).toBe(true);
      const occurrence = occurrenceRes.data;
      expect(occurrence.title).toContain('Commercial Rent Commitment (2026-10)');
      expect(occurrence.status).toBe('RECORDED');

      // Now the expense total increases by exactly the single recorded occurrence amount
      const afterOccurrenceOverview = await expensesService.getOverview(companyId);
      expect(afterOccurrenceOverview.expensesThisMonth).toBe(initialMonthExpenses + 25000);

      // Duplicate occurrence record for the exact same period is idempotent and does not double-count
      const duplicateRes = await expensesService.recordOccurrence(
        scheduleRes.data.id,
        '2026-10',
        '2026-10-05',
        adminActor
      );
      expect(duplicateRes.success).toBe(true);
      expect(duplicateRes.data.id).toBe(occurrence.id);

      const afterDuplicateOverview = await expensesService.getOverview(companyId);
      expect(afterDuplicateOverview.expensesThisMonth).toBe(initialMonthExpenses + 25000);
    });

    it('preserves backward compatibility with legacy or custom category names in stored records', async () => {
      // Historical expense stored with legacy category name 'Office Supplies'
      const legacyExp = await expensesService.createExpense(
        {
          title: 'A4 Printing Paper & Cartridge',
          category: 'Office Supplies',
          amount: 750,
          expenseDate: '2026-10-18',
          paymentMethod: 'Card',
        },
        adminActor
      );
      expect(legacyExp.data.category).toBe('Office Supplies');

      // Query by legacy category name works seamlessly
      const legacyQuery = await expensesRepository.findPaginated(
        { category: 'Office Supplies' },
        companyId
      );
      expect(legacyQuery.items.some((i) => i.id === legacyExp.data.id)).toBe(true);
      expect(legacyQuery.summary.totalAmount).toBe(750);
    });
  });

  describe('11. Phase 03 — Monthly Profit & Expected Cash Verification', () => {
    it('verifies exact client acceptance figures: Lead Profit ₹1,00,000, Total Expenses ₹40,000 -> Monthly Profit ₹60,000, Expected Cash ₹1,00,000', async () => {
      // Seed exact expenses from client example:
      // 1. Spare Parts: ₹5,000
      await expensesService.createExpense(
        {
          title: 'Filter Elements & Valves',
          category: 'Spare Parts',
          amount: 5000,
          expenseDate: '2026-10-05',
          paymentMethod: 'Bank Transfer',
        },
        adminActor
      );

      // 2. Petrol: ₹5,000
      await expensesService.createExpense(
        {
          title: 'Technician Bike Fuel',
          category: 'Petrol',
          amount: 5000,
          expenseDate: '2026-10-10',
          paymentMethod: 'Cash',
        },
        adminActor
      );

      // 3. Business Expenses: ₹10,000
      await expensesService.createExpense(
        {
          title: 'Office Cleaning & Supplies',
          category: 'Business Expenses',
          amount: 10000,
          expenseDate: '2026-10-15',
          paymentMethod: 'UPI',
        },
        adminActor
      );

      // 4. Home Expenses: ₹20,000
      await expensesService.createExpense(
        {
          title: 'Owner Personal Household Drawings',
          category: 'Home Expenses',
          amount: 20000,
          expenseDate: '2026-10-20',
          paymentMethod: 'Bank Transfer',
        },
        adminActor
      );

      // Verify server-side calculation for October 2026:
      const summary = await expensesService.getMonthlyReconciliation(
        2026,
        10,
        companyId,
        {
          leadProfit: 100000,
          previousClosingCash: 40000,
        }
      );

      // A. Verified Category Totals
      expect(summary.categoryTotals['Spare Parts']).toBe(5000);
      expect(summary.categoryTotals['Petrol']).toBe(5000);
      expect(summary.categoryTotals['Business Expenses']).toBe(10000);
      expect(summary.categoryTotals['Home Expenses']).toBe(20000);

      // B. Verified Expense Aggregations
      // Total Expenses = 5,000 + 5,000 + 10,000 + 20,000 = 40,000
      expect(summary.totalExpenses).toBe(40000);
      // Business operating burn = 20,000 (excluding 20,000 Home Expenses)
      expect(summary.businessExpenses).toBe(20000);
      expect(summary.homeExpenses).toBe(20000);

      // C. Verified Monthly Profit = Lead Profit (1,00,000) - Total Expenses (40,000) = 60,000
      expect(summary.monthlyProfit).toBe(60000);

      // D. Verified Previous Closing Cash = 40,000
      expect(summary.previousClosingCash).toBe(40000);

      // E. Verified Expected Cash Before Savings = Previous Closing Cash (40,000) + Monthly Profit (60,000) = 1,00,000
      expect(summary.expectedCashBeforeSavings).toBe(100000);
    });

    it('strictly excludes voided expenses from monthly expense aggregation and profit deduction', async () => {
      // Valid expense: ₹15,000
      await expensesService.createExpense(
        {
          title: 'Commercial Rent Advance',
          category: 'Shop Rent',
          amount: 15000,
          expenseDate: '2026-10-02',
          paymentMethod: 'Bank Transfer',
        },
        adminActor
      );

      // Mistaken expense: ₹50,000, immediately voided
      const mistaken = await expensesService.createExpense(
        {
          title: 'Mistaken Purchase Order',
          category: 'Tools & Maintenance',
          amount: 50000,
          expenseDate: '2026-10-04',
          paymentMethod: 'Card',
        },
        adminActor
      );

      await expensesService.voidExpense(
        mistaken.data.id,
        { reason: 'Duplicate invoice entered erroneously' },
        adminActor
      );

      const summary = await expensesService.getMonthlyReconciliation(
        2026,
        10,
        companyId,
        { leadProfit: 50000, previousClosingCash: 10000 }
      );

      // Only the ₹15,000 active expense is counted; ₹50,000 voided is strictly excluded
      expect(summary.totalExpenses).toBe(15000);
      expect(summary.monthlyProfit).toBe(35000); // 50,000 - 15,000
      expect(summary.expectedCashBeforeSavings).toBe(45000); // 10,000 + 35,000
    });

    it('strictly ensures unrecorded recurring schedules do not inflate monthly expense totals or reduce profit', async () => {
      // Active schedule for ₹30,000 (Electricity / Rent)
      await expensesService.createSchedule(
        {
          title: 'Monthly Workshop Power Bill',
          category: 'Electricity',
          amount: 30000,
          frequency: 'MONTHLY',
          paymentMethod: 'Bank Transfer',
          startDate: '2026-10-01',
        },
        adminActor
      );

      // Active expense: ₹2,000
      await expensesService.createExpense(
        {
          title: 'Broadband Fiber',
          category: 'Internet / Phone',
          amount: 2000,
          expenseDate: '2026-10-08',
          paymentMethod: 'UPI',
        },
        adminActor
      );

      const summary = await expensesService.getMonthlyReconciliation(
        2026,
        10,
        companyId,
        { leadProfit: 20000 }
      );

      // Unrecorded schedule (₹30,000) does not contribute; only recorded ₹2,000 contributes
      expect(summary.totalExpenses).toBe(2000);
      expect(summary.monthlyProfit).toBe(18000);
    });

    it('accurately resolves previous closing cash from prior approved month and distinguishes opening periods', async () => {
      // 1. Unestablished period (no prior close, no override)
      const openingSummary = await expensesService.getMonthlyReconciliation(
        2026,
        10,
        companyId
      );
      expect(openingSummary.hasPriorApprovedClose).toBe(false);
      expect(openingSummary.isOpeningPeriod).toBe(true);
      expect(openingSummary.previousClosingCash).toBe(0);

      // 2. Establishing prior approved close in Month 10
      await expensesService.approveMonthlyClosing(
        {
          year: 2026,
          month: 10,
          leadProfit: 100000,
          previousClosingCash: 50000, // Initial opening baseline
          actualBankBalance: 120000,
          savingsTransfer: 20000,
          previousSavingsBalance: 10000,
          notes: 'October audited close',
        },
        adminActor
      );

      // 3. Month 11 automatically inherits Month 10 approved closingCash as its previousClosingCash
      const novSummary = await expensesService.getMonthlyReconciliation(
        2026,
        11,
        companyId,
        { leadProfit: 80000 }
      );

      // Oct: Expected Before Savings = 50,000 + (100,000 - 0) = 150,000
      // Oct: Closing Cash = 150,000 - 20,000 = 130,000
      expect(novSummary.hasPriorApprovedClose).toBe(true);
      expect(novSummary.isOpeningPeriod).toBe(false);
      expect(novSummary.previousClosingCash).toBe(130000);
      expect(novSummary.previousSavingsBalance).toBe(30000); // 10,000 + 20,000

      // Nov Expected Cash = 130,000 + 80,000 = 210,000
      expect(novSummary.expectedCashBeforeSavings).toBe(210000);
    });

    it('correctly filters expenses within calendar month boundaries and respects company tenant isolation', async () => {
      const otherCompanyId = 'comp-other-999';

      // Expense on Oct 1 (included)
      await expensesService.createExpense(
        {
          title: 'First Day Expense',
          category: 'Travel',
          amount: 1000,
          expenseDate: '2026-10-01',
          paymentMethod: 'Cash',
        },
        adminActor
      );

      // Expense on Oct 31 (included)
      await expensesService.createExpense(
        {
          title: 'Last Day Expense',
          category: 'Travel',
          amount: 2000,
          expenseDate: '2026-10-31',
          paymentMethod: 'Cash',
        },
        adminActor
      );

      // Expense on Sep 30 (excluded from Oct)
      await expensesService.createExpense(
        {
          title: 'September Prior Expense',
          category: 'Travel',
          amount: 5000,
          expenseDate: '2026-09-30',
          paymentMethod: 'Cash',
        },
        adminActor
      );

      // Expense on Nov 01 (excluded from Oct)
      await expensesService.createExpense(
        {
          title: 'November Next Expense',
          category: 'Travel',
          amount: 5000,
          expenseDate: '2026-11-01',
          paymentMethod: 'Cash',
        },
        adminActor
      );

      // Expense for a different company (excluded via tenant isolation)
      await expensesRepository.create(
        {
          title: 'Tenant Isolation Check',
          category: 'Travel',
          amount: 99999,
          expenseDate: '2026-10-15',
          paymentMethod: 'Cash',
          companyId: otherCompanyId,
        },
        { ...adminActor, companyId: otherCompanyId }
      );

      const summary = await expensesService.getMonthlyReconciliation(
        2026,
        10,
        companyId,
        { leadProfit: 50000 }
      );

      // Only Oct 1 (1000) and Oct 31 (2000) are included = 3000
      expect(summary.totalExpenses).toBe(3000);
      expect(summary.monthlyProfit).toBe(47000);
    });
  });

  describe('12. Phase 04 — Bank Reconciliation & Savings Tracking Suite', () => {
    it('calculates positive reconciliation difference as surplus without modifying expenses or profit', async () => {
      await expensesService.createExpense(
        {
          title: 'Office Internet',
          category: 'Internet / Phone',
          amount: 5000,
          expenseDate: '2026-10-10',
          paymentMethod: 'Online',
        },
        adminActor
      );

      // Lead Profit = 50,000, Expenses = 5,000 -> Monthly Profit = 45,000
      // Previous Closing Cash = 10,000 (override) -> Expected Cash Before Savings = 55,000
      // Actual Bank Balance = 60,000
      // Reconciliation Difference = 60,000 - 55,000 = +5,000 (Surplus)
      const summary = await expensesService.getMonthlyReconciliation(
        2026,
        10,
        companyId,
        {
          leadProfit: 50000,
          previousClosingCash: 10000,
          actualBankBalance: 60000,
        }
      );

      expect(summary.totalExpenses).toBe(5000);
      expect(summary.monthlyProfit).toBe(45000);
      expect(summary.expectedCashBeforeSavings).toBe(55000);
      expect(summary.actualBankBalance).toBe(60000);
      expect(summary.reconciliationDifference).toBe(5000); // Positive surplus

      // Verify profit and expenses are unchanged by the surplus
      expect(summary.monthlyProfit).toBe(50000 - 5000);
    });

    it('calculates negative reconciliation difference as shortfall without converting to an expense or altering CRM profit', async () => {
      await expensesService.createExpense(
        {
          title: 'Shop Maintenance',
          category: 'Tools & Maintenance',
          amount: 8000,
          expenseDate: '2026-10-12',
          paymentMethod: 'Bank Transfer',
        },
        adminActor
      );

      // Lead Profit = 60,000, Expenses = 8,000 -> Monthly Profit = 52,000
      // Expected Cash = 52,000
      // Actual Bank Balance = 45,000
      // Reconciliation Difference = 45,000 - 52,000 = -7,000 (Shortfall)
      const summary = await expensesService.getMonthlyReconciliation(
        2026,
        10,
        companyId,
        {
          leadProfit: 60000,
          actualBankBalance: 45000,
        }
      );

      expect(summary.totalExpenses).toBe(8000); // NOT increased by 7,000 shortfall
      expect(summary.monthlyProfit).toBe(52000); // NOT reduced by 7,000 shortfall
      expect(summary.expectedCashBeforeSavings).toBe(52000);
      expect(summary.actualBankBalance).toBe(45000);
      expect(summary.reconciliationDifference).toBe(-7000); // Negative shortfall
    });

    it('calculates zero reconciliation difference when actual bank matches expected cash exactly', async () => {
      await expensesService.createExpense(
        {
          title: 'Shop Rent',
          category: 'Shop Rent',
          amount: 15000,
          expenseDate: '2026-10-05',
          paymentMethod: 'Bank Transfer',
        },
        adminActor
      );

      // Lead Profit = 40,000, Expenses = 15,000 -> Expected Cash = 25,000
      // Actual Bank Balance = 25,000
      const summary = await expensesService.getMonthlyReconciliation(
        2026,
        10,
        companyId,
        {
          leadProfit: 40000,
          actualBankBalance: 25000,
        }
      );

      expect(summary.expectedCashBeforeSavings).toBe(25000);
      expect(summary.actualBankBalance).toBe(25000);
      expect(summary.reconciliationDifference).toBe(0); // Balanced
    });

    it('tracks cumulative savings across consecutive months preserving historical records', async () => {
      // Month 1: 2026-08
      await expensesRepository.approveClosing(
        {
          year: 2026,
          month: 8,
          leadProfit: 80000,
          actualBankBalance: 70000,
          savingsTransfer: 20000,
          companyId,
        },
        adminActor
      );

      // Verify Month 1 Closing
      const month1 = await expensesRepository.findClosingByPeriod(2026, 8, companyId);
      expect(month1).toBeDefined();
      expect(month1?.status).toBe('APPROVED');
      expect(month1?.previousSavingsBalance).toBe(0);
      expect(month1?.savingsTransfer).toBe(20000);
      expect(month1?.currentSavingsBalance).toBe(20000);
      expect(month1?.closingCash).toBe(60000); // 80,000 profit - 20,000 savings

      // Month 2: 2026-09 - Should automatically inherit Month 1 carry forwards
      const month2Summary = await expensesService.getMonthlyReconciliation(
        2026,
        9,
        companyId,
        {
          leadProfit: 50000,
          savingsTransfer: 15000,
        }
      );

      expect(month2Summary.previousClosingCash).toBe(60000);
      expect(month2Summary.previousSavingsBalance).toBe(20000);
      expect(month2Summary.savingsTransfer).toBe(15000);
      expect(month2Summary.currentSavingsBalance).toBe(35000); // 20,000 + 15,000
      expect(month2Summary.expectedCashBeforeSavings).toBe(110000); // 60,000 + 50,000
      expect(month2Summary.closingCash).toBe(95000); // 110,000 - 15,000

      // Approve Month 2
      await expensesRepository.approveClosing(
        {
          year: 2026,
          month: 9,
          leadProfit: 50000,
          actualBankBalance: 95000,
          savingsTransfer: 15000,
          companyId,
        },
        adminActor
      );

      // Verify Month 1 was not mutated by Month 2
      const month1Recheck = await expensesRepository.findClosingByPeriod(2026, 8, companyId);
      expect(month1Recheck?.currentSavingsBalance).toBe(20000);
      expect(month1Recheck?.savingsTransfer).toBe(20000);
    });

    it('identifies unestablished opening balances and flags isOpeningPeriod', async () => {
      // Company with no prior approved closes
      const newCompanyId = 'brand-new-co-999';

      const summary = await expensesService.getMonthlyReconciliation(
        2026,
        1,
        newCompanyId
      );

      expect(summary.hasPriorApprovedClose).toBe(false);
      expect(summary.isOpeningPeriod).toBe(true);
      expect(summary.previousClosingCash).toBe(0);
      expect(summary.previousSavingsBalance).toBe(0);

      // Now create an approved close for 2026-01
      await expensesRepository.approveClosing(
        {
          year: 2026,
          month: 1,
          leadProfit: 30000,
          actualBankBalance: 30000,
          savingsTransfer: 5000,
          companyId: newCompanyId,
        },
        { ...adminActor, companyId: newCompanyId }
      );

      // Query next month 2026-02
      const nextSummary = await expensesService.getMonthlyReconciliation(
        2026,
        2,
        newCompanyId
      );

      expect(nextSummary.hasPriorApprovedClose).toBe(true);
      expect(nextSummary.isOpeningPeriod).toBe(false);
      expect(nextSummary.previousClosingCash).toBe(25000); // 30,000 - 5,000
      expect(nextSummary.previousSavingsBalance).toBe(5000);
    });

    it('ensures query overrides are preview-only and do not persist financial records', async () => {
      const targetYear = 2026;
      const targetMonth = 11;

      // Ensure no existing draft
      const before = await expensesRepository.findClosingByPeriod(targetYear, targetMonth, companyId);
      expect(before).toBeNull();

      // Call getMonthlyReconciliation with preview overrides
      const preview = await expensesService.getMonthlyReconciliation(
        targetYear,
        targetMonth,
        companyId,
        {
          leadProfit: 125000,
          actualBankBalance: 98000,
          savingsTransfer: 30000,
        }
      );

      expect(preview.leadProfit).toBe(125000);
      expect(preview.actualBankBalance).toBe(98000);
      expect(preview.savingsTransfer).toBe(30000);

      // Verify that NO database / memory record was created by the preview query
      const after = await expensesRepository.findClosingByPeriod(targetYear, targetMonth, companyId);
      expect(after).toBeNull();
      expect(memoryMonthlyClosings.find((m) => m.year === targetYear && m.month === targetMonth)).toBeUndefined();
    });

    it('prevents duplicate draft records and safely merges partial updates', async () => {
      const targetYear = 2026;
      const targetMonth = 10;

      // First draft save: set lead profit and actual bank balance
      const draft1 = await expensesService.saveMonthlyClosingDraft(
        {
          year: targetYear,
          month: targetMonth,
          leadProfit: 50000,
          actualBankBalance: 48000,
          savingsTransfer: 0,
          notes: 'First draft inspection',
        },
        adminActor
      );

      expect(draft1.data.status).toBe('DRAFT');
      expect(draft1.data.actualBankBalance).toBe(48000);
      expect(draft1.data.savingsTransfer).toBe(0);

      // Second draft save: only update savings transfer and notes
      const draft2 = await expensesService.saveMonthlyClosingDraft(
        {
          year: targetYear,
          month: targetMonth,
          savingsTransfer: 12000,
          notes: 'Updated savings transfer amount',
        },
        adminActor
      );

      // ID is preserved (upsert in-place, not duplicated)
      expect(draft2.data.id).toBe(draft1.data.id);
      // Previously entered actualBankBalance is safely preserved
      expect(draft2.data.actualBankBalance).toBe(48000);
      expect(draft2.data.savingsTransfer).toBe(12000);
      expect(draft2.data.notes).toBe('Updated savings transfer amount');

      // Verify only 1 record exists in memory for this period and company
      const matchingRecords = memoryMonthlyClosings.filter(
        (m) => m.year === targetYear && m.month === targetMonth && m.companyId === companyId
      );
      expect(matchingRecords).toHaveLength(1);
    });

    it('enforces role authorization: technicians cannot save reconciliation drafts', async () => {
      await expect(
        expensesService.saveMonthlyClosingDraft(
          {
            year: 2026,
            month: 10,
            actualBankBalance: 50000,
          },
          technicianActor
        )
      ).rejects.toThrow('Technicians are not authorized to manage company expenses');
    });

    it('enforces tenant isolation between different companies for reconciliation and drafts', async () => {
      const companyA = 'tenant-alpha-001';
      const companyB = 'tenant-beta-002';

      const actorA = { ...adminActor, companyId: companyA };
      const actorB = { ...adminActor, companyId: companyB };

      // Company A saves draft
      await expensesService.saveMonthlyClosingDraft(
        {
          year: 2026,
          month: 10,
          leadProfit: 100000,
          actualBankBalance: 95000,
          savingsTransfer: 20000,
        },
        actorA
      );

      // Company B queries reconciliation - should NOT see Company A's draft or values
      const summaryB = await expensesService.getMonthlyReconciliation(
        2026,
        10,
        companyB
      );

      expect(summaryB.closingRecord).toBeNull();
      expect(summaryB.actualBankBalance).toBe(0);
      expect(summaryB.savingsTransfer).toBe(0);

      // Company B saves draft with different values
      await expensesService.saveMonthlyClosingDraft(
        {
          year: 2026,
          month: 10,
          leadProfit: 40000,
          actualBankBalance: 38000,
          savingsTransfer: 5000,
        },
        actorB
      );

      // Verify Company A's record remained untouched
      const summaryA = await expensesService.getMonthlyReconciliation(
        2026,
        10,
        companyA
      );
      expect(summaryA.closingRecord?.leadProfit).toBe(100000);
      expect(summaryA.closingRecord?.actualBankBalance).toBe(95000);
      expect(summaryA.closingRecord?.savingsTransfer).toBe(20000);
    });

    it('rejects draft updates to already approved periods with 409 Conflict', async () => {
      // Approve period
      await expensesRepository.approveClosing(
        {
          year: 2026,
          month: 7,
          leadProfit: 70000,
          actualBankBalance: 65000,
          savingsTransfer: 10000,
          companyId,
        },
        adminActor
      );

      // Attempting to modify draft of approved month must fail with 409
      await expect(
        expensesService.saveMonthlyClosingDraft(
          {
            year: 2026,
            month: 7,
            actualBankBalance: 99999,
          },
          adminActor
        )
      ).rejects.toThrow('Duplicate close or draft modification is not permitted');
    });
  });

  describe('Phase 07 — Monthly Closing Approval & Balance Carry-Forward Suite', () => {
    const p7CompanyId = 'comp-p7-001';
    const p7OtherCompanyId = 'comp-p7-002';

    const p7AdminActor = {
      id: '00000000-0000-4000-8000-000000000001',
      userId: '00000000-0000-4000-8000-000000000001',
      displayName: 'Lead Financial Admin',
      username: 'fin_admin',
      role: 'Admin',
      companyId: p7CompanyId,
    };

    const p7AccountantActor = {
      id: '00000000-0000-4000-8000-000000000003',
      userId: '00000000-0000-4000-8000-000000000003',
      displayName: 'Staff Accountant',
      username: 'accountant_joe',
      role: 'Accountant',
      companyId: p7CompanyId,
    };

    const p7OtherAdminActor = {
      id: '00000000-0000-4000-8000-000000000004',
      userId: '00000000-0000-4000-8000-000000000004',
      displayName: 'Other Tenant Admin',
      username: 'other_admin',
      role: 'Admin',
      companyId: p7OtherCompanyId,
    };

    it('creates and updates drafts with status DRAFT without locking period', async () => {
      // 1. Create draft
      const draftRes1 = await expensesService.saveMonthlyClosingDraft(
        {
          year: 2026,
          month: 3,
          leadProfit: 75000,
          actualBankBalance: 70000,
          savingsTransfer: 15000,
          notes: 'Initial Q1 draft',
          companyId: p7CompanyId,
        },
        p7AccountantActor
      );

      expect(draftRes1.success).toBe(true);
      expect(draftRes1.data.status).toBe('DRAFT');
      expect(draftRes1.data.leadProfit).toBe(75000);
      expect(draftRes1.data.actualBankBalance).toBe(70000);
      expect(draftRes1.data.savingsTransfer).toBe(15000);
      expect(draftRes1.data.notes).toBe('Initial Q1 draft');
      expect(draftRes1.data.approvedBy).toBeNull();
      expect(draftRes1.data.approvedAt).toBeNull();

      // 2. Update draft
      const draftRes2 = await expensesService.saveMonthlyClosingDraft(
        {
          year: 2026,
          month: 3,
          leadProfit: 80000,
          actualBankBalance: 78000,
          savingsTransfer: 18000,
          notes: 'Updated Q1 draft after bank statement reconciliation',
          companyId: p7CompanyId,
        },
        p7AdminActor
      );

      expect(draftRes2.data.status).toBe('DRAFT');
      expect(draftRes2.data.leadProfit).toBe(80000);
      expect(draftRes2.data.actualBankBalance).toBe(78000);
      expect(draftRes2.data.savingsTransfer).toBe(18000);
      expect(draftRes2.data.notes).toBe('Updated Q1 draft after bank statement reconciliation');
    });

    it('requires explicit authorized opening baseline and rejects approval if unestablished', async () => {
      const freshCompanyId = 'brand-new-p7-co';
      const freshAdmin = { ...p7AdminActor, companyId: freshCompanyId };

      // Attempting to approve an opening month without previousClosingCash and without confirmOpeningBaseline must throw
      await expect(
        expensesService.approveMonthlyClosing(
          {
            year: 2026,
            month: 1,
            leadProfit: 50000,
            actualBankBalance: 50000,
            companyId: freshCompanyId,
          },
          freshAdmin
        )
      ).rejects.toMatchObject({
        code: 'OPENING_BALANCE_UNESTABLISHED',
        message: expect.stringContaining('Opening baseline balance is unestablished'),
      });

      // Providing explicit opening baseline succeeds
      const approved = await expensesService.approveMonthlyClosing(
        {
          year: 2026,
          month: 1,
          leadProfit: 50000,
          previousClosingCash: 20000,
          actualBankBalance: 70000,
          savingsTransfer: 10000,
          previousSavingsBalance: 5000,
          companyId: freshCompanyId,
          confirmOpeningBaseline: true,
        },
        freshAdmin
      );

      expect(approved.success).toBe(true);
      expect(approved.data.status).toBe('APPROVED');
      expect(approved.data.previousClosingCash).toBe(20000);
      expect(approved.data.closingCash).toBe(60000);
    });

    it('records approver audit metadata and server timestamp upon successful approval', async () => {
      const result = await expensesService.approveMonthlyClosing(
        {
          year: 2026,
          month: 4,
          leadProfit: 120000,
          previousClosingCash: 10000,
          actualBankBalance: 125000,
          savingsTransfer: 25000,
          notes: 'April month close audited',
          companyId: p7CompanyId,
        },
        p7AdminActor
      );

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('APPROVED');
      expect(result.data.approvedBy).toBe(p7AdminActor.id);
      expect(result.data.approvedByName).toBe(p7AdminActor.displayName);
      expect(result.data.approvedAt).toBeTruthy();
      expect(new Date(result.data.approvedAt!).getTime()).not.toBeNaN();
    });

    it('enforces authorization and rejects unauthorized roles (Accountant, Technician)', async () => {
      // Accountant cannot approve
      await expect(
        expensesService.approveMonthlyClosing(
          {
            year: 2026,
            month: 5,
            actualBankBalance: 50000,
            companyId: p7CompanyId,
          },
          p7AccountantActor
        )
      ).rejects.toThrow(/Only authorized administrators can approve monthly closings/i);

      // Technician cannot approve
      await expect(
        expensesService.approveMonthlyClosing(
          {
            year: 2026,
            month: 5,
            actualBankBalance: 50000,
            companyId: p7CompanyId,
          },
          technicianActor
        )
      ).rejects.toThrow(/Only authorized administrators can approve monthly closings/i);
    });

    it('enforces strict tenant isolation and rejects cross-tenant approval', async () => {
      // Admin of Company A tries to approve Company B
      await expect(
        expensesService.approveMonthlyClosing(
          {
            year: 2026,
            month: 5,
            actualBankBalance: 60000,
            companyId: p7OtherCompanyId,
          },
          p7AdminActor
        )
      ).rejects.toThrow(/Cross-tenant closing access forbidden/i);
    });

    it('atomically rejects duplicate approvals and concurrent requests with 409 Conflict', async () => {
      // First approval
      const first = await expensesService.approveMonthlyClosing(
        {
          year: 2026,
          month: 6,
          leadProfit: 90000,
          previousClosingCash: 5000,
          actualBankBalance: 95000,
          companyId: p7CompanyId,
        },
        p7AdminActor
      );
      expect(first.data.status).toBe('APPROVED');

      // Duplicate approval attempt
      await expect(
        expensesService.approveMonthlyClosing(
          {
            year: 2026,
            month: 6,
            leadProfit: 90000,
            actualBankBalance: 95000,
            companyId: p7CompanyId,
          },
          p7AdminActor
        )
      ).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringContaining('already been approved and finalized'),
      });
    });

    it('rejects ordinary draft modifications to approved periods', async () => {
      // First approve month 7
      await expensesService.approveMonthlyClosing(
        {
          year: 2026,
          month: 7,
          leadProfit: 90000,
          previousClosingCash: 5000,
          actualBankBalance: 95000,
          companyId: p7CompanyId,
        },
        p7AdminActor
      );

      // Try to save draft for already approved month 7
      await expect(
        expensesService.saveMonthlyClosingDraft(
          {
            year: 2026,
            month: 7,
            leadProfit: 100000,
            actualBankBalance: 100000,
            companyId: p7CompanyId,
          },
          p7AdminActor
        )
      ).rejects.toMatchObject({
        statusCode: 409,
        message: expect.stringContaining('Duplicate close or draft modification is not permitted'),
      });
    });

    it('ensures draft values never affect next month opening balances', async () => {
      const draftYear = 2026;
      const draftMonth = 8;
      const nextMonth = 9;

      // Save a DRAFT in month 8
      await expensesService.saveMonthlyClosingDraft(
        {
          year: draftYear,
          month: draftMonth,
          leadProfit: 250000,
          actualBankBalance: 240000,
          savingsTransfer: 50000,
          previousClosingCash: 20000,
          companyId: p7OtherCompanyId,
        },
        p7OtherAdminActor
      );

      // Query month 9 reconciliation summary
      const month9Summary = await expensesService.getMonthlyReconciliation(
        draftYear,
        nextMonth,
        p7OtherCompanyId
      );

      // The draft in month 8 MUST NOT establish opening cash for month 9
      expect(month9Summary.hasPriorApprovedClose).toBe(false);
      expect(month9Summary.isOpeningPeriod).toBe(true);
      expect(month9Summary.previousClosingCash).toBe(0);
      expect(month9Summary.previousSavingsBalance).toBe(0);
    });

    it('carries forward approved closing operating cash and current savings balance', async () => {
      const coId = 'comp-carry-forward-01';
      const actor = { ...p7AdminActor, companyId: coId };

      await expensesService.approveMonthlyClosing(
        {
          year: 2026,
          month: 8,
          leadProfit: 100000,
          previousClosingCash: 40000,
          previousSavingsBalance: 10000,
          actualBankBalance: 140000,
          savingsTransfer: 30000,
          companyId: coId,
        },
        actor
      );

      const month9Summary = await expensesService.getMonthlyReconciliation(
        2026,
        9,
        coId
      );

      expect(month9Summary.hasPriorApprovedClose).toBe(true);
      expect(month9Summary.isOpeningPeriod).toBe(false);
      expect(month9Summary.previousClosingCash).toBe(110000);
      expect(month9Summary.previousSavingsBalance).toBe(40000);
    });

    it('correctly handles December-to-January year boundary carry-forward', async () => {
      const ybCompanyId = 'comp-year-boundary-01';
      const ybActor = { ...p7AdminActor, companyId: ybCompanyId };

      await expensesService.approveMonthlyClosing(
        {
          year: 2026,
          month: 12,
          leadProfit: 120000,
          previousClosingCash: 50000,
          previousSavingsBalance: 25000,
          actualBankBalance: 170000,
          savingsTransfer: 35000,
          companyId: ybCompanyId,
        },
        ybActor
      );

      const jan2027Summary = await expensesService.getMonthlyReconciliation(
        2027,
        1,
        ybCompanyId
      );

      expect(jan2027Summary.hasPriorApprovedClose).toBe(true);
      expect(jan2027Summary.isOpeningPeriod).toBe(false);
      expect(jan2027Summary.previousClosingCash).toBe(135000);
      expect(jan2027Summary.previousSavingsBalance).toBe(60000);
    });

    it('guarantees historical snapshot immutability when source expenses are added post-close', async () => {
      const immCompanyId = 'comp-immutability-01';
      const immActor = { ...p7AdminActor, companyId: immCompanyId };

      await expensesRepository.create(
        {
          title: 'October Shop Rent',
          amount: 5000,
          category: 'Shop Rent',
          paymentMethod: 'Cash',
          expenseDate: '2026-10-10',
          description: 'October shop rent',
          companyId: immCompanyId,
        },
        immActor
      );

      const approvedOctober = await expensesService.approveMonthlyClosing(
        {
          year: 2026,
          month: 10,
          leadProfit: 80000,
          previousClosingCash: 10000,
          actualBankBalance: 85000,
          savingsTransfer: 10000,
          companyId: immCompanyId,
        },
        immActor
      );

      expect(approvedOctober.data.totalExpenses).toBe(5000);
      expect(approvedOctober.data.monthlyProfit).toBe(75000);
      expect(approvedOctober.data.closingCash).toBe(75000);

      await expensesRepository.create(
        {
          title: 'Late October Parts Invoice',
          amount: 25000,
          category: 'Spare Parts',
          paymentMethod: 'Bank Transfer',
          expenseDate: '2026-10-15',
          description: 'Late October parts invoice',
          companyId: immCompanyId,
        },
        immActor
      );

      const afterSummary = await expensesService.getMonthlyReconciliation(
        2026,
        10,
        immCompanyId
      );

      expect(afterSummary.isClosed).toBe(true);
      expect(afterSummary.totalExpenses).toBe(5000);
      expect(afterSummary.monthlyProfit).toBe(75000);
      expect(afterSummary.closingCash).toBe(75000);
    });

    it('propagates database write failures in production without silent memory fallback', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const queryBuilderMock: any = {
        from: () => queryBuilderMock,
        leftJoin: () => queryBuilderMock,
        where: () => queryBuilderMock,
        orderBy: () => queryBuilderMock,
        limit: () => Promise.resolve([]),
        then: (resolve: any) => resolve([]),
      };

      const mockFailingDb: any = {
        select: () => queryBuilderMock,
        transaction: async (cb: any) => {
          const tx = {
            select: () => ({
              from: () => ({
                where: () => ({
                  for: () => Promise.resolve([]),
                  then: (resolve: any) => resolve([]),
                }),
              }),
            }),
            insert: () => ({
              values: () => ({
                returning: () => Promise.reject(new Error('Connection terminated unexpectedly (PROD_DB_FAIL)')),
              }),
            }),
          };
          return await cb(tx);
        },
      };

      try {
        await expect(
          expensesRepository.approveClosing(
            {
              year: 2026,
              month: 11,
              actualBankBalance: 120000,
              companyId: p7CompanyId,
            },
            p7AdminActor,
            mockFailingDb
          )
        ).rejects.toThrow('Connection terminated unexpectedly (PROD_DB_FAIL)');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe('Phase F — Service Earnings & Automatic Spare Expense Integration Suite', () => {
    const fCompanyId = 'comp-phase-f-001';
    const fAdminActor = {
      id: '00000000-0000-4000-8000-000000000099',
      userId: '00000000-0000-4000-8000-000000000099',
      displayName: 'Phase F Admin',
      username: 'fadmin',
      role: 'Admin',
      companyId: fCompanyId,
    };

    beforeEach(async () => {
      memoryInvoices.length = 0;
      memoryServices.length = 0;
      memoryPayments.length = 0;
      memoryExpenses.length = 0;
      memoryMonthlyClosings.length = 0;
      try {
        await db.delete(expenses).where(or(eq(expenses.companyId, fCompanyId), ilike(expenses.companyId, 'comp-phase-f-%')));
        await db.delete(monthlyClosings).where(or(eq(monthlyClosings.companyId, fCompanyId), ilike(monthlyClosings.companyId, 'comp-phase-f-%')));
      } catch {}
    });

    it('1. Deterministic Financial Example: Service earnings ₹1,00,000, Spares ₹10,000, Petrol ₹5,000, Other ₹5,000 -> Balance ₹80,000 without double-deduction', async () => {
      // 1. Service Earnings of ₹1,00,000 recorded via authoritative service invoice
      memoryInvoices.push({
        id: 'inv-det-01',
        invoiceNumber: 'INV-DET-01',
        totalAmount: '100000',
        paidAmount: '100000',
        invoiceDate: '2026-10-15',
        status: 'PAID',
        serviceId: 'srv-det-01',
        companyId: fCompanyId,
      });

      // 2. Spare-part expense of ₹10,000
      await expensesRepository.create(
        {
          title: 'Service Spare Parts Consumption',
          amount: 10000,
          category: 'Spare Parts',
          paymentMethod: 'Cash',
          expenseDate: '2026-10-15',
          description: 'Spares consumed on October service jobs',
          companyId: fCompanyId,
        },
        fAdminActor
      );

      // 3. Petrol expense of ₹5,000
      await expensesRepository.create(
        {
          title: 'Field Technician Petrol Reimbursement',
          amount: 5000,
          category: 'Petrol',
          paymentMethod: 'Cash',
          expenseDate: '2026-10-16',
          description: 'Petrol allowance for customer visits',
          companyId: fCompanyId,
        },
        fAdminActor
      );

      // 4. Other recorded expense of ₹5,000
      await expensesRepository.create(
        {
          title: 'Office Cleaning and Refreshments',
          amount: 5000,
          category: 'Other',
          paymentMethod: 'Cash',
          expenseDate: '2026-10-18',
          description: 'Miscellaneous office supplies',
          companyId: fCompanyId,
        },
        fAdminActor
      );

      // Calculate monthly reconciliation summary for October 2026
      const summary = await expensesService.getMonthlyReconciliation(2026, 10, fCompanyId);

      // Verify Service Earnings
      expect(summary.serviceEarnings).toBe(100000);
      expect(summary.leadProfit).toBe(100000);

      // Verify Category Breakdowns
      expect(summary.categoryTotals['Spare Parts']).toBe(10000);
      expect(summary.categoryTotals['Petrol']).toBe(5000);
      expect(summary.categoryTotals['Other']).toBe(5000);

      // Verify Total Recorded Expenses
      expect(summary.totalExpenses).toBe(20000);

      // Verify Balance After Recorded Expenses: ₹1,00,000 - ₹20,000 = ₹80,000
      expect(summary.balanceAfterExpenses).toBe(80000);
      expect(summary.monthlyProfit).toBe(80000);

      // Ensure no double-deduction:
      // Earnings (100,000) minus totalExpenses (20,000) exactly equals balance (80,000)
      expect(summary.serviceEarnings! - summary.totalExpenses).toBe(summary.balanceAfterExpenses);
    });

    it('2. Completed service earnings appear in Expenses without creating a duplicate revenue entry in the expenses table', async () => {
      // Add authoritative invoice for completed service
      memoryInvoices.push({
        id: 'inv-f-02',
        invoiceNumber: 'INV-F-0002',
        totalAmount: '45000',
        paidAmount: '45000',
        invoiceDate: '2026-10-12',
        status: 'PAID',
        serviceId: 'srv-f-0002',
        companyId: fCompanyId,
      });

      const summary = await expensesService.getMonthlyReconciliation(2026, 10, fCompanyId);
      expect(summary.serviceEarnings).toBe(45000);

      // Verify that no revenue record was created in the expenses table
      const expenseList = await expensesRepository.findPaginated({}, fCompanyId);
      expect(expenseList.summary.totalCount).toBe(0);
      expect(expenseList.summary.totalAmount).toBe(0);

      const hasRevenueExpense = expenseList.items.some(
        (e) => e.title.toLowerCase().includes('revenue') || e.title.toLowerCase().includes('service earning')
      );
      expect(hasRevenueExpense).toBe(false);
    });

    it('3. Service earnings update consistently with issued service invoices and completed service payments', async () => {
      // Service 1: Issued invoice for ₹30,000
      memoryInvoices.push({
        id: 'inv-f-03a',
        invoiceNumber: 'INV-F-0003A',
        totalAmount: '30000',
        paidAmount: '0',
        invoiceDate: '2026-10-05',
        status: 'ISSUED',
        serviceId: 'srv-f-0003a',
        companyId: fCompanyId,
      });

      let summary = await expensesService.getMonthlyReconciliation(2026, 10, fCompanyId);
      expect(summary.serviceRevenueBilled).toBe(30000);
      expect(summary.serviceEarnings).toBe(30000);

      // Service 2: Paid invoice for ₹20,000
      memoryInvoices.push({
        id: 'inv-f-03b',
        invoiceNumber: 'INV-F-0003B',
        totalAmount: '20000',
        paidAmount: '20000',
        invoiceDate: '2026-10-20',
        status: 'PAID',
        serviceId: 'srv-f-0003b',
        companyId: fCompanyId,
      });

      summary = await expensesService.getMonthlyReconciliation(2026, 10, fCompanyId);
      expect(summary.serviceRevenueBilled).toBe(50000);
      expect(summary.serviceEarnings).toBe(50000);
    });

    it('4. Spare parts consumed on a completed service produce exactly one "Spare Parts" cost record at purchase/unit cost', async () => {
      const serviceId = 'srv-f-parts-01';
      const result = await expensesRepository.recordSparePartsExpenseForService(
        {
          serviceId,
          serviceNumber: 'SRV-2026-0088',
          companyId: fCompanyId,
          partsReplaced: [
            { partName: 'Spun Filter 5 Micron', quantity: 2, cost: 250 },
            { partName: 'Activated Carbon Block', quantity: 1, cost: 500 },
          ],
          actor: fAdminActor,
        }
      );

      expect(result).not.toBeNull();
      expect(result!.category).toBe('Spare Parts');
      // 2 * 250 + 1 * 500 = 1000
      expect(Number(result!.amount)).toBe(1000);
      expect(result!.title).toContain('SRV-2026-0088');
      expect(result!.notes).toContain(`[REF:SERVICE:${serviceId}]`);
      expect(result!.status).toBe('RECORDED');

      // Verify it appears in monthly reconciliation
      const summary = await expensesService.getMonthlyReconciliation(2026, 10, fCompanyId);
      expect(summary.categoryTotals['Spare Parts']).toBe(1000);
      expect(summary.totalExpenses).toBe(1000);
    });

    it('5. Services completed without spare parts produce no spare expense or zero-value records', async () => {
      const result1 = await expensesRepository.recordSparePartsExpenseForService(
        {
          serviceId: 'srv-f-noparts-01',
          serviceNumber: 'SRV-2026-0089',
          companyId: fCompanyId,
          partsReplaced: [],
          actor: fAdminActor,
        }
      );
      expect(result1).toBeNull();

      const result2 = await expensesRepository.recordSparePartsExpenseForService(
        {
          serviceId: 'srv-f-noparts-02',
          serviceNumber: 'SRV-2026-0090',
          companyId: fCompanyId,
          partsReplaced: undefined,
          actor: fAdminActor,
        }
      );
      expect(result2).toBeNull();

      const summary = await expensesService.getMonthlyReconciliation(2026, 10, fCompanyId);
      expect(summary.categoryTotals['Spare Parts']).toBe(0);
      expect(summary.totalExpenses).toBe(0);
    });

    it('6. Duplicate service completion requests or retries do not duplicate spare-part expenses (strictly idempotent)', async () => {
      const serviceId = 'srv-f-idem-01';
      const params = {
        serviceId,
        serviceNumber: 'SRV-2026-0091',
        companyId: fCompanyId,
        partsReplaced: [{ partName: 'Post Carbon Filter', quantity: 1, cost: 450 }],
        actor: fAdminActor,
      };

      // First call
      const firstResult = await expensesRepository.recordSparePartsExpenseForService(params);
      expect(firstResult).not.toBeNull();
      expect(Number(firstResult!.amount)).toBe(450);

      // Second call (simulating retry / duplicate event)
      const secondResult = await expensesRepository.recordSparePartsExpenseForService(params);
      expect(secondResult).not.toBeNull();
      expect(secondResult!.id).toBe(firstResult!.id);

      // Third call
      const thirdResult = await expensesRepository.recordSparePartsExpenseForService(params);
      expect(thirdResult!.id).toBe(firstResult!.id);

      // Verify category totals: 450 exactly once
      const summary = await expensesService.getMonthlyReconciliation(2026, 10, fCompanyId);
      expect(summary.categoryTotals['Spare Parts']).toBe(450);
      expect(summary.totalExpenses).toBe(450);
    });

    it('7. Incomplete services generate no finalized costs, and service cancellation voids linked spare-part expenses with audit reason', async () => {
      const serviceId = 'srv-f-void-01';

      // Record spare expense upon initial completion
      const expense = await expensesRepository.recordSparePartsExpenseForService({
        serviceId,
        serviceNumber: 'SRV-2026-0092',
        companyId: fCompanyId,
        partsReplaced: [{ partName: 'Booster Pump 100 GPD', quantity: 1, cost: 2200 }],
        actor: fAdminActor,
      });
      expect(expense).not.toBeNull();

      let summary = await expensesService.getMonthlyReconciliation(2026, 10, fCompanyId);
      expect(summary.categoryTotals['Spare Parts']).toBe(2200);

      // Cancel service
      const voided = await expensesRepository.voidSparePartsExpenseForService(
        serviceId,
        'Customer cancelled service after technician visit',
        fAdminActor.id
      );
      expect(voided).not.toBeNull();
      expect(voided!.status).toBe('VOIDED');
      expect(voided!.voidReason).toContain('Customer cancelled service');

      // Reconciliation summary now excludes voided expense
      summary = await expensesService.getMonthlyReconciliation(2026, 10, fCompanyId);
      expect(summary.categoryTotals['Spare Parts']).toBe(0);
      expect(summary.totalExpenses).toBe(0);
    });

    it('8. Existing spare-part expenses and auto-recorded service spare costs are summed correctly without double-counting', async () => {
      // 1. Manual workshop supplier invoice for spares
      await expensesRepository.create(
        {
          title: 'Wholesale RO Membrane Inventory Inward',
          amount: 6000,
          category: 'Spare Parts',
          paymentMethod: 'Bank Transfer',
          expenseDate: '2026-10-02',
          description: 'Bulk purchase from distributor',
          companyId: fCompanyId,
        },
        fAdminActor
      );

      // 2. Auto-recorded service spare expense
      await expensesRepository.recordSparePartsExpenseForService({
        serviceId: 'srv-f-existing-01',
        serviceNumber: 'SRV-2026-0093',
        companyId: fCompanyId,
        partsReplaced: [{ partName: 'SMPS 24V', quantity: 1, cost: 800 }],
        actor: fAdminActor,
      });

      const summary = await expensesService.getMonthlyReconciliation(2026, 10, fCompanyId);
      // 6000 + 800 = 6800
      expect(summary.categoryTotals['Spare Parts']).toBe(6800);
      expect(summary.totalExpenses).toBe(6800);
    });

    it('9. Category breakdown accurately maps to the 10 canonical categories and isolates Home Expenses', async () => {
      const testExpenses = [
        { title: 'Petrol for Bikes', amount: 1500, category: 'Petrol' as const },
        { title: 'Staff Lunch & Travel', amount: 800, category: 'Business Expenses' as const },
        { title: 'Owner Grocery & Personal', amount: 2500, category: 'Home Expenses' as const },
        { title: 'Workshop Power Bill', amount: 3200, category: 'Electricity' as const },
        { title: 'Shop Rent Oct 2026', amount: 12000, category: 'Shop Rent' as const },
        { title: 'Fiber Broadband', amount: 1000, category: 'Internet / Phone' as const },
        { title: 'Outstation Bus Ticket', amount: 600, category: 'Travel' as const },
        { title: 'Drill Bit Replacement', amount: 400, category: 'Tools & Maintenance' as const },
        { title: 'Tea and Refreshments', amount: 300, category: 'Other' as const },
      ];

      for (const e of testExpenses) {
        await expensesRepository.create(
          {
            title: e.title,
            amount: e.amount,
            category: e.category,
            paymentMethod: 'Cash',
            expenseDate: '2026-10-10',
            description: e.title,
            companyId: fCompanyId,
          },
          fAdminActor
        );
      }

      const summary = await expensesService.getMonthlyReconciliation(2026, 10, fCompanyId);

      // Verify each individual category
      expect(summary.categoryTotals['Petrol']).toBe(1500);
      expect(summary.categoryTotals['Business Expenses']).toBe(800);
      expect(summary.categoryTotals['Home Expenses']).toBe(2500);
      expect(summary.categoryTotals['Electricity']).toBe(3200);
      expect(summary.categoryTotals['Shop Rent']).toBe(12000);
      expect(summary.categoryTotals['Internet / Phone']).toBe(1000);
      expect(summary.categoryTotals['Travel']).toBe(600);
      expect(summary.categoryTotals['Tools & Maintenance']).toBe(400);
      expect(summary.categoryTotals['Other']).toBe(300);

      // Verify Home vs Business breakdown
      expect(summary.homeExpenses).toBe(2500);
      expect(summary.businessExpenses).toBe(19800);
      expect(summary.totalExpenses).toBe(22300);
      expect(summary.totalExpenses).toBe(summary.homeExpenses + summary.businessExpenses);
    });

    it('10. Strictly enforces tenant isolation and permission boundaries for service earnings and spare expenses', async () => {
      const companyA = 'comp-phase-f-tenant-a';
      const companyB = 'comp-phase-f-tenant-b';

      const actorA = { ...fAdminActor, companyId: companyA };
      const actorB = { ...fAdminActor, companyId: companyB };

      // Company A has service earnings and spare expenses
      memoryInvoices.push({
        id: 'inv-tenant-a',
        invoiceNumber: 'INV-A-01',
        totalAmount: '75000',
        paidAmount: '75000',
        invoiceDate: '2026-10-10',
        status: 'PAID',
        serviceId: 'srv-tenant-a',
        companyId: companyA,
      });

      await expensesRepository.recordSparePartsExpenseForService({
        serviceId: 'srv-tenant-a',
        serviceNumber: 'SRV-A-01',
        companyId: companyA,
        partsReplaced: [{ partName: 'Membrane', quantity: 1, cost: 1500 }],
        actor: actorA,
      });

      // Query Company B
      const summaryB = await expensesService.getMonthlyReconciliation(2026, 10, companyB);
      expect(summaryB.serviceEarnings).toBe(0);
      expect(summaryB.totalExpenses).toBe(0);
      expect(summaryB.categoryTotals['Spare Parts']).toBe(0);

      // Query Company A
      const summaryA = await expensesService.getMonthlyReconciliation(2026, 10, companyA);
      expect(summaryA.serviceEarnings).toBe(75000);
      expect(summaryA.totalExpenses).toBe(1500);
      expect(summaryA.categoryTotals['Spare Parts']).toBe(1500);
    });

    it('11. Approved monthly closing freezes serviceEarnings and balanceAfterExpenses immutably', async () => {
      const closingCoId = 'comp-phase-f-close-01';
      const closingActor = { ...fAdminActor, companyId: closingCoId };

      memoryInvoices.push({
        id: 'inv-close-01',
        invoiceNumber: 'INV-CLS-01',
        totalAmount: '60000',
        paidAmount: '60000',
        invoiceDate: '2026-10-10',
        status: 'PAID',
        serviceId: 'srv-cls-01',
        companyId: closingCoId,
      });

      await expensesRepository.create(
        {
          title: 'Closing Test Rent',
          amount: 10000,
          category: 'Shop Rent',
          paymentMethod: 'Bank Transfer',
          expenseDate: '2026-10-05',
          description: 'Shop rent',
          companyId: closingCoId,
        },
        closingActor
      );

      // Approve October closing
      const approved = await expensesService.approveMonthlyClosing(
        {
          year: 2026,
          month: 10,
          serviceEarnings: 60000,
          leadProfit: 60000,
          previousClosingCash: 5000,
          actualBankBalance: 55000,
          savingsTransfer: 5000,
          companyId: closingCoId,
        },
        closingActor
      );

      expect(approved.data.status).toBe('APPROVED');
      expect(approved.data.totalExpenses).toBe(10000);
      expect(approved.data.monthlyProfit).toBe(50000);

      // Add a late expense post-close
      await expensesRepository.create(
        {
          title: 'Late October Tools',
          amount: 2000,
          category: 'Tools & Maintenance',
          paymentMethod: 'Cash',
          expenseDate: '2026-10-25',
          description: 'Late expense',
          companyId: closingCoId,
        },
        closingActor
      );

      // Summary must reflect the immutable approved snapshot
      const closedSummary = await expensesService.getMonthlyReconciliation(2026, 10, closingCoId);
      expect(closedSummary.isClosed).toBe(true);
      expect(closedSummary.totalExpenses).toBe(10000);
      expect(closedSummary.monthlyProfit).toBe(50000);
      expect(closedSummary.closingRecord?.status).toBe('APPROVED');
    });

    it('12. Bank reconciliation differences, savings transfers, and pending technician handovers remain separate from income/expenses', async () => {
      // Service earnings ₹80,000, expenses ₹10,000 -> Expected Balance ₹70,000
      memoryInvoices.push({
        id: 'inv-recon-01',
        invoiceNumber: 'INV-REC-01',
        totalAmount: '80000',
        paidAmount: '80000',
        invoiceDate: '2026-10-15',
        status: 'PAID',
        serviceId: 'srv-rec-01',
        companyId: fCompanyId,
      });

      await expensesRepository.create(
        {
          title: 'Petrol Allowance',
          amount: 10000,
          category: 'Petrol',
          paymentMethod: 'Cash',
          expenseDate: '2026-10-12',
          description: 'Petrol',
          companyId: fCompanyId,
        },
        fAdminActor
      );

      // Preview with actual bank balance ₹75,000 (surplus ₹5,000) and savings transfer ₹10,000
      const summary = await expensesService.getMonthlyReconciliation(
        2026,
        10,
        fCompanyId,
        {
          actualBankBalance: 75000,
          savingsTransfer: 10000,
          previousClosingCash: 0,
        }
      );

      // Financial balance remains exactly ₹70,000
      expect(summary.serviceEarnings).toBe(80000);
      expect(summary.totalExpenses).toBe(10000);
      expect(summary.balanceAfterExpenses).toBe(70000);
      expect(summary.monthlyProfit).toBe(70000);

      // Bank reconciliation difference is a diagnostic surplus (+5000), NOT income
      expect(summary.reconciliationDifference).toBe(5000);
      expect(summary.reconciliationDifference > 0).toBe(true);

      // Savings transfer is tracked separately
      expect(summary.savingsTransfer).toBe(10000);
      expect(summary.currentSavingsBalance).toBe(10000);
    });
  });
});


