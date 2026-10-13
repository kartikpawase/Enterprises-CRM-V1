import { expensesRepository, type ActorUserInfo } from './expenses.repository';
import type {
  CreateExpenseInput,
  UpdateExpenseInput,
  ExpenseQueryFilter,
  VoidExpenseInput,
  CreateExpenseScheduleInput,
  SaveMonthlyClosingDraftInput,
  ApproveMonthlyClosingInput,
} from '@crm/validation';
import type {
  ExpenseItem,
  ExpenseScheduleItem,
  ExpensesOverviewSummary,
  MonthlyClosingRecord,
  MonthlyReconciliationSummary,
} from '@crm/types';
import { HTTP_STATUS } from '@crm/shared';

export class ExpensesService {
  async getOverview(
    companyId?: string | null,
    dateRange?: { startDate?: string; endDate?: string }
  ): Promise<ExpensesOverviewSummary> {
    return expensesRepository.getOverview(companyId, dateRange);
  }

  async getExpenses(filters: ExpenseQueryFilter, companyId?: string | null) {
    return expensesRepository.findPaginated(filters, companyId);
  }

  async getExpenseById(id: string): Promise<ExpenseItem> {
    const item = await expensesRepository.findById(id);
    if (!item) {
      const err: any = new Error('Expense record not found');
      err.statusCode = HTTP_STATUS.NOT_FOUND;
      throw err;
    }
    return item;
  }

  async createExpense(
    input: CreateExpenseInput,
    actor: ActorUserInfo
  ): Promise<{ success: boolean; data: ExpenseItem; message: string }> {
    this.assertNotTechnician(actor);
    const item = await expensesRepository.create(input, actor);
    return {
      success: true,
      data: item,
      message: 'Expense recorded successfully.',
    };
  }

  async updateExpense(
    id: string,
    input: UpdateExpenseInput,
    actor: ActorUserInfo
  ): Promise<{ success: boolean; data: ExpenseItem; message: string }> {
    this.assertNotTechnician(actor);
    const item = await expensesRepository.update(id, input, actor);
    return {
      success: true,
      data: item,
      message: 'Expense updated successfully.',
    };
  }

  async voidExpense(
    id: string,
    input: VoidExpenseInput,
    actor: ActorUserInfo
  ): Promise<{ success: boolean; data: ExpenseItem; message: string }> {
    this.assertNotTechnician(actor);
    const item = await expensesRepository.voidExpense(id, input.reason, actor);
    return {
      success: true,
      data: item,
      message: 'Expense voided successfully.',
    };
  }

  async getSchedules(companyId?: string | null): Promise<ExpenseScheduleItem[]> {
    return expensesRepository.findSchedules(companyId);
  }

  async createSchedule(
    input: CreateExpenseScheduleInput,
    actor: ActorUserInfo
  ): Promise<{ success: boolean; data: ExpenseScheduleItem; message: string }> {
    this.assertNotTechnician(actor);
    const item = await expensesRepository.createSchedule(input, actor);
    return {
      success: true,
      data: item,
      message: 'Recurring expense schedule configured successfully.',
    };
  }

  async toggleSchedule(
    id: string,
    isActive: boolean,
    actor: ActorUserInfo
  ): Promise<{ success: boolean; data: ExpenseScheduleItem; message: string }> {
    this.assertNotTechnician(actor);
    const item = await expensesRepository.toggleSchedule(id, isActive, actor);
    return {
      success: true,
      data: item,
      message: `Schedule ${isActive ? 'activated' : 'paused'} successfully.`,
    };
  }

  async recordOccurrence(
    scheduleId: string,
    occurrencePeriod: string,
    expenseDateStr: string,
    actor: ActorUserInfo,
    notes?: string | null
  ): Promise<{ success: boolean; data: ExpenseItem; message: string }> {
    this.assertNotTechnician(actor);
    const item = await expensesRepository.recordOccurrence(
      scheduleId,
      occurrencePeriod,
      expenseDateStr,
      actor,
      notes
    );
    return {
      success: true,
      data: item,
      message: `Recorded scheduled expense occurrence for ${occurrencePeriod}.`,
    };
  }

  async getMonthlyReconciliation(
    year: number,
    month: number,
    companyId?: string | null,
    overrides?: {
      leadProfit?: number;
      actualBankBalance?: number;
      savingsTransfer?: number;
      previousClosingCash?: number;
      previousSavingsBalance?: number;
    }
  ): Promise<MonthlyReconciliationSummary> {
    return expensesRepository.calculateReconciliationSummary(
      year,
      month,
      companyId,
      overrides
    );
  }

  async saveMonthlyClosingDraft(
    input: SaveMonthlyClosingDraftInput,
    actor: ActorUserInfo
  ): Promise<{ success: boolean; data: MonthlyClosingRecord; message: string }> {
    this.assertNotTechnician(actor);

    if (actor.companyId && input.companyId && actor.role !== 'Super Admin' && input.companyId !== actor.companyId) {
      const err: any = new Error('Cross-tenant closing access forbidden');
      err.statusCode = HTTP_STATUS.FORBIDDEN;
      throw err;
    }

    const item = await expensesRepository.saveClosingDraft(input, actor);
    return {
      success: true,
      data: item,
      message: 'Monthly closing draft saved successfully.',
    };
  }

  async approveMonthlyClosing(
    input: ApproveMonthlyClosingInput,
    actor: ActorUserInfo
  ): Promise<{ success: boolean; data: MonthlyClosingRecord; message: string }> {
    this.assertAdmin(actor);

    if (actor.companyId && input.companyId && actor.role !== 'Super Admin' && input.companyId !== actor.companyId) {
      const err: any = new Error('Cross-tenant closing access forbidden');
      err.statusCode = HTTP_STATUS.FORBIDDEN;
      throw err;
    }

    const targetCompanyId =
      actor.role === 'Super Admin' ? (input.companyId ?? actor.companyId ?? null) : (actor.companyId ?? null);

    const summary = await expensesRepository.calculateReconciliationSummary(
      input.year,
      input.month,
      targetCompanyId
    );

    if (summary.isOpeningPeriod && input.previousClosingCash === undefined && !input.confirmOpeningBaseline) {
      const err: any = new Error(
        'Opening baseline balance is unestablished for this period. An explicit authorized opening balance or confirmation is required.'
      );
      err.statusCode = HTTP_STATUS.BAD_REQUEST;
      err.code = 'OPENING_BALANCE_UNESTABLISHED';
      throw err;
    }

    const item = await expensesRepository.approveClosing(input, actor);
    return {
      success: true,
      data: item,
      message: `Monthly closing for ${input.year}-${String(input.month).padStart(2, '0')} approved and finalized.`,
    };
  }

  private assertNotTechnician(actor: ActorUserInfo) {
    const actorId = actor?.id || (actor as any)?.userId;
    if (!actor || !actorId) {
      const err: any = new Error('Authentication required');
      err.statusCode = HTTP_STATUS.UNAUTHORIZED;
      throw err;
    }
    if (String(actor.role || '').toUpperCase() === 'TECHNICIAN') {
      const err: any = new Error('Technicians are not authorized to manage company expenses');
      err.statusCode = HTTP_STATUS.FORBIDDEN;
      throw err;
    }
  }

  private assertAdmin(actor: ActorUserInfo) {
    const actorId = actor?.id || (actor as any)?.userId;
    if (!actor || !actorId) {
      const err: any = new Error('Authentication required');
      err.statusCode = HTTP_STATUS.UNAUTHORIZED;
      throw err;
    }
    const role = String(actor.role || '').trim();
    if (role !== 'Admin' && role !== 'Super Admin') {
      const err: any = new Error('Only authorized administrators can approve monthly closings');
      err.statusCode = HTTP_STATUS.FORBIDDEN;
      throw err;
    }
  }
}

export const expensesService = new ExpensesService();
