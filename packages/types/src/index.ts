/**
 * SR Enterprises CRM - Master Domain Contracts, Types & DTOs
 */

// ==========================================
// 1. RBAC, AUTHENTICATION & SECURITY
// ==========================================

export type UserRole = 'Super Admin' | 'Admin' | 'Staff' | 'Technician';

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export type PermissionKey =
  | 'customers.view'
  | 'customers.create'
  | 'customers.edit'
  | 'customers.delete'
  | 'sales.view'
  | 'sales.create'
  | 'sales.edit'
  | 'sales.confirm'
  | 'sales.cancel'
  | 'invoices.view'
  | 'invoices.create'
  | 'invoices.edit'
  | 'invoices.cancel'
  | 'assets.view'
  | 'assets.create'
  | 'assets.update'
  | 'products.view'
  | 'products.create'
  | 'products.update'
  | 'services.view'
  | 'services.create'
  | 'services.update'
  | 'services.complete'
  | 'payments.view'
  | 'payments.create'
  | 'payments.refund'
  | 'expenses.view'
  | 'expenses.create'
  | 'expenses.edit'
  | 'expenses.delete'
  | 'tasks.view'
  | 'tasks.create'
  | 'tasks.update'
  | 'inquiries.view'
  | 'inquiries.create'
  | 'inquiries.edit'
  | 'inquiries.assign'
  | 'whatsapp.view'
  | 'whatsapp.send'
  | 'whatsapp.manage'
  | 'analytics.view'
  | 'reports.view'
  | 'settings.view'
  | 'settings.manage'
  | 'settings.business.manage'
  | 'settings.tax.manage'
  | 'settings.invoice.manage'
  | 'settings.payment.manage'
  | 'settings.service.manage'
  | 'settings.warranty.manage'
  | 'settings.inventory.manage'
  | 'settings.notification.manage'
  | 'settings.numbering.manage'
  | 'settings.security.manage'
  | 'users.manage'
  | 'data.import.customers'
  | 'data.import.products'
  | 'data.import.assets'
  | 'data.import.inventory'
  | 'data.import.warranties'
  | 'data.export.customers'
  | 'data.export.products'
  | 'data.export.inventory'
  | 'data.export.sales'
  | 'data.export.invoices'
  | 'data.export.payments'
  | 'data.export.services'
  | 'data.export.warranties'
  | 'data.export.job_cards'
  | 'data.export.all'
  | 'system.backup'
  | 'system.restore'
  | 'workflows.view'
  | 'workflows.manage'
  | 'documents.view'
  | 'documents.upload'
  | 'documents.delete'
  | 'documents.manage';

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'ARCHIVE'
  | 'RESTORE'
  | 'LOGIN'
  | 'LOGOUT'
  | 'PASSWORD_CHANGE'
  | 'LOCKOUT_TRIGGERED'
  | 'PERMISSION_CHANGE'
  | 'CANCEL';

export interface UserSession {
  userId: string;
  username: string;
  displayName: string;
  email: string | null;
  role: UserRole;
  sessionId: string;
  createdAt: number;
}

// ==========================================
// 2. HTTP ENVELOPE & OBSERVABILITY
// ==========================================

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  pagination?: PaginationMeta;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface HealthCheckResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  uptimeSeconds: number;
  environment: string;
  version: string;
}

export interface ReadinessCheckResponse {
  status: 'ready' | 'not_ready';
  timestamp: string;
  services: {
    database: 'connected' | 'disconnected' | 'error';
    redis: 'connected' | 'disconnected' | 'error';
  };
}

export type ConnectivityState = 'connected' | 'connecting' | 'offline' | 'syncing' | 'sync_complete' | 'idle';

// ==========================================
// 3. INQUIRIES & LEADS
// ==========================================

export type InquirySource =
  | 'WEBSITE'
  | 'DIRECT'
  | 'DIRECT_CALL'
  | 'PHONE'
  | 'WHATSAPP'
  | 'REFERRAL'
  | 'SOCIAL'
  | 'WALK_IN'
  | 'OTHER';

export type InquiryType =
  | 'NEW_PURCHASE'
  | 'SERVICE'
  | 'REPAIR'
  | 'WARRANTY'
  | 'INSTALLATION'
  | 'PRODUCT_INFORMATION'
  | 'GENERAL';

export type InquiryStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'FOLLOW_UP'
  | 'IN_PROGRESS'
  | 'QUALIFIED'
  | 'CONVERTED'
  | 'CLOSED'
  | 'SPAM';

export type InquiryPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export const INQUIRY_SOURCES: InquirySource[] = [
  'WEBSITE',
  'DIRECT',
  'DIRECT_CALL',
  'PHONE',
  'WHATSAPP',
  'REFERRAL',
  'SOCIAL',
  'WALK_IN',
  'OTHER',
];

export const INQUIRY_TYPES: InquiryType[] = [
  'NEW_PURCHASE',
  'SERVICE',
  'REPAIR',
  'WARRANTY',
  'INSTALLATION',
  'PRODUCT_INFORMATION',
  'GENERAL',
];

export const INQUIRY_STATUSES: InquiryStatus[] = [
  'NEW',
  'CONTACTED',
  'FOLLOW_UP',
  'IN_PROGRESS',
  'QUALIFIED',
  'CONVERTED',
  'CLOSED',
  'SPAM',
];

export const INQUIRY_PRIORITIES: InquiryPriority[] = [
  'LOW',
  'NORMAL',
  'HIGH',
  'URGENT',
];

export type InquiryQueryFilters = {
  status?: InquiryStatus;
  source?: InquirySource;
  inquiryType?: InquiryType;
  priority?: InquiryPriority;
  assignedToUserId?: string;
  search?: string;
  page?: number;
  limit?: number;
  [key: string]: any;
};

export interface InquiryKPIs {
  totalInquiries: number;
  newToday?: number;
  pendingFollowUp?: number;
  convertedThisMonth?: number;
  conversionRatePercent?: number;
  newInquiries?: number;
  followUpDue?: number;
  qualifiedLeads?: number;
  convertedCount?: number;
  conversionRate?: number;
  spamCount?: number;
  [key: string]: any;
}

export interface ConvertInquiryResult {
  success: boolean;
  customerId: string;
  customerNumber: string;
  customerName: string;
  isExistingCustomerLinked: boolean;
}

export interface Inquiry {
  id: string;
  inquiryNumber: string;
  name: string;
  customerName?: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  pincode?: string | null;
  productInterest?: string | null;
  serviceInterest?: string | null;
  inquiryType: InquiryType;
  type?: InquiryType;
  source: InquirySource;
  status: InquiryStatus;
  priority: InquiryPriority;
  message?: string | null;
  assignedToUserId?: string | null;
  assignedToName?: string | null;
  assignedUser?: { id: string; fullName: string; email?: string; phone?: string; role?: string } | null;
  followUpDate?: string | null;
  lastContactedAt?: string | null;
  convertedAt?: string | null;
  convertedCustomerId?: string | null;
  convertedCustomer?: { id: string; customerNumber: string; fullName: string } | null;
  isPossibleDuplicate?: boolean;
  events?: InquiryEvent[];
  createdAt: string;
  updatedAt: string;
  [key: string]: any;
}

export interface InquiryEvent {
  id: string;
  inquiryId: string;
  eventType: string;
  description: string;
  actorUserId?: string | null;
  actorName?: string | null;
  actorUser?: { id: string; fullName: string; email?: string; role?: string } | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  [key: string]: any;
}

// ==========================================
// 4. WHATSAPP BUSINESS
// ==========================================

export type WhatsAppOptInStatus = 'OPTED_IN' | 'OPTED_OUT' | 'UNKNOWN';
export type WhatsAppConversationStatus = 'ACTIVE' | 'CLOSED' | 'ARCHIVED';
export type WhatsAppDirection = 'INBOUND' | 'OUTBOUND';
export type WhatsAppMessageType = 'TEXT' | 'TEMPLATE' | 'IMAGE' | 'DOCUMENT' | 'OTHER';
export type WhatsAppMessageStatus = 'QUEUED' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';

export interface WhatsAppContact {
  id: string;
  phone: string;
  phoneNumber?: string;
  waId?: string | null;
  displayName?: string | null;
  customerId?: string | null;
  customer?: any;
  optInStatus: WhatsAppOptInStatus;
  optInTimestamp?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  [key: string]: any;
}

export interface WhatsAppConversation {
  id: string;
  contactId: string;
  customerId?: string | null;
  customer?: any;
  status: WhatsAppConversationStatus;
  assignedUserId?: string | null;
  lastMessageText?: string | null;
  lastMessagePreview?: string | null;
  lastMessageTimestamp?: Date | string | null;
  lastMessageAt?: Date | string | null;
  unreadCount: number;
  createdAt: Date | string;
  updatedAt: Date | string;
  contact?: WhatsAppContact;
  [key: string]: any;
}

export interface WhatsAppMessage {
  id: string;
  conversationId: string;
  contactId: string;
  direction: WhatsAppDirection;
  messageType: WhatsAppMessageType;
  content: string;
  body?: string | null;
  templateName?: string | null;
  templateParams?: unknown;
  mediaUrl?: string | null;
  providerMessageId?: string | null;
  status: WhatsAppMessageStatus;
  errorCode?: string | null;
  errorMessage?: string | null;
  sentByUserId?: string | null;
  actorUserId?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface WhatsAppEvent {
  id: string;
  messageId: string | null;
  eventType: string;
  payload: Record<string, unknown> | null;
  createdAt: Date | string;
}

export interface WhatsAppTemplateDefinition {
  id: string;
  name: string;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION' | 'TRANSACTIONAL';
  language: string;
  description: string;
  parameterKeys: string[];
  sampleText: string;
}

export interface SendWhatsAppTextMessageDto {
  conversationId?: string;
  phone?: string;
  recipientPhone?: string;
  content: string;
  text?: string;
  customerId?: string;
}

export interface SendWhatsAppTemplateMessageDto {
  recipientPhone: string;
  phone?: string;
  templateName: string;
  languageCode?: string;
  parameters: Record<string, string>;
  templateParams?: Record<string, string>;
  conversationId?: string;
  customerId?: string;
}

export interface WhatsAppConversationQueryFilters {
  status?: WhatsAppConversationStatus;
  search?: string;
  assignedUserId?: string;
  page?: number;
  limit?: number;
}

export interface WhatsAppProviderSendResult {
  success: boolean;
  status: WhatsAppMessageStatus;
  providerMessageId?: string;
  error?: {
    code?: string;
    message?: string;
  };
}

export interface WhatsAppWebhookEventData {
  eventId: string;
  eventType: string;
  providerMessageId?: string;
  status?: WhatsAppMessageStatus;
  timestamp?: Date;
  to?: string;
  from?: string;
  fromPhone?: string;
  messageText?: string;
  content?: string;
  errorCode?: string;
  errorMessage?: string;
  raw?: Record<string, unknown> | unknown;
  contactPhone?: string;
  contactName?: string;
  messageId?: string;
  field?: string;
  value?: Record<string, unknown>;
}

export interface WhatsAppProvider {
  name: string;
  sendTextMessage(phone: string, text: string): Promise<WhatsAppProviderSendResult>;
  sendTemplateMessage(
    phone: string,
    templateName: string,
    languageCode: string,
    params: Record<string, string>
  ): Promise<WhatsAppProviderSendResult>;
  validateWebhookSignature(rawBody: string, signatureHeader?: string): boolean;
  parseWebhookPayload(parsedPayload: unknown): WhatsAppWebhookEventData[];
}

// ==========================================
// 5. NOTIFICATIONS
// ==========================================

export type NotificationSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';

export type NotificationType =
  | 'NEW_INQUIRY'
  | 'PAYMENT_RECEIVED'
  | 'INVOICE_OVERDUE'
  | 'REMINDER_DUE'
  | 'SERVICE_DUE'
  | 'JOB_ASSIGNED'
  | 'JOB_COMPLETED'
  | 'WARRANTY_EXPIRING'
  | 'WHATSAPP_FAILURE'
  | 'SYSTEM_WARNING'
  | 'PAYMENT_DUE'
  | 'PAYMENT_OVERDUE'
  | 'JOB_CARD_UPDATE'
  | 'SYSTEM_ALERT';

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  severity: NotificationSeverity;
  notificationType: NotificationType;
  isRead: boolean;
  entityType?: string | null;
  entityId?: string | null;
  actionUrl?: string | null;
  createdAt: string;
  readAt?: string | null;
}

export interface NotificationEntity {
  id: string;
  userId: string | null;
  title: string;
  message: string;
  severity: NotificationSeverity;
  notificationType: NotificationType;
  entityType: string | null;
  entityId: string | null;
  actionUrl: string | null;
  isRead: boolean;
  readAt: Date | null;
  createdAt: Date;
}

export interface NotificationPreferences {
  emailAlerts: boolean;
  whatsappAlerts: boolean;
  systemAlerts: boolean;
  serviceReminders: boolean;
  paymentAlerts: boolean;
}

export interface NotificationQueryFilter {
  isRead?: boolean;
  severity?: NotificationSeverity;
  notificationType?: NotificationType;
  entityType?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface UnreadNotificationCountResponse {
  count?: number;
  unreadCount?: number;
  criticalCount?: number;
  warningCount?: number;
}

// ==========================================
// 6. ANALYTICS & REPORTING
// ==========================================

export type AnalyticsDateRangePreset =
  | 'today'
  | 'yesterday'
  | 'last_7_days'
  | 'last_30_days'
  | 'previous_month'
  | 'last_week'
  | 'last_month'
  | 'last_year'
  | '7d'
  | '7D'
  | '30d'
  | '30D'
  | '90d'
  | '90D'
  | '12m'
  | '1Y'
  | 'custom'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'this_year';

export interface AnalyticsDateFilter {
  startDate?: string;
  endDate?: string;
  preset?: AnalyticsDateRangePreset;
  range?: AnalyticsDateRangePreset;
  timezone?: string;
}

export interface MetricComparison {
  current: number;
  previous: number;
  deltaPercentage?: number | null;
  changePercent?: number | null;
  trend: 'up' | 'down' | 'neutral';
}

export interface AnalyticsOverview {
  period?: {
    range?: string;
    startDate?: string;
    endDate?: string;
    previousStartDate?: string;
    previousEndDate?: string;
    timezone?: string;
  };
  kpis?: Record<string, any>;
  sales?: any;
  revenue?: any;
  payments?: any;
  customers?: any;
  products?: any;
  inventory?: any;
  services?: any;
  jobCards?: any;
  technicians?: any;
  warranties?: any;
  inquiries?: any;
  totalRevenue?: MetricComparison;
  totalSalesCount?: MetricComparison;
  activeCustomers?: MetricComparison;
  completedServices?: MetricComparison;
  openJobCards?: MetricComparison;
  activeWarranties?: MetricComparison;
  outstandingInvoicesAmount?: MetricComparison;
}

export interface SalesAnalytics {
  totalSalesAmount?: number;
  salesCount?: number;
  averageOrderValue?: number;
  averageSaleValue?: number;
  salesByProduct?: any[];
  salesTrend?: any[];
  salesByCategory?: any[];
  salesByCustomerType?: any[];
  comparison?: any;
  [key: string]: any;
}

export interface RevenueAnalytics {
  grossRevenue?: number;
  grossBilled?: number;
  amountCollected?: number;
  collectedRevenue?: number;
  outstandingRevenue?: number;
  outstandingAmount?: number;
  revenueByPaymentMethod?: any[];
  monthlyRevenueTrend?: any[];
  revenueTrend?: any[];
  comparison?: any;
  [key: string]: any;
}

export interface PaymentAnalytics {
  totalCollected?: number;
  pendingAmount?: number;
  overdueAmount?: number;
  collectionEfficiencyPercent?: number;
  comparison?: any;
  [key: string]: any;
}

export interface CustomerAnalytics {
  totalCustomers?: number;
  newCustomers?: number;
  commercialCount?: number;
  individualCount?: number;
  repeatPurchaseRate?: number;
  comparison?: any;
  [key: string]: any;
}

export interface ServiceAnalytics {
  totalServices?: number;
  completedServices?: number;
  pendingServices?: number;
  averageCompletionTimeHours?: number;
  servicesByType?: any[];
  comparison?: any;
  [key: string]: any;
}

export interface JobCardAnalytics {
  totalJobCards?: number;
  completedJobCards?: number;
  inProgressJobCards?: number;
  averageTdsReductionPercent?: number;
  comparison?: any;
  [key: string]: any;
}

export interface TechnicianAnalytics {
  technicianPerformance?: any[];
  technicianBreakdown?: any[];
  activeTechniciansCount?: number;
  totalAssignedJobs?: number;
  totalCompletedJobs?: number;
  workforceAverageCompletionHours?: number;
  comparison?: any;
  [key: string]: any;
}

export interface WarrantyAnalytics {
  activeWarrantiesCount?: number;
  expiringIn30DaysCount?: number;
  claimsCount?: number;
  comparison?: any;
  [key: string]: any;
}

export interface ProductAnalytics {
  topProducts?: Array<{
    productId?: string;
    productName: string;
    category?: string;
    unitsSold: number;
    revenue: number;
    trendPercentage?: number;
    stockStatus?: 'in_stock' | 'low_stock' | 'out_of_stock';
  }>;
  totalProductsCount?: number;
  totalUnitsSold?: number;
  totalProductRevenue?: number;
  lowSellingProducts?: any[];
  comparison?: any;
  [key: string]: any;
}

export interface InventoryAnalytics {
  totalStockUnits: number;
  totalInventoryValue: number;
  lowStockCount: number;
  outOfStockCount: number;
  healthyStockCount: number;
  stockMovementSummary?: {
    purchases: number;
    sales: number;
    serviceUsage: number;
    adjustments: number;
  };
  reorderAlerts?: Array<{
    id: string;
    name: string;
    sku: string;
    currentStock: number;
    minStock: number;
    deficit: number;
  }>;
  comparison?: any;
  [key: string]: any;
}

export interface InquiryAnalytics {
  totalInquiries?: number;
  conversionRatePercent?: number;
  conversionRate?: number;
  convertedInquiries?: number;
  inquiriesBySource?: any[];
  inquiriesByStatus?: any[];
  inquirySourceDistribution?: any[];
  comparison?: any;
  [key: string]: any;
}

// ==========================================
// 7. SEARCH & DATA DISCOVERY (PHASE 25)
// ==========================================

export type SearchEntityType =
  | 'customer'
  | 'contact'
  | 'asset'
  | 'product'
  | 'inventory'
  | 'sale'
  | 'invoice'
  | 'payment'
  | 'service'
  | 'job_card'
  | 'warranty'
  | 'technician'
  | 'inquiry';

export type SearchMatchType =
  | 'EXACT'
  | 'EXACT_FIELD'
  | 'PREFIX'
  | 'TOKEN'
  | 'PARTIAL'
  | 'FUZZY'
  | 'SECONDARY';

export interface SearchItemResult {
  type: SearchEntityType;
  id: string;
  title: string;
  subtitle: string;
  matchType: SearchMatchType;
  score: number;
  navigationTarget: string;
  metadata?: Record<string, any>;
}

export interface GlobalSearchQuery {
  q: string;
  types?: SearchEntityType[] | string;
  limit?: number;
  offset?: number;
}

export interface GlobalSearchResponse {
  query: string;
  totalMatches: number;
  executionTimeMs: number;
  categories: Record<string, SearchItemResult[]>;
  results: SearchItemResult[];
}

export interface SearchSuggestionItem {
  id: string;
  title: string;
  type: SearchEntityType;
  subtitle?: string;
  navigationTarget: string;
}

export interface SearchSuggestionResponse {
  query: string;
  suggestions: SearchSuggestionItem[];
}

export type SearchFilterOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'not_in'
  | 'between'
  | 'contains'
  | 'starts_with';

export interface SearchFilterClause {
  field: string;
  operator: SearchFilterOperator;
  value: any;
}

export interface AdvancedSearchRequest {
  q?: string;
  entityType: SearchEntityType;
  filters?: SearchFilterClause[];
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface AdvancedSearchResponse<T = any> {
  entityType: SearchEntityType;
  query?: string;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  executionTimeMs: number;
  items: SearchItemResult[];
  rawItems?: T[];
}

// ==========================================
// 12. DATA IMPORT, EXPORT, BACKUP & RESTORE (PHASE 26)
// ==========================================

export type ImportEntityType = 'customer' | 'product' | 'asset' | 'inventory' | 'warranty';

export type ImportDuplicatePolicy = 'CREATE' | 'SKIP' | 'UPDATE';

export type ImportValidationErrorCode =
  | 'REQUIRED_FIELD'
  | 'INVALID_FORMAT'
  | 'INVALID_VALUE'
  | 'DUPLICATE'
  | 'MISSING_REFERENCE'
  | 'CONFLICT'
  | 'INVALID_DATE'
  | 'INVALID_AMOUNT'
  | 'UNAUTHORIZED_UPDATE';

export interface ImportRowError {
  rowNumber: number;
  field?: string;
  code: ImportValidationErrorCode;
  message: string;
  value?: any;
}

export interface ImportRowWarning {
  rowNumber: number;
  field?: string;
  message: string;
}

export interface ImportPreviewResult {
  entityType: ImportEntityType;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  missingReferenceRows: number;
  errors: ImportRowError[];
  warnings: ImportRowWarning[];
  sampleValid: Array<Record<string, any>>;
  sampleInvalid: Array<{ rowNumber: number; data: Record<string, any>; errors: ImportRowError[] }>;
  canProceed: boolean;
}

export interface ImportExecuteRequest {
  entityType: ImportEntityType;
  records: Array<Record<string, any>>;
  duplicatePolicy?: ImportDuplicatePolicy;
  batchSize?: number;
}

export interface ImportExecuteResult {
  entityType: ImportEntityType;
  totalProcessed: number;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: ImportRowError[];
  executionTimeMs: number;
  auditLogId?: string;
}

export type ExportEntityType =
  | 'customers'
  | 'products'
  | 'inventory'
  | 'sales'
  | 'invoices'
  | 'payments'
  | 'services'
  | 'job_cards'
  | 'warranties'
  | 'technicians'
  | 'inquiries';

export type ExportFormat = 'csv' | 'json';

export interface ExportFilterParams {
  startDate?: string;
  endDate?: string;
  status?: string;
  type?: string;
  customerType?: string;
  city?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
}

export interface BackupMetadata {
  id: string;
  filename: string;
  sizeBytes: number;
  checksumSha256: string;
  createdAt: string;
  databaseEngine: string;
  schemaVersion: string;
  tableCounts: Record<string, number>;
  status: 'HEALTHY' | 'CORRUPTED' | 'PRE_RESTORE_SAFETY';
  notes?: string;
}

export interface BackupListResponse {
  backups: BackupMetadata[];
  totalBackups: number;
  storageSizeBytes: number;
}

export interface RestoreRequest {
  backupId: string;
  confirmationPhrase: string; // Must be "RESTORE SRM DATA"
  notes?: string;
}

export interface RestoreResult {
  success: boolean;
  restoredBackupId: string;
  safetyBackupId: string;
  restoredAt: string;
  verification: {
    databaseConnected: boolean;
    schemaValid: boolean;
    tableCounts: Record<string, number>;
    financialTotalsMatch: boolean;
    tableCountsMatch?: boolean;
    countMismatches?: string[];
    relationshipsValid?: boolean;
    relationshipErrors?: string[];
    documentsRestored?: number;
  };
  durationMs: number;
}

// ==========================================
// 16. SYSTEM ADMINISTRATION & BUSINESS CONFIGURATION
// ==========================================

export type SettingsCategory =
  | 'SYSTEM'
  | 'BUSINESS'
  | 'TAX'
  | 'INVOICE'
  | 'PAYMENT'
  | 'SALES'
  | 'SERVICE'
  | 'JOB_CARD'
  | 'WARRANTY'
  | 'INVENTORY'
  | 'NOTIFICATION'
  | 'NUMBERING'
  | 'SECURITY';

export type PaymentMethod = 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE' | 'CARD' | 'NET_BANKING' | 'OTHER';

export interface SystemSettings {
  appName: string;
  appVersion: string;
  timezone: string;
  currency: string;
  currencySymbol: string;
  dateFormat: string;
  timeFormat: string;
  locale: string;
  defaultPageSize: number;
}

export interface BusinessSettings {
  businessName: string;
  legalName: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  email: string;
  website?: string;
  gstin?: string;
  panNumber?: string;
  logoUrl?: string;
}

export interface TaxSettings {
  taxEnabled: boolean;
  defaultTaxRatePercent: number; // e.g. 18.00
  taxInclusivePricing: boolean;
  taxNumber?: string;
  defaultHsnSac?: string;
}

export interface InvoiceSettings {
  prefix: string;
  numberFormat: string; // e.g. "INV-{YYYY}-{COUNTER}"
  startingNumber: number;
  paymentTermsDays: number; // e.g. 30
  defaultNotes: string;
  defaultTermsAndConditions: string;
  showTaxBreakdown: boolean;
  showGst: boolean;
  footerText?: string;
}

export interface PaymentSettings {
  defaultPaymentMethod: PaymentMethod;
  defaultDuePeriodDays: number;
  allowPartialPayments: boolean;
  autoGenerateReceipts: boolean;
}

export interface SalesSettings {
  defaultSalesStatus: 'COMPLETED' | 'DRAFT';
  autoGenerateInvoiceOnSale: boolean;
  autoCreateAssetOnSale: boolean;
  autoCreateWarrantyOnSale: boolean;
}

export interface ServiceSettings {
  defaultServiceDurationMinutes: number;
  defaultServicePriority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  slaHours: number;
  autoCreateJobCardOnService: boolean;
}

export interface JobCardSettings {
  prefix: string;
  defaultPriority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  requireCustomerSignature: boolean;
  requireOtpVerification: boolean;
}

export interface WarrantySettings {
  defaultWarrantyMonths: number; // e.g. 12
  defaultServiceIntervalMonths: number; // e.g. 6
  expiryNotificationThresholdDays: number; // e.g. 30
  allowAmcUpgrade: boolean;
}

export interface InventorySettings {
  lowStockThreshold: number; // e.g. 5
  allowNegativeStock: boolean;
  valuationMethod: 'FIFO' | 'WEIGHTED_AVERAGE';
  skuPrefix?: string;
}

export interface NotificationSettings {
  warrantyExpiryReminderDays: number[]; // e.g. [30, 15, 7]
  invoiceDueReminderDays: number[]; // e.g. [7, 3, 1]
  serviceReminderDays: number[]; // e.g. [14, 7]
  inAppEnabled: boolean;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
}

export interface NumberingSettings {
  customerPrefix: string;
  invoicePrefix: string;
  salePrefix: string;
  servicePrefix: string;
  jobCardPrefix: string;
  paymentPrefix: string;
  warrantyPrefix: string;
  assetPrefix: string;
  inquiryPrefix: string;
  reminderPrefix: string;
  padding: number;
  yearReset: boolean;
}

export interface SecuritySettings {
  sessionTimeoutMinutes: number;
  maxLoginAttempts: number;
  lockoutDurationMinutes: number;
  passwordMinLength: number;
  passwordRequireSpecialChar: boolean;
}

export interface AllSettingsResponse {
  system: SystemSettings;
  business: BusinessSettings;
  tax: TaxSettings;
  invoice: InvoiceSettings;
  payment: PaymentSettings;
  sales: SalesSettings;
  service: ServiceSettings;
  jobCard: JobCardSettings;
  warranty: WarrantySettings;
  inventory: InventorySettings;
  notification: NotificationSettings;
  numbering: NumberingSettings;
  security: SecuritySettings;
  metadata: {
    cachedAt: string;
    versionMap: Record<SettingsCategory, number>;
  };
}

export interface PublicSettingsResponse {
  appName: string;
  appVersion: string;
  businessName: string;
  currency: string;
  currencySymbol: string;
  dateFormat: string;
  timezone: string;
  locale: string;
  phone: string;
  email: string;
  city: string;
  taxEnabled: boolean;
  defaultTaxRatePercent: number;
}

export interface UpdateSettingsRequest<T = any> {
  category: SettingsCategory;
  data: Partial<T>;
  expectedVersion?: number;
}

export interface SettingsHealthResponse {
  healthy: boolean;
  timestamp: string;
  issues: string[];
  categories: Record<SettingsCategory, boolean>;
}

// ==========================================
// 17. ADVANCED WORKFLOW ENGINE & DOMAIN EVENTS
// ==========================================

export type DomainEventType =
  | 'CustomerCreated'
  | 'CustomerUpdated'
  | 'SaleCreated'
  | 'SaleConfirmed'
  | 'SaleCancelled'
  | 'SaleCompleted'
  | 'InvoiceCreated'
  | 'InvoiceIssued'
  | 'InvoiceCancelled'
  | 'InvoicePaid'
  | 'InvoiceOverdue'
  | 'PaymentCreated'
  | 'PaymentReceived'
  | 'PaymentFailed'
  | 'PaymentRefunded'
  | 'AssetCreated'
  | 'AssetAssigned'
  | 'WarrantyCreated'
  | 'WarrantyExpiring'
  | 'WarrantyExpired'
  | 'ServiceRequestCreated'
  | 'ServiceRequestAssigned'
  | 'ServiceCompleted'
  | 'JobCardCreated'
  | 'JobCardAssigned'
  | 'JobCardStarted'
  | 'JobCardCompleted'
  | 'JobCardCancelled'
  | 'InventoryUpdated'
  | 'LowStockDetected'
  | 'InquiryCreated'
  | 'InquiryConverted';

export interface DomainEvent<T = any> {
  eventId: string;
  eventType: DomainEventType;
  aggregateType: string; // 'SALE', 'INVOICE', 'PAYMENT', 'CUSTOMER', 'ASSET', 'WARRANTY', 'SERVICE', 'JOB_CARD', 'INVENTORY', 'INQUIRY'
  aggregateId: string;
  actorId?: string;
  actorRole?: string;
  payload: T;
  timestamp: string;
  metadata?: Record<string, any>;
}

export type OutboxStatus = 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED' | 'DEAD_LETTER';

export interface OutboxEventRecord {
  id: string;
  eventId: string;
  eventType: DomainEventType;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, any>;
  status: OutboxStatus;
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  processedAt?: string;
  createdAt: string;
}

export type WorkflowConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'greater_than'
  | 'less_than'
  | 'greater_than_or_equal'
  | 'less_than_or_equal'
  | 'contains'
  | 'in'
  | 'not_in'
  | 'exists'
  | 'not_exists';

export interface WorkflowCondition {
  field: string; // e.g. "payload.totalAmount" or "payload.status"
  operator: WorkflowConditionOperator;
  value?: any;
}

export interface WorkflowConditionGroup {
  logic: 'AND' | 'OR';
  conditions: (WorkflowCondition | WorkflowConditionGroup)[];
}

export type WorkflowActionType =
  | 'CREATE_NOTIFICATION'
  | 'CREATE_REMINDER'
  | 'CREATE_JOB_CARD'
  | 'GENERATE_INVOICE'
  | 'UPDATE_STATUS'
  | 'UPDATE_WARRANTY'
  | 'ASSIGN_TECHNICIAN'
  | 'UPDATE_INVENTORY'
  | 'SEND_WHATSAPP';

export interface WorkflowActionConfig {
  type: WorkflowActionType;
  params: Record<string, any>;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  eventType: DomainEventType;
  conditions: WorkflowConditionGroup;
  actions: WorkflowActionConfig[];
  priority: number; // Lower numbers execute first
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type WorkflowExecutionStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'PARTIALLY_COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface WorkflowExecutionRecord {
  id: string;
  workflowId: string;
  workflowName: string;
  eventId: string;
  eventType: DomainEventType;
  status: WorkflowExecutionStatus;
  error?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}

export type ActionExecutionStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';

export interface WorkflowActionExecutionRecord {
  id: string;
  workflowExecutionId: string;
  actionType: WorkflowActionType;
  idempotencyKey: string;
  status: ActionExecutionStatus;
  resultPayload?: Record<string, any>;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

export interface CreateWorkflowRequest {
  name: string;
  description?: string;
  eventType: DomainEventType;
  conditions: WorkflowConditionGroup;
  actions: WorkflowActionConfig[];
  priority?: number;
  isActive?: boolean;
}

export interface UpdateWorkflowRequest {
  name?: string;
  description?: string;
  conditions?: WorkflowConditionGroup;
  actions?: WorkflowActionConfig[];
  priority?: number;
  isActive?: boolean;
}

// ==========================================
// 20. DOCUMENT & FILE MANAGEMENT (PHASE 31)
// ==========================================

export type DocumentCategory =
  | 'CUSTOMER_DOCUMENT'
  | 'INVOICE'
  | 'PAYMENT_RECEIPT'
  | 'WARRANTY_DOCUMENT'
  | 'SERVICE_PHOTO'
  | 'JOB_CARD_PHOTO'
  | 'ASSET_PHOTO'
  | 'TECHNICIAN_DOCUMENT'
  | 'GENERAL';

export type DocumentStatus =
  | 'ACTIVE'
  | 'QUARANTINED'
  | 'DELETED'
  | 'STORAGE_MISSING'
  | 'CORRUPTED';

export type DocumentEntityType =
  | 'CUSTOMER'
  | 'ASSET'
  | 'SALE'
  | 'INVOICE'
  | 'PAYMENT'
  | 'WARRANTY'
  | 'SERVICE'
  | 'JOB_CARD'
  | 'PRODUCT'
  | 'TECHNICIAN'
  | 'INQUIRY';

export interface DocumentDTO {
  id: string;
  originalFilename: string;
  storedFilename: string;
  storagePath: string;
  mimeType: string;
  fileExtension: string;
  fileSizeBytes: number;
  checksumSha256: string;
  category: DocumentCategory;
  status: DocumentStatus;
  uploadedByUserId?: string | null;
  version: number;
  metadata?: Record<string, any> | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  deletedAt?: string | Date | null;
}

export interface DocumentAttachmentDTO {
  id: string;
  documentId: string;
  entityType: DocumentEntityType;
  entityId: string;
  attachedByUserId?: string | null;
  createdAt: string | Date;
  document?: DocumentDTO;
}

export interface UploadDocumentRequest {
  filename: string;
  category?: DocumentCategory;
  entityType?: DocumentEntityType;
  entityId?: string;
  metadata?: Record<string, any>;
  dataBase64?: string;
}

export interface AttachDocumentRequest {
  documentId: string;
  entityType: DocumentEntityType;
  entityId: string;
}

export interface DocumentStorageStats {
  totalDocuments: number;
  totalSizeBytes: number;
  totalSizeBytesFormatted: string;
  categoryBreakdown: Record<string, { count: number; sizeBytes: number }>;
  statusBreakdown: Record<string, number>;
}

export interface DocumentReconciliationReport {
  scannedAt: string;
  totalDbRecords: number;
  totalPhysicalFiles: number;
  matchedFiles: number;
  missingPhysicalFiles: string[];
  orphanPhysicalFiles: string[];
  corruptedFiles: string[];
  durationMs: number;
}

/**
 * Phase 32 — Backup + Restore + Disaster Recovery Types
 */
export type BackupStatus =
  | 'CREATING'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CORRUPTED'
  | 'RESTORING'
  | 'RESTORE_FAILED'
  | 'DELETED';

export type BackupType = 'FULL' | 'SAFETY' | 'MANUAL' | 'SCHEDULED';

export interface BackupManifestDTO {
  backupId: string;
  createdAt: string;
  srmVersion: string;
  databaseSchemaVersion: number | string;
  backupFormatVersion: string;
  backupType: BackupType;
  tableCounts: Record<string, number>;
  totalRecords: number;
  documentCount: number;
  documentStorageSizeBytes: number;
  databaseSizeBytes: number;
  totalPackageSizeBytes: number;
  checksumSha256: string;
  componentChecksums: {
    database: string;
    documents?: string;
    configuration?: string;
  };
  status: BackupStatus;
  notes?: string;
  isProtected?: boolean;
  encryption?: {
    isEncrypted: boolean;
    algorithm?: string;
    salt?: string;
  };
}

export interface CreateBackupRequest {
  notes?: string;
  backupType?: BackupType;
  includeDocuments?: boolean;
  isProtected?: boolean;
  encryptionPassword?: string;
}

export interface RestoreBackupRequest {
  backupId?: string;
  filename?: string;
  confirmAction: boolean;
  encryptionPassword?: string;
}

export interface BackupInspectionReport {
  manifest: BackupManifestDTO | null;
  isValid: boolean;
  integrityStatus: 'VALID' | 'CORRUPTED' | 'UNKNOWN';
  schemaCompatible: boolean;
  validationErrors: string[];
}

export interface BackupStorageEstimate {
  estimatedSizeBytes: number;
  estimatedSizeFormatted: string;
  availableDiskSpaceBytes?: number;
  hasSufficientSpace: boolean;
  breakdown: {
    databaseBytes: number;
    documentBytes: number;
    estimatedArchiveBytes: number;
  };
}

export interface StagedRestoreState {
  restoreId: string;
  safetyBackupId?: string;
  stage: 'PREPARING' | 'SAFETY_SNAPSHOT' | 'EXTRACTING' | 'RESTORING_DB' | 'RESTORING_DOCS' | 'VERIFYING' | 'COMPLETED' | 'FAILED' | 'ROLLED_BACK';
  startedAt: string;
  completedAt?: string;
  error?: string;
}

// ==========================================
// 34. CHATBOT & ADMIN TRAINING DOMAIN TYPES
// ==========================================

export type ChatbotCategory =
  | 'Services'
  | 'Products'
  | 'Warranty'
  | 'AMC'
  | 'Rentals'
  | 'Payments'
  | 'Installation'
  | 'Maintenance'
  | 'Contact'
  | 'General FAQ'
  | 'Custom';

export interface ChatbotKnowledge {
  id: string;
  title: string;
  category: string;
  question: string;
  answer: string;
  isActive: boolean;
  isPublished: boolean;
  createdBy?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CreateChatbotKnowledgeInput {
  title?: string | null;
  category?: string | null;
  question?: string | null;
  answer?: string | null;
  isActive?: boolean;
}

export interface UpdateChatbotKnowledgeInput {
  title?: string | null;
  category?: string | null;
  question?: string | null;
  answer?: string | null;
  isActive?: boolean;
  isPublished?: boolean;
}

export interface ChatbotQueryPayload {
  message: string;
  conversationId?: string;
}

export interface ChatbotSourceItem {
  id: string;
  title: string;
  category: string;
  question: string;
}

export interface ChatbotResponse {
  answer: string;
  matched: boolean;
  sources: ChatbotSourceItem[];
  conversationId?: string;
}

export interface ChatbotMessageItem {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatbotSourceItem[] | null;
  createdAt: string | Date;
}

// ==========================================
// EXPENSES & CASH-IN-HAND DOMAIN TYPES
// ==========================================

export const EXPENSE_CATEGORIES = [
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
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export function isHomeExpense(category?: string | null): boolean {
  if (!category) return false;
  return category.trim().toLowerCase() === 'home expenses';
}

export type ExpenseFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type ExpenseStatus = 'RECORDED' | 'VOIDED';
export type MonthlyClosingStatus = 'DRAFT' | 'APPROVED';

export interface MonthlyClosingRecord {
  id: string;
  companyId?: string | null;
  year: number;
  month: number;
  leadProfit: number;
  totalExpenses: number;
  monthlyProfit: number;
  previousClosingCash: number;
  expectedCashBeforeSavings: number;
  actualBankBalance: number;
  reconciliationDifference: number;
  savingsTransfer: number;
  closingCash: number;
  previousSavingsBalance: number;
  currentSavingsBalance: number;
  status: MonthlyClosingStatus;
  approvedBy?: string | null;
  approvedByName?: string | null;
  approvedAt?: string | Date | null;
  notes?: string | null;
  categoryBreakdown?: Record<string, number> | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface MonthlyReconciliationSummary {
  year: number;
  month: number;
  leadProfit: number;
  totalExpenses: number;
  businessExpenses: number;
  homeExpenses: number;
  monthlyProfit: number;
  previousClosingCash: number;
  expectedCashBeforeSavings: number;
  actualBankBalance: number;
  reconciliationDifference: number;
  savingsTransfer: number;
  closingCash: number;
  previousSavingsBalance: number;
  currentSavingsBalance: number;
  categoryTotals: Record<string, number>;
  serviceEarnings?: number;
  serviceRevenueBilled?: number;
  servicePaymentsCollected?: number;
  completedServicesCount?: number;
  balanceAfterExpenses?: number;
  closingRecord?: MonthlyClosingRecord | null;
  isClosed: boolean;
  hasPriorApprovedClose?: boolean;
  isOpeningPeriod?: boolean;
}

export interface ExpenseItem {
  id: string;
  companyId?: string | null;
  title: string;
  category: string;
  amount: number;
  expenseDate: string;
  paymentMethod: string;
  notes?: string | null;
  status: ExpenseStatus;
  recordedBy: string;
  recordedByName?: string | null;
  voidedBy?: string | null;
  voidedByName?: string | null;
  voidedAt?: string | null;
  voidReason?: string | null;
  recurringScheduleId?: string | null;
  occurrencePeriod?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface ExpensesListSummary {
  totalAmount: number;
  voidedAmount: number;
  totalCount: number;
}

export interface ExpenseScheduleItem {
  id: string;
  companyId?: string | null;
  title: string;
  category: string;
  amount: number;
  frequency: ExpenseFrequency;
  paymentMethod: string;
  startDate: string;
  endDate?: string | null;
  nextDueDate: string;
  isActive: boolean;
  notes?: string | null;
  createdBy: string;
  createdByName?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface ExpensesOverviewSummary {
  expensesToday: number;
  expensesThisWeek: number;
  expensesThisMonth: number;
  expensesThisYear: number;
  pendingTechnicianCash: number;
  cashReceivedByOwner: number;
  shopCashMovementBalance: number;
  cashExpensesTotal: number;
  nonCashExpensesTotal: number;
  activeSchedulesCount: number;
}

export interface FinancialSummaryReport {
  period: string;
  startDate: string;
  endDate: string;
  totalServiceRevenue: number;
  totalCustomerPaymentsReceived: number;
  totalExpenses: number;
  cogsAmount: number;
  grossProfit: number;
  netProfit: number;
  cashCollectedByTechnicians: number;
  cashHandedOverToOwner: number;
  pendingTechnicianCash: number;
  shopCashMovementBalance: number;
}

export * from './technician-portal';


