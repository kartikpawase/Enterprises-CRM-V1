import { whatsappRepository } from './whatsapp.repository';
import { getWhatsAppProvider } from './whatsapp.provider';
import { normalizeWhatsAppPhone } from './whatsapp-phone.util';
import type {
  SendWhatsAppTextMessageDto,
  SendWhatsAppTemplateMessageDto,
  WhatsAppTemplateDefinition,
  WhatsAppConversationQueryFilters,
  WhatsAppOptInStatus,
} from '@crm/types';

/**
 * Standard Approved WhatsApp Business Templates Registry for SR Enterprises
 */
export const APPROVED_WHATSAPP_TEMPLATES: WhatsAppTemplateDefinition[] = [
  {
    id: 'invoice_reminder',
    name: 'invoice_reminder',
    category: 'TRANSACTIONAL',
    language: 'en',
    description: 'Friendly reminder for pending service or equipment sale invoice payment.',
    parameterKeys: ['customer_name', 'invoice_number', 'amount_due', 'due_date'],
    sampleText:
      'Dear {{customer_name}}, this is a friendly reminder that Invoice {{invoice_number}} for Rs. {{amount_due}} is due on {{due_date}}. Please make payment via UPI or visit our customer portal.',
  },
  {
    id: 'service_scheduled',
    name: 'service_scheduled',
    category: 'UTILITY',
    language: 'en',
    description: 'Notification to customer when a doorstep service visit is scheduled.',
    parameterKeys: ['customer_name', 'machine_model', 'scheduled_time', 'technician_name'],
    sampleText:
      'Hello {{customer_name}}, your service visit for {{machine_model}} has been scheduled on {{scheduled_time}}. Technician {{technician_name}} will visit your registered address.',
  },
  {
    id: 'job_completed',
    name: 'job_completed',
    category: 'UTILITY',
    language: 'en',
    description: 'Service completion confirmation and equipment health summary.',
    parameterKeys: ['customer_name', 'job_card_number', 'machine_model', 'service_summary'],
    sampleText:
      'Dear {{customer_name}}, service for your {{machine_model}} under Job Card {{job_card_number}} has been successfully completed: {{service_summary}}. Thank you for choosing Enterprises CRM!',
  },
  {
    id: 'payment_receipt',
    name: 'payment_receipt',
    category: 'TRANSACTIONAL',
    language: 'en',
    description: 'Official payment acknowledgement and receipt notification.',
    parameterKeys: ['customer_name', 'receipt_number', 'amount_paid', 'invoice_number'],
    sampleText:
      'Hello {{customer_name}}, we have received your payment of Rs. {{amount_paid}} for Invoice {{invoice_number}} (Receipt #{{receipt_number}}). Thank you for your business with Enterprises CRM.',
  },
  {
    id: 'warranty_expiry_notice',
    name: 'warranty_expiry_notice',
    category: 'UTILITY',
    language: 'en',
    description: 'Advance notice for equipment warranty or AMC expiry.',
    parameterKeys: ['customer_name', 'machine_model', 'expiry_date'],
    sampleText:
      'Dear {{customer_name}}, the warranty / AMC for your equipment {{machine_model}} is expiring on {{expiry_date}}. Contact us to renew and enjoy uninterrupted service.',
  },
];

export class WhatsAppService {
  /**
   * List Pre-approved Template Definitions
   */
  getApprovedTemplates(): WhatsAppTemplateDefinition[] {
    return APPROVED_WHATSAPP_TEMPLATES;
  }

  /**
   * Get Template Definition by Name
   */
  getTemplateByName(templateName: string): WhatsAppTemplateDefinition | undefined {
    return APPROVED_WHATSAPP_TEMPLATES.find((t) => t.name === templateName);
  }

  /**
   * List Conversations with Search & Status Filters
   */
  async listConversations(filters: WhatsAppConversationQueryFilters = {}) {
    return whatsappRepository.findConversations(filters);
  }

  /**
   * Get Single Conversation Details
   */
  async getConversationById(id: string) {
    const conv = await whatsappRepository.findConversationById(id);
    if (!conv) {
      throw new Error('WhatsApp conversation not found');
    }
    return conv;
  }

  /**
   * Get Messages for Conversation
   */
  async listMessages(conversationId: string, page = 1, limit = 50) {
    return whatsappRepository.findMessages(conversationId, page, limit);
  }

  /**
   * Send Direct Outbound Text Message
   */
  async sendTextMessage(dto: SendWhatsAppTextMessageDto, actorUserId?: string) {
    let contactId: string;
    let recipientPhone: string;
    let conversationId: string;

    // 1. Resolve conversation, contact, and recipient phone
    if (dto.conversationId) {
      const conv = await whatsappRepository.findConversationById(dto.conversationId);
      if (!conv || !conv.contact) {
        throw new Error('Conversation or contact not found');
      }
      conversationId = conv.id;
      contactId = conv.contact.id;
      recipientPhone = conv.contact.phone;
    } else if (dto.customerId || dto.phone) {
      const contact = await whatsappRepository.findOrCreateContact(
        dto.phone || '',
        dto.customerId || null
      );
      contactId = contact.id;
      recipientPhone = contact.phone;
      const conv = await whatsappRepository.findOrCreateConversation(contact.id, contact.customerId);
      conversationId = conv.id;
    } else {
      throw new Error('Must provide either conversationId, customerId, or phone');
    }

    // 2. Persist local outbound message in QUEUED state (Local-First Guarantee)
    const localMessage = await whatsappRepository.createOutboundMessage({
      conversationId,
      contactId,
      content: dto.content.trim(),
      messageType: 'TEXT',
      ...(actorUserId ? { sentByUserId: actorUserId } : {}),
      status: 'QUEUED',
    });

    // 3. Dispatch through configured WhatsApp provider
    const provider = getWhatsAppProvider();
    const sendResult = await provider.sendTextMessage(recipientPhone, dto.content.trim());

    // 4. Update message status based on provider response
    const updatedMessage = await whatsappRepository.updateMessageStatus(localMessage.id, {
      ...(sendResult.providerMessageId ? { providerMessageId: sendResult.providerMessageId } : {}),
      status: sendResult.status,
      ...(sendResult.error?.code ? { errorCode: sendResult.error.code } : {}),
      ...(sendResult.error?.message ? { errorMessage: sendResult.error.message } : {}),
    });

    return updatedMessage;
  }

  /**
   * Send Pre-Approved WhatsApp Business Template Message
   */
  async sendTemplateMessage(dto: SendWhatsAppTemplateMessageDto, actorUserId?: string) {
    // 1. Validate template exists in approved registry
    const templateDef = APPROVED_WHATSAPP_TEMPLATES.find((t) => t.name === dto.templateName);
    if (!templateDef) {
      throw new Error(`Template "${dto.templateName}" is not registered or approved.`);
    }

    // 2. Render sample message preview from parameters
    let renderedContent = templateDef.sampleText;
    for (const [key, val] of Object.entries(dto.parameters)) {
      renderedContent = renderedContent.replace(new RegExp(`{{${key}}}`, 'g'), String(val));
    }

    // 3. Resolve Contact & Conversation
    const contact = await whatsappRepository.findOrCreateContact(
      dto.recipientPhone,
      dto.customerId || null
    );
    const conversation = await whatsappRepository.findOrCreateConversation(
      contact.id,
      contact.customerId
    );

    // 4. Persist local message record in QUEUED state
    const localMessage = await whatsappRepository.createOutboundMessage({
      conversationId: conversation.id,
      contactId: contact.id,
      content: renderedContent,
      messageType: 'TEMPLATE',
      templateName: dto.templateName,
      templateParams: dto.parameters,
      ...(actorUserId ? { sentByUserId: actorUserId } : {}),
      status: 'QUEUED',
    });

    // 5. Dispatch via Provider
    const provider = getWhatsAppProvider();
    const sendResult = await provider.sendTemplateMessage(
      contact.phone,
      dto.templateName,
      templateDef.language,
      dto.parameters
    );

    // 6. Update message delivery status
    const updatedMessage = await whatsappRepository.updateMessageStatus(localMessage.id, {
      ...(sendResult.providerMessageId ? { providerMessageId: sendResult.providerMessageId } : {}),
      status: sendResult.status,
      ...(sendResult.error?.code ? { errorCode: sendResult.error.code } : {}),
      ...(sendResult.error?.message ? { errorMessage: sendResult.error.message } : {}),
    });

    return updatedMessage;
  }

  /**
   * Update Communication Consent
   */
  async updateConsent(contactId: string, optInStatus: WhatsAppOptInStatus) {
    return whatsappRepository.updateConsent(contactId, optInStatus);
  }

  /**
   * Mark Conversation as Read
   */
  async markAsRead(conversationId: string) {
    return whatsappRepository.markConversationAsRead(conversationId);
  }

  /**
   * Process Incoming Webhook Event with HMAC validation & Idempotency Guarantee
   */
  async processWebhook(rawBody: string, signatureHeader?: string, parsedPayload?: any) {
    const provider = getWhatsAppProvider();

    // 1. Signature Verification
    const isSignatureValid = provider.validateWebhookSignature(rawBody, signatureHeader);
    if (!isSignatureValid) {
      throw new Error('Invalid webhook signature');
    }

    // 2. Parse payload into structured events
    const events = provider.parseWebhookPayload(parsedPayload);
    const results: any[] = [];

    for (const ev of events) {
      // 3. Webhook Idempotency: Prevent duplicate message creation / redundant updates
      const isNewEvent = await whatsappRepository.recordEventIfNew(
        ev.eventId,
        ev.eventType,
        (ev.raw as Record<string, unknown>) || {}
      );

      if (!isNewEvent) {
        results.push({ eventId: ev.eventId, status: 'SKIPPED_DUPLICATE' });
        continue;
      }

      // 4. Process event based on type
      if (ev.eventType === 'message_status_update' && ev.providerMessageId && ev.status) {
        const updated = await whatsappRepository.updateMessageStatusByProviderId(
          ev.providerMessageId,
          ev.status,
          ev.errorCode || ev.errorMessage
            ? {
                code: ev.errorCode || 'UNKNOWN_ERROR',
                message: ev.errorMessage || 'Error reported by provider',
              }
            : undefined,
          ev.timestamp || undefined
        );
        results.push({ eventId: ev.eventId, status: 'PROCESSED_STATUS', updated: !!updated });
      } else if (ev.eventType === 'inbound_message' && ev.from && ev.messageText) {
        const inboundMsg = await whatsappRepository.createInboundMessage({
          fromPhone: ev.from,
          providerMessageId: ev.providerMessageId || `inbound_${Date.now()}`,
          content: ev.messageText,
          ...(ev.timestamp ? { timestamp: ev.timestamp } : {}),
        });
        results.push({
          eventId: ev.eventId,
          status: 'PROCESSED_INBOUND',
          messageId: inboundMsg ? inboundMsg.id : undefined,
        });
      } else {
        results.push({ eventId: ev.eventId, status: 'PROCESSED_OTHER' });
      }
    }

    return results;
  }

  /**
   * Send Dynamic WhatsApp Notification to Assigned Technician for a Job Card / Work Order
   */
  async notifyTechnicianJobAssignment(
    jobCardId: string,
    options?: { forceResend?: boolean; actorUserId?: string }
  ): Promise<{
    success: boolean;
    status: string;
    recipientPhone?: string;
    technicianName?: string;
    providerMessageId?: string;
    messageText?: string;
    directUrl?: string;
    error?: string;
    errorCode?: string;
    isDuplicate?: boolean;
  }> {
    if (!jobCardId || typeof jobCardId !== 'string') {
      return { success: false, status: 'FAILED', error: 'Invalid Job Card ID' };
    }

    try {
      const { jobCardsRepository } = await import('../job-cards/job-cards.repository');
      const jobCard = await jobCardsRepository.findById(jobCardId);

      if (!jobCard) {
        return { success: false, status: 'FAILED', error: `Job Card '${jobCardId}' not found` };
      }

      if (!jobCard.technicianId) {
        return {
          success: false,
          status: 'SKIPPED',
          error: 'No technician is currently assigned to this Job Card',
        };
      }

      // Authoritatively resolve technician record from database
      const { techniciansRepository } = await import('../technicians/technicians.repository');
      const techRecord = await techniciansRepository.findById(jobCard.technicianId);

      const technicianName = techRecord?.fullName || jobCard.technicianName || 'Technician';
      const rawTechPhone = techRecord?.phone || jobCard.technicianPhone || '';
      const normalizedPhone = normalizeWhatsAppPhone(rawTechPhone);

      if (!normalizedPhone) {
        return {
          success: false,
          status: 'FAILED',
          technicianName,
          error: `Invalid technician mobile number (${rawTechPhone || 'None'}). Please ensure technician mobile number is valid.`,
        };
      }

      // Dynamic field extraction from authoritative CRM record
      const customerName = jobCard.customerName || 'Valued Customer';
      const customerPhone = jobCard.customerPhone || 'N/A';
      const machineName = jobCard.productName || jobCard.productBrand || 'Equipment';
      const serialNumber = jobCard.serialNumber || 'N/A';

      const formatTitleCase = (str?: string | null): string => {
        if (!str) return '';
        return str
          .replace(/_/g, ' ')
          .toLowerCase()
          .split(' ')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
      };

      const serviceType = formatTitleCase(jobCard.serviceType) || 'Periodic Maintenance';
      const priority = formatTitleCase(jobCard.priority) || 'Normal';
      const serviceLocation = (jobCard as any).serviceLocation === 'IN_SHOP' ? 'In-Shop' : 'Doorstep';
      const timeSlot = (jobCard as any).scheduledTimeSlot || '10:00 AM - 12:00 PM';

      let scheduledDateStr = 'Scheduled Visit';
      if (jobCard.scheduledDate) {
        const d = new Date(jobCard.scheduledDate);
        if (!isNaN(d.getTime())) {
          scheduledDateStr = d.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          });
        }
      }

      const messageText = `New Service Job Assigned

Customer: ${customerName}
Customer Phone: ${customerPhone}
Machine/Product: ${machineName}
Serial Number: ${serialNumber}
Service Type: ${serviceType}
Visit Date: ${scheduledDateStr}
Time Slot: ${timeSlot}
Location: ${serviceLocation}
Priority: ${priority}

Job Card: ${jobCard.jobCardNumber}

Please check the CRM for complete job details.`;

      const directUrl = `https://api.whatsapp.com/send?phone=${normalizedPhone}&text=${encodeURIComponent(messageText)}`;

      // Resolve contact and conversation for audit and duplicate check
      let contact: any = null;
      let conversation: any = null;
      try {
        contact = await whatsappRepository.findOrCreateContact(normalizedPhone, null);
        conversation = await whatsappRepository.findOrCreateConversation(contact.id, null);

        // Check for recent duplicate message if not forced
        if (!options?.forceResend) {
          const recent = await whatsappRepository.findMessages(conversation.id, 1, 5);
          const sixtySecAgo = Date.now() - 60000;
          const duplicate = recent.data.find(
            (m) =>
              m.direction === 'OUTBOUND' &&
              m.content.includes(jobCard.jobCardNumber) &&
              new Date(m.createdAt).getTime() > sixtySecAgo &&
              m.status !== 'FAILED'
          );
          if (duplicate) {
            return {
              success: true,
              status: 'SKIPPED_DUPLICATE',
              isDuplicate: true,
              recipientPhone: normalizedPhone,
              technicianName,
              providerMessageId: duplicate.providerMessageId || duplicate.id,
              messageText,
              directUrl,
            };
          }
        }
      } catch {}

      // Dispatch via configured WhatsApp provider
      const provider = getWhatsAppProvider();
      const sendResult = await provider.sendTextMessage(normalizedPhone, messageText);

      // Create local message record for audit
      let localMessageId: string | undefined;
      if (conversation && contact) {
        try {
          const localMessage = await whatsappRepository.createOutboundMessage({
            conversationId: conversation.id,
            contactId: contact.id,
            content: messageText,
            messageType: 'TEXT',
            ...(options?.actorUserId ? { sentByUserId: options.actorUserId } : {}),
            status: sendResult.status || (sendResult.success ? 'SENT' : 'FAILED'),
            ...(sendResult.providerMessageId ? { providerMessageId: sendResult.providerMessageId } : {}),
            ...(sendResult.error?.code ? { errorCode: sendResult.error.code } : {}),
            ...(sendResult.error?.message ? { errorMessage: sendResult.error.message } : {}),
          });
          localMessageId = localMessage?.id;
        } catch {}
      }

      return {
        success: sendResult.success,
        status: sendResult.status || (sendResult.success ? 'SENT' : 'FAILED'),
        recipientPhone: normalizedPhone,
        technicianName,
        providerMessageId: sendResult.providerMessageId || localMessageId,
        messageText,
        directUrl,
        error: sendResult.success ? undefined : (sendResult.error?.message || 'WhatsApp delivery failed'),
        errorCode: sendResult.error?.code,
      };
    } catch (err: any) {
      return {
        success: false,
        status: 'FAILED',
        error: err?.message || 'Failed to dispatch WhatsApp notification to technician',
      };
    }
  }

  /**
   * Send Dynamic WhatsApp Notification to Assigned Technician directly from Service record
   */
  async notifyTechnicianServiceAssignment(
    service: any,
    options?: { forceResend?: boolean; actorUserId?: string }
  ): Promise<{
    success: boolean;
    status: string;
    recipientPhone?: string;
    technicianName?: string;
    providerMessageId?: string;
    messageText?: string;
    directUrl?: string;
    error?: string;
    errorCode?: string;
    isDuplicate?: boolean;
  }> {
    if (!service) {
      return { success: false, status: 'FAILED', error: 'Invalid service record' };
    }

    let rawTechPhone = service.technicianPhone || service.technician?.phone || '';
    let technicianName = service.technicianName || service.technician?.fullName || 'Technician';

    if (!rawTechPhone && service.technicianId) {
      try {
        const { techniciansRepository } = await import('../technicians/technicians.repository');
        const techRecord = await techniciansRepository.findById(service.technicianId);
        if (techRecord) {
          rawTechPhone = techRecord.phone;
          technicianName = techRecord.fullName || technicianName;
        }
      } catch {}
    }

    const normalizedPhone = normalizeWhatsAppPhone(rawTechPhone);

    if (!normalizedPhone) {
      return {
        success: false,
        status: 'FAILED',
        technicianName,
        error: `Invalid technician mobile number (${rawTechPhone || 'None'}). Please ensure technician mobile number is valid.`,
      };
    }

    const customerName = service.customerName || 'Valued Customer';
    const customerPhone = service.customerPhone || 'N/A';
    const machineName = service.productName || service.productBrand || 'Equipment';
    const serialNumber = service.serialNumber || 'N/A';

    const formatTitleCase = (str?: string | null): string => {
      if (!str) return '';
      return str
        .replace(/_/g, ' ')
        .toLowerCase()
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    };

    const serviceType = formatTitleCase(service.serviceType) || 'Periodic Maintenance';
    const priority = formatTitleCase(service.priority) || 'Normal';
    const serviceLocation = service.serviceLocation === 'IN_SHOP' ? 'In-Shop' : 'Doorstep';
    const timeSlot = service.scheduledTimeSlot || '10:00 AM - 12:00 PM';

    let scheduledDateStr = 'Scheduled Visit';
    if (service.scheduledDate) {
      const d = new Date(service.scheduledDate);
      if (!isNaN(d.getTime())) {
        scheduledDateStr = d.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });
      }
    }

    const messageText = `New Service Job Assigned

Customer: ${customerName}
Customer Phone: ${customerPhone}
Machine/Product: ${machineName}
Serial Number: ${serialNumber}
Service Type: ${serviceType}
Visit Date: ${scheduledDateStr}
Time Slot: ${timeSlot}
Location: ${serviceLocation}
Priority: ${priority}

Service #: ${service.serviceNumber}

Please check the CRM for complete job details.`;

    const directUrl = `https://api.whatsapp.com/send?phone=${normalizedPhone}&text=${encodeURIComponent(messageText)}`;

    // Resolve contact and conversation for audit and duplicate check
    let contact: any = null;
    let conversation: any = null;
    try {
      contact = await whatsappRepository.findOrCreateContact(normalizedPhone, null);
      conversation = await whatsappRepository.findOrCreateConversation(contact.id, null);

      if (!options?.forceResend) {
        const recent = await whatsappRepository.findMessages(conversation.id, 1, 5);
        const sixtySecAgo = Date.now() - 60000;
        const duplicate = recent.data.find(
          (m) =>
            m.direction === 'OUTBOUND' &&
            m.content.includes(service.serviceNumber) &&
            new Date(m.createdAt).getTime() > sixtySecAgo &&
            m.status !== 'FAILED'
        );
        if (duplicate) {
          return {
            success: true,
            status: 'SKIPPED_DUPLICATE',
            isDuplicate: true,
            recipientPhone: normalizedPhone,
            technicianName,
            providerMessageId: duplicate.providerMessageId || duplicate.id,
            messageText,
            directUrl,
          };
        }
      }
    } catch {}

    // Dispatch via configured WhatsApp provider
    const provider = getWhatsAppProvider();
    const sendResult = await provider.sendTextMessage(normalizedPhone, messageText);

    // Create local message record for audit
    let localMessageId: string | undefined;
    if (conversation && contact) {
      try {
        const localMessage = await whatsappRepository.createOutboundMessage({
          conversationId: conversation.id,
          contactId: contact.id,
          content: messageText,
          messageType: 'TEXT',
          ...(options?.actorUserId ? { sentByUserId: options.actorUserId } : {}),
          status: sendResult.status || (sendResult.success ? 'SENT' : 'FAILED'),
          ...(sendResult.providerMessageId ? { providerMessageId: sendResult.providerMessageId } : {}),
          ...(sendResult.error?.code ? { errorCode: sendResult.error.code } : {}),
          ...(sendResult.error?.message ? { errorMessage: sendResult.error.message } : {}),
        });
        localMessageId = localMessage?.id;
      } catch {}
    }

    return {
      success: sendResult.success,
      status: sendResult.status || (sendResult.success ? 'SENT' : 'FAILED'),
      recipientPhone: normalizedPhone,
      technicianName,
      providerMessageId: sendResult.providerMessageId || localMessageId,
      messageText,
      directUrl,
      error: sendResult.success ? undefined : (sendResult.error?.message || 'WhatsApp delivery failed'),
      errorCode: sendResult.error?.code,
    };
  }

  /**
   * Send Dynamic WhatsApp Notification to Customer / Client for Scheduled Service Visit
   */
  async notifyCustomerServiceScheduled(
    service: any,
    options?: { actorUserId?: string }
  ): Promise<{
    success: boolean;
    status: string;
    recipientPhone?: string;
    customerName?: string;
    providerMessageId?: string;
    messageText?: string;
    directUrl?: string;
    error?: string;
    errorCode?: string;
  }> {
    if (!service) {
      return { success: false, status: 'FAILED', error: 'Invalid service record' };
    }

    const rawCustPhone = service.customerPhone || service.customer?.phone || '';
    const customerName = service.customerName || service.customer?.fullName || 'Valued Customer';
    const normalizedPhone = normalizeWhatsAppPhone(rawCustPhone);

    if (!normalizedPhone) {
      return {
        success: false,
        status: 'FAILED',
        customerName,
        error: `Invalid customer mobile number (${rawCustCustPhone(rawCustPhone)}). Please ensure customer mobile number is valid.`,
      };
    }

    const machineName = service.productName || service.productBrand || 'Equipment';
    const serialNumber = service.serialNumber || 'N/A';
    const technicianName = service.technicianName || service.technician?.fullName || 'Assigned Specialist';
    const technicianPhone = service.technicianPhone || service.technician?.phone || '';

    const formatTitleCase = (str?: string | null): string => {
      if (!str) return '';
      return str
        .replace(/_/g, ' ')
        .toLowerCase()
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    };

    const serviceType = formatTitleCase(service.serviceType) || 'Periodic Maintenance';
    const serviceLocation = service.serviceLocation === 'IN_SHOP' ? 'In-Shop Service' : 'Doorstep Visit';
    const timeSlot = service.scheduledTimeSlot || '10:00 AM - 12:00 PM';

    let scheduledDateStr = 'Scheduled Visit';
    if (service.scheduledDate) {
      const d = new Date(service.scheduledDate);
      if (!isNaN(d.getTime())) {
        scheduledDateStr = d.toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });
      }
    }

    const techInfo = technicianPhone ? `${technicianName} (${technicianPhone})` : technicianName;

    const messageText = `Hello ${customerName},

Your service visit with Enterprises CRM has been confirmed!

Service #: ${service.serviceNumber}
Equipment: ${machineName}${serialNumber !== 'N/A' ? ` (SN: ${serialNumber})` : ''}
Service Type: ${serviceType}
Visit Date: ${scheduledDateStr}
Time Slot: ${timeSlot}
Service Location: ${serviceLocation}
Assigned Technician: ${techInfo}

Our technician will contact you prior to arrival. Thank you for choosing Enterprises CRM!`;

    const directUrl = `https://api.whatsapp.com/send?phone=${normalizedPhone}&text=${encodeURIComponent(messageText)}`;

    // Dispatch via configured WhatsApp provider
    const provider = getWhatsAppProvider();
    const sendResult = await provider.sendTextMessage(normalizedPhone, messageText);

    let localMessageId: string | undefined;
    try {
      const contact = await whatsappRepository.findOrCreateContact(normalizedPhone, service.customerId || null);
      const conversation = await whatsappRepository.findOrCreateConversation(contact.id, contact.customerId);

      const localMessage = await whatsappRepository.createOutboundMessage({
        conversationId: conversation.id,
        contactId: contact.id,
        content: messageText,
        messageType: 'TEXT',
        ...(options?.actorUserId ? { sentByUserId: options.actorUserId } : {}),
        status: sendResult.status || (sendResult.success ? 'SENT' : 'FAILED'),
        ...(sendResult.providerMessageId ? { providerMessageId: sendResult.providerMessageId } : {}),
        ...(sendResult.error?.code ? { errorCode: sendResult.error.code } : {}),
        ...(sendResult.error?.message ? { errorMessage: sendResult.error.message } : {}),
      });
      localMessageId = localMessage?.id;
    } catch {}

    return {
      success: sendResult.success,
      status: sendResult.status || (sendResult.success ? 'SENT' : 'FAILED'),
      recipientPhone: normalizedPhone,
      customerName,
      providerMessageId: sendResult.providerMessageId || localMessageId,
      messageText,
      directUrl,
      error: sendResult.success ? undefined : (sendResult.error?.message || 'WhatsApp delivery failed'),
      errorCode: sendResult.error?.code,
    };
  }
}

function rawCustCustPhone(phone: string): string {
  return phone || 'None';
}

export const whatsappService = new WhatsAppService();
