import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { normalizeWhatsAppPhone } from './whatsapp-phone.util.js';
import type {
  WhatsAppProvider,
  WhatsAppProviderSendResult,
  WhatsAppWebhookEventData,
} from '@crm/types';

/**
 * Meta Official WhatsApp Business Cloud API Provider
 */
export class MetaWhatsAppProvider implements WhatsAppProvider {
  public name = 'META_CLOUD_API';
  private phoneNumberId: string;
  private accessToken: string;
  private apiVersion: string;
  private apiUrl: string;
  private appSecret?: string | undefined;

  constructor(config?: {
    phoneNumberId?: string;
    accessToken?: string;
    apiVersion?: string;
    apiUrl?: string;
    appSecret?: string;
  }) {
    this.phoneNumberId = (config?.phoneNumberId || env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
    this.accessToken = (config?.accessToken || env.WHATSAPP_ACCESS_TOKEN || '').trim();
    this.apiVersion = (config?.apiVersion || env.WHATSAPP_API_VERSION || 'v21.0').trim();
    this.apiUrl = (config?.apiUrl || env.WHATSAPP_API_URL || 'https://graph.facebook.com').replace(/\/+$/, '').trim();
    this.appSecret = config?.appSecret || env.WHATSAPP_WEBHOOK_APP_SECRET;
  }

  public isConfigValid(): boolean {
    return Boolean(
      this.phoneNumberId &&
      this.accessToken &&
      !this.phoneNumberId.includes('placeholder') &&
      !this.accessToken.includes('placeholder')
    );
  }

  private getMessagesEndpoint(): string {
    if (this.apiUrl.includes('/v')) {
      return `${this.apiUrl}/${this.phoneNumberId}/messages`;
    }
    return `${this.apiUrl}/${this.apiVersion}/${this.phoneNumberId}/messages`;
  }

  /**
   * Execute Meta Cloud API call with bounded retries for transient failures ONLY
   */
  private async executeWithRetry(
    payload: Record<string, unknown>
  ): Promise<WhatsAppProviderSendResult> {
    const url = this.getMessagesEndpoint();
    const maxAttempts = 3; // 1 initial + up to 2 retries
    let lastError: WhatsAppProviderSendResult | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeoutMs = 15000;
      const timeoutId = setTimeout(
        () => controller.abort(new Error('WhatsApp API request timed out after 15 seconds')),
        timeoutMs
      );

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const data = (await response.json().catch(() => null)) as any;

        if (response.ok) {
          const providerMessageId = data?.messages?.[0]?.id;
          if (!providerMessageId) {
            return {
              success: false,
              status: 'FAILED',
              error: {
                code: 'NO_MESSAGE_ID',
                message: 'WhatsApp provider did not return a valid message confirmation ID.',
              },
            };
          }
          return {
            success: true,
            providerMessageId,
            status: 'SENT',
          };
        }

        const metaError = data?.error;
        const statusCode = response.status;
        const rawCode = metaError?.code ? Number(metaError.code) : statusCode;
        const rawMsg =
          metaError?.error_user_msg ||
          metaError?.message ||
          data?.message ||
          response.statusText ||
          'WhatsApp API rejected the message';

        // 1. Authentication failure
        if (statusCode === 401 || rawCode === 190) {
          return {
            success: false,
            status: 'FAILED',
            error: {
              code: 'AUTHENTICATION_ERROR',
              message: 'WhatsApp authentication failed. Access token is invalid or expired.',
            },
          };
        }

        // 2. Invalid recipient destination
        if (
          rawCode === 131030 ||
          rawCode === 131026 ||
          rawCode === 131009 ||
          rawCode === 100
        ) {
          return {
            success: false,
            status: 'FAILED',
            error: {
              code: 'INVALID_DESTINATION',
              message: `Recipient phone number rejected by WhatsApp: ${rawMsg}`,
            },
          };
        }

        // 3. Template errors
        if (rawCode >= 132000 && rawCode <= 132015) {
          return {
            success: false,
            status: 'FAILED',
            error: {
              code: 'TEMPLATE_ERROR',
              message: `WhatsApp template error: ${rawMsg}`,
            },
          };
        }

        // 4. Rate limit (transient)
        const isRateLimit = statusCode === 429 || rawCode === 80007 || rawCode === 4;
        // 5. Transient server errors (500, 502, 503, 504)
        const isServerError = statusCode >= 500 && statusCode < 600;

        lastError = {
          success: false,
          status: 'FAILED',
          error: {
            code: isRateLimit ? 'RATE_LIMIT_EXCEEDED' : String(rawCode || 'META_API_ERROR'),
            message: isRateLimit
              ? 'WhatsApp API rate limit exceeded. Please try again shortly.'
              : `WhatsApp delivery failed: ${rawMsg}`,
          },
        };

        const isTransient = isRateLimit || isServerError;
        if (!isTransient || attempt === maxAttempts) {
          return lastError;
        }

        const backoffMs = attempt * 500;
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      } catch (networkErr: any) {
        clearTimeout(timeoutId);
        const isTimeout = controller.signal.aborted;
        lastError = {
          success: false,
          status: 'FAILED',
          error: {
            code: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
            message: isTimeout
              ? 'WhatsApp provider request timed out after 15 seconds.'
              : `Failed to reach WhatsApp API endpoint: ${networkErr?.message || 'Network error'}`,
          },
        };

        if (attempt < maxAttempts) {
          const backoffMs = attempt * 500;
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }
        return lastError;
      }
    }

    return (
      lastError || {
        success: false,
        status: 'FAILED',
        error: {
          code: 'UNKNOWN_FAILURE',
          message: 'WhatsApp delivery failed after bounded retries.',
        },
      }
    );
  }

  /**
   * Send Direct Text Message via Meta Cloud API
   */
  async sendTextMessage(to: string, text: string): Promise<WhatsAppProviderSendResult> {
    if (!this.isConfigValid()) {
      return {
        success: false,
        status: 'FAILED',
        error: {
          code: 'PROVIDER_CONFIG_MISSING',
          message: 'WhatsApp service is not configured. Please set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN in server environment.',
        },
      };
    }

    const normalizedTo = normalizeWhatsAppPhone(to);
    if (!normalizedTo || normalizedTo.length < 10) {
      return {
        success: false,
        status: 'FAILED',
        error: {
          code: 'INVALID_RECIPIENT_PHONE',
          message: 'Invalid technician mobile number. Recipient phone number must be at least 10 digits.',
        },
      };
    }

    return this.executeWithRetry({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedTo,
      type: 'text',
      text: {
        preview_url: false,
        body: text,
      },
    });
  }

  /**
   * Send Pre-Approved Meta Template Message
   */
  async sendTemplateMessage(
    to: string,
    templateName: string,
    languageCode = 'en_US',
    parameters: Record<string, string> = {}
  ): Promise<WhatsAppProviderSendResult> {
    if (!this.isConfigValid()) {
      return {
        success: false,
        status: 'FAILED',
        error: {
          code: 'PROVIDER_CONFIG_MISSING',
          message: 'WhatsApp service is not configured. Please set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN in server environment.',
        },
      };
    }

    const normalizedTo = normalizeWhatsAppPhone(to);
    if (!normalizedTo || normalizedTo.length < 10) {
      return {
        success: false,
        status: 'FAILED',
        error: {
          code: 'INVALID_RECIPIENT_PHONE',
          message: 'Invalid recipient mobile number for WhatsApp template.',
        },
      };
    }

    const bodyParameters = Object.values(parameters).map((paramVal) => ({
      type: 'text',
      text: paramVal,
    }));

    return this.executeWithRetry({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizedTo,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: languageCode,
        },
        components:
          bodyParameters.length > 0
            ? [
                {
                  type: 'body',
                  parameters: bodyParameters,
                },
              ]
            : undefined,
      },
    });
  }

  /**
   * Cryptographically validate X-Hub-Signature-256 header using App Secret
   */
  validateWebhookSignature(rawBody: string, signatureHeader?: string): boolean {
    if (!this.appSecret) {
      // In dev or without configured secret, reject or log
      return true;
    }
    if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
      return false;
    }

    try {
      const expectedSignature = signatureHeader.substring(7);
      const hmac = crypto.createHmac('sha256', this.appSecret);
      hmac.update(rawBody);
      const calculatedSignature = hmac.digest('hex');

      const calcBuf = Buffer.from(calculatedSignature, 'utf8');
      const expBuf = Buffer.from(expectedSignature, 'utf8');

      if (calcBuf.length !== expBuf.length) {
        return false;
      }

      return crypto.timingSafeEqual(calcBuf, expBuf);
    } catch {
      return false;
    }
  }

  /**
   * Parse Meta Webhook JSON Payload into structured events
   */
  parseWebhookPayload(payload: any): WhatsAppWebhookEventData[] {
    const events: WhatsAppWebhookEventData[] = [];
    if (!payload || !payload.entry) return events;

    for (const entry of payload.entry) {
      if (!entry.changes) continue;
      for (const change of entry.changes) {
        const value = change.value;
        if (!value) continue;

        // 1. Handle Message Status Updates (sent -> delivered -> read -> failed)
        if (value.statuses && Array.isArray(value.statuses)) {
          for (const statusObj of value.statuses) {
            const statusStr = (statusObj.status || '').toUpperCase();
            let parsedStatus: any = 'SENT';
            if (statusStr === 'DELIVERED') parsedStatus = 'DELIVERED';
            else if (statusStr === 'READ') parsedStatus = 'READ';
            else if (statusStr === 'FAILED') parsedStatus = 'FAILED';

            events.push({
              eventId: `status_${statusObj.id}_${statusObj.status}_${statusObj.timestamp}`,
              eventType: 'message_status_update',
              providerMessageId: statusObj.id,
              status: parsedStatus,
              timestamp: statusObj.timestamp ? new Date(Number(statusObj.timestamp) * 1000) : new Date(),
              to: statusObj.recipient_id,
              errorCode: statusObj.errors?.[0]?.code ? String(statusObj.errors[0].code) : undefined,
              errorMessage: statusObj.errors?.[0]?.title || statusObj.errors?.[0]?.message,
              raw: statusObj,
            });
          }
        }

        // 2. Handle Inbound Incoming Messages
        if (value.messages && Array.isArray(value.messages)) {
          for (const msgObj of value.messages) {
            let messageText = '';
            if (msgObj.type === 'text' && msgObj.text?.body) {
              messageText = msgObj.text.body;
            } else if (msgObj.type === 'button') {
              messageText = msgObj.button?.text || '';
            } else if (msgObj.type === 'interactive') {
              messageText =
                msgObj.interactive?.button_reply?.title ||
                msgObj.interactive?.list_reply?.title ||
                '[Interactive Response]';
            } else {
              messageText = `[Received ${msgObj.type || 'media'} message]`;
            }

            events.push({
              eventId: `inbound_${msgObj.id}`,
              eventType: 'inbound_message',
              providerMessageId: msgObj.id,
              status: 'DELIVERED',
              from: msgObj.from,
              messageText,
              timestamp: msgObj.timestamp ? new Date(Number(msgObj.timestamp) * 1000) : new Date(),
              raw: msgObj,
            });
          }
        }
      }
    }

    return events;
  }
}

/**
 * Local-First / Development Simulator WhatsApp Provider
 * Provides robust offline operations and test predictability
 */
export class DevWhatsAppProvider implements WhatsAppProvider {
  public name = 'DEV_LOCAL_SIMULATOR';

  async sendTextMessage(_to: string, _text: string): Promise<WhatsAppProviderSendResult> {
    const providerMessageId = `wamid.DEV_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    return {
      success: true,
      providerMessageId,
      status: 'SENT',
    };
  }

  async sendTemplateMessage(
    _to: string,
    _templateName: string,
    _languageCode = 'en_US',
    _parameters: Record<string, string> = {}
  ): Promise<WhatsAppProviderSendResult> {
    const providerMessageId = `wamid.DEV_TPL_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    return {
      success: true,
      providerMessageId,
      status: 'SENT',
    };
  }

  validateWebhookSignature(_rawBody: string, _signatureHeader?: string): boolean {
    return true; // Always valid in simulator mode
  }

  parseWebhookPayload(payload: any): WhatsAppWebhookEventData[] {
    const metaParser = new MetaWhatsAppProvider();
    return metaParser.parseWebhookPayload(payload);
  }
}

/**
 * Provider Factory
 */
export function getWhatsAppProvider(): WhatsAppProvider {
  const configuredProvider = (process.env.WHATSAPP_PROVIDER || env.WHATSAPP_PROVIDER || '').toUpperCase();
  if (configuredProvider === 'DEV' || configuredProvider === 'MOCK') {
    return new DevWhatsAppProvider();
  }
  if (process.env.NODE_ENV === 'test' && !env.WHATSAPP_PHONE_NUMBER_ID && !process.env.WHATSAPP_PHONE_NUMBER_ID) {
    return new DevWhatsAppProvider();
  }
  return new MetaWhatsAppProvider();
}
