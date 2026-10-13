import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GlobalSidebar } from './GlobalSidebar';
import { useUIStore } from '../../stores/ui-store';

const mockLogout = vi.fn();
let mockPermissions = [
  'customers.view',
  'sales.view',
  'rentals.view',
  'invoices.view',
  'services.view',
  'payments.view',
  'expenses.view',
  'reports.view',
  'tasks.view',
  'settings.manage',
];

vi.mock('../../providers/AuthBoundary', () => ({
  useAuth: () => ({
    hasPermission: (perm: string) => mockPermissions.includes(perm),
    user: {
      id: 'admin-1',
      username: 'admin',
      displayName: 'Shailendra Rajput (Admin)',
      role: 'Super Admin',
    },
    logout: mockLogout,
  }),
}));

describe('Master GlobalSidebar Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPermissions = [
      'customers.view',
      'sales.view',
      'rentals.view',
      'invoices.view',
      'services.view',
      'payments.view',
      'expenses.view',
      'reports.view',
      'tasks.view',
      'settings.manage',
    ];
    useUIStore.getState().expandSidebar();
  });

  it('renders branding hierarchy: Logo, ENTERPRISES, and CRM in expanded state', () => {
    render(<GlobalSidebar activePath="/dashboard" />);

    expect(screen.getByText('ENTERPRISES')).toBeDefined();
    expect(screen.getByText('CRM')).toBeDefined();
    expect(screen.getByRole('complementary', { name: /master global navigation sidebar/i })).toBeDefined();
  });

  it('renders all authoritative navigation items and bottom Logout in expanded state', () => {
    render(<GlobalSidebar activePath="/dashboard" />);

    const expectedItems = [
      'Dashboard',
      'Dues',
      'Customers',
      'Sales',
      'Rent',
      'Invoices',
      'Services',
      'Inventory',
      'Technicians',
      'Payments',
      'Expenses',
      'Reports',
      'Tasks',
      'Settings',
    ];

    expectedItems.forEach((label) => {
      expect(screen.getByRole('button', { name: new RegExp(`^${label}$`, 'i') })).toBeDefined();
    });

    expect(screen.getByRole('button', { name: /^logout$/i })).toBeDefined();
  });

  it('highlights the active item with strong red background and white text', () => {
    render(<GlobalSidebar activePath="/customers" />);

    const customersBtn = screen.getByRole('button', { name: /^customers$/i });
    expect(customersBtn.className).toContain('bg-[#C1121F]');
    expect(customersBtn.getAttribute('aria-current')).toBe('page');

    const salesBtn = screen.getByRole('button', { name: /^sales$/i });
    expect(salesBtn.className).not.toContain('bg-[#C1121F]');
    expect(salesBtn.getAttribute('aria-current')).toBeNull();
  });

  it('correctly activates parent navigation for nested routes', () => {
    render(<GlobalSidebar activePath="/customers/cust-12345" />);

    const customersBtn = screen.getByRole('button', { name: /^customers$/i });
    expect(customersBtn.className).toContain('bg-[#C1121F]');
  });

  it('triggers onNavigate and expands sidebar manually on item click', async () => {
    const handleNavigate = vi.fn();
    useUIStore.getState().collapseSidebar();

    render(<GlobalSidebar activePath="/dashboard" onNavigate={handleNavigate} />);

    const salesBtn = screen.getByRole('button', { name: /^sales$/i });
    fireEvent.click(salesBtn);

    expect(handleNavigate).toHaveBeenCalledWith('/sales');
    expect(useUIStore.getState().sidebarState).toBe('manuallyExpanded');
  });

  it('smoothly expands on mouseEnter when collapsed and collapses on mouseLeave', () => {
    useUIStore.getState().collapseSidebar();
    render(<GlobalSidebar activePath="/dashboard" />);

    const sidebar = screen.getByRole('complementary', { name: /master global navigation sidebar/i });

    // Initial collapsed width
    expect(sidebar.className).toContain('w-[68px]');

    // Hover enters sidebar
    fireEvent.mouseEnter(sidebar);
    expect(useUIStore.getState().sidebarState).toBe('hoverExpanded');
    expect(sidebar.className).toContain('w-[136px]');

    // Pointer leaves sidebar
    fireEvent.mouseLeave(sidebar);
    expect(useUIStore.getState().sidebarState).toBe('collapsed');
    expect(sidebar.className).toContain('w-[68px]');
  });

  it('filters navigation items based on user permissions', () => {
    // Revoke reports.view and payments.view permissions
    mockPermissions = ['customers.view', 'sales.view', 'invoices.view'];

    render(<GlobalSidebar activePath="/dashboard" />);

    expect(screen.queryByRole('button', { name: /^reports$/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^payments$/i })).toBeNull();
    expect(screen.getByRole('button', { name: /^customers$/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /^sales$/i })).toBeDefined();
  });

  it('calls logout and resets sidebar state on logout click', async () => {
    render(<GlobalSidebar activePath="/dashboard" />);

    const logoutBtn = screen.getByRole('button', { name: /^logout$/i });
    await userEvent.click(logoutBtn);

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(useUIStore.getState().sidebarState).toBe('expanded');
  });
});
