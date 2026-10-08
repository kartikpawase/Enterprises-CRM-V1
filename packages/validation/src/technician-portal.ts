/**
 * SR Enterprises CRM - Technician Portal Validation Schemas
 * Phase 0: Isolated Preparation Boundary
 * Strictly additive - No existing CRM behavior is modified.
 */

import { z } from 'zod';

export const TechnicianLoginSchema = z
  .object({
    phone: z.string().optional(),
    mobileNumber: z.string().optional(),
    fullName: z.string().optional(),
    technicianName: z.string().optional(),
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

export const TechnicianJobExecutionSchema = z.object({
  problemReported: z.string().optional(),
  diagnosis: z.string().optional(),
  workPerformed: z.string().optional(),
  technicianNotes: z.string().optional(),
  customerRemarks: z.string().optional(),
  partsReplaced: z
    .array(
      z.object({
        itemId: z.string().optional(),
        productId: z.string().optional(),
        inventoryItemId: z.string().optional(),
        sku: z.string().optional(),
        itemName: z.string().min(1, 'Item name is required'),
        description: z.string().optional(),
        quantity: z.coerce.number().positive('Quantity must be greater than 0'),
        isWarrantyCovered: z.boolean().default(false),
        price: z.coerce.number().min(0).optional(),
        unitPrice: z.coerce.number().min(0).optional(),
      })
    )
    .optional(),
  businessFields: z.record(z.any()).optional(),
  customerSignatureFileId: z.string().optional(),
});

export const TechnicianJobHoldSchema = z.object({
  reason: z.string().optional(),
  holdReason: z.string().optional(),
});

export const TechnicianJobCompleteSchema = z.object({
  workPerformed: z.string().min(1, 'Work performed description is required before completing job'),
  diagnosis: z.string().optional(),
  technicianNotes: z.string().optional(),
  customerRemarks: z.string().optional(),
  partsReplaced: z
    .array(
      z.object({
        itemId: z.string().optional(),
        productId: z.string().optional(),
        inventoryItemId: z.string().optional(),
        sku: z.string().optional(),
        itemName: z.string().min(1, 'Item name is required'),
        description: z.string().optional(),
        quantity: z.coerce.number().positive('Quantity must be greater than 0'),
        isWarrantyCovered: z.boolean().default(false),
        price: z.coerce.number().min(0).optional(),
        unitPrice: z.coerce.number().min(0).optional(),
      })
    )
    .optional(),
  serviceCharge: z.coerce.number().min(0).optional(),
  laborCharges: z.coerce.number().min(0).optional(),
  gstEnabled: z.boolean().default(false),
  gstRate: z.coerce.number().min(0).max(100).optional(),
  payment: z
    .object({
      method: z.enum(['CASH', 'ONLINE', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'OTHER']),
      amount: z.coerce.number().min(0),
      reference: z.string().optional().nullable(),
      referenceNumber: z.string().optional().nullable(),
      notes: z.string().optional().nullable(),
    })
    .optional(),
  initialPayment: z.any().optional(),
  businessFields: z.record(z.any()).optional(),
  customerSignatureFileId: z.string().optional(),
  customerSignatureBase64: z.string().optional(),
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
  status: z.string().optional(),
  date: z.string().optional(),
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
  }, z.boolean().optional()),
  type: z.string().optional(),
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
export type TechnicianJobExecutionInput = z.infer<typeof TechnicianJobExecutionSchema>;
export type TechnicianJobHoldInput = z.infer<typeof TechnicianJobHoldSchema>;
export type TechnicianJobCompleteInput = z.infer<typeof TechnicianJobCompleteSchema>;
export type TechnicianRecordPaymentInput = z.infer<typeof TechnicianRecordPaymentSchema>;
export type TechnicianQueryInput = z.infer<typeof TechnicianQuerySchema>;
export type TechnicianNotificationQueryInput = z.infer<typeof TechnicianNotificationQuerySchema>;
export type TechnicianPersonalSummaryOutput = z.infer<typeof TechnicianPersonalSummarySchema>;

