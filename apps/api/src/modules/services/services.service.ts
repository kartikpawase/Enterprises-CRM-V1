import { servicesRepository } from './services.repository';
import type {
  ServiceQueryFilter,
  CreateServiceInput,
  UpdateServiceInput,
  CompleteServiceInput,
} from '@crm/validation';

export class ServicesService {
  async getServices(filters: ServiceQueryFilter) {
    return servicesRepository.findPaginated(filters);
  }

  async getServiceById(id: string) {
    const service = await servicesRepository.findById(id);
    if (!service) {
      throw new Error('Service record not found');
    }
    return service;
  }

  async getHeatmap(period: 'year' | 'month' | 'week' | 'day', dateFrom?: string, dateTo?: string) {
    return servicesRepository.getHeatmapData(period, dateFrom, dateTo);
  }

  async getKPIs() {
    return servicesRepository.getKPIs();
  }

  async getUpcomingServices(days = 7) {
    return servicesRepository.getUpcomingServices(days);
  }

  async getOverdueServices() {
    return servicesRepository.getOverdueServices();
  }

  async createService(input: CreateServiceInput, createdById?: string) {
    const result = await servicesRepository.createService(input, createdById);
    try {
      const { domainEventBus } = await import('../notifications/events/event-bus');
      domainEventBus.publish(
        'SERVICE_SCHEDULED',
        'SERVICE',
        result.service.id,
        {
          serviceNumber: result.service.serviceNumber,
          customerId: result.service.customerId,
          scheduledDate: result.service.scheduledDate,
        },
        createdById
      );

      if (result.service.technicianId) {
        domainEventBus.publish(
          'SERVICE_ASSIGNED',
          'SERVICE',
          result.service.id,
          {
            serviceNumber: result.service.serviceNumber,
            technicianId: result.service.technicianId,
            scheduledDate: result.service.scheduledDate,
            scheduledTimeSlot: result.service.scheduledTimeSlot,
            priority: result.service.priority,
          },
          createdById
        );
      }
    } catch (e) {
      console.error('Failed to emit SERVICE_SCHEDULED event:', e);
    }
    return result;
  }

  async updateService(id: string, input: UpdateServiceInput, actorId?: string) {
    let existing: any = null;
    try {
      existing = await servicesRepository.findById(id);
    } catch {}

    const result = await servicesRepository.updateService(id, input, actorId);

    try {
      const { domainEventBus } = await import('../notifications/events/event-bus');
      const updatedTechId = result?.technicianId;
      const existingTechId = existing?.technicianId;

      // 1. Reassignment or Assignment change
      if (existingTechId !== updatedTechId) {
        if (existingTechId && updatedTechId) {
          // Reassigned from existingTechId to updatedTechId
          domainEventBus.publish(
            'SERVICE_REASSIGNED',
            'SERVICE',
            id,
            {
              serviceNumber: result?.serviceNumber || existing?.serviceNumber,
              oldTechnicianId: existingTechId,
              newTechnicianId: updatedTechId,
              scheduledDate: result?.scheduledDate,
              scheduledTimeSlot: result?.scheduledTimeSlot,
              priority: result?.priority,
            },
            actorId
          );
        } else if (!existingTechId && updatedTechId) {
          // Freshly assigned to updatedTechId
          domainEventBus.publish(
            'SERVICE_ASSIGNED',
            'SERVICE',
            id,
            {
              serviceNumber: result?.serviceNumber || existing?.serviceNumber,
              technicianId: updatedTechId,
              scheduledDate: result?.scheduledDate,
              scheduledTimeSlot: result?.scheduledTimeSlot,
              priority: result?.priority,
            },
            actorId
          );
        } else if (existingTechId && !updatedTechId) {
          // Unassigned from existingTechId
          domainEventBus.publish(
            'SERVICE_REASSIGNED',
            'SERVICE',
            id,
            {
              serviceNumber: result?.serviceNumber || existing?.serviceNumber,
              oldTechnicianId: existingTechId,
              newTechnicianId: null,
            },
            actorId
          );
        }
      } else if (updatedTechId) {
        // Same technician assigned, check other operational updates
        const dateChanged =
          input.scheduledDate &&
          existing?.scheduledDate &&
          new Date(input.scheduledDate).getTime() !== new Date(existing.scheduledDate).getTime();
        const slotChanged =
          input.scheduledTimeSlot !== undefined &&
          input.scheduledTimeSlot !== existing?.scheduledTimeSlot;

        if (dateChanged || slotChanged) {
          domainEventBus.publish(
            'SERVICE_SCHEDULE_CHANGED',
            'SERVICE',
            id,
            {
              serviceNumber: result?.serviceNumber || existing?.serviceNumber,
              technicianId: updatedTechId,
              scheduledDate: result?.scheduledDate,
              scheduledTimeSlot: result?.scheduledTimeSlot,
              reason: input.internalNotes || input.customerNotes,
            },
            actorId
          );
        }

        if (input.status === 'CANCELLED' || input.cancelReason) {
          domainEventBus.publish(
            'SERVICE_CANCELLED',
            'SERVICE',
            id,
            {
              serviceNumber: result?.serviceNumber || existing?.serviceNumber,
              technicianId: updatedTechId,
              cancelReason: input.cancelReason || 'Cancelled by staff',
            },
            actorId
          );
        } else if (
          input.diagnosis ||
          input.workPerformed ||
          input.technicianNotes ||
          input.customerNotes ||
          (input.status && input.status !== existing?.status)
        ) {
          domainEventBus.publish(
            'JOB_CARD_UPDATED',
            'SERVICE',
            id,
            {
              serviceNumber: result?.serviceNumber || existing?.serviceNumber,
              technicianId: updatedTechId,
              summary:
                input.workPerformed ||
                input.diagnosis ||
                input.customerNotes ||
                (input.status ? `Status changed to ${input.status}` : undefined),
            },
            actorId
          );
        }
      }
    } catch (e) {
      console.error('Failed to emit service update domain events:', e);
    }

    return result;
  }

  async cancelService(id: string, cancelReason: string, actorId?: string) {
    const result = await servicesRepository.cancelService(id, cancelReason, actorId);
    try {
      if (result?.technicianId) {
        const { domainEventBus } = await import('../notifications/events/event-bus');
        domainEventBus.publish(
          'SERVICE_CANCELLED',
          'SERVICE',
          id,
          {
            serviceNumber: result.serviceNumber,
            technicianId: result.technicianId,
            cancelReason,
          },
          actorId
        );
      }
    } catch (e) {
      console.error('Failed to emit SERVICE_CANCELLED event:', e);
    }
    return result;
  }

  async deleteService(id: string, actorId?: string) {
    return servicesRepository.deleteService(id);
  }

  async completeService(id: string, input: CompleteServiceInput, actorId?: string) {
    const result = await servicesRepository.completeService(id, input, actorId);
    try {
      const { domainEventBus } = await import('../notifications/events/event-bus');
      domainEventBus.publish(
        'SERVICE_COMPLETED',
        'SERVICE',
        id,
        {
          serviceNumber: (result as any)?.service?.serviceNumber || 'Service',
        },
        actorId
      );

      // Trigger transactional service completion email
      import('../notifications/email.service').then(({ emailService }) => {
        emailService.sendServiceCompleted(id).catch((err) => {
          console.error('[ServicesService] Error dispatching service completed email:', err);
        });
      }).catch(() => {});
    } catch (e) {
      console.error('Failed to emit SERVICE_COMPLETED event:', e);
    }
    return result;
  }

  async listTechnicians() {
    return servicesRepository.listTechnicians();
  }

  async resendTechnicianNotification(serviceId: string, actorId?: string) {
    const service = await servicesRepository.findById(serviceId);
    if (!service) {
      const error: any = new Error('Service record not found');
      error.statusCode = 404;
      throw error;
    }
    const jobCardId = (service as any).jobCardId || (service as any).jobCard?.id;
    const { whatsappService } = await import('../whatsapp/whatsapp.service');

    if (jobCardId) {
      return whatsappService.notifyTechnicianJobAssignment(jobCardId, {
        forceResend: true,
        actorUserId: actorId,
      });
    }

    const { jobCardsRepository } = await import('../job-cards/job-cards.repository');
    const linkedCard = await jobCardsRepository.findByServiceId(serviceId);
    if (linkedCard) {
      return whatsappService.notifyTechnicianJobAssignment(linkedCard.id, {
        forceResend: true,
        actorUserId: actorId,
      });
    }

    // Direct fallback from authoritative service record
    return whatsappService.notifyTechnicianServiceAssignment(service, {
      forceResend: true,
      actorUserId: actorId,
    });
  }

  async resendCustomerNotification(serviceId: string, actorId?: string) {
    const service = await servicesRepository.findById(serviceId);
    if (!service) {
      const error: any = new Error('Service record not found');
      error.statusCode = 404;
      throw error;
    }
    const { whatsappService } = await import('../whatsapp/whatsapp.service');
    return whatsappService.notifyCustomerServiceScheduled(service, {
      actorUserId: actorId,
    });
  }
}

export const servicesService = new ServicesService();
