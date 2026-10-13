/**
 * SR Enterprises CRM - Technician Portal Types & Data Transfer Objects
 * Phase 0: Isolated Preparation Boundary
 * Strictly additive - No existing CRM behavior is modified.
 */

// ==========================================
// 1. TECHNICIAN PORTAL ACCESS & PROFILE
// ==========================================

export interface TechnicianPortalAccess {
  id: string;
  technicianId: string;
  portalEnabled: boolean;
  lastLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Technician360Profile {
  id: string;
  technicianId: string;
  fullName: string;
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  skills?: string[] | null;
  status: 'ACTIVE' | 'ON_LEAVE' | 'INACTIVE';
  availability: 'AVAILABLE' | 'BUSY' | 'ON_LEAVE' | 'OFF_DUTY';
  portalAccess: 'ENABLED' | 'DISABLED';
  portalEnabled: boolean;
  emergencyContact?: string | null;
}

export interface TechnicianWorkSummary {
  assigned: number;
  inProgress: number;
  completed: number;
  upcoming: number;
  completionRate: number;
  assignedCount?: number;
  inProgressCount?: number;
  completedCount?: number;
  upcomingCount?: number;
  completionRatePercent?: number;
  currentWorkload?: number;
  averageCompletionTimeMinutes?: number | null;
  averageCompletionTimeFormatted?: string | null;
  isAverageCompletionTimeReliable?: boolean;
}

export interface ActiveJobSpareItem {
  itemName: string;
  sku?: string | null;
  quantity: number;
  unitPrice: number;
  source: 'Inventory' | 'Manual';
  isWarrantyCovered?: boolean;
}

export interface ActiveJobSpareRecord {
  jobCardId: string;
  jobCardNumber: string;
  serviceId?: string | null;
  serviceNumber: string;
  customerName: string;
  status: string;
  parts: ActiveJobSpareItem[];
  updatedAt?: string;
}

export interface Technician360ResponseData {
  technician: Technician360Profile;
  workSummary: TechnicianWorkSummary;
  activeJobSpares?: ActiveJobSpareRecord[];
  cashSummary?: TechnicianCashSummary;
}

export interface TechnicianAdminServiceItem {
  id: string;
  serviceNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  customerAddress?: string | null;
  assetId: string;
  machineName: string;
  serialNumber?: string | null;
  modelNumber?: string | null;
  serviceType: string;
  serviceLocation: string;
  serviceClassification: string;
  scheduledDate: string;
  scheduledTimeSlot?: string | null;
  status: string;
  priority: string;
  customerNotes?: string | null;
  internalNotes?: string | null;
  completedAt?: string | null;
  createdAt: string;
  jobCardId?: string | null;
  jobCardNumber?: string | null;
  jobCardStatus?: string | null;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  invoiceTotal?: string | number | null;
  invoiceStatus?: string | null;
  amountPaid?: string | number | null;
}

export interface TechnicianAdminJobCardItem {
  id: string;
  jobCardNumber: string;
  serviceId: string;
  serviceNumber?: string | null;
  serviceType?: string | null;
  customerId: string;
  customerName: string;
  customerPhone: string;
  assetId: string;
  assetName: string;
  problemReported?: string | null;
  diagnosis?: string | null;
  workPerformed?: string | null;
  partsReplaced?: any;
  technicianNotes?: string | null;
  customerRemarks?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  laborCharges: string;
  partsCharges: string;
  totalCharges: string;
  status: string;
  createdAt: string;
}

export interface TechnicianAdminCustomerItem {
  customerId: string;
  customerName: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  totalServices: number;
  lastServiceDate: string | null;
  lastServiceNumber?: string | null;
}

export interface TechnicianAdminAssetItem {
  assetId: string;
  assetName: string;
  serialNumber?: string | null;
  modelNumber?: string | null;
  customerName: string;
  customerId: string;
  totalServices: number;
  lastServiceDate: string | null;
}

export interface TechnicianAdminPartItem {
  partName: string;
  partSku?: string | null;
  quantity: number;
  isWarrantyCovered?: boolean;
  price?: number | string | null;
  jobCardId: string;
  jobCardNumber: string;
  date: string;
}

export interface TechnicianAdminPaymentItem {
  id: string;
  paymentNumber: string;
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  amount: string;
  paymentDate: string;
  paymentMethod: string;
  status: string;
  referenceNumber?: string | null;
}

export interface TechnicianAdmin360Profile {
  technician: {
    id: string;
    fullName: string;
    phone: string;
    email: string | null;
    status: 'ACTIVE' | 'ON_LEAVE' | 'INACTIVE';
    availability: 'AVAILABLE' | 'BUSY' | 'ON_LEAVE' | 'OFF_DUTY';
    skills: string[] | null;
    address: string | null;
    emergencyContact: string | null;
    portalEnabled: boolean;
    createdAt: string;
    updatedAt: string;
  };
  workSummary: {
    assignedCount: number;
    inProgressCount: number;
    completedCount: number;
    upcomingCount: number;
    currentWorkload: number;
    completionRate: number;
    averageCompletionTimeMinutes: number | null;
    averageCompletionTimeFormatted: string | null;
    isAverageCompletionTimeReliable: boolean;
    sampleSize: number;
  };
  financialSummary: {
    totalInvoiced: number;
    totalCollected: number;
    pendingBalance: number;
    collectionsCount: number;
  };
  currentWork: TechnicianAdminServiceItem[];
  upcomingWork: TechnicianAdminServiceItem[];
  assignedServices: TechnicianAdminServiceItem[];
  completedServices: TechnicianAdminServiceItem[];
  jobCards: TechnicianAdminJobCardItem[];
  customersHandled: TechnicianAdminCustomerItem[];
  assetsHandled: TechnicianAdminAssetItem[];
  partsUsed: TechnicianAdminPartItem[];
  payments: TechnicianAdminPaymentItem[];
}

// ==========================================
// 2. AUTHENTICATION & OTP CONCURRENCY
// ==========================================

export interface TechnicianLoginInput {
  phone: string;
  fullName: string;
}

export interface TechnicianOtpChallenge {
  challengeId: string;
  technicianId: string;
  otpHash: string;
  expiresAt: number;
  attemptCount: number;
  maxAttempts: number;
  createdAt: number;
}

export interface TechnicianOtpRequestResponse {
  success: boolean;
  challengeId: string;
  maskedEmail: string;
  expiresInSeconds: number;
  resendAvailableInSeconds: number;
}

export interface TechnicianVerifyOtpInput {
  challengeId: string;
  otp: string;
}

export interface TechnicianSessionData {
  sessionId: string;
  technicianId: string;
  fullName: string;
  phone: string;
  email?: string | null;
  role: 'Technician';
  portalEnabled: boolean;
  createdAt: number;
  lastActivityAt: number;
  ipAddress?: string;
  userAgent?: string;
}

export interface TechnicianAuthMeResponse {
  authenticated: boolean;
  expiresIn?: number;
  technician?: TechnicianSessionData;
}

// ==========================================
// 3. ASSIGNED SERVICES & WORK EXECUTION
// ==========================================

export interface TechnicianAssignedService {
  serviceId: string;
  id?: string;
  serviceNumber: string;
  serviceType: string;
  serviceClassification: 'GENERAL' | 'WARRANTY';
  scheduledDate: Date | string;
  scheduledTimeSlot?: string | null;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  status: string;
  customerNotes?: string | null;
  // Customer Context
  customerId: string;
  customerName: string;
  customerPhone: string;
  serviceAddress?: string | null;
  addressLine2?: string | null;
  landmark?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  // Asset Context
  assetId?: string | null;
  productName?: string | null;
  serialNumber?: string | null;
  // Job Card Context
  jobCardId?: string | null;
  jobCardNumber?: string | null;
  jobCardStatus?: string | null;
  completedAt?: Date | string | null;
}

export interface TechnicianServiceHistoryItem {
  serviceId: string;
  serviceNumber: string;
  serviceType: string;
  completedAt?: Date | string | null;
  problemReported?: string | null;
  diagnosis?: string | null;
  workPerformed?: string | null;
  partsReplaced?: any;
}

export interface TechnicianServiceDetail {
  id: string;
  serviceNumber: string;
  serviceType: string;
  serviceClassification: 'GENERAL' | 'WARRANTY';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  status: string;
  scheduledDate: Date | string;
  scheduledTimeSlot?: string | null;
  customerNotes?: string | null;
  internalNotes?: string | null;
  createdAt: Date | string;
  // Job Card
  jobCardId?: string | null;
  jobCardNumber?: string | null;
  jobCardStatus?: string | null;
  problemReported?: string | null;
  diagnosis?: string | null;
  workPerformed?: string | null;
  partsReplaced?: any[];
  technicianNotes?: string | null;
  holdReason?: string | null;
  laborCharges?: string | number | null;
  partsCharges?: string | number | null;
  totalCharges?: string | number | null;
  // Customer Context
  customer: {
    id: string;
    customerNumber?: string | null;
    fullName: string;
    phone: string;
    email?: string | null;
    alternatePhone?: string | null;
  };
  // Location
  location: {
    addressLine1?: string | null;
    addressLine2?: string | null;
    landmark?: string | null;
    city?: string | null;
    state?: string | null;
    pincode?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  };
  // Asset / Equipment Context (Nullable / Gracefully omitted)
  asset?: {
    id: string;
    assetNumber?: string | null;
    name: string;
    brand?: string | null;
    model?: string | null;
    serialNumber?: string | null;
    purchaseDate?: Date | string | null;
  } | null;
  // Relevant Work History
  relevantHistory: TechnicianServiceHistoryItem[];
  // Phase 6: Authoritative Billing Visibility (Nullable / Omitted if not yet invoiced)
  billing?: TechnicianBillingSummary | null;
}

export type TechnicianServiceViewTab = 'all' | 'today' | 'upcoming' | 'in_progress' | 'on_hold' | 'completed';

export interface TechnicianJobExecutionInput {
  problemReported?: string | null;
  diagnosis?: string | null;
  workPerformed?: string | null;
  technicianNotes?: string | null;
  customerRemarks?: string | null;
  partsReplaced?: Array<{
    itemId?: string | null;
    productId?: string | null;
    inventoryItemId?: string | null;
    sku?: string | null;
    itemName: string;
    description?: string | null;
    quantity: number;
    isWarrantyCovered?: boolean | null;
    price?: number | null;
    unitPrice?: number | null;
    inventoryDeducted?: boolean | null;
  }> | null;
  businessFields?: Record<string, any> | null;
  customerSignatureFileId?: string | null;
}


// ==========================================
// 4. BILLING & PAYMENT COLLECTION
// ==========================================

export interface TechnicianBillingSummary {
  jobCardId?: string;
  serviceId?: string;
  invoiceId: string;
  invoiceNumber: string;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  paymentStatus: string;
  status?: string;
  dueDate?: string | null;
  invoiceDate?: string | null;
}

export interface TechnicianPaymentSummary {
  jobCardId: string;
  serviceId: string;
  invoiceId?: string | null;
  invoiceNumber?: string | null;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  status: string;
  paymentStatus?: string;
  // Business payment details
  businessName?: string;
  upiId?: string;
  upiQr?: string;
  accountName?: string;
  bankName?: string;
  accountNumber?: string;
  ifsc?: string;
}

export interface TechnicianRecordPaymentInput {
  invoiceId?: string | null;
  amount: number;
  paymentMethod: 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE' | 'OTHER';
  referenceNumber?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
}

export interface TechnicianPaymentReceipt {
  paymentId: string;
  paymentNumber: string;
  receiptNumber: string;
  invoiceId?: string;
  invoiceNumber: string;
  invoiceTotal?: number;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  amount: number;
  paymentMethod: string;
  referenceNumber?: string | null;
  outstandingBalance: number;
  paymentDate: Date | string;
  paymentStatus?: string;
  notes?: string | null;
  receivedByName?: string | null;
  businessDetails?: {
    businessName: string;
    phone?: string;
    email?: string;
    address?: string;
    gstin?: string;
    upiId?: string;
  };
}

export interface TechnicianRecordPaymentResponse {
  paymentId: string;
  paymentNumber: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  paymentMethod: string;
  referenceNumber?: string | null;
  paymentDate: Date | string;
  remainingOutstanding: number;
  paymentStatus: string;
  receiptNumber: string;
  notes?: string | null;
}

// ==========================================
// 5. PORTAL NOTIFICATIONS
// ==========================================

export type TechnicianNotificationType =
  | 'NEW_ASSIGNMENT'
  | 'SCHEDULE_CHANGE'
  | 'CANCELLATION'
  | 'REASSIGNMENT'
  | 'JOB_UPDATE';

export interface TechnicianPortalNotification {
  id: string;
  technicianId: string;
  type: TechnicianNotificationType | string;
  title: string;
  message: string;
  referenceType?: string | null;
  referenceId?: string | null;
  dedupKey?: string | null;
  isRead: boolean;
  createdAt: Date | string;
  readAt?: Date | string | null;
}

export interface TechnicianPortalNotificationItem {
  id: string;
  type: TechnicianNotificationType | string;
  title: string;
  message: string;
  referenceType?: 'SERVICE' | 'JOB_CARD' | string | null;
  referenceId?: string | null;
  actionUrl?: string | null;
  isRead: boolean;
  createdAt: string;
  readAt?: string | null;
}

export interface TechnicianNotificationListResponse {
  notifications: TechnicianPortalNotificationItem[];
  unreadCount: number;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface TechnicianMarkNotificationReadResponse {
  success: boolean;
  notificationId: string;
  isRead: boolean;
  readAt: string;
  unreadCount: number;
}

// ==========================================
// 9. PERSONAL TECHNICIAN SUMMARY (PHASE 9)
// ==========================================

export interface TechnicianPersonalSummary {
  assignedCount: number;
  completedCount: number;
  currentWorkload: number;
  completionRate: number;
  averageCompletionTimeMinutes: number | null;
  averageCompletionTimeFormatted: string | null;
  isAverageCompletionTimeReliable: boolean;
  sampleSize: number;
  workloadBreakdown: {
    assigned: number;
    inProgress: number;
    onHold: number;
    upcoming: number;
  };
}

export interface TechnicianPersonalSummaryResponse {
  success: boolean;
  data: TechnicianPersonalSummary;
}

// ==========================================
// CASH HANDOVER & COLLECTION CONTRACTS
// ==========================================

export type CashHandoverStatus = 'PENDING' | 'SUBMITTED' | 'RECEIVED';

export interface CashHandoverItem {
  id: string;
  paymentId: string;
  paymentNumber?: string;
  serviceId?: string | null;
  serviceNumber?: string | null;
  jobCardId?: string | null;
  jobCardNumber?: string | null;
  technicianId: string;
  technicianName?: string;
  customerId?: string | null;
  customerName?: string | null;
  amount: number;
  status: CashHandoverStatus;
  collectedAt: string | Date;
  submittedAt?: string | Date | null;
  handedOverAt?: string | Date | null;
  receivedBy?: string | null;
  receivedByName?: string | null;
  notes?: string | null;
  companyId?: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface CashHandoverSummary {
  totalCollected: number;
  totalSubmitted: number;
  totalReceived: number;
  totalPending: number;
  outstandingBalance: number;
  byTechnician: {
    technicianId: string;
    technicianName: string;
    collected: number;
    submitted: number;
    received: number;
    pending: number;
    outstandingBalance: number;
  }[];
}

export interface TechnicianCashSummary {
  cashCollected: number;
  submittedForHandover: number;
  cashHandedOver: number;
  pendingHandover: number;
  outstandingBalance: number;
}

export interface TechnicianCashSummaryResponse {
  success: boolean;
  data: TechnicianCashSummary;
}


