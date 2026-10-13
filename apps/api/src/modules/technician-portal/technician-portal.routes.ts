import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { technicianAuthService } from './technician-auth.service';
import { technicianProfileService } from './technician-profile.service';
import { technicianServicesService } from './technician-services.service';
import { technicianExecutionService } from './technician-execution.service';
import { technicianBillingService } from './technician-billing.service';
import { technicianPaymentService } from './technician-payment.service';
import { technicianNotificationService } from './technician-notification.service';
import { technicianSummaryService } from './technician-summary.service';
import { cashHandoversService } from '../payments/cash-handovers.service';
import { authenticateTechnician } from './technician-portal.middleware';
import { env } from '../../config/env';
import {
  TECHNICIAN_AUTH_COOKIE_NAME,
  TECHNICIAN_SESSION_TTL_SECONDS,
  TECHNICIAN_ERROR_CODES,
  HTTP_STATUS,
} from '@crm/shared';
import {
  TechnicianLoginSchema,
  TechnicianVerifyOtpSchema,
  TechnicianResendOtpSchema,
  TechnicianJobExecutionSchema,
  TechnicianJobHoldSchema,
  TechnicianJobCompleteSchema,
  TechnicianRecordPaymentSchema,
  TechnicianNotificationQuerySchema,
} from '@crm/validation';

/**
 * Technician Authentication Routes Plugin
 * Mounted at: /api/v1/technician-auth
 * Phase 2: Production-Ready Authentication & Independent OTP Engine
 */
export const technicianAuthRoutes: FastifyPluginAsync = async (fastify) => {
  // Connectivity ping
  fastify.get('/ping', async (_request, reply) => {
    return reply.send({
      success: true,
      message: 'Technician Authentication Namespace Ready (Phase 2 Active)',
    });
  });

  /**
   * POST /api/v1/technician-auth/request-otp
   * Request OTP verification code for mobile + technician name
   */
  fastify.post('/request-otp', async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = TechnicianLoginSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.errors[0]?.message || 'Invalid login credentials format',
        },
      });
    }

    const { phone, mobileNumber, fullName, technicianName } = request.body as any;
    const resolvedPhone = phone || mobileNumber;
    const resolvedName = fullName || technicianName;
    const reqIp = (request.headers['x-forwarded-for'] as string) || request.ip || '127.0.0.1';

    try {
      const result = await technicianAuthService.requestOtp({
        phone: resolvedPhone,
        fullName: resolvedName,
        ipAddress: reqIp,
      });

      return reply.status(HTTP_STATUS.OK).send(result);
    } catch (err: any) {
      const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
      return reply.status(statusCode).send({
        success: false,
        error: {
          code: err.code || 'AUTHENTICATION_FAILED',
          message: err.message || 'Unable to request OTP verification code',
        },
      });
    }
  });

  /**
   * POST /api/v1/technician-auth/verify-otp
   * Verify challenge OTP, atomically consume it, and create technician session
   */
  fastify.post('/verify-otp', async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = TechnicianVerifyOtpSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.errors[0]?.message || 'Invalid OTP verification input',
        },
      });
    }

    const { challengeId, otp } = parseResult.data;
    const reqIp = (request.headers['x-forwarded-for'] as string) || request.ip || '127.0.0.1';
    const userAgent = (request.headers['user-agent'] as string) || undefined;

    try {
      const result = await technicianAuthService.verifyOtp({
        challengeId,
        otp,
        ipAddress: reqIp,
        userAgent,
      });

      // Attach secure HttpOnly session cookie
      const isProduction = env.NODE_ENV === 'production';
      reply.setCookie(TECHNICIAN_AUTH_COOKIE_NAME, result.data.sessionToken, {
        path: '/',
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        maxAge: TECHNICIAN_SESSION_TTL_SECONDS,
        expires: new Date(Date.now() + TECHNICIAN_SESSION_TTL_SECONDS * 1000),
      });

      return reply.status(HTTP_STATUS.OK).send(result);
    } catch (err: any) {
      const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
      return reply.status(statusCode).send({
        success: false,
        error: {
          code: err.code || 'VERIFICATION_FAILED',
          message: err.message || 'OTP verification failed',
        },
      });
    }
  });

  /**
   * POST /api/v1/technician-auth/resend-otp
   * Invalidate previous challenge for this technician and issue a new OTP
   */
  fastify.post('/resend-otp', async (request: FastifyRequest, reply: FastifyReply) => {
    const { challengeId, phone, mobileNumber, fullName, technicianName } = (request.body as any) || {};
    const reqIp = (request.headers['x-forwarded-for'] as string) || request.ip || '127.0.0.1';

    try {
      const result = await technicianAuthService.resendOtp({
        challengeId,
        phone: phone || mobileNumber,
        fullName: fullName || technicianName,
        ipAddress: reqIp,
      });

      return reply.status(HTTP_STATUS.OK).send(result);
    } catch (err: any) {
      const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
      return reply.status(statusCode).send({
        success: false,
        error: {
          code: err.code || 'RESEND_FAILED',
          message: err.message || 'Unable to resend verification code',
        },
      });
    }
  });

  /**
   * POST /api/v1/technician-auth/logout
   * Invalidate current technician session in Redis and clear session cookie
   */
  fastify.post('/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    let sessionToken = request.cookies?.[TECHNICIAN_AUTH_COOKIE_NAME];
    if (!sessionToken && request.headers.authorization) {
      const parts = request.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0]?.toLowerCase() === 'bearer') {
        sessionToken = parts[1];
      }
    }

    if (sessionToken) {
      await technicianAuthService.logout(sessionToken);
    }

    const isProduction = env.NODE_ENV === 'production';
    reply.clearCookie(TECHNICIAN_AUTH_COOKIE_NAME, {
      path: '/',
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
    });

    return reply.status(HTTP_STATUS.OK).send({
      success: true,
      message: 'Logged out successfully',
    });
  });

  /**
   * GET /api/v1/technician-auth/me
   * Return current authenticated technician context without exposing sensitive internal data
   */
  fastify.get('/me', async (request: FastifyRequest, reply: FastifyReply) => {
    let sessionToken = request.cookies?.[TECHNICIAN_AUTH_COOKIE_NAME];
    if (!sessionToken && request.headers.authorization) {
      const parts = request.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0]?.toLowerCase() === 'bearer') {
        sessionToken = parts[1];
      }
    }

    if (!sessionToken) {
      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        data: {
          authenticated: false,
        },
      });
    }

    const result = await technicianAuthService.getMe(sessionToken);
    return reply.status(HTTP_STATUS.OK).send({
      success: true,
      data: result,
    });
  });
};

/**
 * Technician Operational Portal Routes Plugin
 * Mounted at: /api/v1/technician
 * Guarded by: authenticateTechnician
 */
export const technicianPortalRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticateTechnician);

  fastify.get('/ping', async (request, reply) => {
    return reply.send({
      success: true,
      message: 'Technician Portal Namespace Ready (Authenticated)',
      technicianId: request.technician?.technicianId,
    });
  });

  /**
   * GET /api/v1/technician/me
   * Phase 3: Technician 360 Profile & Personal Work Summary
   * Strict authorization: technician identity derived exclusively from authenticated server session
   */
  fastify.get('/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const technicianId = request.technician?.technicianId;
    if (!technicianId) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        success: false,
        error: {
          code: TECHNICIAN_ERROR_CODES.SESSION_EXPIRED,
          message: 'Technician authentication required. Please log in.',
        },
      });
    }

    try {
      const profile = await technicianProfileService.getProfile(technicianId);
      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        data: profile,
      });
    } catch (err: any) {
      const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
      return reply.status(statusCode).send({
        success: false,
        error: {
          code: err.code || 'PROFILE_ERROR',
          message: err.message || 'Unable to retrieve technician profile',
        },
      });
    }
  });

  /**
   * GET /api/v1/technician/me/summary
   * Phase 9: Personal Technician Summary
   * Strict authorization: technician identity derived exclusively from authenticated server session
   * Client-supplied technicianId parameter is completely ignored
   */
  fastify.get('/me/summary', async (request: FastifyRequest, reply: FastifyReply) => {
    const technicianId = request.technician?.technicianId;
    if (!technicianId) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        success: false,
        error: {
          code: TECHNICIAN_ERROR_CODES.SESSION_EXPIRED,
          message: 'Technician authentication required. Please log in.',
        },
      });
    }

    try {
      const summary = await technicianSummaryService.getSummary(technicianId);
      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        data: summary,
      });
    } catch (err: any) {
      const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
      return reply.status(statusCode).send({
        success: false,
        error: {
          code: err.code || 'SUMMARY_ERROR',
          message: err.message || 'Unable to retrieve personal technician summary',
        },
      });
    }
  });

  /**
   * GET /api/v1/technician/my-cash
   * Technician Cash Collection & Handover Status
   * Strictly scoped to the authenticated technician session.
   */
  fastify.get('/my-cash', async (request: FastifyRequest, reply: FastifyReply) => {
    const technicianId = request.technician?.technicianId;
    if (!technicianId) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        success: false,
        error: {
          code: TECHNICIAN_ERROR_CODES.SESSION_EXPIRED,
          message: 'Technician authentication required.',
        },
      });
    }

    try {
      const companyId = (request.technician as any)?.companyId || null;
      const data = await cashHandoversService.getTechnicianSummary(technicianId, companyId);
      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        data,
      });
    } catch (err: any) {
      const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
      return reply.status(statusCode).send({
        success: false,
        error: {
          code: err.code || 'CASH_SUMMARY_ERROR',
          message: err.message || 'Unable to retrieve cash collection summary',
        },
      });
    }
  });

  /**
   * GET /api/v1/technician/my-handovers
   * Paginated list of cash collection records for the authenticated technician.
   * Strictly scoped to technician's own collections.
   */
  fastify.get('/my-handovers', async (request: FastifyRequest, reply: FastifyReply) => {
    const technicianId = request.technician?.technicianId;
    if (!technicianId) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        success: false,
        error: {
          code: TECHNICIAN_ERROR_CODES.SESSION_EXPIRED,
          message: 'Technician authentication required.',
        },
      });
    }

    try {
      const companyId = (request.technician as any)?.companyId || null;
      const query = request.query as any;
      const result = await cashHandoversService.getHandovers(
        {
          technicianId,
          status: query?.status || 'ALL',
          page: query?.page ? Number(query.page) : 1,
          limit: query?.limit ? Number(query.limit) : 50,
          search: query?.search,
          startDate: query?.startDate,
          endDate: query?.endDate,
        },
        companyId,
        {
          id: technicianId,
          technicianId,
          role: 'Technician',
        }
      );
      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (err: any) {
      const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
      return reply.status(statusCode).send({
        success: false,
        error: {
          code: err.code || 'CASH_HANDOVERS_ERROR',
          message: err.message || 'Unable to retrieve cash handovers',
        },
      });
    }
  });

  /**
   * POST /api/v1/technician/submit-handover
   * Submit cash handover request for the authenticated technician.
   */
  fastify.post('/submit-handover', async (request: FastifyRequest, reply: FastifyReply) => {
    const technicianId = request.technician?.technicianId;
    if (!technicianId) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        success: false,
        error: {
          code: TECHNICIAN_ERROR_CODES.SESSION_EXPIRED,
          message: 'Technician authentication required.',
        },
      });
    }

    try {
      const body = request.body as any;
      const actor = {
        id: technicianId,
        technicianId,
        fullName: request.technician?.fullName || 'Technician',
        displayName: request.technician?.fullName || 'Technician',
        role: 'Technician',
      };

      if (Array.isArray(body?.handoverIds) && body.handoverIds.length > 0) {
        const batchResult = await cashHandoversService.submitBatchHandover(actor, {
          handoverIds: body.handoverIds,
          notes: body?.notes,
        });
        return reply.status(HTTP_STATUS.OK).send({
          success: true,
          data: batchResult,
          message: batchResult.message,
        });
      }

      const handoverId = body?.handoverId || body?.id;
      if (!handoverId) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          success: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'handoverId is required',
          },
        });
      }

      const singleResult = await cashHandoversService.submitHandover(handoverId, actor, {
        notes: body?.notes,
      });
      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        data: singleResult.data,
        message: singleResult.message,
      });
    } catch (err: any) {
      const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
      return reply.status(statusCode).send({
        success: false,
        error: {
          code: err.code || 'HANDOVER_SUBMISSION_FAILED',
          message: err.message || 'Failed to submit cash handover',
        },
      });
    }
  });

  /**
   * GET /api/v1/technician/me/services
   * Phase 4: Assigned Services Discovery & Multi-View Filtering
   * Strict authorization: queries only services assigned to authenticated technician
   */
  fastify.get('/me/services', async (request: FastifyRequest, reply: FastifyReply) => {
    const technicianId = request.technician?.technicianId;
    if (!technicianId) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        success: false,
        error: {
          code: TECHNICIAN_ERROR_CODES.SESSION_EXPIRED,
          message: 'Technician authentication required. Please log in.',
        },
      });
    }

    const { view } = (request.query as any) || {};

    try {
      const servicesList = await technicianServicesService.getAssignedServices(technicianId, view);
      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        data: servicesList,
      });
    } catch (err: any) {
      const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
      return reply.status(statusCode).send({
        success: false,
        error: {
          code: err.code || 'SERVICES_ERROR',
          message: err.message || 'Unable to retrieve assigned services',
        },
      });
    }
  });

  /**
   * GET /api/v1/technician/me/services/:id
   * Phase 4: Authorized Assigned Service Detail, Customer Context, Location, Asset & Relevant History
   * Enforces server-side authorization: returns 403 Forbidden if not assigned to this technician
   */
  fastify.get('/me/services/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const technicianId = request.technician?.technicianId;
    if (!technicianId) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        success: false,
        error: {
          code: TECHNICIAN_ERROR_CODES.SESSION_EXPIRED,
          message: 'Technician authentication required. Please log in.',
        },
      });
    }

    const { id } = (request.params as any) || {};
    if (!id) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        success: false,
        error: {
          code: TECHNICIAN_ERROR_CODES.VALIDATION_ERROR,
          message: 'Service identifier is required.',
        },
      });
    }

    try {
      const detail = await technicianServicesService.getServiceDetail(id, technicianId);
      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        data: detail,
      });
    } catch (err: any) {
      const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
      return reply.status(statusCode).send({
        success: false,
        error: {
          code: err.code || 'SERVICE_DETAIL_ERROR',
          message: err.message || 'Unable to retrieve service details',
        },
      });
    }
  });

  /**
   * GET /api/v1/technician/catalog/materials
   * Phase 5: Materials / Spare Parts Picker
   * Returns active catalog items with inventory-safe fields only (no purchase costs or FIFO margins)
   */
  fastify.get('/catalog/materials', async (request: FastifyRequest, reply: FastifyReply) => {
    const { search } = (request.query as any) || {};
    try {
      const materials = await technicianExecutionService.getAvailableMaterials(search);
      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        data: materials,
      });
    } catch (err: any) {
      const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
      return reply.status(statusCode).send({
        success: false,
        error: {
          code: err.code || 'CATALOG_ERROR',
          message: err.message || 'Unable to retrieve materials catalog',
        },
      });
    }
  });

  /**
   * POST /api/v1/technician/job-cards/:id/start
   * Phase 5: Start Job Execution
   * Validates technician assignment, state transition, and sets authoritative server timestamp
   */
  fastify.post('/job-cards/:id/start', async (request: FastifyRequest, reply: FastifyReply) => {
    const technicianId = request.technician?.technicianId;
    if (!technicianId) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        success: false,
        error: {
          code: TECHNICIAN_ERROR_CODES.SESSION_EXPIRED,
          message: 'Technician authentication required.',
        },
      });
    }

    const { id } = (request.params as any) || {};
    if (!id) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        success: false,
        error: {
          code: TECHNICIAN_ERROR_CODES.VALIDATION_ERROR,
          message: 'Job Card identifier is required.',
        },
      });
    }

    try {
      const result = await technicianExecutionService.startJob(id, technicianId);
      return reply.status(HTTP_STATUS.OK).send(result);
    } catch (err: any) {
      const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
      return reply.status(statusCode).send({
        success: false,
        error: {
          code: err.code || 'START_JOB_FAILED',
          message: err.message || 'Unable to start job card execution',
        },
      });
    }
  });

  /**
   * POST /api/v1/technician/job-cards/:id/hold
   * Phase 5: Put Active Job on Hold
   * Validates technician assignment, current active state, and logs hold reason
   */
  fastify.post('/job-cards/:id/hold', async (request: FastifyRequest, reply: FastifyReply) => {
    const technicianId = request.technician?.technicianId;
    if (!technicianId) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        success: false,
        error: {
          code: TECHNICIAN_ERROR_CODES.SESSION_EXPIRED,
          message: 'Technician authentication required.',
        },
      });
    }

    const { id } = (request.params as any) || {};
    if (!id) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        success: false,
        error: {
          code: TECHNICIAN_ERROR_CODES.VALIDATION_ERROR,
          message: 'Job Card identifier is required.',
        },
      });
    }

    const parseResult = TechnicianJobHoldSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        success: false,
        error: {
          code: TECHNICIAN_ERROR_CODES.VALIDATION_ERROR,
          message: parseResult.error.errors[0]?.message || 'Invalid hold request payload',
        },
      });
    }

    try {
      const result = await technicianExecutionService.holdJob(id, parseResult.data, technicianId);
      return reply.status(HTTP_STATUS.OK).send(result);
    } catch (err: any) {
      const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
      return reply.status(statusCode).send({
        success: false,
        error: {
          code: err.code || 'HOLD_JOB_FAILED',
          message: err.message || 'Unable to put job on hold',
        },
      });
    }
  });

  /**
   * POST /api/v1/technician/job-cards/:id/resume
   * Phase 5: Resume On-Hold Job
   * Validates technician assignment, on-hold state, and transitions back to IN_PROGRESS
   */
  fastify.post('/job-cards/:id/resume', async (request: FastifyRequest, reply: FastifyReply) => {
    const technicianId = request.technician?.technicianId;
    if (!technicianId) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        success: false,
        error: {
          code: TECHNICIAN_ERROR_CODES.SESSION_EXPIRED,
          message: 'Technician authentication required.',
        },
      });
    }

    const { id } = (request.params as any) || {};
    if (!id) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        success: false,
        error: {
          code: TECHNICIAN_ERROR_CODES.VALIDATION_ERROR,
          message: 'Job Card identifier is required.',
        },
      });
    }

    try {
      const result = await technicianExecutionService.resumeJob(id, technicianId);
      return reply.status(HTTP_STATUS.OK).send(result);
    } catch (err: any) {
      const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
      return reply.status(statusCode).send({
        success: false,
        error: {
          code: err.code || 'RESUME_JOB_FAILED',
          message: err.message || 'Unable to resume job',
        },
      });
    }
  });

  /**
   * PATCH /api/v1/technician/job-cards/:id
   * Phase 5: Execution Form Partial Save
   * Whitelist-enforced: edits diagnosis, work performed, notes, parts consumed, and business fields
   * Protects administrative and financial fields from technician mutation
   */
  fastify.patch('/job-cards/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const technicianId = request.technician?.technicianId;
    if (!technicianId) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        success: false,
        error: {
          code: TECHNICIAN_ERROR_CODES.SESSION_EXPIRED,
          message: 'Technician authentication required.',
        },
      });
    }

    const { id } = (request.params as any) || {};
    if (!id) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        success: false,
        error: {
          code: TECHNICIAN_ERROR_CODES.VALIDATION_ERROR,
          message: 'Job Card identifier is required.',
        },
      });
    }

    const parseResult = TechnicianJobExecutionSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        success: false,
        error: {
          code: TECHNICIAN_ERROR_CODES.VALIDATION_ERROR,
          message: parseResult.error.errors[0]?.message || 'Invalid execution data payload',
        },
      });
    }

    try {
      const result = await technicianExecutionService.updateExecution(
        id,
        parseResult.data,
        technicianId
      );
      return reply.status(HTTP_STATUS.OK).send(result);
    } catch (err: any) {
      const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
      return reply.status(statusCode).send({
        success: false,
        error: {
          code: err.code || 'UPDATE_EXECUTION_FAILED',
          message: err.message || 'Unable to update execution details',
        },
      });
    }
  });

  /**
   * POST /api/v1/technician/job-cards/:id/complete
   * Phase 5: Complete Job Execution
   * Atomically validates mandatory workPerformed and parts quantities,
   * invokes authoritative completion logic, and syncs linked service
   */
  fastify.post('/job-cards/:id/complete', async (request: FastifyRequest, reply: FastifyReply) => {
    const technicianId = request.technician?.technicianId;
    if (!technicianId) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        success: false,
        error: {
          code: TECHNICIAN_ERROR_CODES.SESSION_EXPIRED,
          message: 'Technician authentication required.',
        },
      });
    }

    const { id } = (request.params as any) || {};
    if (!id) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        success: false,
        error: {
          code: TECHNICIAN_ERROR_CODES.VALIDATION_ERROR,
          message: 'Job Card identifier is required.',
        },
      });
    }

    const parseResult = TechnicianJobCompleteSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        success: false,
        error: {
          code: TECHNICIAN_ERROR_CODES.VALIDATION_ERROR,
          message: parseResult.error.errors[0]?.message || 'Invalid job completion payload',
        },
      });
    }

    try {
      const result = await technicianExecutionService.completeJob(
        id,
        parseResult.data,
        technicianId
      );
      return reply.status(HTTP_STATUS.OK).send(result);
    } catch (err: any) {
      const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
      return reply.status(statusCode).send({
        success: false,
        error: {
          code: err.code || 'COMPLETE_JOB_FAILED',
          message: err.message || 'Unable to complete job card',
        },
      });
    }
  });

  /**
   * GET /api/v1/technician/job-cards/:id/payment-summary
   * Phase 6: Read-Only Billing Visibility Endpoint
   * Returns authoritative Invoice Number, Total, Paid, Outstanding, and Payment Status
   * Strictly enforces server-side technician assignment authorization
   */
  fastify.get('/job-cards/:id/payment-summary', async (request: FastifyRequest, reply: FastifyReply) => {
    const technicianId = request.technician?.technicianId;
    if (!technicianId) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        success: false,
        error: {
          code: TECHNICIAN_ERROR_CODES.SESSION_EXPIRED,
          message: 'Technician authentication required.',
        },
      });
    }

    const { id } = (request.params as any) || {};
    if (!id) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        success: false,
        error: {
          code: TECHNICIAN_ERROR_CODES.VALIDATION_ERROR,
          message: 'Job Card identifier is required.',
        },
      });
    }

    try {
      const result = await technicianBillingService.getPaymentSummary(id, technicianId);
      return reply.status(HTTP_STATUS.OK).send(result);
    } catch (err: any) {
      const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
      return reply.status(statusCode).send({
        success: false,
        error: {
          code: err.code || 'BILLING_VISIBILITY_FAILED',
          message: err.message || 'Unable to retrieve billing summary',
        },
      });
    }
  });

  /**
   * POST /api/v1/technician/job-cards/:id/payment
   * Phase 7: Record Field Payment Collection Endpoint
   * Authoritative integration with the existing CRM payment engine.
   * Strictly enforces:
   * - Server-side derived technician authorization
   * - Linked invoice verification
   * - Overpayment prevention against real-time outstanding balance
   * - Idempotency key protection
   */
  fastify.post('/job-cards/:id/payment', async (request: FastifyRequest, reply: FastifyReply) => {
    const session = request.technician;
    if (!session || !session.technicianId) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        success: false,
        error: {
          code: TECHNICIAN_ERROR_CODES.SESSION_EXPIRED,
          message: 'Technician authentication required.',
        },
      });
    }

    const { id } = (request.params as any) || {};
    if (!id) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        success: false,
        error: {
          code: TECHNICIAN_ERROR_CODES.VALIDATION_ERROR,
          message: 'Job Card identifier is required.',
        },
      });
    }

    const parseResult = TechnicianRecordPaymentSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        success: false,
        error: {
          code: TECHNICIAN_ERROR_CODES.VALIDATION_ERROR,
          message: parseResult.error.errors[0]?.message || 'Invalid payment payload',
        },
      });
    }

    try {
      const result = await technicianPaymentService.recordPayment(
        id,
        parseResult.data,
        session
      );
      return reply.status(HTTP_STATUS.CREATED).send(result);
    } catch (err: any) {
      const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
      return reply.status(statusCode).send({
        success: false,
        error: {
          code: err.code || 'PAYMENT_RECORD_FAILED',
          message: err.message || 'Unable to record payment',
        },
      });
    }
  });

  /**
   * GET /api/v1/technician/payments/:id/receipt
   * Phase 7: Technician Payment Receipt Retrieval Endpoint
   * Authoritative receipt data for an authorized payment linked to the technician's assigned work.
   */
  fastify.get('/payments/:id/receipt', async (request: FastifyRequest, reply: FastifyReply) => {
    const technicianId = request.technician?.technicianId;
    if (!technicianId) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        success: false,
        error: {
          code: TECHNICIAN_ERROR_CODES.SESSION_EXPIRED,
          message: 'Technician authentication required.',
        },
      });
    }

    const { id } = (request.params as any) || {};
    if (!id) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        success: false,
        error: {
          code: TECHNICIAN_ERROR_CODES.VALIDATION_ERROR,
          message: 'Payment identifier is required.',
        },
      });
    }

    try {
      const result = await technicianPaymentService.getPaymentReceipt(id, technicianId);
      return reply.status(HTTP_STATUS.OK).send(result);
    } catch (err: any) {
      const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
      return reply.status(statusCode).send({
        success: false,
        error: {
          code: err.code || 'PAYMENT_RECEIPT_FAILED',
          message: err.message || 'Unable to retrieve payment receipt',
        },
      });
    }
  });

  /**
   * GET /api/v1/technician/me/notifications
   * Phase 8: Technician Portal Notifications List
   * Scoped strictly to the authenticated technician session.
   */
  fastify.get('/me/notifications', async (request: FastifyRequest, reply: FastifyReply) => {
    const technicianId = request.technician?.technicianId;
    if (!technicianId) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        success: false,
        error: {
          code: TECHNICIAN_ERROR_CODES.SESSION_EXPIRED,
          message: 'Technician authentication required.',
        },
      });
    }

    const parseResult = TechnicianNotificationQuerySchema.safeParse(request.query || {});
    if (!parseResult.success) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        success: false,
        error: {
          code: TECHNICIAN_ERROR_CODES.VALIDATION_ERROR,
          message: parseResult.error.errors[0]?.message || 'Invalid notification query parameters',
        },
      });
    }

    try {
      const result = await technicianNotificationService.getNotifications(
        technicianId,
        parseResult.data
      );
      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        data: result,
      });
    } catch (err: any) {
      const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
      return reply.status(statusCode).send({
        success: false,
        error: {
          code: err.code || 'NOTIFICATIONS_FETCH_FAILED',
          message: err.message || 'Unable to retrieve notifications',
        },
      });
    }
  });

  /**
   * POST /api/v1/technician/me/notifications/:id/read
   * Phase 8: Mark Notification Read
   * Scoped to the authenticated technician session with IDOR protection & idempotency.
   */
  fastify.post('/me/notifications/:id/read', async (request: FastifyRequest, reply: FastifyReply) => {
    const technicianId = request.technician?.technicianId;
    if (!technicianId) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        success: false,
        error: {
          code: TECHNICIAN_ERROR_CODES.SESSION_EXPIRED,
          message: 'Technician authentication required.',
        },
      });
    }

    const { id } = (request.params as any) || {};
    if (!id) {
      return reply.status(HTTP_STATUS.BAD_REQUEST).send({
        success: false,
        error: {
          code: TECHNICIAN_ERROR_CODES.VALIDATION_ERROR,
          message: 'Notification identifier is required.',
        },
      });
    }

    try {
      const result = await technicianNotificationService.markAsRead(id, technicianId);
      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        data: result,
      });
    } catch (err: any) {
      const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
      return reply.status(statusCode).send({
        success: false,
        error: {
          code: err.code || 'MARK_READ_FAILED',
          message: err.message || 'Unable to mark notification as read',
        },
      });
    }
  });

  /**
   * POST /api/v1/technician/me/notifications/read-all
   * Phase 8: Mark All Notifications Read
   */
  fastify.post('/me/notifications/read-all', async (request: FastifyRequest, reply: FastifyReply) => {
    const technicianId = request.technician?.technicianId;
    if (!technicianId) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        success: false,
        error: {
          code: TECHNICIAN_ERROR_CODES.SESSION_EXPIRED,
          message: 'Technician authentication required.',
        },
      });
    }

    try {
      const result = await technicianNotificationService.markAllAsRead(technicianId);
      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        data: result,
      });
    } catch (err: any) {
      const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
      return reply.status(statusCode).send({
        success: false,
        error: {
          code: err.code || 'MARK_ALL_READ_FAILED',
          message: err.message || 'Unable to mark all notifications as read',
        },
      });
    }
  });

  /**
   * GET /api/v1/technician/me/notifications/unread-count
   * Phase 8: Unread Notifications Count for Badge
   */
  fastify.get('/me/notifications/unread-count', async (request: FastifyRequest, reply: FastifyReply) => {
    const technicianId = request.technician?.technicianId;
    if (!technicianId) {
      return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
        success: false,
        error: {
          code: TECHNICIAN_ERROR_CODES.SESSION_EXPIRED,
          message: 'Technician authentication required.',
        },
      });
    }

    try {
      const result = await technicianNotificationService.getUnreadCount(technicianId);
      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        data: result,
      });
    } catch (err: any) {
      const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
      return reply.status(statusCode).send({
        success: false,
        error: {
          code: err.code || 'UNREAD_COUNT_FAILED',
          message: err.message || 'Unable to retrieve unread notification count',
        },
      });
    }
  });
};

