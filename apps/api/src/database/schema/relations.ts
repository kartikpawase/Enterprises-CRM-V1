import { relations } from 'drizzle-orm';
import { users, roles, permissions, rolePermissions } from './users';
import { customers, customerAddresses } from './customers';
import { products } from './products';
import { customerAssets } from './assets';
import { sales, saleItems } from './sales';
import { invoices, invoiceItems } from './invoices';
import { payments } from './payments';
import { warranties, warrantyEvents } from './warranties';
import { services, serviceSchedules } from './services';
import { jobCards } from './job-cards';
import { technicians } from './technicians';
import { inquiries, inquiryEvents } from './inquiries';
import {
  whatsappContacts,
  whatsappConversations,
  whatsappMessages,
} from './whatsapp';
import { notifications } from './notifications';
import { customerActivities } from './activities';
import { auditLogs } from './audit';
import { documents } from './documents';
import { rentals, rentalPayments, rentalEvents } from './rentals';
import { cashHandovers } from './cash-handovers';
import { expenses, expenseSchedules, monthlyClosings } from './expenses';

/**
 * Users & RBAC Relations
 */
export const usersRelations = relations(users, ({ one, many }) => ({
  technician: one(technicians, {
    fields: [users.id],
    references: [technicians.userId],
  }),
  notifications: many(notifications),
  auditLogs: many(auditLogs),
  createdCustomers: many(customers),
  createdSales: many(sales),
  createdInvoices: many(invoices),
  createdPayments: many(payments),
  createdServices: many(services),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, {
    fields: [rolePermissions.roleId],
    references: [roles.id],
  }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}));

/**
 * Customers Relations
 */
export const customersRelations = relations(customers, ({ one, many }) => ({
  addresses: many(customerAddresses),
  assets: many(customerAssets),
  sales: many(sales),
  invoices: many(invoices),
  payments: many(payments),
  warranties: many(warranties),
  services: many(services),
  serviceSchedules: many(serviceSchedules),
  jobCards: many(jobCards),
  activities: many(customerActivities),
  createdByUser: one(users, {
    fields: [customers.createdBy],
    references: [users.id],
  }),
  inquiries: many(inquiries),
  whatsappContacts: many(whatsappContacts),
  whatsappConversations: many(whatsappConversations),
  rentals: many(rentals),
  rentalPayments: many(rentalPayments),
}));

export const customerAddressesRelations = relations(customerAddresses, ({ one }) => ({
  customer: one(customers, {
    fields: [customerAddresses.customerId],
    references: [customers.id],
  }),
}));

/**
 * Products Relations
 */
export const productsRelations = relations(products, ({ many }) => ({
  assets: many(customerAssets),
  saleItems: many(saleItems),
  invoiceItems: many(invoiceItems),
}));

/**
 * Assets Relations
 */
export const customerAssetsRelations = relations(customerAssets, ({ one, many }) => ({
  customer: one(customers, {
    fields: [customerAssets.customerId],
    references: [customers.id],
  }),
  product: one(products, {
    fields: [customerAssets.productId],
    references: [products.id],
  }),
  installationAddress: one(customerAddresses, {
    fields: [customerAssets.installationAddressId],
    references: [customerAddresses.id],
  }),
  warranties: many(warranties),
  warrantyEvents: many(warrantyEvents),
  services: many(services),
  serviceSchedules: many(serviceSchedules),
  jobCards: many(jobCards),
}));

/**
 * Sales Relations
 */
export const salesRelations = relations(sales, ({ one, many }) => ({
  customer: one(customers, {
    fields: [sales.customerId],
    references: [customers.id],
  }),
  items: many(saleItems),
  invoices: many(invoices),
  warranties: many(warranties),
  createdByUser: one(users, {
    fields: [sales.createdBy],
    references: [users.id],
  }),
}));

export const saleItemsRelations = relations(saleItems, ({ one }) => ({
  sale: one(sales, {
    fields: [saleItems.saleId],
    references: [sales.id],
  }),
  product: one(products, {
    fields: [saleItems.productId],
    references: [products.id],
  }),
}));

/**
 * Invoices & Payments Relations
 */
export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  customer: one(customers, {
    fields: [invoices.customerId],
    references: [customers.id],
  }),
  sale: one(sales, {
    fields: [invoices.saleId],
    references: [sales.id],
  }),
  items: many(invoiceItems),
  payments: many(payments),
  createdByUser: one(users, {
    fields: [invoices.createdBy],
    references: [users.id],
  }),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceItems.invoiceId],
    references: [invoices.id],
  }),
  product: one(products, {
    fields: [invoiceItems.productId],
    references: [products.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  customer: one(customers, {
    fields: [payments.customerId],
    references: [customers.id],
  }),
  invoice: one(invoices, {
    fields: [payments.invoiceId],
    references: [invoices.id],
  }),
  createdByUser: one(users, {
    fields: [payments.createdBy],
    references: [users.id],
  }),
  cashHandover: one(cashHandovers, {
    fields: [payments.id],
    references: [cashHandovers.paymentId],
  }),
}));

export const cashHandoversRelations = relations(cashHandovers, ({ one }) => ({
  payment: one(payments, {
    fields: [cashHandovers.paymentId],
    references: [payments.id],
  }),
  service: one(services, {
    fields: [cashHandovers.serviceId],
    references: [services.id],
  }),
  jobCard: one(jobCards, {
    fields: [cashHandovers.jobCardId],
    references: [jobCards.id],
  }),
  technician: one(technicians, {
    fields: [cashHandovers.technicianId],
    references: [technicians.id],
  }),
  receivedByUser: one(users, {
    fields: [cashHandovers.receivedBy],
    references: [users.id],
  }),
}));

/**
 * Warranties Relations
 */
export const warrantiesRelations = relations(warranties, ({ one, many }) => ({
  customer: one(customers, {
    fields: [warranties.customerId],
    references: [customers.id],
  }),
  asset: one(customerAssets, {
    fields: [warranties.assetId],
    references: [customerAssets.id],
  }),
  sale: one(sales, {
    fields: [warranties.saleId],
    references: [sales.id],
  }),
  events: many(warrantyEvents),
  serviceSchedules: many(serviceSchedules),
  services: many(services),
}));

export const warrantyEventsRelations = relations(warrantyEvents, ({ one }) => ({
  warranty: one(warranties, {
    fields: [warrantyEvents.warrantyId],
    references: [warranties.id],
  }),
  customer: one(customers, {
    fields: [warrantyEvents.customerId],
    references: [customers.id],
  }),
  asset: one(customerAssets, {
    fields: [warrantyEvents.assetId],
    references: [customerAssets.id],
  }),
  replacementAsset: one(customerAssets, {
    fields: [warrantyEvents.replacementAssetId],
    references: [customerAssets.id],
  }),
  actor: one(users, {
    fields: [warrantyEvents.actorId],
    references: [users.id],
  }),
}));

/**
 * Services & Job Cards Relations
 */
export const servicesRelations = relations(services, ({ one }) => ({
  customer: one(customers, {
    fields: [services.customerId],
    references: [customers.id],
  }),
  asset: one(customerAssets, {
    fields: [services.assetId],
    references: [customerAssets.id],
  }),
  warranty: one(warranties, {
    fields: [services.warrantyId],
    references: [warranties.id],
  }),
  technician: one(technicians, {
    fields: [services.technicianId],
    references: [technicians.id],
  }),
  jobCard: one(jobCards, {
    fields: [services.id],
    references: [jobCards.serviceId],
  }),
  createdByUser: one(users, {
    fields: [services.createdBy],
    references: [users.id],
  }),
}));

export const serviceSchedulesRelations = relations(serviceSchedules, ({ one }) => ({
  customer: one(customers, {
    fields: [serviceSchedules.customerId],
    references: [customers.id],
  }),
  asset: one(customerAssets, {
    fields: [serviceSchedules.assetId],
    references: [customerAssets.id],
  }),
  warranty: one(warranties, {
    fields: [serviceSchedules.warrantyId],
    references: [warranties.id],
  }),
  generatedService: one(services, {
    fields: [serviceSchedules.generatedServiceId],
    references: [services.id],
  }),
}));

export const jobCardsRelations = relations(jobCards, ({ one }) => ({
  service: one(services, {
    fields: [jobCards.serviceId],
    references: [services.id],
  }),
  customer: one(customers, {
    fields: [jobCards.customerId],
    references: [customers.id],
  }),
  asset: one(customerAssets, {
    fields: [jobCards.assetId],
    references: [customerAssets.id],
  }),
  technician: one(technicians, {
    fields: [jobCards.technicianId],
    references: [technicians.id],
  }),
}));

export const techniciansRelations = relations(technicians, ({ one, many }) => ({
  user: one(users, {
    fields: [technicians.userId],
    references: [users.id],
  }),
  services: many(services),
  jobCards: many(jobCards),
}));

/**
 * Inquiries Relations
 */
export const inquiriesRelations = relations(inquiries, ({ one, many }) => ({
  assignedToUser: one(users, {
    fields: [inquiries.assignedToUserId],
    references: [users.id],
  }),
  assignedByUser: one(users, {
    fields: [inquiries.assignedByUserId],
    references: [users.id],
  }),
  convertedCustomer: one(customers, {
    fields: [inquiries.convertedCustomerId],
    references: [customers.id],
  }),
  convertedByUser: one(users, {
    fields: [inquiries.convertedByUserId],
    references: [users.id],
  }),
  events: many(inquiryEvents),
}));

export const inquiryEventsRelations = relations(inquiryEvents, ({ one }) => ({
  inquiry: one(inquiries, {
    fields: [inquiryEvents.inquiryId],
    references: [inquiries.id],
  }),
  actorUser: one(users, {
    fields: [inquiryEvents.actorUserId],
    references: [users.id],
  }),
}));

/**
 * WhatsApp Business Relations
 */
export const whatsappContactsRelations = relations(whatsappContacts, ({ one, many }) => ({
  customer: one(customers, {
    fields: [whatsappContacts.customerId],
    references: [customers.id],
  }),
  conversations: many(whatsappConversations),
  messages: many(whatsappMessages),
}));

export const whatsappConversationsRelations = relations(whatsappConversations, ({ one, many }) => ({
  customer: one(customers, {
    fields: [whatsappConversations.customerId],
    references: [customers.id],
  }),
  contact: one(whatsappContacts, {
    fields: [whatsappConversations.contactId],
    references: [whatsappContacts.id],
  }),
  messages: many(whatsappMessages),
}));

export const whatsappMessagesRelations = relations(whatsappMessages, ({ one }) => ({
  conversation: one(whatsappConversations, {
    fields: [whatsappMessages.conversationId],
    references: [whatsappConversations.id],
  }),
  contact: one(whatsappContacts, {
    fields: [whatsappMessages.contactId],
    references: [whatsappContacts.id],
  }),
  sender: one(users, {
    fields: [whatsappMessages.sentByUserId],
    references: [users.id],
  }),
}));

/**
 * Notifications, Activities, Audit & Documents Relations
 */
export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

export const customerActivitiesRelations = relations(customerActivities, ({ one }) => ({
  customer: one(customers, {
    fields: [customerActivities.customerId],
    references: [customers.id],
  }),
  actor: one(users, {
    fields: [customerActivities.actorId],
    references: [users.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, {
    fields: [auditLogs.actorId],
    references: [users.id],
  }),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  uploadedByUser: one(users, {
    fields: [documents.uploadedByUserId],
    references: [users.id],
  }),
}));

/**
 * Rentals Relations
 */
export const rentalsRelations = relations(rentals, ({ one, many }) => ({
  customer: one(customers, {
    fields: [rentals.customerId],
    references: [customers.id],
  }),
  technician: one(technicians, {
    fields: [rentals.technicianId],
    references: [technicians.id],
  }),
  createdByUser: one(users, {
    fields: [rentals.createdBy],
    references: [users.id],
  }),
  payments: many(rentalPayments),
  events: many(rentalEvents),
}));

export const rentalPaymentsRelations = relations(rentalPayments, ({ one }) => ({
  rental: one(rentals, {
    fields: [rentalPayments.rentalId],
    references: [rentals.id],
  }),
  customer: one(customers, {
    fields: [rentalPayments.customerId],
    references: [customers.id],
  }),
  recordedByUser: one(users, {
    fields: [rentalPayments.recordedBy],
    references: [users.id],
  }),
}));

export const rentalEventsRelations = relations(rentalEvents, ({ one }) => ({
  rental: one(rentals, {
    fields: [rentalEvents.rentalId],
    references: [rentals.id],
  }),
}));

/**
 * Expenses & Cash Management Relations
 */
export const expenseSchedulesRelations = relations(expenseSchedules, ({ one, many }) => ({
  createdByUser: one(users, {
    fields: [expenseSchedules.createdBy],
    references: [users.id],
  }),
  expenses: many(expenses),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
  recordedByUser: one(users, {
    fields: [expenses.recordedBy],
    references: [users.id],
  }),
  voidedByUser: one(users, {
    fields: [expenses.voidedBy],
    references: [users.id],
  }),
  recurringSchedule: one(expenseSchedules, {
    fields: [expenses.recurringScheduleId],
    references: [expenseSchedules.id],
  }),
}));

export const monthlyClosingsRelations = relations(monthlyClosings, ({ one }) => ({
  approvedByUser: one(users, {
    fields: [monthlyClosings.approvedBy],
    references: [users.id],
  }),
}));
