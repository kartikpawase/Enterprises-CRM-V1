import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ServiceTable } from './ServiceTable';
import { ToastProvider } from '../../../providers/ToastProvider';
import { GOOGLE_REVIEW_URL, GOOGLE_REVIEW_DEFAULT_MESSAGE } from '../../../lib/whatsapp';
import type { ServiceItem } from '../services.api';

// Default mock auth as Super Admin
let mockAuthRole = 'Super Admin';
let mockHasPermission = true;

vi.mock('../../../providers/AuthBoundary', () => ({
  useAuth: () => ({
    user: {
      id: 'admin-1',
      username: 'admin',
      displayName: 'Admin User',
      role: mockAuthRole,
    },
    isAuthenticated: true,
    hasRole: (...roles: string[]) => roles.includes(mockAuthRole),
    hasPermission: () => mockHasPermission,
  }),
}));

vi.mock('../services.api', () => ({
  useNotifyServiceTechnicianWhatsAppMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useNotifyServiceCustomerWhatsAppMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useDeleteServiceMutation: () => ({
    mutateAsync: vi.fn(),
  }),
}));

const baseMockService: ServiceItem = {
  id: 'srv-001',
  serviceNumber: 'SRV-2026-0001',
  serviceType: 'PERIODIC_MAINTENANCE',
  serviceLocation: 'DOORSTEP',
  serviceClassification: 'GENERAL',
  scheduledDate: '2026-08-18T10:00:00Z',
  scheduledTimeSlot: '10:00 AM - 12:00 PM',
  status: 'SCHEDULED',
  priority: 'NORMAL',
  customerNotes: null,
  internalNotes: null,
  completedAt: null,
  createdAt: '2026-08-15T10:00:00Z',
  customerId: 'cust-101',
  customerName: 'Rahul Sharma',
  customerPhone: '9820011223',
  customerNumber: 'CUST-101',
  assetId: 'ast-101',
  assetNumber: 'AST-101',
  serialNumber: 'SN-998877',
  productName: 'AquaPure Pro RO',
  productBrand: 'AquaPure',
  productSku: 'AP-RO',
  technicianId: 'tech-101',
  technicianName: 'Suresh Verma',
  technicianPhone: '9820099999',
  warrantyId: null,
  warrantyStatus: null,
  warrantyEndDate: null,
  jobCardId: null,
  jobCardNumber: null,
  jobCardStatus: null,
};

describe('ServiceTable — WhatsApp Google Review Action', () => {
  beforeEach(() => {
    vi.stubGlobal('open', vi.fn());
    mockAuthRole = 'Super Admin';
    mockHasPermission = true;
  });

  const renderTable = (services: ServiceItem[]) => {
    return render(
      <ToastProvider>
        <BrowserRouter>
          <ServiceTable
            services={services}
            isLoading={false}
            pagination={{ page: 1, limit: 10, total: services.length, totalPages: 1 }}
            onPageChange={vi.fn()}
            onOpenCompleteModal={vi.fn()}
            onOpenQuickAssign={vi.fn()}
            onOpenEditModal={vi.fn()}
          />
        </BrowserRouter>
      </ToastProvider>
    );
  };

  it('does NOT render "Request Google Review" action for SCHEDULED services', () => {
    const scheduledService: ServiceItem = {
      ...baseMockService,
      status: 'SCHEDULED',
    };

    renderTable([scheduledService]);

    expect(screen.queryByText('Request Google Review')).not.toBeInTheDocument();
    // Complete button should be present for non-completed service
    expect(screen.getByRole('button', { name: /Complete/i })).toBeInTheDocument();
  });

  it('does NOT render "Request Google Review" action for IN_PROGRESS or ON_HOLD or CANCELLED services', () => {
    const inProgressService: ServiceItem = {
      ...baseMockService,
      id: 'srv-in-progress',
      status: 'IN_PROGRESS',
    };
    const onHoldService: ServiceItem = {
      ...baseMockService,
      id: 'srv-on-hold',
      status: 'ON_HOLD',
    };
    const cancelledService: ServiceItem = {
      ...baseMockService,
      id: 'srv-cancelled',
      status: 'CANCELLED',
    };

    const { rerender } = renderTable([inProgressService]);
    expect(screen.queryByText('Request Google Review')).not.toBeInTheDocument();

    rerender(
      <ToastProvider>
        <BrowserRouter>
          <ServiceTable
            services={[onHoldService]}
            isLoading={false}
            pagination={{ page: 1, limit: 10, total: 1, totalPages: 1 }}
            onPageChange={vi.fn()}
            onOpenCompleteModal={vi.fn()}
            onOpenQuickAssign={vi.fn()}
            onOpenEditModal={vi.fn()}
          />
        </BrowserRouter>
      </ToastProvider>
    );
    expect(screen.queryByText('Request Google Review')).not.toBeInTheDocument();

    rerender(
      <ToastProvider>
        <BrowserRouter>
          <ServiceTable
            services={[cancelledService]}
            isLoading={false}
            pagination={{ page: 1, limit: 10, total: 1, totalPages: 1 }}
            onPageChange={vi.fn()}
            onOpenCompleteModal={vi.fn()}
            onOpenQuickAssign={vi.fn()}
            onOpenEditModal={vi.fn()}
          />
        </BrowserRouter>
      </ToastProvider>
    );
    expect(screen.queryByText('Request Google Review')).not.toBeInTheDocument();
  });

  it('renders "Request Google Review" action only when service status is COMPLETED', () => {
    const completedService: ServiceItem = {
      ...baseMockService,
      status: 'COMPLETED',
      completedAt: '2026-08-18T12:00:00Z',
    };

    renderTable([completedService]);

    const reviewButton = screen.getByRole('button', { name: /Request Google Review/i });
    expect(reviewButton).toBeInTheDocument();
    // Complete button should be hidden for completed service
    expect(screen.queryByRole('button', { name: /^Complete$/i })).not.toBeInTheDocument();
  });

  it('opens WhatsApp Web/app in a new tab with prefilled Google Review URL when clicked', () => {
    const completedService: ServiceItem = {
      ...baseMockService,
      status: 'COMPLETED',
      customerPhone: '9820011223',
    };

    renderTable([completedService]);

    const reviewButton = screen.getByRole('button', { name: /Request Google Review/i });
    fireEvent.click(reviewButton);

    expect(window.open).toHaveBeenCalledTimes(1);
    const openedUrl = (window.open as any).mock.calls[0][0];
    expect(openedUrl).toContain('https://wa.me/919820011223?text=');

    const decoded = decodeURIComponent(openedUrl);
    expect(decoded).toContain(GOOGLE_REVIEW_URL);
    expect(decoded).toContain(GOOGLE_REVIEW_DEFAULT_MESSAGE);
    expect((window.open as any).mock.calls[0][1]).toBe('_blank');
    expect((window.open as any).mock.calls[0][2]).toBe('noopener,noreferrer');
  });

  it('displays a validation message and does not open WhatsApp when customer phone is missing', () => {
    const completedServiceNoPhone: ServiceItem = {
      ...baseMockService,
      status: 'COMPLETED',
      customerPhone: '',
    };

    renderTable([completedServiceNoPhone]);

    const reviewButton = screen.getByRole('button', { name: /Request Google Review/i });
    fireEvent.click(reviewButton);

    expect(window.open).not.toHaveBeenCalled();
    expect(screen.getByText(/Customer phone number is missing or invalid/i)).toBeInTheDocument();
  });

  it('displays a validation message and does not open WhatsApp when customer phone is invalid (< 10 digits)', () => {
    const completedServiceInvalidPhone: ServiceItem = {
      ...baseMockService,
      status: 'COMPLETED',
      customerPhone: '12345',
    };

    renderTable([completedServiceInvalidPhone]);

    const reviewButton = screen.getByRole('button', { name: /Request Google Review/i });
    fireEvent.click(reviewButton);

    expect(window.open).not.toHaveBeenCalled();
    expect(screen.getByText(/Customer phone number is missing or invalid/i)).toBeInTheDocument();
  });

  it('does NOT render "Request Google Review" when an unauthorized technician views the table', () => {
    mockAuthRole = 'Technician';
    mockHasPermission = false;

    const completedService: ServiceItem = {
      ...baseMockService,
      status: 'COMPLETED',
    };

    renderTable([completedService]);

    expect(screen.queryByText('Request Google Review')).not.toBeInTheDocument();
  });

  it('keeps existing row actions (Details, Edit, Delete) intact and accessible', () => {
    const onOpenEditModal = vi.fn();
    const completedService: ServiceItem = {
      ...baseMockService,
      status: 'COMPLETED',
    };

    render(
      <ToastProvider>
        <BrowserRouter>
          <ServiceTable
            services={[completedService]}
            isLoading={false}
            pagination={{ page: 1, limit: 10, total: 1, totalPages: 1 }}
            onPageChange={vi.fn()}
            onOpenCompleteModal={vi.fn()}
            onOpenQuickAssign={vi.fn()}
            onOpenEditModal={onOpenEditModal}
          />
        </BrowserRouter>
      </ToastProvider>
    );

    expect(screen.getByRole('button', { name: /^Details$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Edit$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete service/i })).toBeInTheDocument();
  });
});
