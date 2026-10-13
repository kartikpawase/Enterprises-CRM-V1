import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ServiceDetailPage } from './ServiceDetailPage';
import { ToastProvider } from '../../providers/ToastProvider';
import { GOOGLE_REVIEW_URL, GOOGLE_REVIEW_DEFAULT_MESSAGE } from '../../lib/whatsapp';
import type { ServiceDetail } from './services.api';

let mockAuthRole = 'Super Admin';
let mockHasPermission = true;

vi.mock('../../providers/AuthBoundary', () => ({
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

let mockServiceData: ServiceDetail | null = null;

vi.mock('./services.api', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    useServiceDetailQuery: () => ({
      data: mockServiceData,
      isLoading: false,
      error: null,
    }),
    useNotifyServiceTechnicianWhatsAppMutation: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }),
    useNotifyServiceCustomerWhatsAppMutation: () => ({
      mutateAsync: vi.fn(),
      isPending: false,
    }),
    useTechniciansQuery: () => ({
      data: [{ id: 'tech-1', name: 'Suresh Verma' }],
      isLoading: false,
    }),
  };
});

const baseMockDetail: ServiceDetail = {
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
  updatedAt: '2026-08-15T10:00:00Z',
  cancelledAt: null,
  cancelReason: null,
  customerId: 'cust-101',
  customerName: 'Rahul Sharma',
  customerPhone: '9820011223',
  customerEmail: 'rahul@example.com',
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
  warrantyType: null,
  warrantyStartDate: null,
  jobCardId: null,
  jobCardNumber: null,
  jobCardStatus: null,
  problemReported: null,
  diagnosis: null,
  workPerformed: null,
  partsReplaced: null,
  technicianNotes: null,
  customerRemarks: null,
  laborCharges: '0',
  partsCharges: '0',
  totalCharges: '0',
  jobCardCompletedAt: null,
};

describe('ServiceDetailPage — WhatsApp Google Review Action', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.stubGlobal('open', vi.fn());
    mockAuthRole = 'Super Admin';
    mockHasPermission = true;
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  const renderPage = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<ServiceDetailPage />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    );
  };

  it('does NOT render "Request Google Review" when service status is SCHEDULED', () => {
    mockServiceData = {
      ...baseMockDetail,
      status: 'SCHEDULED',
    };

    renderPage();

    expect(screen.queryByRole('button', { name: /Request Google Review/i })).not.toBeInTheDocument();
    // Complete Service button should be present
    expect(screen.getByRole('button', { name: /Complete Service/i })).toBeInTheDocument();
  });

  it('renders "Request Google Review" CTA button when service status is COMPLETED', () => {
    mockServiceData = {
      ...baseMockDetail,
      status: 'COMPLETED',
      completedAt: '2026-08-18T12:00:00Z',
    };

    renderPage();

    expect(screen.getByRole('button', { name: /Request Google Review/i })).toBeInTheDocument();
    // Complete Service button should be hidden
    expect(screen.queryByRole('button', { name: /Complete Service/i })).not.toBeInTheDocument();
  });

  it('opens WhatsApp with prefilled Google Review message when clicked', () => {
    mockServiceData = {
      ...baseMockDetail,
      status: 'COMPLETED',
      customerPhone: '9820011223',
    };

    renderPage();

    const reviewBtn = screen.getByRole('button', { name: /Request Google Review/i });
    fireEvent.click(reviewBtn);

    expect(window.open).toHaveBeenCalledTimes(1);
    const openedUrl = (window.open as any).mock.calls[0][0];
    expect(openedUrl).toContain('https://wa.me/919820011223?text=');

    const decoded = decodeURIComponent(openedUrl);
    expect(decoded).toContain(GOOGLE_REVIEW_URL);
    expect(decoded).toContain(GOOGLE_REVIEW_DEFAULT_MESSAGE);
  });

  it('displays validation toast error and prevents window.open when customer phone is invalid', () => {
    mockServiceData = {
      ...baseMockDetail,
      status: 'COMPLETED',
      customerPhone: '123',
    };

    renderPage();

    const reviewBtn = screen.getByRole('button', { name: /Request Google Review/i });
    fireEvent.click(reviewBtn);

    expect(window.open).not.toHaveBeenCalled();
    expect(screen.getByText(/Customer phone number is missing or invalid/i)).toBeInTheDocument();
  });

  it('does NOT render "Request Google Review" button for unauthorized technician', () => {
    mockAuthRole = 'Technician';
    mockHasPermission = false;
    mockServiceData = {
      ...baseMockDetail,
      status: 'COMPLETED',
    };

    renderPage();

    expect(screen.queryByRole('button', { name: /Request Google Review/i })).not.toBeInTheDocument();
  });
});
