import fs from 'node:fs';
import type { FastifyPluginAsync } from 'fastify';
import { backupService } from './backup.service';
import { restoreService } from './restore.service';
import { backupScheduler, type BackupScheduleConfig } from './backup-scheduler';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { HTTP_STATUS } from '@crm/shared';
import type {
  CreateBackupRequest,
  RestoreBackupRequest,
} from '@crm/types';

export const backupRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', authenticate);

  /**
   * POST /api/v1/backups
   * Create a new backup snapshot
   */
  fastify.post<{ Body: CreateBackupRequest }>(
    '/',
    { preHandler: [requirePermission('backups.create')] },
    async (request, reply) => {
      const user = (request as any).user;
      const body = request.body || {};

      try {
        const manifest = await backupService.createBackup(body, {
          userId: user?.userId || user?.id,
          role: user?.role,
        });

        return reply.status(HTTP_STATUS.CREATED).send({
          success: true,
          data: manifest,
        });
      } catch (err: any) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          success: false,
          error: { code: 'BACKUP_CREATION_FAILED', message: err.message },
        });
      }
    }
  );

  /**
   * GET /api/v1/backups
   * List all backup snapshots
   */
  fastify.get<{ Querystring: { page?: string; limit?: string; type?: string } }>(
    '/',
    { preHandler: [requirePermission('backups.view')] },
    async (request, reply) => {
      const page = Number(request.query.page) || 1;
      const limit = Number(request.query.limit) || 20;
      const type = request.query.type;

      const result = await backupService.listBackups({ page, limit, type });

      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        data: result.items,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: Math.ceil(result.total / result.limit),
        },
      });
    }
  );

  /**
   * GET /api/v1/backups/storage/estimate
   * Estimate backup size and check storage readiness
   */
  fastify.get(
    '/storage/estimate',
    { preHandler: [requirePermission('backups.view')] },
    async (_request, reply) => {
      const estimate = await backupService.estimateBackupSize();
      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        data: estimate,
      });
    }
  );

  /**
   * GET /api/v1/backups/:id/inspect
   * Inspect backup metadata and structure without restoring
   */
  fastify.get<{ Params: { id: string } }>(
    '/:id/inspect',
    { preHandler: [requirePermission('backups.view')] },
    async (request, reply) => {
      const { id } = request.params;
      const report = await backupService.inspectBackup(id);

      if (!report.manifest && !report.isValid) {
        return reply.status(HTTP_STATUS.NOT_FOUND).send({
          success: false,
          error: { code: 'NOT_FOUND', message: `Backup '${id}' not found or corrupted.` },
        });
      }

      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        data: report,
      });
    }
  );

  /**
   * POST /api/v1/backups/:id/verify
   * Verify cryptographic checksums of a backup
   */
  fastify.post<{ Params: { id: string } }>(
    '/:id/verify',
    { preHandler: [requirePermission('backups.view')] },
    async (request, reply) => {
      const { id } = request.params;
      const result = await backupService.verifyBackup(id);

      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        data: result,
      });
    }
  );

  /**
   * POST /api/v1/backups/:id/restore
   * Execute safe staged disaster recovery & restore
   */
  fastify.post<{ Params: { id: string }; Body: RestoreBackupRequest }>(
    '/:id/restore',
    { preHandler: [requirePermission('backups.restore')] },
    async (request, reply) => {
      const { id } = request.params;
      const user = (request as any).user;
      const body = request.body || { confirmAction: false };

      try {
        const result = await restoreService.executeRestore(id, body, {
          userId: user?.userId || user?.id,
          role: user?.role,
        });

        return reply.status(HTTP_STATUS.OK).send({
          success: true,
          data: result,
        });
      } catch (err: any) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          success: false,
          error: { code: 'RESTORE_FAILED', message: err.message },
        });
      }
    }
  );

  /**
   * DELETE /api/v1/backups/:id
   * Delete backup snapshot
   */
  fastify.delete<{ Params: { id: string } }>(
    '/:id',
    { preHandler: [requirePermission('backups.delete')] },
    async (request, reply) => {
      const { id } = request.params;
      const user = (request as any).user;

      try {
        await backupService.deleteBackup(id, {
          userId: user?.userId || user?.id,
        });

        return reply.status(HTTP_STATUS.OK).send({
          success: true,
          data: { id, deleted: true },
        });
      } catch (err: any) {
        return reply.status(HTTP_STATUS.BAD_REQUEST).send({
          success: false,
          error: { code: 'DELETE_FAILED', message: err.message },
        });
      }
    }
  );

  /**
   * GET /api/v1/backups/:id/download
   * Download validated backup file package
   */
  fastify.get<{ Params: { id: string } }>(
    '/:id/download',
    { preHandler: [requirePermission('backups.view')] },
    async (request, reply) => {
      const { id } = request.params;
      try {
        const fileInfo = await backupService.getBackupDownloadStream(id);
        return reply
          .header('Content-Disposition', `attachment; filename="${fileInfo.filename}"`)
          .header('Content-Type', fileInfo.contentType || 'application/octet-stream')
          .send(fileInfo.stream);
      } catch (err: any) {
        return reply.status(HTTP_STATUS.NOT_FOUND).send({
          success: false,
          error: { code: 'BACKUP_NOT_FOUND', message: err.message },
        });
      }
    }
  );

  /**
   * GET /api/v1/backups/schedule
   * Get automatic backup schedule configuration
   */
  fastify.get(
    '/schedule',
    { preHandler: [requirePermission('backups.view')] },
    async (_request, reply) => {
      const config = await backupScheduler.getConfig();
      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        data: config,
      });
    }
  );

  /**
   * PUT /api/v1/backups/schedule
   * Update automatic backup schedule configuration
   */
  fastify.put<{ Body: Partial<BackupScheduleConfig> }>(
    '/schedule',
    { preHandler: [requirePermission('backups.manage')] },
    async (request, reply) => {
      const user = (request as any).user;
      const body = request.body || {};
      const updated = await backupScheduler.updateConfig(body, {
        userId: user?.userId || user?.id,
      });
      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        data: updated,
      });
    }
  );

  /**
   * POST /api/v1/backups/retention/cleanup
   * Trigger retention rotation cleanup
   */
  fastify.post(
    '/retention/cleanup',
    { preHandler: [requirePermission('backups.manage')] },
    async (_request, reply) => {
      const result = await backupService.cleanupOldBackups(10);
      return reply.status(HTTP_STATUS.OK).send({
        success: true,
        data: result,
      });
    }
  );
};
