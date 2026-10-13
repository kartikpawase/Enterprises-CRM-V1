import { z } from 'zod';

// ==========================================
// 1. COMMON UTILITY SCHEMAS
// ==========================================

export const UuidParamSchema = z.object({
  id: z.string().uuid('Invalid UUID identifier'),
});
export type UuidParam = z.infer<typeof UuidParamSchema>;

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(20),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc').optional(),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

export const DateRangeFilterSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
export type DateRangeFilter = z.infer<typeof DateRangeFilterSchema>;

// ==========================================
// 2. AUTHENTICATION & SECURITY SCHEMAS
// ==========================================

export const LoginRequestSchema = z.object({
  username: z.string().min(1, 'Username is required').trim(),
  password: z.string().min(1, 'Password is required'),
  challengeId: z.string().min(1, 'CAPTCHA challenge ID is required'),
  captcha: z.string().min(1, 'CAPTCHA text is required').trim(),
});
export type LoginRequestInput = z.infer<typeof LoginRequestSchema>;

export const CaptchaVerificationSchema = z.object({
  challengeId: z.string().min(1, 'Challenge ID is required'),
  captcha: z.string().min(1, 'CAPTCHA is required'),
});

// ==========================================
// 3. CUSTOMER SCHEMAS
// ==========================================

export const CustomerAddressSchema = z.object({
  id: z.string().uuid().optional(),
  type: z.enum(['BILLING', 'SERVICE', 'BOTH']).optional(),
  addressType: z.enum(['BILLING', 'SERVICE', 'BOTH']).optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional().nullable(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  postalCode: z.string().optional(),
  landmark: z.string().optional().nullable(),
  isDefault: z.boolean().optional(),
});
export type CustomerAddressInput = {
  id?: string;
  type?: 'BILLING' | 'SERVICE' | 'BOTH';
  addressType?: 'BILLING' | 'SERVICE' | 'BOTH';
  addressLine1: string;
  addressLine2?: string | null;
  city?: string;
  state?: string;
  pincode?: string;
  postalCode?: string;
  landmark?: string | null;
  isDefault?: boolean;
};

export const CreateCustomerSchema = z
  .object({
    fullName: z.string().min(1, 'Full name is required').trim(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    phone: z.string().min(10, 'Phone must be at least 10 digits').trim(),
    alternatePhone: z.preprocess((val) => (typeof val === 'string' && val.trim() === '' ? null : val), z.string().nullable().optional()),
    email: z.preprocess((val) => (typeof val === 'string' && val.trim() === '' ? null : val), z.string().email('Invalid email address').nullable().optional()),
    customerType: z
      .enum(['INDIVIDUAL', 'COMMERCIAL', 'RESIDENTIAL', 'INDUSTRIAL', 'INSTITUTIONAL'])
      .default('INDIVIDUAL')
      .transform((val) => {
        if (val === 'RESIDENTIAL') return 'INDIVIDUAL';
        if (val === 'INDUSTRIAL' || val === 'INSTITUTIONAL') return 'COMMERCIAL';
        return val as 'INDIVIDUAL' | 'COMMERCIAL';
      }),
    companyName: z.preprocess((val) => (typeof val === 'string' && val.trim() === '' ? null : val), z.string().nullable().optional()),
    gstin: z.preprocess((val) => (typeof val === 'string' && val.trim() === '' ? null : val), z.string().nullable().optional()),
    gstNumber: z.preprocess((val) => (typeof val === 'string' && val.trim() === '' ? null : val), z.string().nullable().optional()),
    notes: z.preprocess((val) => (typeof val === 'string' && val.trim() === '' ? null : val), z.string().nullable().optional()),
    customerLabel: z
      .enum(['GOOD', 'BAD', 'NONE'])
      .optional()
      .nullable()
      .transform((val) => (val === 'NONE' || !val ? null : (val as 'GOOD' | 'BAD'))),
    addressLine1: z.string().optional(),
    addressLine2: z.string().optional().nullable(),
    city: z.string().optional(),
    state: z.string().optional(),
    postalCode: z.string().optional(),
    pincode: z.string().optional(),
    addresses: z.array(CustomerAddressSchema).optional(),
  })
  .transform((val) => {
    const fullName =
      val.fullName ||
      [val.firstName, val.lastName].filter(Boolean).join(' ') ||
      'Customer';

    let addresses = (val.addresses || [])
      .map((a) => ({
        ...a,
        addressLine1: (a?.addressLine1 || '').trim() || 'Main Service Location',
        city: (a?.city || val.city || '').trim(),
        state: (a?.state || val.state || '').trim(),
        postalCode: (a?.postalCode || a?.pincode || val.postalCode || val.pincode || '').trim(),
      }));

    if (addresses.length === 0) {
      addresses = [
        {
          addressLine1: (val.addressLine1 || 'Main Service Location').trim(),
          addressLine2: val.addressLine2 || null,
          city: (val.city || '').trim(),
          state: (val.state || '').trim(),
          postalCode: (val.postalCode || val.pincode || '').trim(),
          pincode: (val.pincode || val.postalCode || '').trim(),
          isDefault: true,
          type: 'BOTH',
          addressType: 'SERVICE',
        },
      ];
    }

    return {
      ...val,
      fullName,
      addresses,
    };
  });
export type CreateCustomerInput = z.infer<typeof CreateCustomerSchema>;

export const CustomerLabelSchema = z.enum(['GOOD', 'BAD']);
export type CustomerLabel = z.infer<typeof CustomerLabelSchema>;

export const CreateCustomLabelSchema = z.object({
  name: z.string().trim().min(1, 'Label name cannot be blank').max(40, 'Label name cannot exceed 40 characters'),
  color: z.string().trim().min(1, 'Label color is required').regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Color must be a valid hex code (e.g. #3B82F6)'),
  description: z.string().trim().max(255).optional().nullable(),
});
export type CreateCustomLabelInput = z.infer<typeof CreateCustomLabelSchema>;

export const UpdateCustomLabelSchema = z.object({
  name: z.string().trim().min(1, 'Label name cannot be blank').max(40, 'Label name cannot exceed 40 characters').optional(),
  color: z.string().trim().regex(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Color must be a valid hex code').optional(),
  description: z.string().trim().max(255).optional().nullable(),
});
export type UpdateCustomLabelInput = z.infer<typeof UpdateCustomLabelSchema>;

export const UpdateCustomerLabelSchema = z.object({
  label: z
    .enum(['GOOD', 'BAD', 'CUSTOM', 'NONE'])
    .nullable()
    .optional(),
  customLabelId: z.string().uuid().nullable().optional(),
  newCustomLabel: CreateCustomLabelSchema.optional(),
});
export type UpdateCustomerLabelInput = z.infer<typeof UpdateCustomerLabelSchema>;

export const UpdateCustomerSchema = z
  .object({
    fullName: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    phone: z.string().min(10, 'Phone must be at least 10 digits').optional(),
    alternatePhone: z.string().optional().nullable(),
    email: z.string().email('Invalid email address').optional().nullable().or(z.literal('')),
    customerType: z
      .enum(['INDIVIDUAL', 'COMMERCIAL', 'RESIDENTIAL', 'INDUSTRIAL', 'INSTITUTIONAL'])
      .optional()
      .transform((val) => {
        if (!val) return undefined;
        if (val === 'RESIDENTIAL') return 'INDIVIDUAL';
        if (val === 'INDUSTRIAL' || val === 'INSTITUTIONAL') return 'COMMERCIAL';
        return val as 'INDIVIDUAL' | 'COMMERCIAL';
      }),
    companyName: z.string().optional().nullable(),
    gstin: z.string().optional().nullable(),
    gstNumber: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
    customerLabel: z
      .enum(['GOOD', 'BAD', 'NONE'])
      .optional()
      .nullable()
      .transform((val) => (val === 'NONE' ? null : (val as 'GOOD' | 'BAD' | null))),
    addresses: z.array(CustomerAddressSchema).optional(),
  });
export type UpdateCustomerInput = z.infer<typeof UpdateCustomerSchema>;

export const CustomerQueryFilterSchema = PaginationQuerySchema.extend({
  sortBy: z.string().default('customerNumber').optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc').optional(),
  customerType: z
    .enum(['INDIVIDUAL', 'COMMERCIAL', 'ALL'])
    .optional()
    .transform((val) => (val === 'ALL' || !val ? undefined : val)),
  status: z
    .enum(['ACTIVE', 'INACTIVE', 'ARCHIVED', 'ALL'])
    .optional()
    .transform((val) => (val === 'ALL' || !val ? undefined : val)),
  customerLabel: z
    .enum(['GOOD', 'BAD', 'NONE', 'ALL'])
    .optional()
    .transform((val) => (val === 'ALL' || !val ? undefined : val)),
  city: z
    .string()
    .optional()
    .transform((val) => (val === 'ALL' || !val || !val.trim() ? undefined : val.trim())),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  dateRange: z.string().optional(),
});
export type CustomerQueryFilterInput = z.infer<typeof CustomerQueryFilterSchema>;

export const CheckDuplicateCustomerSchema = z.object({
  phone: z.string().optional(),
  email: z.string().optional(),
  excludeId: z.string().uuid().optional(),
  excludeCustomerId: z.string().uuid().optional(),
});
export type CheckDuplicateCustomerInput = {
  phone?: string;
  email?: string;
  excludeId?: string;
  excludeCustomerId?: string;
};

export const CustomerNoteSchema = z.object({
  content: z.string().min(1, 'Note content is required'),
});
export type CustomerNoteInput = z.infer<typeof CustomerNoteSchema>;

export const ArchiveCustomerSchema = z.object({
  reason: z.string().optional(),
});
export type ArchiveCustomerInput = z.infer<typeof ArchiveCustomerSchema>;

// ==========================================
// 4. PRODUCT & CATALOG SCHEMAS
// ==========================================

export const CreateProductSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  sku: z.string().min(1, 'SKU is required'),
  productType: z.enum(['RO_MACHINE', 'SPARE_PART']),
  brand: z.string().min(1, 'Brand is required'),
  model: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  unitPrice: z.coerce.number().min(0, 'Price must be >= 0'),
  sellingPrice: z.coerce.number().min(0).optional(),
  mrp: z.coerce.number().min(0).optional().nullable(),
  costPrice: z.coerce.number().min(0).optional().nullable(),
  taxRatePercent: z.coerce.number().min(0).max(100).default(18),
  hsnCode: z.string().optional().nullable(),
  defaultWarrantyMonths: z.coerce.number().int().min(0).default(12),
  warrantyMonths: z.coerce.number().int().min(0).optional(),
  defaultServiceIntervalMonths: z.coerce.number().int().min(0).default(6),
  serviceIntervalMonths: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().default(true),
  stockQuantity: z.coerce.number().int().min(0).default(0),
});
export type CreateProductInput = z.infer<typeof CreateProductSchema>;

export const UpdateProductSchema = CreateProductSchema.partial();
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;

export const ProductQueryFilterSchema = PaginationQuerySchema.extend({
  productType: z.enum(['RO_MACHINE', 'SPARE_PART']).optional(),
  brand: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
});
export type ProductQueryFilter = z.infer<typeof ProductQueryFilterSchema>;

// ==========================================
// 5. CUSTOMER ASSET SCHEMAS
// ==========================================

export const CreateAssetSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID'),
  productId: z.string().uuid('Invalid product ID'),
  serialNumber: z.string().optional().nullable(),
  installationDate: z.string().optional().nullable(),
  installedAddress: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'IN_SERVICE', 'REPLACED', 'DECOMMISSIONED']).default('ACTIVE'),
  notes: z.string().optional().nullable(),
});
export type CreateAssetInput = z.infer<typeof CreateAssetSchema>;

export const UpdateAssetSchema = z.object({
  serialNumber: z.string().optional().nullable(),
  status: z.enum(['ACTIVE', 'IN_SERVICE', 'REPLACED', 'DECOMMISSIONED']).optional(),
  installedAddress: z.string().optional().nullable(),
  customName: z.string().optional().nullable(),
  installationAddressId: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export type UpdateAssetInput = z.infer<typeof UpdateAssetSchema>;

export const AssetQueryFilterSchema = PaginationQuerySchema.extend({
  customerId: z
    .string()
    .optional()
    .transform((val) => (val === 'ALL' || val === 'none' || val === 'null' || !val || !val.trim() ? undefined : val.trim())),
  productId: z
    .string()
    .optional()
    .transform((val) => (val === 'ALL' || val === 'none' || val === 'null' || !val || !val.trim() ? undefined : val.trim())),
  assetType: z.string().optional(),
  serialNumber: z.string().optional(),
  status: z.enum(['ACTIVE', 'IN_SERVICE', 'REPLACED', 'DECOMMISSIONED', 'ALL']).optional(),
});
export type AssetQueryFilter = z.infer<typeof AssetQueryFilterSchema>;

// ==========================================
// 6. INVENTORY & STOCK SCHEMAS
// ==========================================

export const InventoryAdjustmentSchema = z.object({
  productId: z.string().uuid('Invalid product ID'),
  type: z.enum(['PURCHASE', 'SALE', 'RETURN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE', 'TRANSFER']),
  quantity: z.coerce.number().int().positive('Quantity must be a positive integer'),
  reason: z.string().min(1, 'Reason is required'),
  referenceType: z.string().optional(),
  referenceId: z.string().optional(),
});
export type InventoryAdjustmentInput = z.infer<typeof InventoryAdjustmentSchema>;

export const InventoryQueryFilterSchema = PaginationQuerySchema.extend({
  productId: z.string().uuid().optional(),
  type: z.string().optional(),
  lowStockOnly: z.coerce.boolean().optional(),
});
export type InventoryQueryFilter = z.infer<typeof InventoryQueryFilterSchema>;

// ==========================================
// 7. SALES & ORDER SCHEMAS
// ==========================================

export const SaleItemInputSchema = z.object({
  productId: z.string().optional().nullable(),
  productName: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
  productType: z.enum(['RO_MACHINE', 'FILTER_CARTRIDGE', 'SPARE_PART', 'ACCESSORY', 'SERVICE']).optional().nullable(),
  brand: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  purificationCapacity: z.string().optional().nullable(),
  storageCapacity: z.string().optional().nullable(),
  technology: z.string().optional().nullable(),
  installationRequired: z.boolean().optional().nullable(),
  hsnCode: z.string().optional().nullable(),
  partCategory: z.string().optional().nullable(),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
  unitPrice: z.coerce.number().min(0, 'Unit price must be >= 0'),
  discountAmount: z.coerce.number().min(0).default(0),
  taxRatePercent: z.coerce.number().min(0).max(100).default(18),
  serialNumber: z.string().optional().nullable(),
  warrantyPeriodMonths: z.coerce.number().int().min(0).optional().nullable(),
  warrantyMonths: z.coerce.number().int().min(0).optional().nullable(),
  nextServiceDate: z.string().optional().nullable(),
});
export type SaleItemInput = z.infer<typeof SaleItemInputSchema>;

export const CreateSaleSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID'),
  saleDate: z.union([z.string(), z.date()]).optional(),
  status: z.enum(['DRAFT', 'COMPLETED', 'CANCELLED']).default('DRAFT').optional(),
  items: z.array(SaleItemInputSchema).min(1, 'At least one sale item is required').max(10, 'Maximum 10 items allowed'),
  discountAmount: z.coerce.number().min(0).default(0).optional(),
  notes: z.string().optional().nullable(),
  billingAddressId: z.string().uuid().optional().nullable(),
  serviceAddressId: z.string().uuid().optional().nullable(),
  poNumber: z.string().optional().nullable(),
  createInvoice: z.boolean().default(true).optional(),
  activateWarranty: z.boolean().default(true).optional(),
  generateServiceSchedules: z.boolean().default(true).optional(),
});
export type CreateSaleInput = z.infer<typeof CreateSaleSchema>;

export const UpdateSaleSchema = CreateSaleSchema.partial();
export type UpdateSaleInput = z.infer<typeof UpdateSaleSchema>;

export const ConfirmSaleSchema = z.object({
  confirmNotes: z.string().optional(),
  itemSerialNumbers: z.record(z.string()).optional(),
  installationAddressId: z.string().uuid().optional().nullable(),
  installationNotes: z.string().optional().nullable(),
  poNumber: z.string().optional().nullable(),
});
export type ConfirmSaleInput = z.infer<typeof ConfirmSaleSchema>;

export const CancelSaleSchema = z.object({
  reason: z.string().optional(),
  cancellationReason: z.string().optional(),
});
export type CancelSaleInput = {
  reason?: string;
  cancellationReason?: string;
};

export const SaleQueryFilterSchema = PaginationQuerySchema.extend({
  customerId: z
    .string()
    .optional()
    .transform((val) => (val === 'ALL' || !val || !val.trim() ? undefined : val.trim())),
  productId: z
    .string()
    .optional()
    .transform((val) => (val === 'ALL' || !val || !val.trim() ? undefined : val.trim())),
  status: z
    .enum(['DRAFT', 'COMPLETED', 'CANCELLED', 'ALL', 'PROCESSING', 'Delivered', 'Processing', 'Draft', 'Cancelled'])
    .optional()
    .transform((val) => {
      if (!val || val === 'ALL') return undefined;
      if (val === 'Delivered') return 'COMPLETED';
      if (val === 'Draft') return 'DRAFT';
      if (val === 'Cancelled') return 'CANCELLED';
      if (val === 'PROCESSING' || val === 'Processing') return 'DRAFT';
      return val as 'DRAFT' | 'COMPLETED' | 'CANCELLED';
    }),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  datePreset: z.string().optional(),
});
export type SaleQueryFilter = z.infer<typeof SaleQueryFilterSchema>;

// ==========================================
// 7. INVOICE SCHEMAS
// ==========================================

export const CreateInvoiceItemSchema = z.object({
  productId: z.string().uuid().optional().nullable(),
  itemType: z.enum(['PRODUCT', 'SERVICE', 'SPARE_PART', 'CUSTOM']).default('PRODUCT'),
  name: z.string().optional().nullable(),
  description: z.string().min(1, 'Description is required'),
  quantity: z.coerce.number().min(1).default(1),
  unitPrice: z.coerce.number().min(0),
  discountAmount: z.coerce.number().min(0).default(0),
  taxRatePercent: z.coerce.number().min(0).default(18),
});
export type CreateInvoiceItemInput = z.infer<typeof CreateInvoiceItemSchema>;

export const CreateInvoiceSchema = z
  .object({
    customerId: z.string().uuid('Invalid customer ID'),
    saleId: z.string().uuid().optional().nullable(),
    status: z.enum(['DRAFT', 'ISSUED']).default('ISSUED').optional(),
    invoiceDate: z.string().optional(),
    dueDate: z.string().optional(),
    poNumber: z.string().optional().nullable(),
    discountAmount: z.coerce.number().min(0).default(0).optional(),
    items: z
      .array(CreateInvoiceItemSchema)
      .min(1, 'At least one invoice item is required')
      .max(10, 'Maximum 10 items allowed'),
    notes: z.string().optional().nullable(),
    terms: z.string().optional().nullable(),
    termsAndConditions: z.string().optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.invoiceDate && data.dueDate) {
        const invTime = new Date(data.invoiceDate).getTime();
        const dueTime = new Date(data.dueDate).getTime();
        if (isNaN(invTime) || isNaN(dueTime)) return false;
        const invDateOnly = new Date(data.invoiceDate).setHours(0, 0, 0, 0);
        const dueDateOnly = new Date(data.dueDate).setHours(0, 0, 0, 0);
        return dueDateOnly >= invDateOnly;
      }
      return true;
    },
    {
      message: 'Due Date cannot be before Invoice Date',
      path: ['dueDate'],
    }
  );
export type CreateInvoiceInput = z.infer<typeof CreateInvoiceSchema>;

export const CreateInvoiceFromSaleSchema = z.object({
  dueDate: z.string().optional(),
  poNumber: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  termsAndConditions: z.string().optional().nullable(),
});
export type CreateInvoiceFromSaleInput = z.infer<typeof CreateInvoiceFromSaleSchema>;

export const UpdateInvoiceSchema = z
  .object({
    invoiceDate: z.string().optional(),
    dueDate: z.string().optional(),
    poNumber: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    termsAndConditions: z.string().optional().nullable(),
    discountAmount: z.coerce.number().min(0).optional(),
    items: z
      .array(CreateInvoiceItemSchema)
      .min(1)
      .max(10, 'Maximum 10 items allowed')
      .optional(),
  })
  .refine(
    (data) => {
      if (data.invoiceDate && data.dueDate) {
        const invTime = new Date(data.invoiceDate).getTime();
        const dueTime = new Date(data.dueDate).getTime();
        if (isNaN(invTime) || isNaN(dueTime)) return false;
        const invDateOnly = new Date(data.invoiceDate).setHours(0, 0, 0, 0);
        const dueDateOnly = new Date(data.dueDate).setHours(0, 0, 0, 0);
        return dueDateOnly >= invDateOnly;
      }
      return true;
    },
    {
      message: 'Due Date cannot be before Invoice Date',
      path: ['dueDate'],
    }
  );
export type UpdateInvoiceInput = z.infer<typeof UpdateInvoiceSchema>;

export const FinalizeInvoiceSchema = z.object({
  notes: z.string().optional().nullable(),
});
export type FinalizeInvoiceInput = z.infer<typeof FinalizeInvoiceSchema>;

export const CancelInvoiceSchema = z.object({
  reason: z.string().optional(),
  cancellationReason: z.string().optional(),
});
export type CancelInvoiceInput = {
  reason?: string;
  cancellationReason?: string;
};

export const InvoiceQueryFilterSchema = PaginationQuerySchema.extend({
  customerId: z
    .string()
    .optional()
    .transform((val) => (val === 'ALL' || val === 'none' || val === 'null' || !val || !val.trim() ? undefined : val.trim())),
  saleId: z
    .string()
    .optional()
    .transform((val) => (val === 'ALL' || val === 'none' || val === 'null' || !val || !val.trim() ? undefined : val.trim())),
  status: z.enum(['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'ALL']).optional(),
  overdueOnly: z.coerce.boolean().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
export type InvoiceQueryFilter = z.infer<typeof InvoiceQueryFilterSchema>;

// ==========================================
// 8. PAYMENT SCHEMAS
// ==========================================

export const CreatePaymentSchema = z.object({
  invoiceId: z.string().min(1, 'Invoice ID is required'),
  customerId: z.string().optional().nullable(),
  amount: z.coerce.number().min(0.01, 'Payment amount must be greater than 0'),
  paymentDate: z.string().optional(),
  paymentMethod: z.enum(['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'OTHER']),
  referenceNumber: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  nextPaymentDueDate: z.union([z.string(), z.date()]).optional().nullable(),
  nextPaymentDate: z.union([z.string(), z.date()]).optional().nullable(),
});
export type CreatePaymentInput = z.infer<typeof CreatePaymentSchema>;

export const CancelPaymentSchema = z.object({
  reason: z.string().min(1, 'Cancellation reason is required'),
});
export type CancelPaymentInput = z.infer<typeof CancelPaymentSchema>;

export const ReversePaymentSchema = CancelPaymentSchema;
export type ReversePaymentInput = CancelPaymentInput;

export const RefundPaymentSchema = z.object({
  refundAmount: z.coerce.number().min(0.01, 'Refund amount must be > 0').optional(),
  refundReason: z.string().optional(),
  reason: z.string().optional(),
}).transform((data) => {
  const reason = data.reason || data.refundReason || 'Refund processed';
  return {
    reason,
    refundReason: reason,
    refundAmount: data.refundAmount || 0,
  };
});
export type RefundPaymentInput = z.infer<typeof RefundPaymentSchema>;

export const PaymentQueryFilterSchema = PaginationQuerySchema.extend({
  invoiceId: z.string().optional(),
  customerId: z.string().optional(),
  paymentMethod: z.enum(['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'OTHER', 'ALL']).optional(),
  status: z.enum(['COMPLETED', 'PENDING', 'FAILED', 'CANCELLED', 'REFUNDED', 'ALL']).optional(),
  minAmount: z.coerce.number().optional(),
  maxAmount: z.coerce.number().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
export type PaymentQueryFilter = z.infer<typeof PaymentQueryFilterSchema>;

// ==========================================
// 9. REMINDERS & FOLLOW-UP SCHEMAS
// ==========================================

export const CreateReminderSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID'),
  invoiceId: z.string().uuid().optional().nullable(),
  serviceId: z.string().uuid().optional().nullable(),
  paymentId: z.string().uuid().optional().nullable(),
  reminderType: z.enum([
    'PAYMENT_FOLLOW_UP',
    'OVERDUE_PAYMENT',
    'INVOICE_DUE',
    'SERVICE_DUE',
    'WARRANTY_EXPIRY',
    'CUSTOMER_FOLLOW_UP',
  ]),
  reminderDate: z.string(),
  reminderTime: z.string().optional().nullable(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  notes: z.string().optional().nullable(),
});
export type CreateReminderInput = z.infer<typeof CreateReminderSchema>;

export const UpdateReminderSchema = CreateReminderSchema.partial().extend({
  status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED', 'MISSED']).optional(),
});
export type UpdateReminderInput = z.infer<typeof UpdateReminderSchema>;

export const CompleteReminderSchema = z.object({
  notes: z.string().optional().nullable(),
});
export type CompleteReminderInput = z.infer<typeof CompleteReminderSchema>;

export const ReminderQueryFilterSchema = PaginationQuerySchema.extend({
  customerId: z
    .string()
    .optional()
    .transform((val) => (val === 'ALL' || val === 'none' || val === 'null' || !val || !val.trim() ? undefined : val.trim())),
  invoiceId: z
    .string()
    .optional()
    .transform((val) => (val === 'ALL' || val === 'none' || val === 'null' || !val || !val.trim() ? undefined : val.trim())),
  reminderType: z.enum([
    'PAYMENT_FOLLOW_UP',
    'OVERDUE_PAYMENT',
    'INVOICE_DUE',
    'SERVICE_DUE',
    'WARRANTY_EXPIRY',
    'CUSTOMER_FOLLOW_UP',
    'ALL',
  ]).optional(),
  status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED', 'MISSED', 'ALL']).optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT', 'ALL']).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
export type ReminderQueryFilter = z.infer<typeof ReminderQueryFilterSchema>;

// ==========================================
// 10. SERVICES & MAINTENANCE SCHEMAS
// ==========================================

export const CreateServiceSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID'),
  assetId: z.string().optional().nullable(),
  machineName: z.string().optional().nullable(),
  warrantyId: z.string().uuid('Invalid warranty ID').optional().nullable(),
  serviceType: z.enum(['INSTALLATION', 'REPAIR', 'PERIODIC_MAINTENANCE', 'EMERGENCY', 'SPARE_REPLACEMENT']),
  serviceLocation: z.enum(['DOORSTEP', 'IN_SHOP']).default('DOORSTEP'),
  serviceClassification: z.enum(['GENERAL', 'WARRANTY']).default('GENERAL'),
  scheduledDate: z.string().min(1, 'Scheduled visit date is required'),
  scheduledTimeSlot: z.string().optional().nullable(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  customerNotes: z.string().optional().nullable(),
  internalNotes: z.string().optional().nullable(),
  technicianId: z.string().uuid('Invalid technician ID').optional().nullable(),
});
export type CreateServiceInput = z.infer<typeof CreateServiceSchema>;

export const UpdateServiceSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID').optional(),
  assetId: z.string().optional().nullable().or(z.literal('')),
  machineName: z.string().optional().nullable(),
  warrantyId: z.string().uuid('Invalid warranty ID').optional().nullable().or(z.literal('')),
  serviceType: z.enum(['INSTALLATION', 'REPAIR', 'PERIODIC_MAINTENANCE', 'EMERGENCY', 'SPARE_REPLACEMENT']).optional(),
  serviceLocation: z.enum(['DOORSTEP', 'IN_SHOP']).optional(),
  serviceClassification: z.enum(['GENERAL', 'WARRANTY']).optional(),
  scheduledDate: z.string().optional(),
  scheduledTimeSlot: z.string().optional().nullable(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
  customerNotes: z.string().optional().nullable(),
  internalNotes: z.string().optional().nullable(),
  technicianId: z.string().uuid('Invalid technician ID').optional().nullable().or(z.literal('')),
  status: z.enum(['SCHEDULED', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED', 'OVERDUE']).optional(),
  cancelReason: z.string().optional().nullable(),
  // Job card execution fields
  diagnosis: z.string().optional().nullable(),
  workPerformed: z.string().optional().nullable(),
  technicianNotes: z.string().optional().nullable(),
  customerRemarks: z.string().optional().nullable(),
  laborCharges: z.coerce.number().optional().nullable(),
  partsCharges: z.coerce.number().optional().nullable(),
  totalCharges: z.coerce.number().optional().nullable(),
  partsReplaced: z.array(z.any()).optional(),
});
export type UpdateServiceInput = z.infer<typeof UpdateServiceSchema>;

export const CompleteServiceSchema = z.object({
  workSummary: z.string().optional(),
  workPerformed: z.string().optional(),
  diagnosis: z.string().optional().nullable(),
  partsReplaced: z.array(z.any()).optional(),
  finalTds: z.coerce.number().optional().nullable(),
  rawWaterTds: z.coerce.number().optional().nullable(),
  customerSignatureUrl: z.string().optional().nullable(),
  laborCharges: z.coerce.number().optional().nullable(),
  partsCharges: z.coerce.number().optional().nullable(),
  totalCharges: z.coerce.number().optional().nullable(),
  technicianNotes: z.string().optional().nullable(),
  customerRemarks: z.string().optional().nullable(),
  nextServiceRecommendationMonths: z.coerce.number().optional().nullable(),
  scheduleNextService: z.boolean().optional(),
  nextServiceDate: z.string().optional().nullable(),
  initialPayment: z.object({
    amount: z.coerce.number(),
    paymentMethod: z.string().optional(),
    referenceNumber: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
  }).optional(),
}).passthrough();
export type CompleteServiceInput = z.infer<typeof CompleteServiceSchema>;

export const ServiceQueryFilterSchema = PaginationQuerySchema.extend({
  customerId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  technicianId: z.string().uuid().optional(),
  serviceType: z.enum(['INSTALLATION', 'REPAIR', 'PERIODIC_MAINTENANCE', 'EMERGENCY', 'SPARE_REPLACEMENT']).optional(),
  status: z.enum(['SCHEDULED', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED', 'OVERDUE', 'ALL']).optional(),
  classification: z.string().optional(),
  location: z.string().optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT', 'ALL']).optional(),
  targetDate: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
export type ServiceQueryFilter = z.infer<typeof ServiceQueryFilterSchema>;

// ==========================================
// 11. JOB CARDS & FIELD OPERATIONS SCHEMAS
// ==========================================

export const JobCardPartItemSchema = z.object({
  partName: z.string().min(1, 'Part name is required'),
  partSku: z.string().optional(),
  quantity: z.coerce.number().int().min(1),
  unitPrice: z.coerce.number().min(0),
  totalPrice: z.coerce.number().min(0),
  isWarrantyCovered: z.boolean().default(false),
});
export type JobCardPartItem = z.infer<typeof JobCardPartItemSchema>;

export const CreateJobCardSchema = z.object({
  serviceId: z.string().uuid('Invalid service ID'),
  customerId: z.string().uuid('Invalid customer ID'),
  assetId: z.string().uuid().optional().nullable(),
  technicianId: z.string().uuid().optional().nullable(),
  problemReported: z.string().optional().nullable(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL').optional(),
  initialTds: z.coerce.number().optional().nullable(),
  rawWaterTds: z.coerce.number().optional().nullable(),
});
export type CreateJobCardInput = z.infer<typeof CreateJobCardSchema>;

export const AssignTechnicianSchema = z.object({
  technicianId: z.string().uuid('Invalid technician ID'),
  assignedNotes: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export type AssignTechnicianInput = {
  technicianId: string;
  assignedNotes?: string | null;
  notes?: string | null;
};

export const UpdateJobCardWorkSchema = z.object({
  diagnosis: z.string().optional().nullable(),
  workPerformed: z.string().optional().nullable(),
  partsUsed: z.array(JobCardPartItemSchema).optional(),
  partsReplaced: z.array(z.any()).optional(),
  inputTds: z.coerce.number().optional().nullable(),
  outputTds: z.coerce.number().optional().nullable(),
  rejectionRatePercent: z.coerce.number().optional().nullable(),
  laborCharges: z.coerce.number().optional().nullable(),
  partsCharges: z.coerce.number().optional().nullable(),
  totalCharges: z.coerce.number().optional().nullable(),
  technicianNotes: z.string().optional().nullable(),
  customerRemarks: z.string().optional().nullable(),
  nextServiceRecommendationMonths: z.coerce.number().optional().nullable(),
  nextServiceNotes: z.string().optional().nullable(),
});
export type UpdateJobCardWorkInput = z.infer<typeof UpdateJobCardWorkSchema>;

export const CompleteJobCardSchema = z.object({
  workPerformed: z.string().min(1, 'Work performed summary is required'),
  partsUsed: z.array(JobCardPartItemSchema).optional(),
  partsReplaced: z.array(z.any()).optional(),
  diagnosis: z.string().optional().nullable(),
  inputTds: z.coerce.number().optional().nullable(),
  outputTds: z.coerce.number().optional().nullable(),
  customerRating: z.coerce.number().min(1).max(5).optional().nullable(),
  customerFeedback: z.string().optional().nullable(),
  customerRemarks: z.string().optional().nullable(),
  technicianNotes: z.string().optional().nullable(),
  laborCharges: z.coerce.number().optional().nullable(),
  partsCharges: z.coerce.number().optional().nullable(),
  totalCharges: z.coerce.number().optional().nullable(),
  nextServiceRecommendationMonths: z.coerce.number().optional().nullable(),
  nextServiceNotes: z.string().optional().nullable(),
  scheduleNextService: z.boolean().optional(),
  nextServiceDate: z.string().optional().nullable(),
  customerSignatureUrl: z.string().optional().nullable(),
});
export type CompleteJobCardInput = z.infer<typeof CompleteJobCardSchema>;

export const JobCardActionSchema = z.object({
  action: z.enum([
    'START',
    'HOLD',
    'RESUME',
    'CANCEL',
    'REOPEN',
    'CLOSE',
    'accept',
    'start',
    'resume',
    'hold',
    'cancel',
    'reopen',
    'close',
  ]),
  reason: z.string().optional(),
  notes: z.string().optional(),
});
export type JobCardActionInput = z.infer<typeof JobCardActionSchema>;

export const JobCardQueryFilterSchema = PaginationQuerySchema.extend({
  technicianId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  priority: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  status: z.enum([
    'SCHEDULED',
    'ASSIGNED',
    'STARTED',
    'DIAGNOSIS',
    'IN_PROGRESS',
    'ON_HOLD',
    'COMPLETED',
    'CUSTOMER_CONFIRMED',
    'CLOSED',
    'CANCELLED',
    'ALL',
  ]).optional(),
});
export type JobCardQueryFilter = z.infer<typeof JobCardQueryFilterSchema>;

// ==========================================
// 12. TECHNICIANS SCHEMAS
// ==========================================

export const CreateTechnicianSchema = z.object({
  userId: z.string().uuid().optional().nullable(),
  fullName: z.string().min(1, 'Full name is required'),
  phone: z.string().min(10, 'Phone must be at least 10 digits'),
  email: z.string().email('Invalid email').optional().nullable(),
  status: z.enum(['ACTIVE', 'ON_LEAVE', 'INACTIVE', 'SUSPENDED']).default('ACTIVE'),
  specialization: z.string().optional().nullable(),
  serviceArea: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  skills: z.array(z.string()).optional(),
  emergencyContact: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  portalEnabled: z.boolean().optional(),
});
export type CreateTechnicianInput = z.infer<typeof CreateTechnicianSchema>;

export const UpdateTechnicianSchema = CreateTechnicianSchema.partial();
export type UpdateTechnicianInput = z.infer<typeof UpdateTechnicianSchema>;

export const TogglePortalAccessSchema = z.object({
  portalEnabled: z.boolean(),
});
export type TogglePortalAccessInput = z.infer<typeof TogglePortalAccessSchema>;

export const TechnicianQueryFilterSchema = PaginationQuerySchema.extend({
  status: z.enum(['ACTIVE', 'ON_LEAVE', 'INACTIVE', 'SUSPENDED', 'ALL']).optional(),
  serviceArea: z.string().optional(),
});
export type TechnicianQueryFilter = z.infer<typeof TechnicianQueryFilterSchema>;

// ==========================================
// 13. WARRANTY & AMC SCHEMAS
// ==========================================

export const WarrantyTypeSchema = z.enum(['STANDARD_MACHINE', 'EXTENDED_MACHINE', 'SPARE_PART']);
export type WarrantyTypeSchema = z.infer<typeof WarrantyTypeSchema>;

export const CreateWarrantySchema = z.object({
  customerId: z.string().uuid('Invalid customer ID'),
  assetId: z.string().uuid('Invalid asset ID'),
  saleId: z.string().uuid().optional().nullable(),
  warrantyType: WarrantyTypeSchema.default('STANDARD_MACHINE'),
  startDate: z.string(),
  endDate: z.string(),
  durationMonths: z.coerce.number().int().min(1, 'Duration must be >= 1 month'),
  terms: z.string().optional().nullable(),
  coverage: z.union([z.string(), z.array(z.string())]).optional().nullable(),
});
export type CreateWarrantyInput = z.infer<typeof CreateWarrantySchema>;

export const UpdateWarrantySchema = CreateWarrantySchema.partial().extend({
  status: z.enum(['ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'VOID', 'CANCELLED']).optional(),
  reason: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});
export type UpdateWarrantyInput = z.infer<typeof UpdateWarrantySchema>;

export const ExtendWarrantySchema = z.object({
  durationMonths: z.coerce.number().int().min(1, 'Extension months must be >= 1'),
  extensionFee: z.coerce.number().min(0).default(0),
  notes: z.string().optional().nullable(),
});
export type ExtendWarrantyInput = z.infer<typeof ExtendWarrantySchema>;

export const WarrantyQueryFilterSchema = PaginationQuerySchema.extend({
  customerId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  status: z.enum(['ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'VOID', 'CANCELLED', 'ALL']).optional(),
  warrantyType: z.enum(['STANDARD_MACHINE', 'EXTENDED_MACHINE', 'SPARE_PART', 'ALL']).optional(),
  expiringDays: z.coerce.number().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});
export type WarrantyQueryFilter = z.infer<typeof WarrantyQueryFilterSchema>;

// ==========================================
// 14. INQUIRIES & LEADS SCHEMAS
// ==========================================

export const PublicInquirySubmissionSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').trim().optional(),
  name: z.string().min(1).trim().optional(),
  phone: z.string().min(10, 'Valid phone number required').trim(),
  email: z.string().email('Invalid email').optional().nullable().or(z.literal('')),
  city: z.string().optional().nullable(),
  pincode: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  serviceType: z.string().optional().nullable(),
  serviceInterest: z.string().optional().nullable(),
  productInterest: z.string().optional().nullable(),
  inquiryType: z.string().optional().nullable(),
  source: z.enum([
    'WEBSITE',
    'DIRECT',
    'DIRECT_CALL',
    'PHONE',
    'WHATSAPP',
    'REFERRAL',
    'SOCIAL',
    'WALK_IN',
    'OTHER',
  ]).default('WEBSITE').optional(),
  message: z.string().optional().nullable(),
  websiteUrlHoneypot: z.string().optional().nullable(),
  captchaChallengeId: z.string().optional().nullable(),
  captchaCode: z.string().optional().nullable(),
}).transform((d) => ({
  fullName: d.fullName || d.name || 'Website Inquiry',
  phone: d.phone,
  email: d.email,
  city: d.city,
  pincode: d.pincode,
  address: d.address,
  serviceType: d.serviceType || d.serviceInterest,
  productInterest: d.productInterest,
  inquiryType: d.inquiryType,
  source: d.source || 'WEBSITE',
  message: d.message,
  websiteUrlHoneypot: d.websiteUrlHoneypot,
  captchaChallengeId: d.captchaChallengeId,
  captchaCode: d.captchaCode,
}));
export type PublicInquirySubmissionInput = z.infer<typeof PublicInquirySubmissionSchema>;

export const CreateInquirySchema = z.object({
  source: z.enum([
    'WEBSITE',
    'DIRECT',
    'DIRECT_CALL',
    'PHONE',
    'WHATSAPP',
    'REFERRAL',
    'SOCIAL',
    'WALK_IN',
    'OTHER',
  ]).default('DIRECT').optional(),
  type: z.enum([
    'NEW_PURCHASE',
    'SERVICE',
    'REPAIR',
    'WARRANTY',
    'INSTALLATION',
    'PRODUCT_INFORMATION',
    'GENERAL',
  ]).default('GENERAL').optional(),
  inquiryType: z.string().optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL').optional(),
  customerName: z.string().optional(),
  name: z.string().optional(),
  phone: z.string().min(10, 'Phone must be at least 10 digits'),
  email: z.string().email('Invalid email').optional().nullable().or(z.literal('')),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  pincode: z.string().optional().nullable(),
  productInterest: z.string().optional().nullable(),
  serviceInterest: z.string().optional().nullable(),
  serviceType: z.string().optional().nullable(),
  message: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  assignedToUserId: z.string().uuid().optional().nullable(),
  followUpDate: z.string().optional().nullable(),
  isPublicSubmission: z.boolean().optional(),
});
export type CreateInquiryInput = z.infer<typeof CreateInquirySchema>;

export const UpdateInquirySchema = CreateInquirySchema.partial();
export type UpdateInquiryInput = z.infer<typeof UpdateInquirySchema>;

export const AssignInquirySchema = z.object({
  assignedToUserId: z.string().uuid('Invalid user ID').optional().nullable(),
  notes: z.string().optional().nullable(),
});
export type AssignInquiryInput = {
  assignedToUserId?: string | null;
  notes?: string | null;
};

export const UpdateInquiryStatusSchema = z.object({
  status: z.enum(['NEW', 'CONTACTED', 'FOLLOW_UP', 'IN_PROGRESS', 'QUALIFIED', 'CONVERTED', 'CLOSED', 'SPAM']),
  notes: z.string().optional().nullable(),
});
export type UpdateInquiryStatusInput = z.infer<typeof UpdateInquiryStatusSchema>;

export const InquiryFollowUpSchema = z.object({
  followUpDate: z.string().optional(),
  notes: z.string().optional().nullable(),
  status: z.string().optional(),
  createReminder: z.boolean().optional(),
  reminderPriority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).optional(),
});
export type InquiryFollowUpInput = {
  followUpDate?: string;
  notes?: string | null;
  status?: string;
  createReminder?: boolean;
  reminderPriority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
};

export const ConvertInquirySchema = z.object({
  customerType: z.enum(['INDIVIDUAL', 'COMMERCIAL']).default('INDIVIDUAL').optional(),
  companyName: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  existingCustomerId: z.string().uuid().optional().nullable(),
  gstNumber: z.string().optional().nullable(),
  gstin: z.string().optional().nullable(),
  addressLine1: z.string().optional().nullable(),
  addressLine2: z.string().optional().nullable(),
  landmark: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  pincode: z.string().optional().nullable(),
});
export type ConvertInquiryInput = z.infer<typeof ConvertInquirySchema>;

export const InquiryQueryFilterSchema = PaginationQuerySchema.extend({
  status: z.enum(['NEW', 'CONTACTED', 'FOLLOW_UP', 'IN_PROGRESS', 'QUALIFIED', 'CONVERTED', 'CLOSED', 'SPAM', 'ALL']).optional(),
  source: z.enum([
    'WEBSITE',
    'DIRECT',
    'DIRECT_CALL',
    'PHONE',
    'WHATSAPP',
    'REFERRAL',
    'SOCIAL',
    'WALK_IN',
    'OTHER',
    'ALL',
  ]).optional(),
  type: z.enum([
    'NEW_PURCHASE',
    'SERVICE',
    'REPAIR',
    'WARRANTY',
    'INSTALLATION',
    'PRODUCT_INFORMATION',
    'GENERAL',
    'ALL',
  ]).optional(),
  inquiryType: z.string().optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT', 'ALL']).optional(),
  assignedToUserId: z.string().uuid().optional(),
  isPossibleDuplicate: z.coerce.boolean().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
export type InquiryQueryFilterInput = z.infer<typeof InquiryQueryFilterSchema>;

// ==========================================
// 15. WHATSAPP BUSINESS SCHEMAS
// ==========================================

export const SendWhatsAppTextMessageSchema = z.object({
  recipientPhone: z.string().min(10).optional(),
  phone: z.string().min(10).optional(),
  text: z.string().min(1).optional(),
  content: z.string().min(1).default(''),
  conversationId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
});
export type SendWhatsAppTextMessageInput = z.infer<typeof SendWhatsAppTextMessageSchema>;

export const SendWhatsAppTemplateMessageSchema = z.object({
  recipientPhone: z.string().min(10, 'Recipient phone is required'),
  phone: z.string().min(10).optional(),
  templateName: z.string().min(1, 'Template name is required'),
  languageCode: z.string().default('en_US').optional(),
  parameters: z.record(z.string()).default({}),
  templateParams: z.record(z.string()).optional(),
  conversationId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
});
export type SendWhatsAppTemplateMessageInput = z.infer<typeof SendWhatsAppTemplateMessageSchema>;

export const UpdateWhatsAppConsentSchema = z.object({
  contactId: z.string().uuid('Invalid contact ID'),
  optInStatus: z.enum(['OPTED_IN', 'OPTED_OUT', 'UNKNOWN']),
});
export type UpdateWhatsAppConsentInput = z.infer<typeof UpdateWhatsAppConsentSchema>;

export const WhatsAppConversationQueryFilterSchema = PaginationQuerySchema.extend({
  status: z.enum(['ACTIVE', 'CLOSED', 'ARCHIVED']).optional(),
  assignedUserId: z.string().uuid().optional(),
});
export type WhatsAppConversationQueryFilterInput = z.infer<typeof WhatsAppConversationQueryFilterSchema>;

// ==========================================
// 16. NOTIFICATIONS SCHEMAS
// ==========================================

export const notificationQueryFilterSchema = PaginationQuerySchema.extend({
  isRead: z.coerce.boolean().optional(),
  severity: z.enum(['INFO', 'SUCCESS', 'WARNING', 'CRITICAL']).optional(),
  notificationType: z.string().optional(),
  entityType: z.string().optional().nullable(),
});
export type NotificationQueryFilterInput = z.infer<typeof notificationQueryFilterSchema>;

export const updateNotificationPreferencesSchema = z.object({
  emailAlerts: z.boolean().optional(),
  whatsappAlerts: z.boolean().optional(),
  systemAlerts: z.boolean().optional(),
  serviceReminders: z.boolean().optional(),
  paymentAlerts: z.boolean().optional(),
});
export type UpdateNotificationPreferencesInput = z.infer<typeof updateNotificationPreferencesSchema>;

// ==========================================
// 17. ANALYTICS & REPORTING SCHEMAS
// ==========================================

export const analyticsDateFilterSchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  preset: z.string().optional(),
  range: z.string().optional(),
  timezone: z.string().optional(),
});
export type AnalyticsDateFilterInput = z.infer<typeof analyticsDateFilterSchema>;

export const analyticsExportQuerySchema = analyticsDateFilterSchema.extend({
  format: z.enum(['csv', 'json', 'pdf']).default('csv').optional(),
  section: z.string().optional(),
  category: z.string().default('overview').optional(),
}).transform((d) => ({
  ...d,
  category: d.category || d.section || 'overview',
  section: d.section || d.category || 'overview',
  format: d.format || 'csv',
}));
export type AnalyticsExportQueryInput = z.infer<typeof analyticsExportQuerySchema>;

// ==========================================
// 18. SERVICE BILLING SCHEMAS (PHASE 22)
// ==========================================

export const ServiceBillingItemSchema = z.object({
  productId: z.string().uuid().optional().nullable(),
  itemType: z.enum(['PRODUCT', 'SPARE_PART', 'SERVICE', 'CUSTOM']).default('SPARE_PART'),
  name: z.string().min(1, 'Item name is required'),
  quantity: z.coerce.number().int().min(1, 'Quantity must be >= 1').default(1),
  unitPrice: z.coerce.number().min(0, 'Unit price must be non-negative'),
  discountAmount: z.coerce.number().min(0).default(0),
  taxRatePercent: z.coerce.number().min(0).default(18),
  isWarrantyCovered: z.boolean().default(false),
  description: z.string().optional().nullable(),
});
export type ServiceBillingItemInput = z.infer<typeof ServiceBillingItemSchema>;

export const GenerateServiceInvoiceSchema = z.object({
  jobCardId: z.string().uuid('Invalid Job Card ID').optional(),
  serviceId: z.string().uuid('Invalid Service ID').optional(),
  dueDate: z.string().optional(),
  discountAmount: z.coerce.number().min(0).default(0),
  notes: z.string().optional().nullable(),
  termsAndConditions: z.string().optional().nullable(),
  customItems: z.array(ServiceBillingItemSchema).optional(),
});
export type GenerateServiceInvoiceInput = z.infer<typeof GenerateServiceInvoiceSchema>;

export const ServiceChargeSchema = z.object({
  jobCardId: z.string().uuid('Invalid Job Card ID'),
  chargeType: z.enum(['LABOUR', 'INSPECTION', 'VISIT_FEE', 'CUSTOM']),
  description: z.string().min(1, 'Description is required'),
  amount: z.coerce.number().min(0, 'Amount must be non-negative'),
  isWarrantyCovered: z.boolean().default(false),
});
export type ServiceChargeInput = z.infer<typeof ServiceChargeSchema>;

// ==========================================
// 19. DUES & SCHEDULED ACTIVITIES SCHEMAS
// ==========================================

export const DuesQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
    .optional(),
});
export type DuesQueryInput = z.infer<typeof DuesQuerySchema>;

export const DuesMonthSummaryQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});
export type DuesMonthSummaryQueryInput = z.infer<typeof DuesMonthSummaryQuerySchema>;

// ==========================================
// 20. INVENTORY MANAGEMENT SCHEMAS
// ==========================================

export const CreateInventoryItemSchema = z.object({
  name: z.string().min(1, 'Item name is required'),
  category: z.string().min(1, 'Category is required').default('Filter'),
  brand: z.string().optional().nullable(),
  partNumber: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  purchasePrice: z.coerce.number().min(0, 'Purchase price must be >= 0'),
  sellingPrice: z.coerce.number().min(0, 'Selling price must be >= 0'),
  initialStock: z.coerce.number().int().min(0, 'Initial stock must be >= 0').default(0),
  minStockLevel: z.coerce.number().int().min(0, 'Minimum stock level must be >= 0').default(0),
  status: z.enum(['ACTIVE', 'INACTIVE', 'DISCONTINUED']).default('ACTIVE'),
});
export type CreateInventoryItemInput = z.infer<typeof CreateInventoryItemSchema>;

export const UpdateInventoryItemSchema = z.object({
  name: z.string().min(1, 'Item name is required').optional(),
  category: z.string().min(1, 'Category is required').optional(),
  brand: z.string().optional().nullable(),
  partNumber: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  purchasePrice: z.coerce.number().min(0, 'Purchase price must be >= 0').optional(),
  sellingPrice: z.coerce.number().min(0, 'Selling price must be >= 0').optional(),
  minStockLevel: z.coerce.number().int().min(0, 'Minimum stock level must be >= 0').optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'DISCONTINUED']).optional(),
});
export type UpdateInventoryItemInput = z.infer<typeof UpdateInventoryItemSchema>;

export const InventoryItemQueryFilterSchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'DISCONTINUED', 'ALL']).optional(),
  lowStockOnly: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((val) => val === true || val === 'true'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type InventoryItemQueryFilter = z.infer<typeof InventoryItemQueryFilterSchema>;

export const CreateInventoryPurchaseSchema = z.object({
  itemId: z.string().uuid('Invalid inventory item ID'),
  supplierName: z.string().optional().nullable(),
  purchaseDate: z.string().min(1, 'Purchase date is required'),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
  purchasePricePerUnit: z.coerce.number().min(0, 'Purchase cost per unit must be >= 0'),
  notes: z.string().optional().nullable(),
});
export type CreateInventoryPurchaseInput = z.infer<typeof CreateInventoryPurchaseSchema>;

export const UpdateInventoryPurchaseSchema = z.object({
  supplierName: z.string().optional().nullable(),
  purchaseDate: z.string().min(1, 'Purchase date is required').optional(),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1').optional(),
  purchasePricePerUnit: z.coerce.number().min(0, 'Purchase cost per unit must be >= 0').optional(),
  notes: z.string().optional().nullable(),
});
export type UpdateInventoryPurchaseInput = z.infer<typeof UpdateInventoryPurchaseSchema>;

export const InventoryPurchaseQueryFilterSchema = z.object({
  itemId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type InventoryPurchaseQueryFilter = z.infer<typeof InventoryPurchaseQueryFilterSchema>;

export const CreateInventorySaleSchema = z.object({
  itemId: z.string().uuid('Invalid inventory item ID'),
  customerId: z.union([z.string().uuid('Invalid customer ID'), z.literal('')]).optional().nullable(),
  customerName: z.string().optional().nullable(),
  customerPhone: z.string().optional().nullable(),
  saleDate: z.string().min(1, 'Sale date is required'),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
  sellingPricePerUnit: z.coerce.number().min(0, 'Selling price per unit must be >= 0'),
  paymentStatus: z.enum(['COMPLETED', 'PENDING']).default('COMPLETED'),
  notes: z.string().optional().nullable(),
});
export type CreateInventorySaleInput = z.infer<typeof CreateInventorySaleSchema>;

export const UpdateInventorySaleSchema = z.object({
  customerId: z.union([z.string().uuid('Invalid customer ID'), z.literal('')]).optional().nullable(),
  customerName: z.string().optional().nullable(),
  customerPhone: z.string().optional().nullable(),
  saleDate: z.string().min(1, 'Sale date is required').optional(),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1').optional(),
  sellingPricePerUnit: z.coerce.number().min(0, 'Selling price per unit must be >= 0').optional(),
  paymentStatus: z.enum(['COMPLETED', 'PENDING']).optional(),
  notes: z.string().optional().nullable(),
});
export type UpdateInventorySaleInput = z.infer<typeof UpdateInventorySaleSchema>;

export const InventorySaleQueryFilterSchema = z.object({
  itemId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type InventorySaleQueryFilter = z.infer<typeof InventorySaleQueryFilterSchema>;

export const InventoryAnalyticsFilterSchema = z.object({
  period: z.enum(['today', 'week', 'month', 'year', 'custom']).default('month'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
export type InventoryAnalyticsFilter = z.infer<typeof InventoryAnalyticsFilterSchema>;

export const InventoryProfitLedgerFilterSchema = z.object({
  period: z.enum(['today', 'week', 'month', 'year', 'custom']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  itemId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type InventoryProfitLedgerFilter = z.infer<typeof InventoryProfitLedgerFilterSchema>;
 
// ==========================================
// 34. CHATBOT SCHEMAS
// ==========================================

export const CreateChatbotKnowledgeSchema = z.object({
  title: z.string().max(200, 'Title cannot exceed 200 characters').trim().optional().default(''),
  category: z.string().max(100).trim().optional().default(''),
  question: z.string().max(1000, 'Question cannot exceed 1000 characters').trim().optional().default(''),
  answer: z.string().max(10000, 'Answer cannot exceed 10000 characters').trim().optional().default(''),
  isActive: z.boolean().default(true).optional(),
});
export type CreateChatbotKnowledgeSchemaInput = z.infer<typeof CreateChatbotKnowledgeSchema>;

export const UpdateChatbotKnowledgeSchema = z.object({
  title: z.string().max(200).trim().optional().nullable(),
  category: z.string().max(100).trim().optional().nullable(),
  question: z.string().max(1000).trim().optional().nullable(),
  answer: z.string().max(10000).trim().optional().nullable(),
  isActive: z.boolean().optional(),
  isPublished: z.boolean().optional(),
});
export type UpdateChatbotKnowledgeSchemaInput = z.infer<typeof UpdateChatbotKnowledgeSchema>;

export const ChatbotKnowledgeFilterSchema = z.object({
  search: z.string().optional(),
  category: z.string().optional(),
  isActive: z.enum(['true', 'false', 'all']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ChatbotKnowledgeFilter = z.infer<typeof ChatbotKnowledgeFilterSchema>;

export const ChatbotMessageQuerySchema = z.object({
  message: z.string().trim().min(1, 'Message cannot be empty').max(2000, 'Message cannot exceed 2000 characters'),
  conversationId: z.string().uuid('Invalid conversation UUID').optional(),
});
export type ChatbotMessageQueryInput = z.infer<typeof ChatbotMessageQuerySchema>;

// ==========================================
// 35. CASH HANDOVER SCHEMAS
// ==========================================
export const CashHandoverQueryFilterSchema = PaginationQuerySchema.extend({
  technicianId: z.string().uuid().optional(),
  status: z.enum(['ALL', 'PENDING', 'SUBMITTED', 'RECEIVED']).default('ALL'),
  search: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});
export type CashHandoverQueryFilter = z.infer<typeof CashHandoverQueryFilterSchema>;

export const SubmitCashHandoverSchema = z.object({
  notes: z.string().max(500).optional(),
});
export type SubmitCashHandoverInput = z.infer<typeof SubmitCashHandoverSchema>;

export const BatchSubmitCashHandoverSchema = z.object({
  handoverIds: z.array(z.string().uuid()).min(1, 'At least one handover ID must be selected'),
  notes: z.string().max(500).optional(),
});
export type BatchSubmitCashHandoverInput = z.infer<typeof BatchSubmitCashHandoverSchema>;

export const MarkCashReceivedSchema = z.object({
  notes: z.string().max(500).optional(),
});
export type MarkCashReceivedInput = z.infer<typeof MarkCashReceivedSchema>;

export const BatchMarkCashReceivedSchema = z.object({
  handoverIds: z.array(z.string().uuid()).min(1, 'At least one handover ID must be selected'),
  notes: z.string().max(500).optional(),
});
export type BatchMarkCashReceivedInput = z.infer<typeof BatchMarkCashReceivedSchema>;

// ==========================================
// 36. EXPENSES SCHEMAS
// ==========================================

export const CreateExpenseSchema = z.object({
  title: z.string().trim().min(1, 'Expense title is required').max(200),
  category: z.string().trim().min(1, 'Category is required').max(100),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  expenseDate: z.string().min(1, 'Expense date is required').refine((val) => !isNaN(Date.parse(val)), 'Invalid expense date'),
  paymentMethod: z.string().trim().min(1, 'Payment method is required'),
  notes: z.string().max(1000).optional().nullable(),
  recurringScheduleId: z.string().uuid().optional().nullable(),
  occurrencePeriod: z.string().optional().nullable(),
});
export type CreateExpenseInput = z.infer<typeof CreateExpenseSchema>;

export const UpdateExpenseSchema = z.object({
  title: z.string().trim().min(1, 'Expense title is required').max(200).optional(),
  category: z.string().trim().min(1, 'Category is required').max(100).optional(),
  amount: z.coerce.number().positive('Amount must be greater than zero').optional(),
  expenseDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid expense date').optional(),
  paymentMethod: z.string().trim().min(1, 'Payment method is required').optional(),
  notes: z.string().max(1000).optional().nullable(),
});
export type UpdateExpenseInput = z.infer<typeof UpdateExpenseSchema>;

export const VoidExpenseSchema = z.object({
  reason: z.string().trim().min(1, 'Reason for voiding expense is required').max(500),
});
export type VoidExpenseInput = z.infer<typeof VoidExpenseSchema>;

export const ExpenseQueryFilterSchema = PaginationQuerySchema.extend({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  category: z.string().optional(),
  paymentMethod: z.string().optional(),
  status: z.enum(['ALL', 'RECORDED', 'VOIDED']).default('ALL'),
  type: z.enum(['ALL', 'ONE_TIME', 'RECURRING']).default('ALL'),
});
export type ExpenseQueryFilter = z.infer<typeof ExpenseQueryFilterSchema>;

export const CreateExpenseScheduleSchema = z.object({
  title: z.string().trim().min(1, 'Schedule title is required').max(200),
  category: z.string().trim().min(1, 'Category is required').max(100),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']),
  paymentMethod: z.string().trim().min(1, 'Payment method is required'),
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});
export type CreateExpenseScheduleInput = z.infer<typeof CreateExpenseScheduleSchema>;

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

export const ExpenseCategorySchema = z.enum(EXPENSE_CATEGORIES);
export type ExpenseCategory = z.infer<typeof ExpenseCategorySchema>;

export const MonthlyReconciliationQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  leadProfit: z.coerce.number().min(0).optional(),
  serviceEarnings: z.coerce.number().min(0).optional(),
  previousClosingCash: z.coerce.number().optional(),
  actualBankBalance: z.coerce.number().optional(),
  savingsTransfer: z.coerce.number().min(0).optional(),
  previousSavingsBalance: z.coerce.number().min(0).optional(),
});
export type MonthlyReconciliationQuery = z.infer<typeof MonthlyReconciliationQuerySchema>;

export const SaveMonthlyClosingDraftSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  companyId: z.string().optional().nullable(),
  leadProfit: z.coerce.number().min(0).optional(),
  serviceEarnings: z.coerce.number().min(0).optional(),
  previousClosingCash: z.coerce.number().optional(),
  actualBankBalance: z.coerce.number().optional(),
  savingsTransfer: z.coerce.number().min(0).optional(),
  previousSavingsBalance: z.coerce.number().min(0).optional(),
  notes: z.string().max(1000).optional().nullable(),
  confirmOpeningBaseline: z.boolean().optional(),
});
export type SaveMonthlyClosingDraftInput = z.infer<typeof SaveMonthlyClosingDraftSchema>;

export const ApproveMonthlyClosingSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  companyId: z.string().optional().nullable(),
  leadProfit: z.coerce.number().min(0).optional(),
  serviceEarnings: z.coerce.number().min(0).optional(),
  previousClosingCash: z.coerce.number().optional(),
  actualBankBalance: z.coerce.number(),
  savingsTransfer: z.coerce.number().min(0).default(0),
  previousSavingsBalance: z.coerce.number().min(0).optional(),
  notes: z.string().max(1000).optional().nullable(),
  confirmOpeningBaseline: z.boolean().optional(),
});
export type ApproveMonthlyClosingInput = z.infer<typeof ApproveMonthlyClosingSchema>;

export * from './technician-portal';


