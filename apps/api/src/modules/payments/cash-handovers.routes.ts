import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { cashHandoversService } from './cash-handovers.service';
import {
  CashHandoverQueryFilterSchema,
  SubmitCashHandoverSchema,
  BatchSubmitCashHandoverSchema,
  MarkCashReceivedSchema,
  BatchMarkCashReceivedSchema,
} from '@crm/validation';
import { requirePermission } from '../../middleware/rbac';
import { authenticate } from '../../middleware/auth';
import { HTTP_STATUS } from '@crm/shared';

function getAdminActorFromUser(user: any) {
  return {
    id: user?.userId || user?.id || '',
    userId: user?.userId || user?.id || '',
    technicianId: user?.technicianId || undefined,
    displayName: user?.displayName || user?.username || 'Admin',
    username: user?.username || 'admin',
    role: user?.role || 'Admin',
  };
}

const checkViewAuth = async (request: FastifyRequest, reply: FastifyReply) => {
  const user = request.user as any;
  if (user && String(user.role || '').toUpperCase() === 'TECHNICIAN') {
    return; // Technicians are authorized to view their own cash records
  }
  await requirePermission('payments.view')(request, reply);
};

export const cashHandoversRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /api/v1/cash-handovers/summary
   * Summary overview (Total Collected, Total Submitted, Total Received, Total Pending, Outstanding, Breakdown by Technician)
   */
  fastify.get(
    '/summary',
    { preHandler: [requirePermission('payments.view')] },
    async (request, reply) => {
      const companyId = (request.user as any)?.companyId || null;
      const query = request.query as any;
      const summary = await cashHandoversService.getSummary(companyId, {
        startDate: query?.startDate,
        endDate: query?.endDate,
      });
      return reply.send({
        success: true,
        data: summary,
      });
    }
  );

  /**
   * GET /api/v1/cash-handovers
   * List paginated cash handovers with filters & search.
   * Technicians can only view their own records.
   */
  fastify.get(
    '/',
    { preHandler: [checkViewAuth] },
    async (request, reply) => {
      const query = CashHandoverQueryFilterSchema.parse(request.query);
      const companyId = (request.user as any)?.companyId || null;
      const result = await cashHandoversService.getHandovers(query, companyId, request.user);
      return reply.send({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    }
  );

  /**
   * GET /api/v1/cash-handovers/:id
   * Get single cash handover record by ID.
   * Technicians can only access their own records.
   */
  fastify.get(
    '/:id',
    { preHandler: [checkViewAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const item = await cashHandoversService.getHandoverById(id, request.user);
      return reply.send({
        success: true,
        data: item,
      });
    }
  );

  /**
   * POST /api/v1/cash-handovers/:id/submit
   * Submit collected cash handover request for admin verification.
   * Technicians can submit only their own collected cash.
   */
  fastify.post(
    '/:id/submit',
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = request.user as any;
      if (!user) {
        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
      }

      const input = request.body ? SubmitCashHandoverSchema.parse(request.body) : undefined;
      const result = await cashHandoversService.submitHandover(id, user, input);

      return reply.send({
        success: true,
        data: result.data,
        message: result.message,
      });
    }
  );

  /**
   * POST /api/v1/cash-handovers/submit-batch
   * Atomically submit multiple collected cash handovers for verification.
   */
  fastify.post(
    '/submit-batch',
    async (request, reply) => {
      const user = request.user as any;
      if (!user) {
        return reply.status(HTTP_STATUS.UNAUTHORIZED).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
      }

      const input = BatchSubmitCashHandoverSchema.parse(request.body);
      const result = await cashHandoversService.submitBatchHandover(user, input);

      return reply.send({
        success: true,
        data: result,
        message: result.message,
      });
    }
  );

  /**
   * POST /api/v1/cash-handovers/:id/receive
   * Mark pending/submitted cash handover as RECEIVED.
   * Strictly Owner/Admin authorized. Technicians are blocked from confirming own or any handover.
   * receivedBy is strictly derived from the authenticated admin session.
   */
  fastify.post(
    '/:id/receive',
    { preHandler: [requirePermission('payments.create')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = request.user as any;

      if (!user || user.role === 'Technician') {
        return reply.status(HTTP_STATUS.FORBIDDEN).send({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Technicians are not authorized to mark cash handovers as received',
          },
        });
      }

      const input = request.body ? MarkCashReceivedSchema.parse(request.body) : undefined;
      const result = await cashHandoversService.markReceived(id, getAdminActorFromUser(user), input);

      return reply.send({
        success: true,
        data: result.data,
        message: result.message,
      });
    }
  );

  /**
   * POST /api/v1/cash-handovers/receive-batch
   * Atomically mark a batch of pending/submitted cash handovers as RECEIVED.
   * Strictly Owner/Admin authorized. Technicians cannot confirm handovers.
   */
  fastify.post(
    '/receive-batch',
    { preHandler: [requirePermission('payments.create')] },
    async (request, reply) => {
      const user = request.user as any;

      if (!user || user.role === 'Technician') {
        return reply.status(HTTP_STATUS.FORBIDDEN).send({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'Technicians are not authorized to mark cash handovers as received',
          },
        });
      }

      const input = BatchMarkCashReceivedSchema.parse(request.body);
      const result = await cashHandoversService.markBatchReceived(getAdminActorFromUser(user), input);

      return reply.send({
        success: true,
        data: result,
        message: result.message,
      });
    }
  );
};
