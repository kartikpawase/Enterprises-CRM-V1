import { pgTable, uuid, text, numeric, timestamp, index } from 'drizzle-orm/pg-core';
import { payments } from './payments';
import { services } from './services';
import { jobCards } from './job-cards';
import { technicians } from './technicians';
import { users } from './users';

/**
 * Cash Handovers Table
 * Tracks physical cash collected by technicians in the field and handed over to company owner/admin.
 * Strictly decoupled from customer payment status (Payment PAID does not imply Cash Handed Over).
 */
export const cashHandovers = pgTable(
  'cash_handovers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    paymentId: uuid('payment_id')
      .notNull()
      .unique()
      .references(() => payments.id, { onDelete: 'restrict' }),
    serviceId: uuid('service_id').references(() => services.id, { onDelete: 'set null' }),
    jobCardId: uuid('job_card_id').references(() => jobCards.id, { onDelete: 'set null' }),
    technicianId: uuid('technician_id')
      .notNull()
      .references(() => technicians.id, { onDelete: 'restrict' }),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    status: text('status').default('PENDING').notNull(), // 'PENDING' | 'RECEIVED'
    collectedAt: timestamp('collected_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    handedOverAt: timestamp('handed_over_at', { withTimezone: true, mode: 'date' }),
    receivedBy: uuid('received_by').references(() => users.id, { onDelete: 'set null' }),
    notes: text('notes'),
    companyId: text('company_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('cash_handovers_payment_id_idx').on(table.paymentId),
    index('cash_handovers_technician_id_idx').on(table.technicianId),
    index('cash_handovers_status_idx').on(table.status),
    index('cash_handovers_service_id_idx').on(table.serviceId),
  ]
);

export type CashHandover = typeof cashHandovers.$inferSelect;
export type NewCashHandover = typeof cashHandovers.$inferInsert;
