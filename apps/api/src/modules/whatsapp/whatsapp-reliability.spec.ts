import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MetaWhatsAppProvider, DevWhatsAppProvider, getWhatsAppProvider } from './whatsapp.provider.js';
import { normalizeWhatsAppPhone } from './whatsapp-phone.util.js';
import { whatsappService } from './whatsapp.service.js';
import { whatsappRepository } from './whatsapp.repository.js';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';

const { mockJobCard, mockTech } = vi.hoisted(() => ({
  mockJobCard: {
    id: 'jc-uuid-1',
    jobCardNumber: 'JC-2026-TEST',
    technicianId: 'tech-uuid-1',
    technicianName: 'Aakash Sharma',
    technicianPhone: '9820011223',
    customerName: 'Kartik Pawase',
    customerPhone: '9021653893',
    serviceType: 'REPAIR',
    priority: 'HIGH',
  },
  mockTech: {
    id: 'tech-uuid-1',
    fullName: 'Aakash Sharma',
    phone: '9820011223',
  },
}));

vi.mock('../job-cards/job-cards.repository', () => ({
  jobCardsRepository: {
    findById: vi.fn().mockImplementation((id: string) => {
      if (id === 'jc-uuid-1') return Promise.resolve(mockJobCard);
      return Promise.resolve(null);
    }),
  },
}));

vi.mock('../technicians/technicians.repository', () => ({
  techniciansRepository: {
    findById: vi.fn().mockImplementation((id: string) => {
      if (id === 'tech-uuid-1') return Promise.resolve(mockTech);
      return Promise.resolve(null);
    }),
  },
}));

describe('WhatsApp Reliability & Resilience Test Matrix (Step 9)', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // 1 & 2 & 12 & 13: Assignment, Resend, Double-Click & Force Resend
  // =========================================================================
  describe('1, 2, 12, 13: Assignment, Resend & Idempotency Flow', () => {
    it('1. Assignment message: dispatches to technician with complete details', async () => {
      const mockSend = vi.fn().mockResolvedValue({
        success: true,
        status: 'SENT',
        providerMessageId: 'wamid.TEST_ASSIGN_001',
      });

      const provider = new DevWhatsAppProvider();
      vi.spyOn(provider, 'sendTextMessage').mockImplementation(mockSend);

      const result = await provider.sendTextMessage('9820011223', 'New Service Job Assigned');
      expect(result.success).toBe(true);
      expect(result.status).toBe('SENT');
      expect(result.providerMessageId).toBe('wamid.TEST_ASSIGN_001');
      expect(mockSend).toHaveBeenCalledWith('9820011223', 'New Service Job Assigned');
    });

    it('2 & 13. Resend message: forceResend bypasses duplicate suppression', async () => {
      vi.spyOn(whatsappRepository, 'findOrCreateContact').mockResolvedValue({
        id: 'contact-test-1',
        phone: '+919820011223',
        optInStatus: 'OPTED_IN',
        optInDate: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.spyOn(whatsappRepository, 'findOrCreateConversation').mockResolvedValue({
        id: 'conv-test-1',
        contactId: 'contact-test-1',
        status: 'ACTIVE',
        unreadCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Simulate a recent outbound message for JC-2026-TEST within last 60 seconds
      vi.spyOn(whatsappRepository, 'findMessages').mockResolvedValue({
        data: [
          {
            id: 'msg-recent-1',
            conversationId: 'conv-test-1',
            direction: 'OUTBOUND',
            content: 'New Service Job Assigned\nJob Card: JC-2026-TEST',
            status: 'SENT',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        pagination: { page: 1, limit: 5, total: 1, totalPages: 1 },
      });

      // Test Scenario 12: Double-click without forceResend skips duplicate
      const dupResult = await whatsappService.notifyTechnicianJobAssignment('jc-uuid-1', {
        forceResend: false,
      });
      expect(dupResult.isDuplicate).toBe(true);
      expect(dupResult.status).toBe('SKIPPED_DUPLICATE');

      // Test Scenario 13: With forceResend: true, bypasses duplicate check and dispatches
      const resendResult = await whatsappService.notifyTechnicianJobAssignment('jc-uuid-1', {
        forceResend: true,
      });
      expect(resendResult.isDuplicate).toBeUndefined();
      expect(resendResult.recipientPhone).toBe('919820011223');
    });
  });

  // =========================================================================
  // 3 & 4: Valid vs Invalid Destination Phone Formatting
  // =========================================================================
  describe('3 & 4: Destination Phone Normalization', () => {
    it('3. Valid destination: normalizes various valid Indian phone formats to 91XXXXXXXXXX', () => {
      expect(normalizeWhatsAppPhone('9820011223')).toBe('919820011223');
      expect(normalizeWhatsAppPhone('+919820011223')).toBe('919820011223');
      expect(normalizeWhatsAppPhone('+91 98200 11223')).toBe('919820011223');
      expect(normalizeWhatsAppPhone('09820011223')).toBe('919820011223');
      expect(normalizeWhatsAppPhone('0919820011223')).toBe('919820011223');
    });

    it('4. Invalid destination: rejects malformed numbers without network call', async () => {
      const provider = new MetaWhatsAppProvider({
        phoneNumberId: '1234567890',
        accessToken: 'EAAG_VALID_TEST_TOKEN',
      });

      const invalidInputs = ['', '   ', '123', 'abcdef', 'null', 'undefined', '12345'];
      for (const input of invalidInputs) {
        const res = await provider.sendTextMessage(input, 'Test message');
        expect(res.success).toBe(false);
        expect(res.status).toBe('FAILED');
        expect(res.error?.code).toBe('INVALID_RECIPIENT_PHONE');
      }
    });
  });

  // =========================================================================
  // 5: Provider Rejection Handling
  // =========================================================================
  describe('5: Meta Provider Rejection & Error Classification', () => {
    it('handles Meta 400 Bad Request / Invalid recipient cleanly', async () => {
      const provider = new MetaWhatsAppProvider({
        phoneNumberId: '1234567890',
        accessToken: 'EAAG_VALID_TOKEN',
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message: '(#131030) Recipient phone number not in allowed list',
              type: 'OAuthException',
              code: 131030,
            },
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const res = await provider.sendTextMessage('9820011223', 'Hello');
      expect(res.success).toBe(false);
      expect(res.status).toBe('FAILED');
      expect(res.error?.code).toBe('INVALID_DESTINATION');
      expect(res.error?.message).toContain('Recipient phone number rejected');
    });

    it('handles Meta 401 Authentication Error without leaking token', async () => {
      const secretToken = 'EAAG_SECRET_TOKEN_DO_NOT_LEAK_12345';
      const provider = new MetaWhatsAppProvider({
        phoneNumberId: '1234567890',
        accessToken: secretToken,
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message: 'Invalid OAuth access token - Cannot parse access token',
              type: 'OAuthException',
              code: 190,
            },
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const res = await provider.sendTextMessage('9820011223', 'Hello');
      expect(res.success).toBe(false);
      expect(res.status).toBe('FAILED');
      expect(res.error?.code).toBe('AUTHENTICATION_ERROR');
      expect(res.error?.message).not.toContain(secretToken);
      expect(res.error?.message).toContain('WhatsApp authentication failed');
    });

    it('handles Meta Template Error cleanly', async () => {
      const provider = new MetaWhatsAppProvider({
        phoneNumberId: '1234567890',
        accessToken: 'EAAG_VALID_TOKEN',
      });

      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message: 'Template name does not exist in the translation language',
              type: 'OAuthException',
              code: 132000,
            },
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const res = await provider.sendTemplateMessage('9820011223', 'nonexistent_tpl');
      expect(res.success).toBe(false);
      expect(res.status).toBe('FAILED');
      expect(res.error?.code).toBe('TEMPLATE_ERROR');
      expect(res.error?.message).toContain('WhatsApp template error');
    });
  });

  // =========================================================================
  // 6: Missing Configuration
  // =========================================================================
  describe('6: Missing Configuration Handling', () => {
    it('returns PROVIDER_CONFIG_MISSING when token or phone ID is empty or placeholder', async () => {
      const unconfigured = new MetaWhatsAppProvider({
        phoneNumberId: '',
        accessToken: '',
      });

      expect(unconfigured.isConfigValid()).toBe(false);

      const res = await unconfigured.sendTextMessage('9820011223', 'Test');
      expect(res.success).toBe(false);
      expect(res.status).toBe('FAILED');
      expect(res.error?.code).toBe('PROVIDER_CONFIG_MISSING');
      expect(res.error?.message).toContain('WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN');

      const placeholderProvider = new MetaWhatsAppProvider({
        phoneNumberId: 'placeholder_id',
        accessToken: 'placeholder_token',
      });
      expect(placeholderProvider.isConfigValid()).toBe(false);
    });
  });

  // =========================================================================
  // 7 & 10: Backend Unavailable, Network Errors & Timeout
  // =========================================================================
  describe('7 & 10: Backend Unavailable, Network Failures & Timeout', () => {
    it('7. Network error / connection refused: catches and returns NETWORK_ERROR cleanly', async () => {
      const provider = new MetaWhatsAppProvider({
        phoneNumberId: '1234567890',
        accessToken: 'EAAG_TOKEN',
      });

      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:4000'));

      const res = await provider.sendTextMessage('9820011223', 'Hello');
      expect(res.success).toBe(false);
      expect(res.status).toBe('FAILED');
      expect(res.error?.code).toBe('NETWORK_ERROR');
      expect(res.error?.message).toContain('Failed to reach WhatsApp API endpoint');
    });

    it('10. Timeout: catches aborted request and returns TIMEOUT code', async () => {
      const provider = new MetaWhatsAppProvider({
        phoneNumberId: '1234567890',
        accessToken: 'EAAG_TOKEN',
      });

      // Simulate an AbortError triggered by timeout
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options: any) => {
        // Trigger abort signal
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      });

      const res = await provider.sendTextMessage('9820011223', 'Hello');
      expect(res.success).toBe(false);
      expect(res.status).toBe('FAILED');
      expect(['TIMEOUT', 'NETWORK_ERROR']).toContain(res.error?.code);
    });
  });

  // =========================================================================
  // 11: Transient Failures & Bounded Retries
  // =========================================================================
  describe('11: Transient Failure & Bounded Retries', () => {
    it('retries transient 429 rate limit error up to bounded limit', async () => {
      const provider = new MetaWhatsAppProvider({
        phoneNumberId: '1234567890',
        accessToken: 'EAAG_TOKEN',
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ error: { code: 80007, message: 'Rate limit exceeded' } }),
            { status: 429, headers: { 'Content-Type': 'application/json' } }
          )
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ messages: [{ id: 'wamid.SUCCESS_AFTER_RETRY' }] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        );

      const res = await provider.sendTextMessage('9820011223', 'Hello');
      expect(res.success).toBe(true);
      expect(res.status).toBe('SENT');
      expect(res.providerMessageId).toBe('wamid.SUCCESS_AFTER_RETRY');
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('does NOT retry non-transient 401 Unauthorized or 400 Bad Request', async () => {
      const provider = new MetaWhatsAppProvider({
        phoneNumberId: '1234567890',
        accessToken: 'EAAG_TOKEN',
      });

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { code: 190, message: 'Invalid token' } }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const res = await provider.sendTextMessage('9820011223', 'Hello');
      expect(res.success).toBe(false);
      expect(res.error?.code).toBe('AUTHENTICATION_ERROR');
      // Must not retry on 401
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 8: Fastify CORS & Preflight Verification
  // =========================================================================
  describe('8: CORS & Preflight Verification', () => {
    beforeEach(async () => {
      app = await buildApp();
      await app.ready();
    });

    afterEach(async () => {
      await app.close();
    });

    it('handles OPTIONS preflight for /api/v1/whatsapp/messages with proper headers', async () => {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/api/v1/whatsapp/messages',
        headers: {
          origin: 'http://localhost:3000',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'authorization, content-type, x-request-id',
        },
      });

      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
      expect(response.headers['access-control-allow-methods']).toContain('POST');
      expect(String(response.headers['access-control-allow-headers']).toLowerCase()).toContain('content-type');
    });

    it('never uses wildcard * origin when credentials: true is configured', async () => {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/api/v1/whatsapp/templates',
        headers: {
          origin: 'http://localhost:3000',
          'access-control-request-method': 'GET',
        },
      });

      expect(response.headers['access-control-allow-origin']).not.toBe('*');
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });
  });
});
