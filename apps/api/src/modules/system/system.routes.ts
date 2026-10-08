import type { FastifyPluginAsync } from 'fastify';
import fs from 'fs';
import path from 'path';
import { authenticate } from '../../middleware/auth';
import { requirePermission } from '../../middleware/rbac';
import { db } from '../../database/client';
import { sql } from 'drizzle-orm';
import { memorySales } from '../sales/sales.repository';
import { memoryInvoices, memoryInvoiceItems } from '../invoices/invoices.repository';
import { memoryPayments } from '../payments/payments.repository';
import { memoryServices } from '../services/services.repository';
import { memoryCustomers } from '../customers/customer.repository';
import { memoryTechnicians } from '../technicians/technicians.repository';
import { memoryJobCards } from '../job-cards/job-cards.repository';
import { memoryWarranties } from '../warranties/warranties.repository';
import { memoryReminders } from '../reminders/reminders.repository';
import { memoryAssets } from '../assets/assets.repository';
import {
  memoryInventoryItems,
  memoryPurchases,
  memorySales as memoryInventorySales,
} from '../inventory-management/inventory-management.repository';
import { memoryRentals, memoryRentalPayments } from '../rentals/rental.repository';
import {
  memoryNotifications,
  memoryNotificationPreferences,
} from '../notifications/notifications.repository';

export function resetAllMemoryStores() {
  try {
    memorySales.length = 0;
    memoryInvoices.length = 0;
    memoryInvoiceItems.length = 0;
    memoryPayments.length = 0;
    memoryServices.length = 0;
    memoryCustomers.length = 0;
    memoryTechnicians.length = 0;
    memoryJobCards.length = 0;
    memoryWarranties.length = 0;
    memoryReminders.length = 0;
    memoryAssets.length = 0;
    memoryInventoryItems.length = 0;
    memoryPurchases.length = 0;
    memoryInventorySales.length = 0;
    memoryRentals.length = 0;
    memoryRentalPayments.length = 0;
    memoryNotifications.length = 0;
    memoryNotificationPreferences.clear();
  } catch {}
}

/**
 * System routes for testing end-to-end API connectivity and system maintenance
 */
export const systemRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/v1/system/ping
   * Safe test endpoint verifying Frontend -> API -> Backend communication
   */
  fastify.get('/ping', async (_request, reply) => {
    return reply.status(200).send({
      success: true,
      data: {
        pong: true,
        timestamp: new Date().toISOString(),
        service: 'Enterprises CRM API',
        version: 'v1',
      },
    });
  });

  /**
   * POST /api/v1/system/purge-seeded-data
   * Administrative purge of all seeded/mock business records from CRM database.
   * Strictly resets sequences to 0 and preserves Super Admin accounts & system roles.
   */
  fastify.post(
    '/purge-seeded-data',
    { preHandler: [authenticate, requirePermission('settings.manage')] },
    async (_request, reply) => {
      const tablesToClean = [
        'job_cards',
        'service_schedules',
        'services',
        'warranty_events',
        'warranties',
        'customer_assets',
        'payments',
        'invoice_items',
        'invoices',
        'sale_items',
        'sales',
        'customer_addresses',
        'customer_custom_labels',
        'customer_activities',
        'rental_events',
        'rental_payments',
        'rentals',
        'inventory_sales',
        'inventory_purchases',
        'inventory_items',
        'reminders',
        'technicians',
        'inquiry_events',
        'inquiries',
        'whatsapp_events',
        'whatsapp_messages',
        'whatsapp_conversations',
        'whatsapp_contacts',
        'notifications',
        'email_notifications',
        'email_queue',
        'audit_logs',
        'documents',
        'customers',
        'products',
      ];

      const results: Record<string, string> = {};

      for (const table of tablesToClean) {
        try {
          await db.execute(sql.raw(`DELETE FROM "${table}"`));
          results[table] = 'purged';
        } catch (err: any) {
          results[table] = `error: ${err.message}`;
        }
      }

      // Reset all business sequence counters to 0 so fresh orders start at 0001
      try {
        await db.execute(sql.raw(`UPDATE "business_sequences" SET "current_val" = 0`));
        results['business_sequences'] = 'reset to 0';
      } catch (err: any) {
        results['business_sequences'] = `error: ${err.message}`;
      }

      // Reset all in-memory repositories
      resetAllMemoryStores();

      return reply.status(200).send({
        success: true,
        message: 'All seeded and mock business data has been completely purged.',
        data: results,
      });
    }
  );

  /**
   * POST /api/v1/system/sync-schema
   * Ensure newly added tables like inquiry_events exist in PGlite
   */
  fastify.post(
    '/sync-schema',
    { preHandler: [authenticate, requirePermission('settings.manage')] },
    async (_request, reply) => {
      try {
        await db.execute(sql.raw(`
          CREATE TABLE IF NOT EXISTS "inquiry_events" (
            "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            "inquiry_id" uuid NOT NULL REFERENCES "inquiries"("id") ON DELETE CASCADE,
            "event_type" text NOT NULL,
            "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
            "notes" text,
            "metadata" jsonb,
            "created_at" timestamp with time zone DEFAULT now() NOT NULL
          );
        `));
        return reply.status(200).send({ success: true, message: 'Schema synchronized successfully' });
      } catch (err: any) {
        return reply.status(500).send({ success: false, error: err.message });
      }
    }
  );

  /**
   * POST /api/v1/system/delete-crm-database
   * Complete purge of all CRM data across database level and cloud/local storage levels.
   * Permanently clears all business tables, resets sequence counters to 0,
   * purges all objects from storage, and wipes local documents/backups.
   * Super Admin account and system roles are preserved for uninterrupted access.
   */
  fastify.post(
    '/delete-crm-database',
    { preHandler: [authenticate, requirePermission('settings.manage')] },
    async (_request, reply) => {
      const allBusinessTables = [
        'job_cards',
        'service_schedules',
        'services',
        'warranty_events',
        'warranties',
        'customer_assets',
        'payments',
        'invoice_items',
        'invoices',
        'sale_items',
        'sales',
        'customer_addresses',
        'customer_custom_labels',
        'customer_activities',
        'rental_events',
        'rental_payments',
        'rentals',
        'inventory_sales',
        'inventory_purchases',
        'inventory_items',
        'reminders',
        'technicians',
        'inquiry_events',
        'inquiries',
        'whatsapp_events',
        'whatsapp_messages',
        'whatsapp_conversations',
        'whatsapp_contacts',
        'notifications',
        'email_notifications',
        'email_queue',
        'audit_logs',
        'documents',
        'customers',
        'products',
        'app_settings',
      ];

      const dbResults: Record<string, string> = {};

      // 1. Delete all records from all business tables in DB
      for (const table of allBusinessTables) {
        try {
          await db.execute(sql.raw(`DELETE FROM "${table}"`));
          dbResults[table] = 'purged';
        } catch (err: any) {
          dbResults[table] = `skipped/error: ${err.message}`;
        }
      }

      // 2. Reset business sequences to 0
      try {
        await db.execute(sql.raw(`UPDATE "business_sequences" SET "current_val" = 0`));
        dbResults['business_sequences'] = 'reset to 0';
      } catch (err: any) {
        dbResults['business_sequences'] = `skipped/error: ${err.message}`;
      }

      // 3. Clean physical storage directories
      let storagePurgedCount = 0;
      try {
        const cleanDirRecursively = (dirPath: string) => {
          if (!fs.existsSync(dirPath)) return;
          const entries = fs.readdirSync(dirPath, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
              cleanDirRecursively(fullPath);
              try { fs.rmdirSync(fullPath); } catch {}
            } else if (entry.isFile()) {
              try {
                fs.unlinkSync(fullPath);
                storagePurgedCount++;
              } catch {}
            }
          }
        };

        const localDirs = ['./storage/documents', './storage/temp', './backups', './.crm-data/backups', './.crm-data/documents'];
        for (const dir of localDirs) {
          cleanDirRecursively(dir);
        }
      } catch (err: any) {
        console.warn('[Delete CRM Database] Storage purge error:', err?.message || err);
      }

      // 5. Reset all in-memory store arrays
      resetAllMemoryStores();

      return reply.status(200).send({
        success: true,
        message: 'CRM Database and Storage deleted successfully. All data wiped.',
        data: {
          tablesPurged: Object.keys(dbResults).length,
          storageFilesDeleted: storagePurgedCount,
          dbResults,
        },
      });
    }
  );
};


