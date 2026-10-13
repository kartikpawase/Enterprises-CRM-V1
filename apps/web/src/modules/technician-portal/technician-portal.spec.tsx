import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { TechnicianPortalRouter } from './routes';
import { TechnicianLoginPage } from './pages/TechnicianLoginPage';
import { TechnicianDashboardPage } from './pages/TechnicianDashboardPage';
import { TechnicianServicesPage } from './pages/TechnicianServicesPage';
import { TechnicianServiceDetailPage } from './pages/TechnicianServiceDetailPage';
import { TechnicianCompletedServicesPage } from './pages/TechnicianCompletedServicesPage';
import { TechnicianProfilePage } from './pages/TechnicianProfilePage';
import { TechnicianNotificationsPage } from './pages/TechnicianNotificationsPage';
import { TechnicianPortalLayout } from './layouts/TechnicianPortalLayout';
import { apiClient } from '@/lib/api-client';
import {
  TECHNICIAN_PORTAL_ROUTE_PREFIX,
  TECHNICIAN_AUTH_ROUTE,
  TECHNICIAN_SERVICES_ROUTE,
  TECHNICIAN_COMPLETED_ROUTE,
  TECHNICIAN_PROFILE_ROUTE,
  TECHNICIAN_NOTIFICATIONS_ROUTE,
} from '@crm/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

// Mock apiClient to control session verification
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
  getApiBaseUrl: vi.fn(() => 'http://localhost:3000'),
}));

describe('Technician Portal Phase 2: Authentication & Portal Shell Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Default authenticated session and services for protected page route tests
    vi.mocked(apiClient.get).mockImplementation((url: string) => {
      if (url.includes('/services/srv-101') || url.includes('/services/SRV-2026-0001')) {
        return Promise.resolve({
          success: true,
          data: {
            id: 'srv-101',
            serviceNumber: 'SRV-2026-0001',
            serviceType: 'PERIODIC_MAINTENANCE',
            serviceClassification: 'WARRANTY',
            priority: 'HIGH',
            status: 'ASSIGNED',
            scheduledDate: new Date().toISOString(),
            scheduledTimeSlot: '10:00 AM - 12:00 PM',
            customerNotes: 'Inspect booster pump vibration.',
            createdAt: new Date().toISOString(),
            jobCardId: 'jc-101',
            jobCardNumber: 'JC-2026-0001',
            jobCardStatus: 'ASSIGNED',
            problemReported: 'Abnormal vibration under high pressure load',
            customer: {
              id: 'cust-1',
              customerNumber: 'CUST-2026-0001',
              fullName: 'Apex Industrial Solutions',
              phone: '9876543210',
              email: 'contact@apexindustrial.com',
            },
            location: {
              addressLine1: 'Plot 42, MIDC Industrial Area',
              addressLine2: 'Phase II',
              landmark: 'Near Water Tower',
              city: 'Pune',
              state: 'Maharashtra',
              pincode: '411019',
            },
            asset: {
              id: 'asset-1',
              assetNumber: 'ASSET-2026-0001',
              name: 'Commercial High-Pressure Booster Pump',
              brand: 'SR Enterprises',
              model: 'HP-500-PRO',
              serialNumber: 'SN-PUMP-2026-X1',
              purchaseDate: new Date('2025-06-15').toISOString(),
            },
            relevantHistory: [
              {
                serviceId: 'hist-1',
                serviceNumber: 'SRV-2025-0899',
                serviceType: 'INSTALLATION',
                completedAt: new Date('2025-06-15').toISOString(),
                problemReported: 'Commissioning',
                diagnosis: 'Baseline set',
                workPerformed: 'Completed installation',
              },
            ],
          },
        } as any);
      }

      if (url.includes('/services')) {
        return Promise.resolve({
          success: true,
          data: [
            {
              serviceId: 'srv-101',
              id: 'srv-101',
              serviceNumber: 'SRV-2026-0001',
              serviceType: 'PERIODIC_MAINTENANCE',
              serviceClassification: 'WARRANTY',
              scheduledDate: new Date().toISOString(),
              scheduledTimeSlot: '10:00 AM - 12:00 PM',
              priority: 'HIGH',
              status: 'ASSIGNED',
              customerName: 'Apex Industrial Solutions',
              customerPhone: '9876543210',
              serviceAddress: 'Plot 42, MIDC Industrial Area',
              city: 'Pune',
              productName: 'Commercial High-Pressure Booster Pump',
              serialNumber: 'SN-PUMP-2026-X1',
            },
            {
              serviceId: 'srv-102',
              id: 'srv-102',
              serviceNumber: 'SRV-2026-0002',
              serviceType: 'REPAIR',
              serviceClassification: 'GENERAL',
              scheduledDate: new Date(Date.now() + 86400000 * 2).toISOString(),
              scheduledTimeSlot: '02:00 PM - 04:00 PM',
              priority: 'URGENT',
              status: 'SCHEDULED',
              customerName: 'Metro Logistics Center',
              customerPhone: '9876543212',
              serviceAddress: 'Gate 3, Warehouse Complex',
              city: 'Pune',
              productName: 'Industrial Filtration System',
            },
          ],
        } as any);
      }

      if (url.includes('/me')) {
        return Promise.resolve({
          success: true,
          data: {
            authenticated: true,
            technician: {
              id: 'tech-uuid-001',
              technicianId: 'TECH-004',
              fullName: 'Rahul Patil',
              name: 'Rahul Patil',
              phone: '9876543210',
              email: 'rahul.patil@srenterprises.com',
              role: 'Technician',
              portalEnabled: true,
              portalAccess: 'ENABLED',
              status: 'ACTIVE',
              availability: 'AVAILABLE',
              skills: ['Industrial Equipment Overhaul', 'High-Pressure Booster Pumps'],
            },
            workSummary: {
              assigned: 10,
              inProgress: 2,
              completed: 6,
              upcoming: 4,
              completionRate: 33,
            },
          },
        } as any);
      }
      return Promise.reject(new Error('Not found'));
    });
  });

  describe('Page Shells Rendering', () => {
    it('renders /technician/login with mobile number, name inputs and OTP trigger', () => {
      render(
        <MemoryRouter>
          <TechnicianLoginPage />
        </MemoryRouter>
      );

      expect(screen.getByText('Technician Portal')).toBeInTheDocument();
      expect(screen.getByText('Technician Login')).toBeInTheDocument();
      expect(screen.getByLabelText(/Registered Mobile Number/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Registered Full Name/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Send Verification Code/i })).toBeInTheDocument();
      expect(screen.getByText(/receive a verification OTP on your registered email/i)).toBeInTheDocument();
    });

    it('renders /technician (My Work) shell with KPI metrics and Current Job card', async () => {
      localStorage.setItem('technician_current_job_id', 'srv-101');
      localStorage.setItem(
        'technician_current_job_data',
        JSON.stringify({
          serviceId: 'srv-101',
          serviceNumber: 'SRV-2026-0001',
          customerName: 'Apex Industrial Solutions',
          serviceType: 'Periodic Preventive Maintenance',
          status: 'ASSIGNED',
          serviceAddress: 'Plot 42, MIDC Industrial Area',
        })
      );
      render(
        <MemoryRouter>
          <TechnicianDashboardPage />
        </MemoryRouter>
      );

      expect(screen.getByRole('heading', { name: /My Work/i })).toBeInTheDocument();
      expect(screen.getByText("Today's Schedule")).toBeInTheDocument();
      expect(screen.getAllByText('Current Job').length).toBeGreaterThanOrEqual(1);
      expect(await screen.findByText('SRV-2026-0001')).toBeInTheDocument();
      expect(screen.getAllByText('Apex Industrial Solutions').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/Open Job Card/i)).toBeInTheDocument();
      expect(screen.getByText(/Ongoing Assignment/i)).toBeInTheDocument();
      expect(screen.queryByText(/View In Assigned Queue/i)).not.toBeInTheDocument();
    });

    it('renders /technician/services with filter tabs, live assigned service cards, and VIEW SERVICE link', async () => {
      render(
        <MemoryRouter>
          <TechnicianServicesPage />
        </MemoryRouter>
      );

      expect(screen.getByRole('heading', { name: /Assigned Services/i })).toBeInTheDocument();
      expect(screen.getByText('All Work')).toBeInTheDocument();
      expect(screen.getByText("Today's Services")).toBeInTheDocument();
      expect(screen.getByText('Upcoming')).toBeInTheDocument();
      expect(screen.getByText('In Progress')).toBeInTheDocument();
      expect(screen.getByText('On Hold')).toBeInTheDocument();
      expect(await screen.findByText('Apex Industrial Solutions')).toBeInTheDocument();
      expect(await screen.findByText('Metro Logistics Center')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Search by customer, WO number/i)).toBeInTheDocument();
      expect(screen.getAllByText('VIEW SERVICE').length).toBeGreaterThanOrEqual(1);
    });

    it('renders /technician/services/:id with customer context, location, and relevant history', async () => {
      render(
        <MemoryRouter initialEntries={['/technician/services/srv-101']}>
          <Routes>
            <Route path="/technician/services/:id" element={<TechnicianServiceDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      expect(await screen.findByText('SRV-2026-0001')).toBeInTheDocument();
      expect(await screen.findByText('Apex Industrial Solutions')).toBeInTheDocument();
      expect(screen.getByText('CALL CUSTOMER')).toBeInTheDocument();
      expect(screen.getByText('OPEN MAP')).toBeInTheDocument();
      expect(screen.getByText('Relevant Work History')).toBeInTheDocument();
      expect(screen.getByText('SRV-2025-0899')).toBeInTheDocument();
    });

    it('displays access denied when /technician/services/:id returns 403 Forbidden', async () => {
      vi.mocked(apiClient.get).mockRejectedValueOnce({
        status: 403,
        statusCode: 403,
        code: 'SERVICE_NOT_ASSIGNED',
        message: 'Access denied: This service work order is not assigned to your technician account.',
      });

      render(
        <MemoryRouter initialEntries={['/technician/services/srv-forbidden']}>
          <Routes>
            <Route path="/technician/services/:id" element={<TechnicianServiceDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      expect(
        await screen.findByText(/Access Denied: Service Not Assigned/i)
      ).toBeInTheDocument();
      expect(screen.getByText('Return to Work Queue')).toBeInTheDocument();
    });

    it('renders /technician/completed-services shell with heading and empty state when no records exist', async () => {
      vi.mocked(apiClient.get).mockResolvedValueOnce({
        success: true,
        data: [],
      } as any);

      render(
        <MemoryRouter>
          <TechnicianCompletedServicesPage />
        </MemoryRouter>
      );

      expect(screen.getByRole('heading', { name: /Completed Services/i })).toBeInTheDocument();
      expect(await screen.findByText(/No completed services yet/i)).toBeInTheDocument();
    });

    it('renders /technician/profile with credentials, certified skills, personal work summary, and active logout trigger', async () => {
      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter>
            <TechnicianProfilePage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      expect(screen.getByRole('heading', { name: /Technician Profile/i })).toBeInTheDocument();
      expect(await screen.findByText('Rahul Patil')).toBeInTheDocument();
      expect(screen.getByText('TECH-004')).toBeInTheDocument();
      expect(screen.getByText(/Industrial Equipment Overhaul/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Personal Work Summary/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByRole('button', { name: /Logout Technician Session/i })).toBeInTheDocument();
    });
  });

  describe('Portal Navigation & Layout', () => {
    it('renders portal layout with top branding and mobile bottom navigation', () => {
      render(
        <MemoryRouter initialEntries={['/technician']}>
          <TechnicianPortalLayout />
        </MemoryRouter>
      );

      expect(screen.getByText('Technician Workspace')).toBeInTheDocument();
      expect(screen.getByText('Field Portal')).toBeInTheDocument();
      expect(screen.getByRole('navigation', { name: 'Technician Mobile Navigation' })).toBeInTheDocument();
      expect(screen.getAllByText('My Work').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Assigned').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Completed').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('Profile').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Route Resolution & Auth Protection via TechnicianPortalRouter', () => {
    const renderWithRoute = (initialPath: string) => {
      return render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
              <Route path="/technician/*" element={<TechnicianPortalRouter />} />
              <Route path="/technicians" element={<div>Existing Admin Technicians Roster</div>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );
    };

    it('resolves /technician/login without requiring authentication', async () => {
      renderWithRoute(TECHNICIAN_AUTH_ROUTE);
      expect(await screen.findByText('Technician Login')).toBeInTheDocument();
    });

    it('resolves /technician (My Work dashboard) when authenticated', async () => {
      renderWithRoute(TECHNICIAN_PORTAL_ROUTE_PREFIX);
      expect(await screen.findByRole('heading', { name: /My Work/i })).toBeInTheDocument();
      expect(screen.getByText("Today's Schedule")).toBeInTheDocument();
    });

    it('resolves /technician/services when authenticated', async () => {
      renderWithRoute(TECHNICIAN_SERVICES_ROUTE);
      expect(await screen.findByRole('heading', { name: /Assigned Services/i })).toBeInTheDocument();
    });

    it('resolves /technician/services/:id when authenticated', async () => {
      renderWithRoute('/technician/services/srv-101');
      expect(await screen.findByText('SRV-2026-0001')).toBeInTheDocument();
      expect(await screen.findByText('Apex Industrial Solutions')).toBeInTheDocument();
    });

    it('resolves /technician/completed-services when authenticated', async () => {
      renderWithRoute(TECHNICIAN_COMPLETED_ROUTE);
      expect(await screen.findByRole('heading', { name: /Completed Services/i })).toBeInTheDocument();
    });

    it('resolves /technician/profile when authenticated', async () => {
      renderWithRoute(TECHNICIAN_PROFILE_ROUTE);
      expect(await screen.findByRole('heading', { name: /Technician Profile/i })).toBeInTheDocument();
    });

    it('redirects unauthenticated technician to /technician/login', async () => {
      vi.mocked(apiClient.get).mockRejectedValueOnce(new Error('401 Unauthorized'));

      renderWithRoute(TECHNICIAN_PORTAL_ROUTE_PREFIX);

      await waitFor(() => {
        expect(screen.getByText('Technician Login')).toBeInTheDocument();
      });
    });

    it('does NOT capture /technicians (preserves existing CRM Admin roster)', () => {
      renderWithRoute('/technicians');
      expect(screen.getByText('Existing Admin Technicians Roster')).toBeInTheDocument();
      expect(screen.queryByText('Technician Workspace')).not.toBeInTheDocument();
    });
  });

  describe('Business-Agnostic Vocabulary Check', () => {
    it('contains zero hardcoded RO / Purifier / Membrane / TDS terminology in universal portal views', () => {
      const { container } = render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter>
            <TechnicianDashboardPage />
            <TechnicianServicesPage />
            <TechnicianCompletedServicesPage />
            <TechnicianProfilePage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      const html = container.innerHTML;
      // Prohibited terms per specification
      expect(html).not.toMatch(/\bRO\b/);
      expect(html).not.toMatch(/\bTDS\b/);
      expect(html).not.toMatch(/\bMembrane\b/);
      expect(html).not.toMatch(/\bPurifier\b/);
      expect(html).not.toMatch(/\bLPH\b/);
      expect(html).not.toMatch(/Water Quality/i);
    });
  });

  describe('Phase 5: Job Execution Suite', () => {
    it('displays START JOB button when service is in ASSIGNED state', async () => {
      render(
        <MemoryRouter initialEntries={['/technician/services/srv-101']}>
          <Routes>
            <Route path="/technician/services/:id" element={<TechnicianServiceDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      const startBtn = await screen.findByRole('button', { name: /START JOB EXECUTION/i });
      expect(startBtn).toBeInTheDocument();
    });

    it('triggers /start API call when technician taps START JOB', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        success: true,
        data: { status: 'IN_PROGRESS' },
      } as any);

      render(
        <MemoryRouter initialEntries={['/technician/services/srv-101']}>
          <Routes>
            <Route path="/technician/services/:id" element={<TechnicianServiceDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      const startBtn = await screen.findByRole('button', { name: /START JOB EXECUTION/i });
      startBtn.click();

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          expect.stringContaining('/job-cards/jc-101/start'),
          expect.anything()
        );
      });
    });

    it('displays IN_PROGRESS controls (HOLD, RECORD WORK, COMPLETE) when job is active', async () => {
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url.includes('/services/srv-102')) {
          return Promise.resolve({
            success: true,
            data: {
              id: 'srv-102',
              serviceNumber: 'SRV-2026-0002',
              serviceType: 'REPAIR',
              serviceClassification: 'GENERAL',
              priority: 'NORMAL',
              status: 'IN_PROGRESS',
              scheduledDate: new Date().toISOString(),
              jobCardId: 'jc-102',
              customer: { fullName: 'Industrial Tech', phone: '9998887776' },
              location: { addressLine1: 'Unit 5' },
            },
          } as any);
        }
        return Promise.resolve({ success: true, data: [] } as any);
      });

      render(
        <MemoryRouter initialEntries={['/technician/services/srv-102']}>
          <Routes>
            <Route path="/technician/services/:id" element={<TechnicianServiceDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      expect(await screen.findByRole('button', { name: /PUT ON HOLD/i })).toBeInTheDocument();
      expect(await screen.findByRole('button', { name: /RECORD WORK & PARTS/i })).toBeInTheDocument();
      expect(await screen.findByRole('button', { name: /COMPLETE JOB/i })).toBeInTheDocument();
    });

    it('transitions job to ON_HOLD when put on hold and renders on-hold status badge and RESUME JOB button', async () => {
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url.includes('/services/srv-hold-1')) {
          return Promise.resolve({
            success: true,
            data: {
              id: 'srv-hold-1',
              serviceNumber: 'SRV-2026-HOLD',
              serviceType: 'REPAIR',
              serviceClassification: 'GENERAL',
              priority: 'HIGH',
              status: 'ON_HOLD',
              jobCardStatus: 'ON_HOLD',
              scheduledDate: new Date().toISOString(),
              jobCardId: 'jc-hold-1',
              customer: { fullName: 'Hold Customer', phone: '9988776655' },
              location: {
                addressLine1: 'Plot 10, MIDC',
                addressLine2: 'Wing B',
                landmark: 'Near Water Tank',
                city: 'Pune',
                state: 'Maharashtra',
                pincode: '411019',
              },
            },
          } as any);
        }
        return Promise.resolve({ success: true, data: [] } as any);
      });

      render(
        <MemoryRouter initialEntries={['/technician/services/srv-hold-1']}>
          <Routes>
            <Route path="/technician/services/:id" element={<TechnicianServiceDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      // Verify ON HOLD badge and RESUME button are present
      expect((await screen.findAllByText('ON HOLD')).length).toBeGreaterThanOrEqual(1);
      expect(await screen.findByRole('button', { name: /RESUME JOB/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /START JOB EXECUTION/i })).toBeNull();
    });

    it('strictly uses the customer registered address for Google Maps navigation link', async () => {
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url.includes('/services/srv-nav-1')) {
          return Promise.resolve({
            success: true,
            data: {
              id: 'srv-nav-1',
              serviceNumber: 'SRV-2026-NAV',
              serviceType: 'INSTALLATION',
              serviceClassification: 'GENERAL',
              priority: 'NORMAL',
              status: 'IN_PROGRESS',
              scheduledDate: new Date().toISOString(),
              jobCardId: 'jc-nav-1',
              customer: { fullName: 'Suresh Patil', phone: '9822334455' },
              location: {
                addressLine1: 'Flat 402, Shivneri Heights',
                addressLine2: 'Sector 24, Pradhikaran',
                landmark: 'Near Akurdi Railway Station',
                city: 'Pune',
                state: 'Maharashtra',
                pincode: '411044',
              },
            },
          } as any);
        }
        return Promise.resolve({ success: true, data: [] } as any);
      });

      render(
        <MemoryRouter initialEntries={['/technician/services/srv-nav-1']}>
          <Routes>
            <Route path="/technician/services/:id" element={<TechnicianServiceDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      // Verify the map navigation links encode the exact registered address
      const mapLinks = (await screen.findAllByRole('link', { name: /NAVIGATE/i })) as HTMLAnchorElement[];
      expect(mapLinks.length).toBeGreaterThanOrEqual(1);

      for (const link of mapLinks) {
        expect(link.href).toContain('google.com/maps/search');
        expect(link.href).toContain(encodeURIComponent('Flat 402, Shivneri Heights'));
        expect(link.href).toContain(encodeURIComponent('Pune'));
        expect(link.href).toContain(encodeURIComponent('411044'));
      }
    });
  });

  describe('Phase 6: Billing Visibility Suite', () => {
    it('displays authoritative billing visibility card with invoice number, total, paid, and outstanding', async () => {
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url.includes('/services/srv-103')) {
          return Promise.resolve({
            success: true,
            data: {
              id: 'srv-103',
              serviceNumber: 'SRV-2026-0003',
              serviceType: 'PERIODIC_MAINTENANCE',
              serviceClassification: 'GENERAL',
              priority: 'NORMAL',
              status: 'COMPLETED',
              scheduledDate: new Date().toISOString(),
              jobCardId: 'jc-103',
              customer: { fullName: 'Omega Facilities', phone: '9888877777' },
              location: { addressLine1: 'Building B' },
              billing: {
                invoiceId: 'inv-103',
                invoiceNumber: 'INV-2026-0003',
                totalAmount: 3500,
                paidAmount: 1500,
                outstandingAmount: 2000,
                paymentStatus: 'PARTIALLY_PAID',
              },
            },
          } as any);
        }
        return Promise.resolve({ success: true, data: [] } as any);
      });

      render(
        <MemoryRouter initialEntries={['/technician/services/srv-103']}>
          <Routes>
            <Route path="/technician/services/:id" element={<TechnicianServiceDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      // Verify Billing section title and values
      expect(await screen.findByText('Billing & Invoice Summary')).toBeInTheDocument();
      expect(screen.getByText('INV-2026-0003')).toBeInTheDocument();
      expect(screen.getByText('PARTIALLY PAID')).toBeInTheDocument();
      expect(screen.getByText('₹3,500.00')).toBeInTheDocument();
      expect(screen.getByText('₹1,500.00')).toBeInTheDocument();
      expect(screen.getByText('₹2,000.00')).toBeInTheDocument();

      // Phase 7: Record Customer Payment button IS displayed when outstanding > 0
      expect(
        screen.getByRole('button', { name: /Record Customer Payment/i })
      ).toBeInTheDocument();
    });

    it('gracefully renders "Invoice not yet available" when no billing record exists', async () => {
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url.includes('/services/srv-104')) {
          return Promise.resolve({
            success: true,
            data: {
              id: 'srv-104',
              serviceNumber: 'SRV-2026-0004',
              serviceType: 'INSTALLATION',
              serviceClassification: 'WARRANTY',
              priority: 'NORMAL',
              status: 'ASSIGNED',
              scheduledDate: new Date().toISOString(),
              jobCardId: 'jc-104',
              customer: { fullName: 'Delta Logistics', phone: '9777766666' },
              location: { addressLine1: 'Warehouse 1' },
              billing: null,
            },
          } as any);
        }
        return Promise.resolve({ success: true, data: [] } as any);
      });

      render(
        <MemoryRouter initialEntries={['/technician/services/srv-104']}>
          <Routes>
            <Route path="/technician/services/:id" element={<TechnicianServiceDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      expect(await screen.findByText('Invoice not yet available')).toBeInTheDocument();
      expect(
        screen.getByText(/Billing details will appear here once an invoice is issued/i)
      ).toBeInTheDocument();
    });
  });

  describe('Phase 7: Payment Collection Suite', () => {
    beforeEach(() => {
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url.includes('/services/srv-103')) {
          return Promise.resolve({
            success: true,
            data: {
              id: 'srv-103',
              serviceNumber: 'SRV-2026-0003',
              serviceType: 'REPAIR',
              serviceClassification: 'GENERAL',
              priority: 'HIGH',
              status: 'IN_PROGRESS',
              scheduledDate: new Date().toISOString(),
              jobCardId: 'jc-103',
              customer: { fullName: 'Global Enterprises', phone: '9888877777' },
              location: { addressLine1: 'Sector 5' },
              billing: {
                invoiceNumber: 'INV-2026-0003',
                totalAmount: 3500,
                paidAmount: 1500,
                outstandingAmount: 2000,
                paymentStatus: 'PARTIALLY_PAID',
              },
            },
          } as any);
        }
        if (url.includes('/payment-summary')) {
          return Promise.resolve({
            success: true,
            data: {
              invoiceNumber: 'INV-2026-0003',
              totalAmount: 3500,
              paidAmount: 1500,
              outstandingAmount: 2000,
              paymentStatus: 'PARTIALLY_PAID',
              businessName: 'SR Enterprises',
              upiId: 'srenterprises@upi',
              bankName: 'State Bank of India',
              accountNumber: '30998877665',
              ifsc: 'SBIN0001234',
            },
          } as any);
        }
        return Promise.resolve({ success: true, data: [] } as any);
      });
    });

    it('opens Payment Collection Modal with payment methods and company payment details', async () => {
      render(
        <MemoryRouter initialEntries={['/technician/services/srv-103']}>
          <Routes>
            <Route path="/technician/services/:id" element={<TechnicianServiceDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      const payBtn = await screen.findByRole('button', { name: /Record Customer Payment/i });
      payBtn.click();

      // Modal opens
      expect(await screen.findByText('Record Customer Payment')).toBeInTheDocument();
      expect(screen.getByText('Customer pays business directly')).toBeInTheDocument();
      expect(screen.getByText('Company UPI Details')).toBeInTheDocument();
      expect(screen.getByText('srenterprises@upi')).toBeInTheDocument();
      expect(screen.getByText('Review & Record')).toBeInTheDocument();
    });

    it('submits payment recording through POST /job-cards/:id/payment', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        success: true,
        data: {
          paymentId: 'pay-uuid-999',
          paymentNumber: 'PAY-2026-0999',
          invoiceNumber: 'INV-2026-0003',
          amount: 2000,
          paymentMethod: 'UPI',
          referenceNumber: 'UTR-123456',
          remainingOutstanding: 0,
          paymentStatus: 'PAID',
        },
      } as any);

      render(
        <MemoryRouter initialEntries={['/technician/services/srv-103']}>
          <Routes>
            <Route path="/technician/services/:id" element={<TechnicianServiceDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      const payBtn = await screen.findByRole('button', { name: /Record Customer Payment/i });
      payBtn.click();

      const reviewBtn = await screen.findByRole('button', { name: /Review & Record/i });
      reviewBtn.click();

      const confirmBtn = await screen.findByRole('button', { name: /Confirm & Commit/i });
      confirmBtn.click();

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          expect.stringContaining('/job-cards/jc-103/payment'),
          expect.objectContaining({
            amount: 2000,
            paymentMethod: 'UPI',
          })
        );
      });
    });
  });

  describe('Phase 8: Portal Notifications & Notification Center', () => {
    const mockNotifications = [
      {
        id: 'notif-1',
        type: 'NEW_ASSIGNMENT',
        title: 'New Service Assigned',
        message: 'SRV-2026-0045 • Scheduled: Today (10:00 AM) • Priority: HIGH',
        referenceType: 'SERVICE',
        referenceId: 'srv-45',
        actionUrl: '/technician/services/srv-45',
        isRead: false,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'notif-2',
        type: 'SCHEDULE_CHANGE',
        title: 'Schedule Changed',
        message: 'SRV-2026-0046 • New Time: 3:00 PM',
        referenceType: 'SERVICE',
        referenceId: 'srv-46',
        actionUrl: '/technician/services/srv-46',
        isRead: true,
        createdAt: new Date(Date.now() - 86400000).toISOString(),
      },
    ];

    beforeEach(() => {
      vi.mocked(apiClient.get).mockImplementation((url: string) => {
        if (url.includes('/me/notifications')) {
          return Promise.resolve({
            success: true,
            data: {
              notifications: mockNotifications,
              unreadCount: 1,
              total: 2,
              page: 1,
              limit: 20,
              totalPages: 1,
            },
          } as any);
        }
        if (url.includes('/unread-count')) {
          return Promise.resolve({
            success: true,
            data: { unreadCount: 1 },
          } as any);
        }
        return Promise.resolve({ success: true, data: [] } as any);
      });
    });

    it('renders TechnicianNotificationsPage with notification list and unread count', async () => {
      render(
        <MemoryRouter initialEntries={['/technician/notifications']}>
          <Routes>
            <Route path="/technician/notifications" element={<TechnicianNotificationsPage />} />
          </Routes>
        </MemoryRouter>
      );

      expect(await screen.findByText('Notifications')).toBeInTheDocument();
      expect(await screen.findByText(/1 new/i)).toBeInTheDocument();
      expect(await screen.findByText('New Service Assigned')).toBeInTheDocument();
      expect(await screen.findByText('Schedule Changed')).toBeInTheDocument();
    });

    it('allows marking an unread notification as read upon interaction', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          notificationId: 'notif-1',
          isRead: true,
          readAt: new Date().toISOString(),
          unreadCount: 0,
        },
      } as any);

      render(
        <MemoryRouter initialEntries={['/technician/notifications']}>
          <Routes>
            <Route path="/technician/notifications" element={<TechnicianNotificationsPage />} />
          </Routes>
        </MemoryRouter>
      );

      const unreadItem = await screen.findByText('New Service Assigned');
      unreadItem.click();

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          expect.stringContaining('/me/notifications/notif-1/read'),
          expect.anything()
        );
      });
    });

    it('allows marking all notifications as read', async () => {
      vi.mocked(apiClient.post).mockResolvedValueOnce({
        success: true,
        data: { success: true, affectedCount: 1 },
      } as any);

      render(
        <MemoryRouter initialEntries={['/technician/notifications']}>
          <Routes>
            <Route path="/technician/notifications" element={<TechnicianNotificationsPage />} />
          </Routes>
        </MemoryRouter>
      );

      const markAllBtn = await screen.findByRole('button', { name: /Mark all read/i });
      markAllBtn.click();

      await waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          expect.stringContaining('/me/notifications/read-all'),
          expect.anything()
        );
      });
    });
  });

  describe('Phase 9: Personal Technician Summary Suite', () => {
    it('renders live personal operational summary metrics on TechnicianDashboardPage', async () => {
      vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
        if (url.includes('/me/summary')) {
          return {
            success: true,
            data: {
              assignedCount: 7,
              completedCount: 21,
              currentWorkload: 5,
              completionRate: 81,
              averageCompletionTimeMinutes: 75,
              averageCompletionTimeFormatted: '1h 15m',
              isAverageCompletionTimeReliable: true,
              sampleSize: 18,
              workloadBreakdown: {
                assigned: 4,
                inProgress: 1,
                onHold: 0,
                upcoming: 3,
              },
            },
          } as any;
        }
        return { success: true, data: [] } as any;
      });

      render(
        <MemoryRouter initialEntries={['/technician']}>
          <Routes>
            <Route path="/technician" element={<TechnicianDashboardPage />} />
          </Routes>
        </MemoryRouter>
      );

      expect(await screen.findByText('Personal Operational Summary')).toBeInTheDocument();
      expect(await screen.findByText('1h 15m')).toBeInTheDocument();
      expect(await screen.findByText('Sample: 18 jobs')).toBeInTheDocument();
      expect((await screen.findAllByText('81%')).length).toBeGreaterThanOrEqual(1);
    });

    it('renders "Data unavailable" for average completion time when reliable flag is false', async () => {
      vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
        if (url.includes('/me/summary')) {
          return {
            success: true,
            data: {
              assignedCount: 1,
              completedCount: 0,
              currentWorkload: 1,
              completionRate: 0,
              averageCompletionTimeMinutes: null,
              averageCompletionTimeFormatted: null,
              isAverageCompletionTimeReliable: false,
              sampleSize: 0,
              workloadBreakdown: {
                assigned: 1,
                inProgress: 0,
                onHold: 0,
                upcoming: 1,
              },
            },
          } as any;
        }
        return { success: true, data: [] } as any;
      });

      render(
        <MemoryRouter initialEntries={['/technician']}>
          <Routes>
            <Route path="/technician" element={<TechnicianDashboardPage />} />
          </Routes>
        </MemoryRouter>
      );

      expect(await screen.findByText('Personal Operational Summary')).toBeInTheDocument();
      expect(await screen.findByText('Data unavailable')).toBeInTheDocument();
    });
  });

  describe('Phase 10: Completed Services Migration & Current Job Section Behavior', () => {
    it('does NOT show a completed service in the Current Job section and displays No Active Ongoing Job', async () => {
      vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
        if (url.includes('/me/summary')) {
          return {
            success: true,
            data: {
              assignedCount: 1,
              completedCount: 1,
              currentWorkload: 0,
              completionRate: 100,
              averageCompletionTimeMinutes: 45,
              averageCompletionTimeFormatted: '45m',
              isAverageCompletionTimeReliable: true,
              sampleSize: 1,
              workloadBreakdown: {
                assigned: 0,
                inProgress: 0,
                onHold: 0,
                upcoming: 0,
              },
            },
          } as any;
        }

        if (url.includes('/services')) {
          return {
            success: true,
            data: [
              {
                serviceId: 'srv-comp-1',
                serviceNumber: 'WO-COMPLETED-999',
                status: 'COMPLETED',
                jobCardStatus: 'COMPLETED',
                customerName: 'Finished Corp',
                serviceType: 'Routine Maintenance',
                serviceAddress: '100 Industrial Way',
                completedAt: new Date().toISOString(),
              },
            ],
          } as any;
        }

        return { success: true, data: [] } as any;
      });

      render(
        <MemoryRouter initialEntries={['/technician']}>
          <Routes>
            <Route path="/technician" element={<TechnicianDashboardPage />} />
          </Routes>
        </MemoryRouter>
      );

      // Verify that the completed service is NOT displayed as Current Job
      expect(await screen.findByText('No Active Ongoing Job')).toBeInTheDocument();
      expect(screen.getByText(/Completed services have been moved to the Completed tab/i)).toBeInTheDocument();
      expect(screen.queryByText('WO-COMPLETED-999')).not.toBeInTheDocument();
      expect(screen.getByText('View Completed Tab')).toBeInTheDocument();
    });

    it('renders Completed filter tab on TechnicianServicesPage and allows filtering completed services', async () => {
      vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
        if (url.includes('view=completed')) {
          return {
            success: true,
            data: [
              {
                serviceId: 'srv-comp-2',
                serviceNumber: 'WO-2026-COMPLETED-01',
                status: 'COMPLETED',
                priority: 'NORMAL',
                customerName: 'Acme Laboratories',
                serviceType: 'Filter Cleaning & Sanitization',
                serviceAddress: 'Building 4, Biotech Park',
                city: 'Pune',
              },
            ],
          } as any;
        }
        return { success: true, data: [] } as any;
      });

      render(
        <MemoryRouter>
          <TechnicianServicesPage />
        </MemoryRouter>
      );

      const completedTab = screen.getByRole('button', { name: 'Completed' });
      expect(completedTab).toBeInTheDocument();

      fireEvent.click(completedTab);

      expect(await screen.findByText('WO-2026-COMPLETED-01')).toBeInTheDocument();
      expect(screen.getByText('Acme Laboratories')).toBeInTheDocument();
    });

    it('renders live completed services on TechnicianCompletedServicesPage', async () => {
      vi.mocked(apiClient.get).mockImplementation(async (url: string) => {
        if (url.includes('/services?view=completed')) {
          return {
            success: true,
            data: [
              {
                serviceId: 'srv-comp-3',
                serviceNumber: 'WO-2026-DONE-77',
                status: 'COMPLETED',
                customerName: 'Zenith Tech Park',
                serviceType: 'Compressor Calibration',
                productName: 'Heavy Duty Chiller',
                serviceAddress: 'Tower B, Hinjewadi',
                completedAt: new Date('2026-10-01T10:00:00Z').toISOString(),
              },
            ],
          } as any;
        }
        return { success: true, data: [] } as any;
      });

      render(
        <MemoryRouter>
          <TechnicianCompletedServicesPage />
        </MemoryRouter>
      );

      expect(await screen.findByText('WO-2026-DONE-77')).toBeInTheDocument();
      expect(screen.getByText('Zenith Tech Park')).toBeInTheDocument();
      expect(screen.getByText(/Compressor Calibration/i)).toBeInTheDocument();
    });
  });
});


