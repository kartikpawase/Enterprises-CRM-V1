import type { FastifyPluginAsync } from 'fastify';
import { expensesService } from './expenses.service';
import {
  CreateExpenseSchema,
  UpdateExpenseSchema,
  VoidExpenseSchema,
  ExpenseQueryFilterSchema,
  CreateExpenseScheduleSchema,
  MonthlyReconciliationQuerySchema,
  SaveMonthlyClosingDraftSchema,
  ApproveMonthlyClosingSchema,
} from '@crm/validation';
import { requirePermission } from '../../middleware/rbac';
import { authenticate } from '../../middleware/auth';
import { HTTP_STATUS } from '@crm/shared';
import { z } from 'zod';

function getActorFromUser(user: any) {
  return {
    id: user?.userId || user?.id || '',
    userId: user?.userId || user?.id || '',
    displayName: user?.displayName || user?.username || 'Admin',
    username: user?.username || 'admin',
    role: user?.role || 'Admin',
    companyId: user?.companyId || null,
  };
}

export const expensesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /api/v1/expenses/overview
   */
  fastify.get(
    '/overview',
    { preHandler: [requirePermission('expenses.view')] },
    async (request, reply) => {
      const user = request.user as any;
      if (user?.role === 'Technician') {
        return reply.status(HTTP_STATUS.FORBIDDEN).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Technicians cannot view company expenses' },
        });
      }

      const query = request.query as any;
      const data = await expensesService.getOverview(user?.companyId || null, {
        startDate: query?.startDate,
        endDate: query?.endDate,
      });

      return reply.send({ success: true, data });
    }
  );

  /**
   * GET /api/v1/expenses/schedules
   */
  fastify.get(
    '/schedules',
    { preHandler: [requirePermission('expenses.view')] },
    async (request, reply) => {
      const user = request.user as any;
      if (user?.role === 'Technician') {
        return reply.status(HTTP_STATUS.FORBIDDEN).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Technicians cannot view company expense schedules' },
        });
      }

      const data = await expensesService.getSchedules(user?.companyId || null);
      return reply.send({ success: true, data });
    }
  );

  /**
   * POST /api/v1/expenses/schedules
   */
  fastify.post(
    '/schedules',
    { preHandler: [requirePermission('expenses.create')] },
    async (request, reply) => {
      const user = request.user as any;
      if (user?.role === 'Technician') {
        return reply.status(HTTP_STATUS.FORBIDDEN).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Technicians cannot configure expense schedules' },
        });
      }

      const input = CreateExpenseScheduleSchema.parse(request.body);
      const result = await expensesService.createSchedule(input, getActorFromUser(user));
      return reply.status(HTTP_STATUS.CREATED).send(result);
    }
  );

  /**
   * POST /api/v1/expenses/schedules/:id/toggle
   */
  fastify.post(
    '/schedules/:id/toggle',
    { preHandler: [requirePermission('expenses.edit')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = z.object({ isActive: z.boolean() }).parse(request.body);
      const user = request.user as any;
      const result = await expensesService.toggleSchedule(id, body.isActive, getActorFromUser(user));
      return reply.send(result);
    }
  );

  /**
   * POST /api/v1/expenses/schedules/:id/record
   */
  fastify.post(
    '/schedules/:id/record',
    { preHandler: [requirePermission('expenses.create')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = z
        .object({
          occurrencePeriod: z.string().min(1),
          expenseDate: z.string().min(1),
          notes: z.string().optional().nullable(),
        })
        .parse(request.body);

      const user = request.user as any;
      const result = await expensesService.recordOccurrence(
        id,
        body.occurrencePeriod,
        body.expenseDate,
        getActorFromUser(user),
        body.notes
      );
      return reply.send(result);
    }
  );

  /**
   * GET /api/v1/expenses
   */
  fastify.get(
    '/',
    { preHandler: [requirePermission('expenses.view')] },
    async (request, reply) => {
      const user = request.user as any;
      if (user?.role === 'Technician') {
        return reply.status(HTTP_STATUS.FORBIDDEN).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Technicians cannot view company expenses' },
        });
      }

      const query = ExpenseQueryFilterSchema.parse(request.query);
      const result = await expensesService.getExpenses(query, user?.companyId || null);
      return reply.send({
        success: true,
        data: result.data,
        summary: result.summary,
        pagination: result.pagination,
      });
    }
  );

  /**
   * POST /api/v1/expenses
   */
  fastify.post(
    '/',
    { preHandler: [requirePermission('expenses.create')] },
    async (request, reply) => {
      const user = request.user as any;
      if (user?.role === 'Technician') {
        return reply.status(HTTP_STATUS.FORBIDDEN).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Technicians cannot record company expenses' },
        });
      }

      const input = CreateExpenseSchema.parse(request.body);
      const result = await expensesService.createExpense(input, getActorFromUser(user));
      return reply.status(HTTP_STATUS.CREATED).send(result);
    }
  );

  /**
   * GET /api/v1/expenses/:id
   */
  fastify.get(
    '/:id',
    { preHandler: [requirePermission('expenses.view')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = request.user as any;
      if (user?.role === 'Technician') {
        return reply.status(HTTP_STATUS.FORBIDDEN).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Technicians cannot view company expenses' },
        });
      }

      const item = await expensesService.getExpenseById(id);
      return reply.send({ success: true, data: item });
    }
  );

  /**
   * PUT /api/v1/expenses/:id
   */
  fastify.put(
    '/:id',
    { preHandler: [requirePermission('expenses.edit')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = request.user as any;
      if (user?.role === 'Technician') {
        return reply.status(HTTP_STATUS.FORBIDDEN).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Technicians cannot modify company expenses' },
        });
      }

      const input = UpdateExpenseSchema.parse(request.body);
      const result = await expensesService.updateExpense(id, input, getActorFromUser(user));
      return reply.send(result);
    }
  );

  /**
   * PATCH /api/v1/expenses/:id
   */
  fastify.patch(
    '/:id',
    { preHandler: [requirePermission('expenses.edit')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = request.user as any;
      if (user?.role === 'Technician') {
        return reply.status(HTTP_STATUS.FORBIDDEN).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Technicians cannot modify company expenses' },
        });
      }

      const input = UpdateExpenseSchema.parse(request.body);
      const result = await expensesService.updateExpense(id, input, getActorFromUser(user));
      return reply.send(result);
    }
  );

  /**
   * POST /api/v1/expenses/:id/void
   */
  fastify.post(
    '/:id/void',
    { preHandler: [requirePermission('expenses.delete')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = request.user as any;
      if (user?.role === 'Technician') {
        return reply.status(HTTP_STATUS.FORBIDDEN).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Technicians cannot void company expenses' },
        });
      }

      const input = VoidExpenseSchema.parse(request.body);
      const result = await expensesService.voidExpense(id, input, getActorFromUser(user));
      return reply.send(result);
    }
  );

  /**
   * GET /api/v1/expenses/monthly-reconciliation
   */
  fastify.get(
    '/monthly-reconciliation',
    { preHandler: [requirePermission('expenses.view')] },
    async (request, reply) => {
      const user = request.user as any;
      if (user?.role === 'Technician') {
        return reply.status(HTTP_STATUS.FORBIDDEN).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Technicians cannot view financial reconciliation' },
        });
      }

      const query = MonthlyReconciliationQuerySchema.parse(request.query);
      const data = await expensesService.getMonthlyReconciliation(
        query.year,
        query.month,
        user?.companyId || null,
        {
          leadProfit: query.leadProfit,
          previousClosingCash: query.previousClosingCash,
          actualBankBalance: query.actualBankBalance,
          savingsTransfer: query.savingsTransfer,
          previousSavingsBalance: query.previousSavingsBalance,
        }
      );

      return reply.send({ success: true, data });
    }
  );

  /**
   * POST /api/v1/expenses/monthly-closing/draft
   */
  fastify.post(
    '/monthly-closing/draft',
    { preHandler: [requirePermission('expenses.edit')] },
    async (request, reply) => {
      const user = request.user as any;
      if (user?.role === 'Technician') {
        return reply.status(HTTP_STATUS.FORBIDDEN).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Technicians cannot modify monthly closing drafts' },
        });
      }

      const input = SaveMonthlyClosingDraftSchema.parse(request.body);
      const result = await expensesService.saveMonthlyClosingDraft(input, getActorFromUser(user));
      return reply.send(result);
    }
  );

  /**
   * POST /api/v1/expenses/monthly-closing/approve
   */
  fastify.post(
    '/monthly-closing/approve',
    { preHandler: [requirePermission('expenses.approve')] },
    async (request, reply) => {
      const user = request.user as any;
      if (user?.role !== 'Admin' && user?.role !== 'Super Admin') {
        return reply.status(HTTP_STATUS.FORBIDDEN).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Only authorized administrators can approve monthly closings' },
        });
      }

      const input = ApproveMonthlyClosingSchema.parse(request.body);
      const result = await expensesService.approveMonthlyClosing(input, getActorFromUser(user));
      return reply.send(result);
    }
  );
};
