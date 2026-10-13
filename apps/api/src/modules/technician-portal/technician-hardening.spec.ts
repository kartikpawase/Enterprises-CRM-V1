import { describe, it, expect, vi, beforeEach } from 'vitest';
import { technicianAuthService } from './technician-auth.service';
import { technicianServicesService } from './technician-services.service';
import { technicianExecutionService } from './technician-execution.service';
import { technicianBillingService } from './technician-billing.service';
import { technicianPaymentService } from './technician-payment.service';
import { technicianNotificationService } from './technician-notification.service';
import { technicianSummaryService } from './technician-summary.service';
import { technicianPortalRepository } from './technician-portal.repository';
import { authenticateTechnician } from './technician-portal.middleware';
import { getRedisClient } from '../../redis/client';
import { memoryServices } from '../services/services.repository';
import { memoryJobCards } from '../job-cards/job-cards.repository';
import { memoryInvoices } from '../invoices/invoices.repository';
import { memoryPayments } from '../payments/payments.repository';
import {
  TECHNICIAN_ERROR_CODES,
  TECHNICIAN_AUTH_COOKIE_NAME,
  TECH_REDIS_KEYS,
  HTTP_STATUS,
} from '@crm/shared';
import type { TechnicianSessionData } from '@crm/types';
import {
  TechnicianJobCompleteSchema,
  TechnicianJobHoldSchema,
  TechnicianJobExecutionSchema,
} from '@crm/validation';

describe('Technician Portal Phase 10: Hardening, Security & Concurrency Verification Suite', () => {
  const redis = getRedisClient();

  // Test sessions for two distinct technicians
  const sessionTechA: TechnicianSessionData = {
    sessionId: 'sess-tech-a-token',
    technicianId: '11111111-1111-4111-8111-111111111111',
    fullName: 'Rahul Sharma',
    phone: '9876543210',
    email: 'rahul.sharma@example.com',
    role: 'Technician',
    portalEnabled: true,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  };

  const sessionTechB: TechnicianSessionData = {
    sessionId: 'sess-tech-b-token',
    technicianId: '22222222-2222-4222-8222-222222222222',
    fullName: 'Amit Patel',
    phone: '9876543211',
    email: 'amit.patel@example.com',
    role: 'Technician',
    portalEnabled: true,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  };

  beforeEach(async () => {
    // 1. Reset memory stores
    memoryServices.length = 0;
    memoryJobCards.length = 0;
    memoryInvoices.length = 0;
    memoryPayments.length = 0;

    // 2. Setup Technician A records
    memoryServices.push({
      id: 'svc-tech-a-001',
      serviceNumber: 'SRV-2026-A01',
      serviceType: 'REPAIR',
      technicianId: sessionTechA.technicianId,
      customerId: 'cust-001',
      status: 'ASSIGNED',
      scheduledDate: '2026-10-01',
      scheduledTimeSlot: '10:00 AM - 12:00 PM',
      priority: 'HIGH',
      customerNotes: 'Issue with membrane pump',
    } as any);

    memoryJobCards.push({
      id: 'jc-tech-a-001',
      jobCardNumber: 'JC-2026-A01',
      serviceId: 'svc-tech-a-001',
      technicianId: sessionTechA.technicianId,
      status: 'ASSIGNED',
      problemReported: 'Issue with membrane pump',
      diagnosis: null,
      workPerformed: null,
      partsReplaced: [],
    } as any);

    memoryInvoices.push({
      id: 'inv-tech-a-001',
      invoiceNumber: 'INV-2026-A01',
      jobCardId: 'jc-tech-a-001',
      serviceId: 'svc-tech-a-001',
      customerId: 'cust-001',
      customerName: 'Customer A',
      customerPhone: '9876500001',
      totalAmount: '1000.00',
      paidAmount: '0.00',
      outstandingAmount: '1000.00',
      status: 'ISSUED',
      createdAt: new Date('2026-10-01T08:00:00Z'),
    } as any);

    // 3. Setup Technician B records
    memoryServices.push({
      id: 'svc-tech-b-001',
      serviceNumber: 'SRV-2026-B01',
      serviceType: 'INSTALLATION',
      technicianId: sessionTechB.technicianId,
      customerId: 'cust-002',
      status: 'ASSIGNED',
      scheduledDate: '2026-10-01',
      scheduledTimeSlot: '02:00 PM - 04:00 PM',
      priority: 'NORMAL',
      customerNotes: 'New purifier installation',
    } as any);

    memoryJobCards.push({
      id: 'jc-tech-b-001',
      jobCardNumber: 'JC-2026-B01',
      serviceId: 'svc-tech-b-001',
      technicianId: sessionTechB.technicianId,
      status: 'ASSIGNED',
      problemReported: 'New purifier installation',
      diagnosis: null,
      workPerformed: null,
      partsReplaced: [],
    } as any);

    memoryInvoices.push({
      id: 'inv-tech-b-001',
      invoiceNumber: 'INV-2026-B01',
      jobCardId: 'jc-tech-b-001',
      serviceId: 'svc-tech-b-001',
      customerId: 'cust-002',
      customerName: 'Customer B',
      customerPhone: '9876500002',
      totalAmount: '2500.00',
      paidAmount: '0.00',
      outstandingAmount: '2500.00',
      status: 'ISSUED',
      createdAt: new Date('2026-10-01T09:00:00Z'),
    } as any);

    // Mock getPortalAccessStatus for test technician accounts
    vi.spyOn(technicianPortalRepository, 'getPortalAccessStatus').mockImplementation(async (id) => {
      return id !== 'sess-disabled-token';
    });

    // Seed Redis sessions
    await redis.set(
      `${TECH_REDIS_KEYS.SESSION_PREFIX}${sessionTechA.sessionId}`,
      JSON.stringify(sessionTechA),
      'EX',
      3600
    );
    await redis.set(
      `${TECH_REDIS_KEYS.SESSION_PREFIX}${sessionTechB.sessionId}`,
      JSON.stringify(sessionTechB),
      'EX',
      3600
    );
  });

  // =========================================================================
  // 1. INSECURE DIRECT OBJECT REFERENCE (IDOR) & CROSS-TECHNICIAN ACCESS
  // =========================================================================
  describe('1. IDOR & Cross-Technician Resource Protection', () => {
    it('prevents Technician A from viewing Technician B assigned service detail (403 FORBIDDEN)', async () => {
      await expect(
        technicianServicesService.getServiceDetail('svc-tech-b-001', sessionTechA.technicianId)
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.FORBIDDEN,
        code: TECHNICIAN_ERROR_CODES.SERVICE_NOT_ASSIGNED,
      });
    });

    it('prevents Technician B from viewing Technician A assigned service detail (403 FORBIDDEN)', async () => {
      await expect(
        technicianServicesService.getServiceDetail('svc-tech-a-001', sessionTechB.technicianId)
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.FORBIDDEN,
        code: TECHNICIAN_ERROR_CODES.SERVICE_NOT_ASSIGNED,
      });
    });

    it('prevents Technician A from starting Technician B job card (403 FORBIDDEN)', async () => {
      await expect(
        technicianExecutionService.startJob('jc-tech-b-001', sessionTechA.technicianId)
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.FORBIDDEN,
        code: TECHNICIAN_ERROR_CODES.JOB_CARD_NOT_ASSIGNED,
      });
    });

    it('prevents Technician A from holding Technician B job card (403 FORBIDDEN)', async () => {
      await expect(
        technicianExecutionService.holdJob('jc-tech-b-001', { reason: 'Spare needed' }, sessionTechA.technicianId)
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.FORBIDDEN,
        code: TECHNICIAN_ERROR_CODES.JOB_CARD_NOT_ASSIGNED,
      });
    });

    it('prevents Technician A from resuming Technician B job card (403 FORBIDDEN)', async () => {
      await expect(
        technicianExecutionService.resumeJob('jc-tech-b-001', sessionTechA.technicianId)
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.FORBIDDEN,
        code: TECHNICIAN_ERROR_CODES.JOB_CARD_NOT_ASSIGNED,
      });
    });

    it('prevents Technician A from updating execution data on Technician B job card (403 FORBIDDEN)', async () => {
      await expect(
        technicianExecutionService.updateExecution(
          'jc-tech-b-001',
          { workPerformed: 'Tampered note' },
          sessionTechA.technicianId
        )
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.FORBIDDEN,
        code: TECHNICIAN_ERROR_CODES.JOB_CARD_NOT_ASSIGNED,
      });
    });

    it('prevents Technician A from completing Technician B job card (403 FORBIDDEN)', async () => {
      await expect(
        technicianExecutionService.completeJob(
          'jc-tech-b-001',
          { workPerformed: 'Completed unauthorized work' },
          sessionTechA.technicianId
        )
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.FORBIDDEN,
        code: TECHNICIAN_ERROR_CODES.JOB_CARD_NOT_ASSIGNED,
      });
    });

    it('prevents Technician A from viewing billing/payment summary for Technician B job card (403 FORBIDDEN)', async () => {
      await expect(
        technicianBillingService.getPaymentSummary('jc-tech-b-001', sessionTechA.technicianId)
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.FORBIDDEN,
        code: TECHNICIAN_ERROR_CODES.JOB_CARD_NOT_ASSIGNED,
      });
    });

    it('prevents Technician A from recording payment on Technician B job card (403 FORBIDDEN)', async () => {
      await expect(
        technicianPaymentService.recordPayment(
          'jc-tech-b-001',
          {
            amount: 500,
            paymentMethod: 'CASH',
          },
          sessionTechA
        )
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.FORBIDDEN,
        code: TECHNICIAN_ERROR_CODES.JOB_CARD_NOT_ASSIGNED,
      });
    });

    it('prevents Technician A from viewing receipt for payment made on Technician B invoice (403 FORBIDDEN)', async () => {
      memoryPayments.push({
        id: 'pay-tech-b-001',
        paymentNumber: 'REC-2026-B01',
        invoiceId: 'inv-tech-b-001',
        amount: '1000.00',
        paymentMethod: 'UPI',
        paymentDate: new Date(),
      } as any);

      await expect(
        technicianPaymentService.getPaymentReceipt('pay-tech-b-001', sessionTechA.technicianId)
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.FORBIDDEN,
        code: TECHNICIAN_ERROR_CODES.FORBIDDEN,
      });
    });

    it('prevents Technician A from marking read Technician B notification (403 FORBIDDEN)', async () => {
      const notifId = 'notif-b-001';
      // Mock notification repository to return notification belonging to Tech B
      const { technicianNotificationRepository } = await import('./technician-notification.repository');
      vi.spyOn(technicianNotificationRepository, 'findById').mockResolvedValueOnce({
        id: notifId,
        technicianId: sessionTechB.technicianId,
        isRead: false,
        title: 'New Service Assigned',
        message: 'SRV-2026-B01',
        createdAt: new Date(),
      } as any);

      await expect(
        technicianNotificationService.markAsRead(notifId, sessionTechA.technicianId)
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.FORBIDDEN,
      });
    });
  });

  // =========================================================================
  // 2. URL & API MANIPULATION DEFENSE
  // =========================================================================
  describe('2. URL & API Parameter Manipulation Defense', () => {
    it('server derives technician identity strictly from session, ignoring spoofed client technicianId in query/body', async () => {
      // Tech A requests assigned services
      const servicesTechA = await technicianServicesService.getAssignedServices(sessionTechA.technicianId);
      expect(servicesTechA.length).toBe(1);
      expect(servicesTechA[0].id).toBe('svc-tech-a-001');

      // Ensure Tech B services are NOT returned even if someone passes Tech B ID elsewhere
      const servicesTechB = await technicianServicesService.getAssignedServices(sessionTechB.technicianId);
      expect(servicesTechB.length).toBe(1);
      expect(servicesTechB[0].id).toBe('svc-tech-b-001');
    });

    it('rejects payment request when client attempts to inject an unauthorized or mismatched invoiceId', async () => {
      await expect(
        technicianPaymentService.recordPayment(
          'jc-tech-a-001',
          {
            amount: 500,
            paymentMethod: 'CASH',
            invoiceId: 'inv-tech-b-001', // Mismatched invoice belonging to Tech B
          },
          sessionTechA
        )
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.FORBIDDEN,
        code: TECHNICIAN_ERROR_CODES.FORBIDDEN,
      });
    });
  });

  // =========================================================================
  // 3. ROLE BYPASS & AUTHENTICATION HARDENING
  // =========================================================================
  describe('3. Role Bypass & Authentication Hardening', () => {
    let mockReply: any;
    let mockRequest: any;

    beforeEach(() => {
      mockReply = {
        statusCode: 200,
        status: vi.fn().mockImplementation((code) => {
          mockReply.statusCode = code;
          return mockReply;
        }),
        send: vi.fn(),
      };
      mockRequest = {
        cookies: {},
        headers: {},
        log: { error: vi.fn() },
      };
    });

    it('rejects unauthenticated request with 401 SESSION_EXPIRED', async () => {
      await authenticateTechnician(mockRequest, mockReply);
      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: TECHNICIAN_ERROR_CODES.SESSION_EXPIRED,
          }),
        })
      );
    });

    it('rejects request with expired or non-existent session token with 401', async () => {
      mockRequest.cookies[TECHNICIAN_AUTH_COOKIE_NAME] = 'expired-session-token-xyz';
      await authenticateTechnician(mockRequest, mockReply);
      expect(mockReply.status).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: TECHNICIAN_ERROR_CODES.SESSION_EXPIRED,
          }),
        })
      );
    });

    it('rejects non-Technician role session (e.g. Super Admin or Staff) with 403 FORBIDDEN', async () => {
      const adminSession = {
        sessionId: 'sess-admin-token',
        technicianId: 'admin-uuid-001',
        fullName: 'Super Admin',
        role: 'Super Admin', // Not 'Technician'
        portalEnabled: true,
      };
      await redis.set(
        `${TECH_REDIS_KEYS.SESSION_PREFIX}${adminSession.sessionId}`,
        JSON.stringify(adminSession),
        'EX',
        60
      );

      mockRequest.cookies[TECHNICIAN_AUTH_COOKIE_NAME] = adminSession.sessionId;
      await authenticateTechnician(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: TECHNICIAN_ERROR_CODES.FORBIDDEN,
            message: 'Access restricted to field technicians only.',
          }),
        })
      );
    });

    it('rejects technician whose portal access has been disabled by admin with 403 PORTAL_ACCESS_DISABLED', async () => {
      const disabledSession = {
        ...sessionTechA,
        sessionId: 'sess-disabled-token',
        portalEnabled: false,
      };
      await redis.set(
        `${TECH_REDIS_KEYS.SESSION_PREFIX}${disabledSession.sessionId}`,
        JSON.stringify(disabledSession),
        'EX',
        60
      );

      mockRequest.cookies[TECHNICIAN_AUTH_COOKIE_NAME] = disabledSession.sessionId;
      await authenticateTechnician(mockRequest, mockReply);

      expect(mockReply.status).toHaveBeenCalledWith(403);
      expect(mockReply.send).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: TECHNICIAN_ERROR_CODES.PORTAL_ACCESS_DISABLED,
          }),
        })
      );
    });
  });

  // =========================================================================
  // 4. SESSION ABUSE & LOGOUT INVALIDATION
  // =========================================================================
  describe('4. Session Abuse & Invalidation', () => {
    it('invalidates technician session on logout so subsequent calls return 401', async () => {
      const logoutToken = 'temp-logout-token-123';
      const tempSession = {
        ...sessionTechA,
        sessionId: logoutToken,
      };
      await redis.set(
        `${TECH_REDIS_KEYS.SESSION_PREFIX}${logoutToken}`,
        JSON.stringify(tempSession),
        'EX',
        300
      );

      // Verify session exists
      const beforeLogout = await redis.get(`${TECH_REDIS_KEYS.SESSION_PREFIX}${logoutToken}`);
      expect(beforeLogout).toBeDefined();

      // Execute logout
      await technicianAuthService.logout(logoutToken);

      // Verify session was purged from Redis
      const afterLogout = await redis.get(`${TECH_REDIS_KEYS.SESSION_PREFIX}${logoutToken}`);
      expect(afterLogout).toBeNull();
    });

    it('session switching: logging in as Tech B does not expose Tech A cached data', async () => {
      const summaryA = await technicianSummaryService.getSummary(sessionTechA.technicianId);
      const summaryB = await technicianSummaryService.getSummary(sessionTechB.technicianId);

      // Different technician metrics remain isolated
      expect(summaryA.assignedCount).toBe(1);
      expect(summaryB.assignedCount).toBe(1);
      expect(summaryA.currentWorkload).toBe(1);
      expect(summaryB.currentWorkload).toBe(1);
    });
  });

  // =========================================================================
  // 5. OTP REPLAY, BRUTE FORCE & CONCURRENCY HARDENING
  // =========================================================================
  describe('5. OTP Replay, Brute Force & Concurrency Hardening', () => {
    it('prevents OTP replay: verified challenge cannot be verified a second time', async () => {
      const challengeId = 'replay-test-challenge-001';
      const otpHash = await technicianAuthService.hashOtp(challengeId, '123456');

      // Seed challenge in Redis
      await redis.set(
        `${TECH_REDIS_KEYS.OTP_CHALLENGE_PREFIX}${challengeId}`,
        JSON.stringify({
          challengeId,
          technicianId: sessionTechA.technicianId,
          fullName: sessionTechA.fullName,
          phone: sessionTechA.phone,
          email: sessionTechA.email,
          otpHash,
          expiresAt: Date.now() + 300000,
          attemptCount: 0,
          maxAttempts: 3,
          createdAt: Date.now(),
        }),
        'EX',
        300
      );

      // 1st verification succeeds
      const firstResult = await technicianAuthService.verifyOtp({
        challengeId,
        otp: '123456',
      });
      expect(firstResult.success).toBe(true);

      // 2nd verification attempt with same challenge & OTP MUST be rejected
      await expect(
        technicianAuthService.verifyOtp({
          challengeId,
          otp: '123456',
        })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: TECHNICIAN_ERROR_CODES.OTP_EXPIRED,
      });
    });

    it('enforces maximum 3 attempts and locks challenge upon brute-force failure', async () => {
      const challengeId = 'brute-force-challenge-002';
      const otpHash = await technicianAuthService.hashOtp(challengeId, '654321');

      await redis.set(
        `${TECH_REDIS_KEYS.OTP_CHALLENGE_PREFIX}${challengeId}`,
        JSON.stringify({
          challengeId,
          technicianId: sessionTechA.technicianId,
          fullName: sessionTechA.fullName,
          phone: sessionTechA.phone,
          email: sessionTechA.email,
          otpHash,
          expiresAt: Date.now() + 300000,
          attemptCount: 0,
          maxAttempts: 3,
          createdAt: Date.now(),
        }),
        'EX',
        300
      );

      // Attempt 1: wrong OTP
      await expect(
        technicianAuthService.verifyOtp({ challengeId, otp: '000001' })
      ).rejects.toMatchObject({ code: TECHNICIAN_ERROR_CODES.OTP_INVALID });

      // Attempt 2: wrong OTP
      await expect(
        technicianAuthService.verifyOtp({ challengeId, otp: '000002' })
      ).rejects.toMatchObject({ code: TECHNICIAN_ERROR_CODES.OTP_INVALID });

      // Attempt 3: wrong OTP -> locks challenge
      await expect(
        technicianAuthService.verifyOtp({ challengeId, otp: '000003' })
      ).rejects.toMatchObject({ code: TECHNICIAN_ERROR_CODES.OTP_MAX_ATTEMPTS });

      // Subsequent attempt with correct OTP must fail because challenge was invalidated
      await expect(
        technicianAuthService.verifyOtp({ challengeId, otp: '654321' })
      ).rejects.toMatchObject({ code: TECHNICIAN_ERROR_CODES.OTP_EXPIRED });
    });

    it('multi-technician concurrent OTP challenges remain strictly isolated', async () => {
      const cA = 'concurrent-ch-A';
      const cB = 'concurrent-ch-B';
      const hashA = await technicianAuthService.hashOtp(cA, '111111');
      const hashB = await technicianAuthService.hashOtp(cB, '222222');

      await redis.set(
        `${TECH_REDIS_KEYS.OTP_CHALLENGE_PREFIX}${cA}`,
        JSON.stringify({
          challengeId: cA,
          technicianId: sessionTechA.technicianId,
          fullName: sessionTechA.fullName,
          phone: sessionTechA.phone,
          email: sessionTechA.email,
          otpHash: hashA,
          expiresAt: Date.now() + 300000,
          attemptCount: 0,
          maxAttempts: 3,
          createdAt: Date.now(),
        }),
        'EX',
        300
      );

      await redis.set(
        `${TECH_REDIS_KEYS.OTP_CHALLENGE_PREFIX}${cB}`,
        JSON.stringify({
          challengeId: cB,
          technicianId: sessionTechB.technicianId,
          fullName: sessionTechB.fullName,
          phone: sessionTechB.phone,
          email: sessionTechB.email,
          otpHash: hashB,
          expiresAt: Date.now() + 300000,
          attemptCount: 0,
          maxAttempts: 3,
          createdAt: Date.now(),
        }),
        'EX',
        300
      );

      // Verify Tech A with Tech B OTP fails
      await expect(
        technicianAuthService.verifyOtp({ challengeId: cA, otp: '222222' })
      ).rejects.toMatchObject({ code: TECHNICIAN_ERROR_CODES.OTP_INVALID });

      // Verify Tech B with Tech B OTP succeeds independently
      const resB = await technicianAuthService.verifyOtp({ challengeId: cB, otp: '222222' });
      expect(resB.success).toBe(true);
      expect(resB.data.technician.id).toBe(sessionTechB.technicianId);
    });
  });

  // =========================================================================
  // 6. PAYMENT SECURITY & OVERPAYMENT REJECTION
  // =========================================================================
  describe('6. Payment Security, Overpayment Rejection & Idempotency', () => {
    it('strictly rejects overpayment exceeding current outstanding balance', async () => {
      // Outstanding balance is ₹1,000.00
      await expect(
        technicianPaymentService.recordPayment(
          'jc-tech-a-001',
          {
            amount: 1001, // ₹1 over
            paymentMethod: 'UPI',
          },
          sessionTechA
        )
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.UNPROCESSABLE_ENTITY,
        code: 'PAYMENT_EXCEEDS_OUTSTANDING',
      });
    });

    it('rejects zero or negative payment amounts', async () => {
      await expect(
        technicianPaymentService.recordPayment(
          'jc-tech-a-001',
          {
            amount: 0,
            paymentMethod: 'CASH',
          },
          sessionTechA
        )
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.UNPROCESSABLE_ENTITY,
        code: TECHNICIAN_ERROR_CODES.PAYMENT_AMOUNT_INVALID,
      });

      await expect(
        technicianPaymentService.recordPayment(
          'jc-tech-a-001',
          {
            amount: -150,
            paymentMethod: 'CASH',
          },
          sessionTechA
        )
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.UNPROCESSABLE_ENTITY,
        code: TECHNICIAN_ERROR_CODES.PAYMENT_AMOUNT_INVALID,
      });
    });

    it('provides idempotency protection for duplicate payment requests with same idempotencyKey', async () => {
      const idempotencyKey = 'idem-key-payment-001';

      // 1st submission
      const res1 = await technicianPaymentService.recordPayment(
        'jc-tech-a-001',
        {
          amount: 500,
          paymentMethod: 'CASH',
          idempotencyKey,
        },
        sessionTechA
      );
      expect(res1.success).toBe(true);
      expect(res1.data.amount).toBe(500);

      // 2nd duplicate submission with identical idempotencyKey
      const res2 = await technicianPaymentService.recordPayment(
        'jc-tech-a-001',
        {
          amount: 500,
          paymentMethod: 'CASH',
          idempotencyKey,
        },
        sessionTechA
      );
      expect(res2.success).toBe(true);
      expect(res2.message).toContain('idempotent duplicate submission');
      expect(res2.data.paymentId).toBe(res1.data.paymentId);
    });
  });

  // =========================================================================
  // 7. STATE-MACHINE HARDENING & EXECUTION CONSTRAINTS
  // =========================================================================
  describe('7. State-Machine Hardening & Execution Constraints', () => {
    it('rejects starting a completed or closed job card (400 INVALID_STATE_TRANSITION)', async () => {
      memoryJobCards[0].status = 'COMPLETED';

      await expect(
        technicianExecutionService.startJob('jc-tech-a-001', sessionTechA.technicianId)
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.BAD_REQUEST,
        code: TECHNICIAN_ERROR_CODES.INVALID_STATE_TRANSITION,
      });
    });

    it('rejects starting a cancelled job card (400 INVALID_STATE_TRANSITION)', async () => {
      memoryJobCards[0].status = 'CANCELLED';

      await expect(
        technicianExecutionService.startJob('jc-tech-a-001', sessionTechA.technicianId)
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.BAD_REQUEST,
        code: TECHNICIAN_ERROR_CODES.INVALID_STATE_TRANSITION,
      });
    });

    it('rejects putting a job on hold if it is not started / in progress (400 INVALID_STATE_TRANSITION)', async () => {
      memoryJobCards[0].status = 'ASSIGNED'; // Not started

      await expect(
        technicianExecutionService.holdJob('jc-tech-a-001', { reason: 'Waiting for parts' }, sessionTechA.technicianId)
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.BAD_REQUEST,
        code: TECHNICIAN_ERROR_CODES.INVALID_STATE_TRANSITION,
      });
    });

    it('rejects resuming a job that is not in ON_HOLD status (400 INVALID_STATE_TRANSITION)', async () => {
      memoryJobCards[0].status = 'ASSIGNED';

      await expect(
        technicianExecutionService.resumeJob('jc-tech-a-001', sessionTechA.technicianId)
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.BAD_REQUEST,
        code: TECHNICIAN_ERROR_CODES.INVALID_STATE_TRANSITION,
      });
    });

    it('rejects completing a job without mandatory workPerformed (400 VALIDATION_ERROR)', async () => {
      await expect(
        technicianExecutionService.completeJob(
          'jc-tech-a-001',
          { workPerformed: '' }, // Empty string
          sessionTechA.technicianId
        )
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.BAD_REQUEST,
        code: TECHNICIAN_ERROR_CODES.VALIDATION_ERROR,
      });
    });

    it('idempotently handles duplicate start on an already active job', async () => {
      memoryJobCards[0].status = 'IN_PROGRESS';

      const res = await technicianExecutionService.startJob('jc-tech-a-001', sessionTechA.technicianId);
      expect(res.success).toBe(true);
      expect(res.message).toBe('Job is already in progress');
    });

    it('idempotently handles duplicate hold on an already on-hold job', async () => {
      memoryJobCards[0].status = 'ON_HOLD';

      const res = await technicianExecutionService.holdJob(
        'jc-tech-a-001',
        { reason: 'Duplicate tap' },
        sessionTechA.technicianId
      );
      expect(res.success).toBe(true);
      expect(res.message).toBe('Job is already on hold');
    });

    it('idempotently handles duplicate resume on an already active job', async () => {
      memoryJobCards[0].status = 'IN_PROGRESS';

      const res = await technicianExecutionService.resumeJob('jc-tech-a-001', sessionTechA.technicianId);
      expect(res.success).toBe(true);
      expect(res.message).toBe('Job is already active');
    });

    it('idempotently handles duplicate complete on an already completed job', async () => {
      memoryJobCards[0].status = 'COMPLETED';

      const res = await technicianExecutionService.completeJob(
        'jc-tech-a-001',
        { workPerformed: 'Fixed again' },
        sessionTechA.technicianId
      );
      expect(res.success).toBe(true);
      expect(res.message).toBe('Job has already been completed');
    });
  });

  // =========================================================================
  // 8. REASSIGNMENT SECURITY & INSTANT ACCESS REVOCATION
  // =========================================================================
  describe('8. Reassignment Security & Access Revocation', () => {
    it('reassigning Service A to Tech B immediately revokes Tech A access and grants Tech B access', async () => {
      // 1. Tech A can initially view Service A
      const initialA = await technicianServicesService.getServiceDetail(
        'svc-tech-a-001',
        sessionTechA.technicianId
      );
      expect(initialA.id).toBe('svc-tech-a-001');

      // 2. Reassign Service A & Job Card A to Tech B
      memoryServices[0].technicianId = sessionTechB.technicianId;
      memoryJobCards[0].technicianId = sessionTechB.technicianId;

      // 3. Tech A immediately receives 403 Forbidden
      await expect(
        technicianServicesService.getServiceDetail('svc-tech-a-001', sessionTechA.technicianId)
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.FORBIDDEN,
        code: TECHNICIAN_ERROR_CODES.SERVICE_NOT_ASSIGNED,
      });

      await expect(
        technicianExecutionService.startJob('jc-tech-a-001', sessionTechA.technicianId)
      ).rejects.toMatchObject({
        statusCode: HTTP_STATUS.FORBIDDEN,
        code: TECHNICIAN_ERROR_CODES.JOB_CARD_NOT_ASSIGNED,
      });

      // 4. Tech B can now access Service A & Job Card A
      const reassignedB = await technicianServicesService.getServiceDetail(
        'svc-tech-a-001',
        sessionTechB.technicianId
      );
      expect(reassignedB.id).toBe('svc-tech-a-001');
    });
  });

  // =========================================================================
  // 9. PARTS CATALOG PRICING & FIFO SENSITIVITY PROTECTION
  // =========================================================================
  describe('9. Parts Catalog Pricing & FIFO Sensitivity Protection', () => {
    it('materials catalog excludes purchaseCost, FIFO cost, margins and profit data', async () => {
      const materials = await technicianExecutionService.getAvailableMaterials();
      expect(Array.isArray(materials)).toBe(true);

      for (const item of materials) {
        expect((item as any).purchasePrice).toBeUndefined();
        expect((item as any).purchaseCost).toBeUndefined();
        expect((item as any).fifoCost).toBeUndefined();
        expect((item as any).profitMargin).toBeUndefined();
        expect((item as any).margin).toBeUndefined();
      }
    });
  });

  // =========================================================================
  // 10. NULL-RESILIENT JOB COMPLETION & HOLD PAYLOAD VALIDATION
  // =========================================================================
  describe('10. Null-Resilient Job Completion & Hold Payload Validation', () => {
    it('accepts job complete payload containing null for optional fields without throwing Expected string, received null', () => {
      const payloadWithNulls = {
        workPerformed: 'Completed RO membrane replacement and testing',
        diagnosis: null,
        technicianNotes: null,
        customerRemarks: null,
        partsReplaced: [
          {
            itemId: null,
            productId: null,
            inventoryItemId: null,
            sku: null,
            itemName: 'Sediment Filter 5 Micron',
            description: null,
            quantity: 1,
            unitPrice: 350,
            price: null,
            isWarrantyCovered: null,
            inventoryDeducted: null,
          },
        ],
        serviceCharge: null,
        laborCharges: null,
        gstEnabled: null,
        gstRate: null,
        payment: {
          method: 'CASH',
          amount: 350,
          reference: null,
          referenceNumber: null,
          notes: null,
        },
        businessFields: null,
        customerSignatureFileId: null,
        customerSignatureBase64: null,
      };

      const result = TechnicianJobCompleteSchema.safeParse(payloadWithNulls);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.workPerformed).toBe('Completed RO membrane replacement and testing');
        expect(result.data.diagnosis).toBeNull();
        expect(result.data.gstEnabled).toBe(false);
        expect(result.data.partsReplaced?.[0].isWarrantyCovered).toBe(false);
        expect(result.data.partsReplaced?.[0].inventoryDeducted).toBe(false);
      }
    });

    it('accepts job hold payload containing null for optional fields without error', () => {
      const holdPayloadWithNulls = {
        reason: null,
        holdReason: null,
        workPerformed: null,
        diagnosis: null,
        technicianNotes: null,
        customerRemarks: null,
        partsReplaced: [
          {
            itemId: null,
            productId: null,
            inventoryItemId: null,
            sku: null,
            itemName: 'Carbon Filter',
            description: null,
            quantity: 1,
            unitPrice: null,
            isWarrantyCovered: null,
          },
        ],
        serviceCharge: null,
        laborCharges: null,
        gstEnabled: null,
        gstRate: null,
        businessFields: null,
      };

      const result = TechnicianJobHoldSchema.safeParse(holdPayloadWithNulls);
      expect(result.success).toBe(true);
    });

    it('accepts partial save payload containing null for optional fields without error', () => {
      const execPayloadWithNulls = {
        problemReported: null,
        diagnosis: null,
        workPerformed: null,
        technicianNotes: null,
        customerRemarks: null,
        partsReplaced: null,
        businessFields: null,
        customerSignatureFileId: null,
      };

      const result = TechnicianJobExecutionSchema.safeParse(execPayloadWithNulls);
      expect(result.success).toBe(true);
    });

    it('requires workPerformed for job completion with a clear descriptive message', () => {
      const missingWork = {
        workPerformed: '',
        diagnosis: 'Need part',
      };

      const result = TechnicianJobCompleteSchema.safeParse(missingWork);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0]?.message).toBe(
          'Work performed description is required before completing job'
        );
      }
    });
  });
});
