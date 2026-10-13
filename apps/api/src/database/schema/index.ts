import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

// Export all Enums
export * from './enums';

// Export all Tables
export * from './users';
export * from './customers';
export * from './products';
export * from './assets';
export * from './sales';
export * from './invoices';
export * from './payments';
export * from './reminders';
export * from './warranties';
export * from './services';
export * from './job-cards';
export * from './technicians';
export * from './inquiries';
export * from './whatsapp';
export * from './notifications';
export * from './email-notifications';
export * from './activities';
export * from './audit';
export * from './documents';
export * from './sequences';
export * from './inventory';
export * from './settings';
export * from './workflows';
export * from './rentals';
export * from './inventory-items';
export * from './chatbot';
export * from './technician-portal';
export * from './cash-handovers';
export * from './expenses';

// Export all Relations
export * from './relations';

// Type Inference Helpers
import { users, roles, permissions, rolePermissions } from './users';
import { customers, customerAddresses, customerCustomLabels } from './customers';
import { products } from './products';
import { customerAssets } from './assets';
import { sales, saleItems } from './sales';
import { invoices, invoiceItems } from './invoices';
import { payments } from './payments';
import { reminders } from './reminders';
import { warranties, warrantyEvents } from './warranties';
import { services, serviceSchedules } from './services';
import { jobCards } from './job-cards';
import { technicians } from './technicians';
import { inquiries, inquiryEvents } from './inquiries';
import {
  whatsappContacts,
  whatsappConversations,
  whatsappMessages,
  whatsappEvents,
} from './whatsapp';
import { notifications } from './notifications';
import { emailNotifications, emailQueue } from './email-notifications';
import { customerActivities } from './activities';
import { auditLogs } from './audit';
import { documents } from './documents';
import { businessSequences } from './sequences';
import { appSettings } from './settings';
import { rentals, rentalPayments, rentalEvents } from './rentals';

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;

export type Role = InferSelectModel<typeof roles>;
export type NewRole = InferInsertModel<typeof roles>;

export type RolePermission = InferSelectModel<typeof rolePermissions>;
export type NewRolePermission = InferInsertModel<typeof rolePermissions>;

export type Permission = InferSelectModel<typeof permissions>;
export type NewPermission = InferInsertModel<typeof permissions>;

export type Customer = InferSelectModel<typeof customers>;
export type NewCustomer = InferInsertModel<typeof customers>;

export type CustomerAddress = InferSelectModel<typeof customerAddresses>;
export type NewCustomerAddress = InferInsertModel<typeof customerAddresses>;

export type CustomerCustomLabel = InferSelectModel<typeof customerCustomLabels>;
export type NewCustomerCustomLabel = InferInsertModel<typeof customerCustomLabels>;

export type Product = InferSelectModel<typeof products>;
export type NewProduct = InferInsertModel<typeof products>;

export type CustomerAsset = InferSelectModel<typeof customerAssets>;
export type NewCustomerAsset = InferInsertModel<typeof customerAssets>;

export type Sale = InferSelectModel<typeof sales>;
export type NewSale = InferInsertModel<typeof sales>;

export type SaleItem = InferSelectModel<typeof saleItems>;
export type NewSaleItem = InferInsertModel<typeof saleItems>;

export type Invoice = InferSelectModel<typeof invoices>;
export type NewInvoice = InferInsertModel<typeof invoices>;

export type InvoiceItem = InferSelectModel<typeof invoiceItems>;
export type NewInvoiceItem = InferInsertModel<typeof invoiceItems>;

export type Payment = InferSelectModel<typeof payments>;
export type NewPayment = InferInsertModel<typeof payments>;

export type Reminder = InferSelectModel<typeof reminders>;
export type NewReminder = InferInsertModel<typeof reminders>;

export type Warranty = InferSelectModel<typeof warranties>;
export type NewWarranty = InferInsertModel<typeof warranties>;

export type WarrantyEvent = InferSelectModel<typeof warrantyEvents>;
export type NewWarrantyEvent = InferInsertModel<typeof warrantyEvents>;

export type Service = InferSelectModel<typeof services>;
export type NewService = InferInsertModel<typeof services>;

export type ServiceSchedule = InferSelectModel<typeof serviceSchedules>;
export type NewServiceSchedule = InferInsertModel<typeof serviceSchedules>;

export type JobCard = InferSelectModel<typeof jobCards>;
export type NewJobCard = InferInsertModel<typeof jobCards>;

export type Technician = InferSelectModel<typeof technicians>;
export type NewTechnician = InferInsertModel<typeof technicians>;

export type Inquiry = InferSelectModel<typeof inquiries>;
export type NewInquiry = InferInsertModel<typeof inquiries>;

export type InquiryEvent = InferSelectModel<typeof inquiryEvents>;
export type NewInquiryEvent = InferInsertModel<typeof inquiryEvents>;

export type WhatsAppContact = InferSelectModel<typeof whatsappContacts>;
export type NewWhatsAppContact = InferInsertModel<typeof whatsappContacts>;

export type WhatsAppConversation = InferSelectModel<typeof whatsappConversations>;
export type NewWhatsAppConversation = InferInsertModel<typeof whatsappConversations>;

export type WhatsAppMessage = InferSelectModel<typeof whatsappMessages>;
export type NewWhatsAppMessage = InferInsertModel<typeof whatsappMessages>;

export type WhatsAppEvent = InferSelectModel<typeof whatsappEvents>;
export type NewWhatsAppEvent = InferInsertModel<typeof whatsappEvents>;

export type Notification = InferSelectModel<typeof notifications>;
export type NewNotification = InferInsertModel<typeof notifications>;

export type CustomerActivity = InferSelectModel<typeof customerActivities>;
export type NewCustomerActivity = InferInsertModel<typeof customerActivities>;

export type AuditLog = InferSelectModel<typeof auditLogs>;
export type NewAuditLog = InferInsertModel<typeof auditLogs>;

export type Document = InferSelectModel<typeof documents>;
export type NewDocument = InferInsertModel<typeof documents>;

export type BusinessSequence = InferSelectModel<typeof businessSequences>;
export type NewBusinessSequence = InferInsertModel<typeof businessSequences>;

export type AppSetting = InferSelectModel<typeof appSettings>;
export type NewAppSetting = InferInsertModel<typeof appSettings>;

export type EmailNotification = InferSelectModel<typeof emailNotifications>;
export type NewEmailNotification = InferInsertModel<typeof emailNotifications>;

export type EmailQueueItem = InferSelectModel<typeof emailQueue>;
export type NewEmailQueueItem = InferInsertModel<typeof emailQueue>;

export type Rental = InferSelectModel<typeof rentals>;
export type NewRental = InferInsertModel<typeof rentals>;

export type RentalPayment = InferSelectModel<typeof rentalPayments>;
export type NewRentalPayment = InferInsertModel<typeof rentalPayments>;

export type RentalEvent = InferSelectModel<typeof rentalEvents>;
export type NewRentalEvent = InferInsertModel<typeof rentalEvents>;


