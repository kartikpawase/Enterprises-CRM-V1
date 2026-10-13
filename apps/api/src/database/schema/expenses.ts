import {
  pgTable,
  uuid,
  text,
  numeric,
  timestamp,
  boolean,
  integer,
  jsonb,
  index,
  uniqueIndex,
  unique,
} from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * Expense Recurring Schedules Table
 * Models recurring expense rules (Daily, Weekly, Monthly, Yearly)
 * Identifiable occurrences are generated idempotently when due/paid.
 */
export const expenseSchedules = pgTable(
  'expense_schedules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: text('company_id'),
    title: text('title').notNull(),
    category: text('category').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    frequency: text('frequency').notNull(), // 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
    paymentMethod: text('payment_method').notNull(),
    startDate: timestamp('start_date', { withTimezone: true, mode: 'date' }).notNull(),
    endDate: timestamp('end_date', { withTimezone: true, mode: 'date' }),
    nextDueDate: timestamp('next_due_date', { withTimezone: true, mode: 'date' }).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    notes: text('notes'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('expense_schedules_company_id_idx').on(table.companyId),
    index('expense_schedules_is_active_idx').on(table.isActive),
    index('expense_schedules_next_due_date_idx').on(table.nextDueDate),
  ]
);

/**
 * Expenses Table
 * Tracks all operating and overhead expenses (Petrol, Rent, Parts Purchase, Tools, Electricity, etc.)
 * Strictly audited: supports audited edits and voids (soft-delete with reason).
 */
export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: text('company_id'),
    title: text('title').notNull(),
    category: text('category').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    expenseDate: timestamp('expense_date', { withTimezone: true, mode: 'date' }).notNull(),
    paymentMethod: text('payment_method').notNull(), // 'Cash' | 'UPI' | 'Bank Transfer' | 'Card' | 'Other'
    notes: text('notes'),
    status: text('status').default('RECORDED').notNull(), // 'RECORDED' | 'VOIDED'
    recordedBy: uuid('recorded_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    voidedBy: uuid('voided_by').references(() => users.id, { onDelete: 'set null' }),
    voidedAt: timestamp('voided_at', { withTimezone: true, mode: 'date' }),
    voidReason: text('void_reason'),
    recurringScheduleId: uuid('recurring_schedule_id').references(() => expenseSchedules.id, {
      onDelete: 'set null',
    }),
    occurrencePeriod: text('occurrence_period'), // Idempotency key for recurring occurrences (e.g. '2026-10' or '2026-10-09')
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('expenses_company_id_idx').on(table.companyId),
    index('expenses_expense_date_idx').on(table.expenseDate),
    index('expenses_category_idx').on(table.category),
    index('expenses_payment_method_idx').on(table.paymentMethod),
    index('expenses_status_idx').on(table.status),
    index('expenses_schedule_idx').on(table.recurringScheduleId),
    index('expenses_occurrence_period_idx').on(table.occurrencePeriod),
  ]
);

/**
 * Monthly Cash Closings & Reconciliation Snapshots Table
 * Tracks monthly financial closing, bank reconciliation, savings transfers,
 * and immutable Admin-approved carry-forward balances.
 */
export const monthlyClosings = pgTable(
  'monthly_closings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyId: text('company_id'),
    year: integer('year').notNull(),
    month: integer('month').notNull(), // 1 - 12
    leadProfit: numeric('lead_profit', { precision: 12, scale: 2 }).default('0.00').notNull(),
    totalExpenses: numeric('total_expenses', { precision: 12, scale: 2 }).default('0.00').notNull(),
    monthlyProfit: numeric('monthly_profit', { precision: 12, scale: 2 }).default('0.00').notNull(),
    previousClosingCash: numeric('previous_closing_cash', { precision: 12, scale: 2 }).default('0.00').notNull(),
    expectedCashBeforeSavings: numeric('expected_cash_before_savings', { precision: 12, scale: 2 }).default('0.00').notNull(),
    actualBankBalance: numeric('actual_bank_balance', { precision: 12, scale: 2 }).default('0.00').notNull(),
    reconciliationDifference: numeric('reconciliation_difference', { precision: 12, scale: 2 }).default('0.00').notNull(),
    savingsTransfer: numeric('savings_transfer', { precision: 12, scale: 2 }).default('0.00').notNull(),
    closingCash: numeric('closing_cash', { precision: 12, scale: 2 }).default('0.00').notNull(),
    previousSavingsBalance: numeric('previous_savings_balance', { precision: 12, scale: 2 }).default('0.00').notNull(),
    currentSavingsBalance: numeric('current_savings_balance', { precision: 12, scale: 2 }).default('0.00').notNull(),
    status: text('status').default('DRAFT').notNull(), // 'DRAFT' | 'APPROVED'
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true, mode: 'date' }),
    notes: text('notes'),
    categoryBreakdown: jsonb('category_breakdown'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('monthly_closings_company_year_month_idx').on(table.companyId, table.year, table.month),
    unique('monthly_closings_company_year_month_unique')
      .on(table.companyId, table.year, table.month)
      .nullsNotDistinct(),
    index('monthly_closings_status_idx').on(table.status),
  ]
);

export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
export type ExpenseSchedule = typeof expenseSchedules.$inferSelect;
export type NewExpenseSchedule = typeof expenseSchedules.$inferInsert;
export type MonthlyClosing = typeof monthlyClosings.$inferSelect;
export type NewMonthlyClosing = typeof monthlyClosings.$inferInsert;
