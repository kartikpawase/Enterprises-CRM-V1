import type { ApiErrorResponse } from '@crm/types';
import { API_PREFIX, HTTP_HEADERS } from '@crm/shared';

export class ApiClientError extends Error {
  public code: string;
  public requestId: string;
  public details?: unknown;
  public status?: number;

  constructor(errorResponse: ApiErrorResponse['error'], status?: number) {
    super(errorResponse.message);
    this.name = 'ApiClientError';
    this.code = errorResponse.code;
    this.requestId = errorResponse.requestId;
    this.details = errorResponse.details;
    this.status = status;
  }
}

export interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
}

/**
 * Resolves the backend base URL from environment variables
 * Configured in Vercel as VITE_API_URL (e.g., https://api.srenterprises.com)
 */
export function getApiBaseUrl(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const envBase = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL;
    if (envBase && typeof envBase === 'string' && envBase.trim() !== '') {
      return envBase.trim().replace(/\/+$/, '');
    }
  }
  return '';
}

/**
 * Resolves any API endpoint against configured base URL and API prefix
 */
export function resolveApiUrl(endpoint: string): string {
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    return endpoint;
  }

  const cleanEndpoint = endpoint.startsWith(API_PREFIX)
    ? endpoint
    : `${API_PREFIX}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const baseUrl = getApiBaseUrl();

  // Handle browser environment resilience:
  if (typeof window !== 'undefined' && window.location) {
    const isBrowserOnRemoteHost =
      Boolean(window.location.hostname) &&
      window.location.hostname !== 'localhost' &&
      window.location.hostname !== '127.0.0.1';

    const isBaseUrlLocalhost =
      baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1');

    // If client is running in a remote production/preview browser, ignore baked-in localhost baseUrl
    // and reuse same-origin relative API path to prevent browser "Failed to fetch" / mixed content errors.
    if (isBrowserOnRemoteHost && isBaseUrlLocalhost) {
      return cleanEndpoint;
    }

    // Upgrade http to https if browsing over secure connection to prevent mixed-content blockage
    if (window.location.protocol === 'https:' && baseUrl.startsWith('http://')) {
      if (isBaseUrlLocalhost) {
        return cleanEndpoint;
      }
      return `${baseUrl.replace(/^http:\/\//i, 'https://')}${cleanEndpoint.startsWith('/') ? '' : '/'}${cleanEndpoint}`;
    }
  }

  if (baseUrl) {
    return `${baseUrl}${cleanEndpoint.startsWith('/') ? '' : '/'}${cleanEndpoint}`;
  }

  if (typeof window !== 'undefined' && (!window.location?.origin || window.location.origin === 'null')) {
    return `http://localhost:4000${cleanEndpoint.startsWith('/') ? '' : '/'}${cleanEndpoint}`;
  }

  return cleanEndpoint;
}

/**
 * Safely generates a unique request ID compatible with all browser environments
 */
export function generateRequestId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {}

  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  } catch {}

  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Standard typed HTTP client for SR Enterprises CRM
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { params, headers, ...customConfig } = options;

  let url = resolveApiUrl(endpoint);

  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        searchParams.append(key, String(value));
      }
    });
    const queryString = searchParams.toString();
    if (queryString) {
      url += (url.includes('?') ? '&' : '?') + queryString;
    }
  }

  const defaultHeaders: Record<string, string> = {
    Accept: 'application/json',
    [HTTP_HEADERS.REQUEST_ID]: generateRequestId(),
  };

  try {
    if (typeof localStorage !== 'undefined') {
      const token = localStorage.getItem('crm_session_token');
      if (token) {
        defaultHeaders['Authorization'] = `Bearer ${token}`;
      }
    }
  } catch {}

  if (customConfig.body) {
    defaultHeaders['Content-Type'] = 'application/json';
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error('Request timeout after 30 seconds')), 30000);
  if (customConfig.signal) {
    customConfig.signal.addEventListener('abort', () => controller.abort(customConfig.signal?.reason));
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        ...defaultHeaders,
        ...headers,
      },
      credentials: 'include', // Send secure HTTP-only cookies
      ...customConfig,
      signal: controller.signal,
    });
  } catch (networkErr: any) {
    clearTimeout(timeoutId);
    if (controller.signal.aborted || networkErr?.name === 'AbortError' || networkErr?.name === 'TimeoutError') {
      throw new ApiClientError({
        code: 'TIMEOUT',
        message: 'Request timed out after 30 seconds. The server may be busy or unreachable.',
        requestId: defaultHeaders[HTTP_HEADERS.REQUEST_ID],
      });
    }

    const isFailedToFetch =
      networkErr?.name === 'TypeError' &&
      (networkErr?.message?.includes('fetch') || networkErr?.message === 'Failed to fetch');

    const diagnosticMessage = isFailedToFetch
      ? `Unable to reach CRM API server (${url}). Please verify network connection, backend availability, or CORS.`
      : (networkErr?.message || 'Network request failed');

    throw new ApiClientError({
      code: 'NETWORK_ERROR',
      message: diagnosticMessage,
      requestId: defaultHeaders[HTTP_HEADERS.REQUEST_ID],
      details: {
        originalError: networkErr?.message,
        url,
      },
    });
  } finally {
    clearTimeout(timeoutId);
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    if (
      response.status === 401 &&
      !url.includes('/auth/login') &&
      !url.includes('/auth/captcha') &&
      !url.includes('/public/') &&
      !url.includes('/technician-auth') &&
      !url.includes('/technician/')
    ) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:unauthorized', {
          detail: { message: data?.error?.message || 'Authentication required' },
        }));
      }
    }

    if (data && typeof data === 'object') {
      if ('error' in data && data.error) {
        const errorObj = typeof data.error === 'object' ? data.error : { message: String(data.error) };
        throw new ApiClientError(errorObj, response.status);
      }
      if ('message' in data && typeof data.message === 'string' && data.message.trim() !== '') {
        throw new ApiClientError({
          code: 'HTTP_ERROR',
          message: data.message,
          requestId: response.headers.get(HTTP_HEADERS.REQUEST_ID) || 'unknown',
        }, response.status);
      }
    }
    throw new ApiClientError({
      code: response.status === 401 ? 'UNAUTHORIZED' : (response.status === 403 ? 'FORBIDDEN' : 'HTTP_ERROR'),
      message: response.statusText || 'An unexpected error occurred',
      requestId: response.headers.get(HTTP_HEADERS.REQUEST_ID) || 'unknown',
    }, response.status);
  }

  // If response follows ApiSuccessResponse envelope
  if (data && typeof data === 'object' && 'success' in data && data.success === true) {
    return data as T;
  }

  return data as T;
}

/**
 * Convenient REST methods on apiClient
 */
export const apiClient = {
  get: <T>(endpoint: string, options?: RequestOptions) =>
    apiRequest<{ success: boolean; data: T }>(endpoint, { ...options, method: 'GET' }),

  post: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<{ success: boolean; data: T }>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<{ success: boolean; data: T }>(endpoint, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T>(endpoint: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<{ success: boolean; data: T }>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(endpoint: string, options?: RequestOptions) =>
    apiRequest<{ success: boolean; data: T }>(endpoint, { ...options, method: 'DELETE' }),
};
