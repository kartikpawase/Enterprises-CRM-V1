import { randomUUID } from 'crypto';
import { notificationsService } from '../notifications.service';

export type DomainEventType =
  | 'WARRANTY_CREATED'
  | 'WARRANTY_EXPIRING'
  | 'WARRANTY_EXPIRED'
  | 'SERVICE_SCHEDULED'
  | 'SERVICE_ASSIGNED'
  | 'SERVICE_SCHEDULE_CHANGED'
  | 'SERVICE_CANCELLED'
  | 'SERVICE_REASSIGNED'
  | 'SERVICE_COMPLETED'
  | 'JOB_CARD_ASSIGNED'
  | 'JOB_CARD_STARTED'
  | 'JOB_CARD_UPDATED'
  | 'JOB_CARD_COMPLETED'
  | 'INVOICE_GENERATED'
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_OVERDUE'
  | 'NEW_INQUIRY'
  | 'CUSTOMER_CREATED';

export interface DomainEvent<T = any> {
  eventId: string;
  type: DomainEventType;
  entityType: string;
  entityId: string;
  occurredAt: Date;
  payload: T;
  actorId?: string | null;
  actorName?: string | null;
}

type EventHandler<T = any> = (event: DomainEvent<T>) => Promise<void> | void;

export class DomainEventBus {
  private handlers: Map<DomainEventType, Set<EventHandler>> = new Map();

  constructor() {
    this.registerDefaultHandlers();
  }

  /**
   * Subscribe a handler to a specific domain event
   */
  subscribe<T = any>(type: DomainEventType, handler: EventHandler<T>): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler as EventHandler);

    return () => {
      this.handlers.get(type)?.delete(handler as EventHandler);
    };
  }

  /**
   * Publish an event with failure isolation (ensures business callers never crash on delivery errors)
   */
  async publish<T = any>(
    type: DomainEventType,
    entityType: string,
    entityId: string,
    payload: T,
    actorId?: string | null,
    actorName?: string | null
  ): Promise<DomainEvent<T>> {
    const event: DomainEvent<T> = {
      eventId: randomUUID(),
      type,
      entityType,
      entityId,
      occurredAt: new Date(),
      payload,
      actorId: actorId || null,
      actorName: actorName || 'System',
    };

    const listeners = this.handlers.get(type);
    if (listeners && listeners.size > 0) {
      for (const listener of listeners) {
        try {
          await Promise.resolve(listener(event));
        } catch (handlerErr) {
          console.error(`[EventBus] Error in subscriber for event ${type} (${event.eventId}):`, handlerErr);
        }
      }
    }

    return event;
  }

  /**
   * Register default CRM notification and follow-up handlers
   */
  private registerDefaultHandlers() {
    // 1. Payment Received -> Notify Admin
    this.subscribe('PAYMENT_RECEIVED', async (event) => {
      const { amount, customerName, invoiceNumber } = event.payload;
      await notificationsService.dispatchPaymentReceived({
        paymentId: event.entityId,
        amount: Number(amount) || 0,
        customerName: customerName || 'Customer',
        invoiceNumber,
      });
    });

    // 2. Job Card Assigned -> Notify Technician
    this.subscribe('JOB_CARD_ASSIGNED', async (event) => {
      const { jobCardNumber, technicianId, customerName, serviceType } = event.payload;
      if (technicianId) {
        await notificationsService.dispatchJobAssigned({
          jobCardId: event.entityId,
          jobCardNumber: jobCardNumber || 'Job Card',
          technicianId,
          customerName: customerName || 'Customer',
          serviceType: serviceType || 'Service',
        });
      }
    });

    // 3. Job Card Completed -> Notify Admin
    this.subscribe('JOB_CARD_COMPLETED', async (event) => {
      const { jobCardNumber, technicianName, customerName } = event.payload;
      await notificationsService.dispatchJobCompleted({
        jobCardId: event.entityId,
        jobCardNumber: jobCardNumber || 'Job Card',
        technicianName: technicianName || 'Technician',
        customerName: customerName || 'Customer',
      });
    });

    // 4. Warranty Expiring -> Alert Staff
    this.subscribe('WARRANTY_EXPIRING', async (event) => {
      const { customerName, machineModel, expiryDate } = event.payload;
      await notificationsService.dispatchWarrantyExpiring({
        warrantyId: event.entityId,
        customerName: customerName || 'Customer',
        machineModel: machineModel || 'Equipment',
        expiryDate: expiryDate || new Date().toISOString().split('T')[0],
      });
    });

    // 5. New Inbound Inquiry -> Alert Admin
    this.subscribe('NEW_INQUIRY', async (event) => {
      const { customerName, inquiryType, source } = event.payload;
      await notificationsService.dispatchNewInquiry({
        inquiryId: event.entityId,
        customerName: customerName || 'Prospective Customer',
        inquiryType,
        source,
      });
    });

    // 6. Invoice Overdue -> Alert Staff
    this.subscribe('PAYMENT_OVERDUE', async (event) => {
      const { invoiceNumber, customerName, overdueAmount } = event.payload;
      await notificationsService.dispatchInvoiceOverdue({
        invoiceId: event.entityId,
        invoiceNumber: invoiceNumber || 'INV',
        customerName: customerName || 'Customer',
        overdueAmount: Number(overdueAmount) || 0,
      });
    });
  }
}

export const domainEventBus = new DomainEventBus();
