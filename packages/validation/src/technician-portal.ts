/**
 * SR Enterprises CRM - Technician Portal Validation Schemas
 * Phase 0: Isolated Preparation Boundary
 * Strictly additive - No existing CRM behavior is modified.
 */

import { z } from 'zod';

export const TechnicianLoginSchema = z
  .object({
    phone: z.string().nullish(),
    mobileNumber: z.string().nullish(),
    fullName: z.string().nullish(),
    technicianName: z.string().nullish(),
  })
  .refine((data) => Boolean((data.phone || data.mobileNumber)?.trim()), {
    message: 'Valid registered mobile number is required',
    path: ['mobileNumber'],
  })
  .refine((data) => Boolean((data.fullName || data.technicianName)?.trim()), {
    message: 'Technician registered full name is required',
    path: ['technicianName'],
  });

export const TechnicianVerifyOtpSchema = z.object({
  challengeId: z.string().uuid('Valid challenge ID is required'),
  otp: z
    .string()
    .length(6, 'OTP must be exactly 6 digits')
    .regex(/^[0-9]{6}$/, 'OTP must be numeric'),
});

export const TechnicianResendOtpSchema = z.object({
  challengeId: z.string().uuid('Valid challenge ID is required'),
});

export const TechnicianJobPartItemSchema = z.object({
  itemId: z.string().nullish(),
  productId: z.string().nullish(),
  inventoryItemId: z.string().nullish(),
  sku: z.string().nullish(),
  itemName: z
    .string({
      required_error: 'Item name is required',
      invalid_type_error: 'Item name must be text',
    })
    .min(1, 'Item name is required'),
  partName: z.string().nullish(),
  description: z.string().nullish(),
  quantity: z.coerce.number().positive('Quantity must be greater than 0'),
  isWarrantyCovered: z.boolean().nullish().transform((v) => Boolean(v)),
  price: z.coerce.number().min(0).nullish(),
  unitPrice: z.coerce.number().min(0).nullish(),
  inventoryDeducted: z.boolean().nullish().transform((v) => Boolean(v)),
  recordedAt: z.string().nullish(),
  closedAt: z.string().nullish(),
  status: z.string().nullish(),
});

export const TechnicianJobExecutionSchema = z.object({
  problemReported: z.string().nullish(),
  diagnosis: z.string().nullish(),
  workPerformed: z.string().nullish(),
  technicianNotes: z.string().nullish(),
  customerRemarks: z.string().nullish(),
  partsReplaced: z.array(TechnicianJobPartItemSchema).nullish(),
  businessFields: z.record(z.any()).nullish(),
  customerSignatureFileId: z.string().nullish(),
});

export const TechnicianJobHoldSchema = z.object({
  reason: z.string().nullish(),
  holdReason: z.string().nullish(),
  workPerformed: z.string().nullish(),
  diagnosis: z.string().nullish(),
  technicianNotes: z.string().nullish(),
  customerRemarks: z.string().nullish(),
  partsReplaced: z.array(TechnicianJobPartItemSchema).nullish(),
  serviceCharge: z.coerce.number().min(0).nullish(),
  laborCharges: z.coerce.number().min(0).nullish(),
  gstEnabled: z.boolean().nullish().transform((v) => Boolean(v)),
  gstRate: z.coerce.number().min(0).max(100).nullish(),
  businessFields: z.record(z.any()).nullish(),
});

export const TechnicianJobCompleteSchema = z.object({
  workPerformed: z
    .string({
      required_error: 'Work performed description is required before completing job',
      invalid_type_error: 'Work performed description is required before completing job',
    })
    .min(1, 'Work performed description is required before completing job'),
  diagnosis: z.string().nullish(),
  technicianNotes: z.string().nullish(),
  customerRemarks: z.string().nullish(),
  partsReplaced: z.array(TechnicianJobPartItemSchema).nullish(),
  serviceCharge: z.coerce.number().min(0).nullish(),
  laborCharges: z.coerce.number().min(0).nullish(),
  gstEnabled: z.boolean().nullish().transform((v) => Boolean(v)),
  gstRate: z.coerce.number().min(0).max(100).nullish(),
  payment: z
    .object({
      method: z.enum(['CASH', 'ONLINE', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'OTHER']),
      amount: z.coerce.number().min(0),
      reference: z.string().nullish(),
      referenceNumber: z.string().nullish(),
      notes: z.string().nullish(),
    })
    .nullish(),
  initialPayment: z.any().nullish(),
  businessFields: z.record(z.any()).nullish(),
  customerSignatureFileId: z.string().nullish(),
  customerSignatureBase64: z.string().nullish(),
});

export const TechnicianRecordPaymentSchema = z.object({
  invoiceId: z.string().optional().nullable(),
  amount: z.coerce.number().positive('Payment amount must be greater than zero'),
  paymentMethod: z.enum(['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'OTHER']),
  referenceNumber: z.string().max(100).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  idempotencyKey: z.string().max(100).optional().nullable(),
});

export const TechnicianQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  status: z.string().nullish(),
  date: z.string().nullish(),
});

export const TechnicianNotificationTypeEnum = z.enum([
  'NEW_ASSIGNMENT',
  'SCHEDULE_CHANGE',
  'CANCELLATION',
  'REASSIGNMENT',
  'JOB_UPDATE',
]);

export const TechnicianNotificationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  isRead: z.preprocess((val) => {
    if (val === 'true' || val === true) return true;
    if (val === 'false' || val === false) return false;
    return undefined;
  }, z.boolean().nullish()),
  type: z.string().nullish(),
});

export const TechnicianPersonalSummarySchema = z.object({
  assignedCount: z.number().int().nonnegative(),
  completedCount: z.number().int().nonnegative(),
  currentWorkload: z.number().int().nonnegative(),
  completionRate: z.number().min(0).max(100),
  averageCompletionTimeMinutes: z.number().int().positive().nullable(),
  averageCompletionTimeFormatted: z.string().nullable(),
  isAverageCompletionTimeReliable: z.boolean(),
  sampleSize: z.number().int().nonnegative(),
  workloadBreakdown: z.object({
    assigned: z.number().int().nonnegative(),
    inProgress: z.number().int().nonnegative(),
    onHold: z.number().int().nonnegative(),
    upcoming: z.number().int().nonnegative(),
  }),
});

export type TechnicianLoginInput = z.infer<typeof TechnicianLoginSchema>;
export type TechnicianVerifyOtpInput = z.infer<typeof TechnicianVerifyOtpSchema>;
export type TechnicianResendOtpInput = z.infer<typeof TechnicianResendOtpSchema>;
export type TechnicianJobPartItemInput = z.infer<typeof TechnicianJobPartItemSchema>;
export type TechnicianJobExecutionInput = z.infer<typeof TechnicianJobExecutionSchema>;
export type TechnicianJobHoldInput = z.infer<typeof TechnicianJobHoldSchema>;
export type TechnicianJobCompleteInput = z.infer<typeof TechnicianJobCompleteSchema>;
export type TechnicianRecordPaymentInput = z.infer<typeof TechnicianRecordPaymentSchema>;
export type TechnicianQueryInput = z.infer<typeof TechnicianQuerySchema>;
export type TechnicianNotificationQueryInput = z.infer<typeof TechnicianNotificationQuerySchema>;
export type TechnicianPersonalSummaryOutput = z.infer<typeof TechnicianPersonalSummarySchema>;

