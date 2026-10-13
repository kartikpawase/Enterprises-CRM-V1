import type { FastifyPluginAsync } from 'fastify';
import { analyticsService } from './analytics.service';
import { analyticsDateFilterSchema, analyticsExportQuerySchema } from '@crm/validation';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import type { AnalyticsDateFilter } from '@crm/types';

export const analyticsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /api/v1/analytics/overview
   */
  fastify.get(
    '/overview',
    { preHandler: [requirePermission('analytics.view')] },
    async (request, reply) => {
      const filter = analyticsDateFilterSchema.parse(request.query) as AnalyticsDateFilter;
      const user = (request as any).user;
      const data = await analyticsService.getOverview(filter, user?.role);
      return reply.status(200).send({ success: true, data });
    }
  );

  /**
   * GET /api/v1/analytics/sales
   */
  fastify.get(
    '/sales',
    { preHandler: [requirePermission('sales.view')] },
    async (request, reply) => {
      const filter = analyticsDateFilterSchema.parse(request.query) as AnalyticsDateFilter;
      const data = await analyticsService.getSalesAnalytics(filter);
      return reply.status(200).send({ success: true, data });
    }
  );

  /**
   * GET /api/v1/analytics/revenue
   */
  fastify.get(
    '/revenue',
    { preHandler: [requirePermission('invoices.view')] },
    async (request, reply) => {
      const user = (request as any).user;
      if (!analyticsService.checkFinancialPermission(user?.role)) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'You are not authorized to view financial analytics.' },
        });
      }
      const filter = analyticsDateFilterSchema.parse(request.query) as AnalyticsDateFilter;
      const data = await analyticsService.getRevenueAnalytics(filter);
      return reply.status(200).send({ success: true, data });
    }
  );

  /**
   * GET /api/v1/analytics/financial-summary
   */
  fastify.get(
    '/financial-summary',
    { preHandler: [requirePermission('reports.view')] },
    async (request, reply) => {
      const user = (request as any).user;
      if (!analyticsService.checkFinancialPermission(user?.role)) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'You are not authorized to view financial analytics.' },
        });
      }
      const filter = analyticsDateFilterSchema.parse(request.query) as AnalyticsDateFilter;
      const data = await analyticsService.getFinancialSummary(filter, user?.companyId);
      return reply.status(200).send({ success: true, data });
    }
  );

  /**
   * GET /api/v1/analytics/payments
   */
  fastify.get(
    '/payments',
    { preHandler: [requirePermission('payments.view')] },
    async (request, reply) => {
      const user = (request as any).user;
      if (!analyticsService.checkFinancialPermission(user?.role)) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'You are not authorized to view payment analytics.' },
        });
      }
      const filter = analyticsDateFilterSchema.parse(request.query) as AnalyticsDateFilter;
      const data = await analyticsService.getPaymentAnalytics(filter);
      return reply.status(200).send({ success: true, data });
    }
  );

  /**
   * GET /api/v1/analytics/customers
   */
  fastify.get(
    '/customers',
    { preHandler: [requirePermission('customers.view')] },
    async (request, reply) => {
      const filter = analyticsDateFilterSchema.parse(request.query) as AnalyticsDateFilter;
      const data = await analyticsService.getCustomerAnalytics(filter);
      return reply.status(200).send({ success: true, data });
    }
  );

  /**
   * GET /api/v1/analytics/products
   */
  fastify.get(
    '/products',
    { preHandler: [requirePermission('products.view')] },
    async (request, reply) => {
      const filter = analyticsDateFilterSchema.parse(request.query) as AnalyticsDateFilter;
      const data = await analyticsService.getProductAnalytics(filter);
      return reply.status(200).send({ success: true, data });
    }
  );

  /**
   * GET /api/v1/analytics/inventory
   */
  fastify.get(
    '/inventory',
    { preHandler: [requirePermission('inventory.view')] },
    async (_request, reply) => {
      const data = await analyticsService.getInventoryAnalytics();
      return reply.status(200).send({ success: true, data });
    }
  );

  /**
   * GET /api/v1/analytics/services
   */
  fastify.get(
    '/services',
    { preHandler: [requirePermission('services.view')] },
    async (request, reply) => {
      const filter = analyticsDateFilterSchema.parse(request.query) as AnalyticsDateFilter;
      const data = await analyticsService.getServiceAnalytics(filter);
      return reply.status(200).send({ success: true, data });
    }
  );

  /**
   * GET /api/v1/analytics/jobs
   */
  fastify.get(
    '/jobs',
    { preHandler: [requirePermission('services.view')] },
    async (request, reply) => {
      const filter = analyticsDateFilterSchema.parse(request.query) as AnalyticsDateFilter;
      const data = await analyticsService.getJobCardAnalytics(filter);
      return reply.status(200).send({ success: true, data });
    }
  );

  /**
   * GET /api/v1/analytics/technicians
   */
  fastify.get(
    '/technicians',
    { preHandler: [requirePermission('technicians.view')] },
    async (request, reply) => {
      const filter = analyticsDateFilterSchema.parse(request.query) as AnalyticsDateFilter;
      const data = await analyticsService.getTechnicianAnalytics(filter);
      return reply.status(200).send({ success: true, data });
    }
  );

  /**
   * GET /api/v1/analytics/warranties
   */
  fastify.get(
    '/warranties',
    { preHandler: [requirePermission('warranties.view')] },
    async (request, reply) => {
      const filter = analyticsDateFilterSchema.parse(request.query) as AnalyticsDateFilter;
      const data = await analyticsService.getWarrantyAnalytics(filter);
      return reply.status(200).send({ success: true, data });
    }
  );

  /**
   * GET /api/v1/analytics/inquiries
   */
  fastify.get(
    '/inquiries',
    { preHandler: [requirePermission('inquiries.view')] },
    async (request, reply) => {
      const filter = analyticsDateFilterSchema.parse(request.query) as AnalyticsDateFilter;
      const data = await analyticsService.getInquiryAnalytics(filter);
      return reply.status(200).send({ success: true, data });
    }
  );

  /**
   * GET /api/v1/analytics/export (CSV export)
   */
  fastify.get(
    '/export',
    { preHandler: [requirePermission('reports.export')] },
    async (request, reply) => {
      const query = analyticsExportQuerySchema.parse(request.query);
      const user = (request as any).user;
      const filter: AnalyticsDateFilter = {
        range: query.range as any,
        timezone: query.timezone,
        ...(query.startDate ? { startDate: query.startDate } : {}),
        ...(query.endDate ? { endDate: query.endDate } : {}),
      };
      const csv = await analyticsService.exportToCsv(
        filter,
        query.category,
        user?.role
      );

      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="analytics-${query.category}-${Date.now()}.csv"`);
      return reply.send(csv);
    }
  );
};
