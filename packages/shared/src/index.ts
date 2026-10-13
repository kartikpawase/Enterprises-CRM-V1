/**
 * SR Enterprises CRM - Shared Constants & System Configurations
 */

export const API_PREFIX = '/api/v1';

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export const HTTP_HEADERS = {
  REQUEST_ID: 'x-request-id',
  CORRELATION_ID: 'x-correlation-id',
  CONTENT_TYPE: 'content-type',
  AUTHORIZATION: 'authorization',
} as const;

export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  BAD_REQUEST: 'BAD_REQUEST',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INVALID_CAPTCHA: 'INVALID_CAPTCHA',
} as const;

export const RATE_LIMITS = {
  DEFAULT_MAX_REQUESTS: 100,
  DEFAULT_TIME_WINDOW_MS: 60 * 1000,
  AUTH_MAX_REQUESTS: 10,
  AUTH_TIME_WINDOW_MS: 60 * 1000,
} as const;

export interface NavigationItem {
  id?: string;
  key: string;
  label: string;
  path: string;
  icon: string;
}

export const NAVIGATION_ITEMS: NavigationItem[] = [
  { key: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: 'LayoutDashboard' },
  { key: 'dues', label: 'Dues', path: '/dues', icon: 'CalendarClock' },
  { key: 'customers', label: 'Customers', path: '/customers', icon: 'UsersRound' },
  { key: 'sales', label: 'Sales', path: '/sales', icon: 'BarChart3' },
  { key: 'rent', label: 'Rent', path: '/rent', icon: 'Repeat' },
  { key: 'invoices', label: 'Invoices', path: '/invoices', icon: 'FileText' },
  { key: 'services', label: 'Services', path: '/services', icon: 'Wrench' },
  { key: 'inventory', label: 'Inventory', path: '/inventory', icon: 'PackageSearch' },
  { key: 'technicians', label: 'Technicians', path: '/technicians', icon: 'UserCog' },
  { key: 'payments', label: 'Payments', path: '/payments', icon: 'WalletCards' },
  { key: 'expenses', label: 'Expenses', path: '/expenses', icon: 'Receipt' },
  { key: 'reports', label: 'Reports', path: '/reports', icon: 'PieChart' },
  { key: 'tasks', label: 'Tasks', path: '/tasks', icon: 'ClipboardCheck' },
  { key: 'settings', label: 'Settings', path: '/settings', icon: 'Settings' },
];

export * from './technician-portal';

