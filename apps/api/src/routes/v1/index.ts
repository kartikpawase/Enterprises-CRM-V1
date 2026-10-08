import type { FastifyPluginAsync } from 'fastify';
import { authRoutes } from './auth';
import { customerRoutes } from '../../modules/customers/customer.routes';
import { salesRoutes } from '../../modules/sales/sales.routes';
import { invoicesRoutes } from '../../modules/invoices/invoices.routes';
import { assetsRoutes } from '../../modules/assets/assets.routes';
import { productRoutes } from '../../modules/products/product.routes';
import { inventoryRoutes } from '../../modules/inventory/inventory.routes';
import { dashboardRoutes } from '../../modules/dashboard/dashboard.routes';
import { servicesRoutes } from '../../modules/services/services.routes';
import { warrantiesRoutes } from '../../modules/warranties/warranties.routes';
import { jobCardsRoutes } from '../../modules/job-cards/job-cards.routes';
import { techniciansRoutes } from '../../modules/technicians/technicians.routes';
import { paymentsRoutes } from '../../modules/payments/payments.routes';
import { remindersRoutes } from '../../modules/reminders/reminders.routes';
import { inquiriesRoutes } from '../../modules/inquiries/inquiries.routes';
import { publicInquiriesRoutes } from '../../modules/inquiries/public-inquiries.routes';
import { whatsappRoutes } from '../../modules/whatsapp/whatsapp.routes';
import { whatsappWebhookRoutes } from '../../modules/whatsapp/whatsapp-webhook.routes';
import { analyticsRoutes } from '../../modules/analytics/analytics.routes';
import { notificationsRoutes } from '../../modules/notifications/notifications.routes';
import { systemRoutes } from '../../modules/system/system.routes';
import { searchRoutes } from '../../modules/search/search.routes';
import { rentalRoutes } from '../../modules/rentals/rental.routes';
import { duesRoutes } from '../../modules/dues/dues.routes';
import { inventoryManagementRoutes } from '../../modules/inventory-management/inventory-management.routes';

/**
 * Root /api/v1 Router
 */
export const v1Routes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', async (_request, reply) => {
    return reply.status(200).send({
      success: true,
      data: {
        message: 'Enterprises CRM API v1 Foundation Active',
        version: 'v1',
      },
    });
  });

  // Global & Multi-Domain Search Engine (Phase 25)
  await fastify.register(searchRoutes, { prefix: '/search' });

  // System Connectivity & Health Probe (/api/v1/system/ping)
  await fastify.register(systemRoutes, { prefix: '/system' });

  // Public Endpoints (Website Inquiries & CAPTCHA - Unauthenticated)
  await fastify.register(publicInquiriesRoutes, { prefix: '/public' });

  // Webhooks (Meta WhatsApp Signed Ingestion)
  await fastify.register(whatsappWebhookRoutes, { prefix: '/webhooks/whatsapp' });

  // Authentication & Session Management Endpoints
  await fastify.register(authRoutes, { prefix: '/auth' });

  // Operational Dashboard Endpoints
  await fastify.register(dashboardRoutes, { prefix: '/dashboard' });

  // Business Analytics & Intelligence (Phase 10)
  await fastify.register(analyticsRoutes, { prefix: '/analytics' });

  // Internal Notifications Center (Phase 10)
  await fastify.register(notificationsRoutes, { prefix: '/notifications' });

  // Customer Management Endpoints
  await fastify.register(customerRoutes, { prefix: '/customers' });

  // Inquiries & Leads Management (Phase 9)
  await fastify.register(inquiriesRoutes, { prefix: '/inquiries' });

  // WhatsApp Business Integration (Phase 9)
  await fastify.register(whatsappRoutes, { prefix: '/whatsapp' });

  // Sales & Commercial Transactions
  await fastify.register(salesRoutes, { prefix: '/sales' });

  // Rental Agreements & Equipment Subscriptions
  await fastify.register(rentalRoutes, { prefix: '/rentals' });

  // Date-Wise Dues & Scheduled Activities
  await fastify.register(duesRoutes, { prefix: '/dues' });

  // Inventory & Spare Parts Purchase, Sales & Profit Management
  await fastify.register(inventoryManagementRoutes, { prefix: '/inventory-management' });

  // Invoices & Billing
  await fastify.register(invoicesRoutes, { prefix: '/invoices' });

  // Payments & Financial Ledger (Phase 8)
  await fastify.register(paymentsRoutes, { prefix: '/payments' });

  // Reminders & Follow-ups (Phase 8)
  await fastify.register(remindersRoutes, { prefix: '/reminders' });

  // Customer Assets & Serialized Machines
  await fastify.register(assetsRoutes, { prefix: '/assets' });

  // Products & Spare Parts Catalog
  await fastify.register(productRoutes, { prefix: '/products' });

  // Inventory & Stock Balances (Phase 17)
  await fastify.register(inventoryRoutes, { prefix: '/inventory' });

  // Services & Maintenance Management
  await fastify.register(servicesRoutes, { prefix: '/services' });

  // Warranties & Coverage Management
  await fastify.register(warrantiesRoutes, { prefix: '/warranties' });

  // Job Cards & Work Execution Orders (Phase 7)
  await fastify.register(jobCardsRoutes, { prefix: '/job-cards' });

  // Service Billing & Invoicing (Phase 22)
  const { serviceBillingRoutes } = await import('../../modules/service-billing/service-billing.routes');
  await fastify.register(serviceBillingRoutes, { prefix: '/service-billing' });

  // Technicians & Field Workforce Management (Phase 7)
  await fastify.register(techniciansRoutes, { prefix: '/technicians' });

  // Data Import, Export, Backup & Restore Engine (Phase 26)
  const { dataMovementRoutes } = await import('../../modules/data-movement/data-movement.routes');
  await fastify.register(dataMovementRoutes, { prefix: '/data-movement' });

  // System Administration & Business Configuration Engine (Phase 27)
  const { settingsRoutes } = await import('../../modules/system/settings.routes');
  await fastify.register(settingsRoutes, { prefix: '/settings' });

  // Advanced Workflow Engine & Business Automation (Phase 28)
  const { workflowRoutes } = await import('../../modules/workflows/workflow.routes');
  await fastify.register(workflowRoutes, { prefix: '/workflows' });

  // Document & File Management Infrastructure (Phase 31)
  const { documentRoutes } = await import('../../modules/documents/document.routes');
  await fastify.register(documentRoutes, { prefix: '/documents' });

  // Backup + Restore + Disaster Recovery Engine (Phase 32)
  const { backupRoutes } = await import('../../modules/backup/backup.routes');
  await fastify.register(backupRoutes, { prefix: '/backups' });

  // Trainable Knowledge Chatbot Engine
  const { chatbotRoutes } = await import('../../modules/chatbot/chatbot.routes');
  await fastify.register(chatbotRoutes, { prefix: '/chatbot' });

  // Technician Portal Isolated Authentication & Operation APIs
  const { technicianAuthRoutes, technicianPortalRoutes } = await import('../../modules/technician-portal/technician-portal.routes');
  await fastify.register(technicianAuthRoutes, { prefix: '/technician-auth' });
  await fastify.register(technicianPortalRoutes, { prefix: '/technician' });

  // Google Maps Platform & Live Technician Tracking APIs
  const { mapsRoutes } = await import('../../modules/maps/maps.routes');
  await fastify.register(mapsRoutes, { prefix: '/maps' });
};
