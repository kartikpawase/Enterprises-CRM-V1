import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveApiUrl, apiRequest, ApiClientError } from './api-client';

describe('API Client & Base URL Resolution (Step 2, 3, 9)', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    // Restore window.location if modified
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });
  });

  it('9. Production API URL: reuses relative same-origin API on remote production host if localhost baseUrl is baked in', () => {
    // Simulate running in production browser on remote hostname
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        hostname: 'crm.srenterprises.com',
        origin: 'https://crm.srenterprises.com',
        protocol: 'https:',
      },
    });

    const url = resolveApiUrl('/job-cards/123/notify-technician');
    // On remote host, resolveApiUrl should not use localhost:4000 to avoid "Failed to fetch"
    expect(url).not.toContain('localhost:4000');
    expect(url).toBe('/api/v1/job-cards/123/notify-technician');
  });

  it('preserves full https:// external URLs as-is', () => {
    const fullUrl = 'https://api.external.com/v1/resource';
    expect(resolveApiUrl(fullUrl)).toBe(fullUrl);
  });

  it('catches browser "Failed to fetch" TypeError and returns descriptive diagnostic ApiClientError', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    try {
      await apiRequest('/whatsapp/messages', { method: 'POST', body: JSON.stringify({ phone: '9820011223' }) });
      expect.fail('Should have thrown an ApiClientError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiClientError);
      expect(err.code).toBe('NETWORK_ERROR');
      expect(err.message).toContain('Unable to reach CRM API server');
      expect(err.details?.originalError).toBe('Failed to fetch');
    }
  });

  it('throws ApiClientError with code TIMEOUT on request abort', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, opts: any) => {
      // Simulate timeout abort
      opts?.signal?.dispatchEvent(new Event('abort'));
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    });

    try {
      await apiRequest('/whatsapp/messages', { method: 'GET' });
      expect.fail('Should have thrown an ApiClientError');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiClientError);
      expect(err.code).toBe('TIMEOUT');
      expect(err.message).toContain('Request timed out after 30 seconds');
    }
  });
});
