import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReportsPage } from './ReportsPage';

vi.mock('../../providers/AuthBoundary', () => ({
  useAuth: () => ({
    hasPermission: () => true,
    user: { id: 'admin-1', fullName: 'Administrator', role: 'ADMIN' },
  }),
}));

vi.mock('../analytics/analytics.api', () => ({
  useAnalyticsOverview: () => ({
    data: {
      range: 'this_month',
      generatedAt: '2026-08-18T10:00:00Z',
      kpis: {
        grossBilled: { current: 875450, previous: 778000, deltaPercentage: 12.4, trend: 'up' },
        salesCompleted: { current: 56, previous: 47, deltaPercentage: 18.6, trend: 'up' },
        servicesCompleted: { current: 48, previous: 40, deltaPercentage: 20.4, trend: 'up' },
        totalCustomers: { current: 632, previous: 584, deltaPercentage: 8.2, trend: 'up' },
        outstandingAmount: { current: 4250, previous: 4650, deltaPercentage: -8.5, trend: 'down' },
      },
      revenue: {
        grossBilled: 875450,
        outstandingAmount: 4250,
      },
      sales: {
        salesCount: 56,
        comparison: { count: { deltaPercentage: 18.6, trend: 'up' } },
      },
      customers: {
        totalCustomers: 632,
        comparison: { totalCustomers: { deltaPercentage: 8.2, trend: 'up' } },
      },
    },
    isLoading: false,
    refetch: vi.fn(),
  }),
  useSalesAnalytics: () => ({ data: {}, isLoading: false }),
  useRevenueAnalytics: () => ({ data: {}, isLoading: false }),
  usePaymentAnalytics: () => ({ data: {}, isLoading: false }),
  useServiceAnalytics: () => ({ data: {}, isLoading: false }),
  useTechnicianAnalytics: () => ({ data: {}, isLoading: false }),
  useInquiryAnalytics: () => ({ data: {}, isLoading: false }),
  useFinancialSummaryQuery: () => ({
    data: {
      period: '2026-10-01 to 2026-10-31',
      totalServiceRevenue: 120000,
      totalCustomerPaymentsReceived: 115000,
      totalExpenses: 25000,
      cogsAmount: 40000,
      grossProfit: 80000,
      netProfit: 50000,
      cashCollectedByTechnicians: 35000,
      cashHandedOverToOwner: 30000,
      pendingTechnicianCash: 5000,
      shopCashMovementBalance: 20000,
    },
    isLoading: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('../customers/customer.api', () => ({
  useCustomersQuery: () => ({ data: { data: [] }, isLoading: false }),
}));

vi.mock('../invoices/invoices.api', () => ({
  useInvoicesQuery: () => ({ data: { data: [] }, isLoading: false }),
}));

vi.mock('../job-cards/job-cards.api', () => ({
  useJobCardsQuery: () => ({ data: { data: [] }, isLoading: false }),
}));

vi.mock('../technicians/technicians.api', () => ({
  useTechniciansQuery: () => ({ data: { data: [] }, isLoading: false }),
}));

vi.mock('../sales/sales.api', () => ({
  useSalesQuery: () => ({ data: { data: [] }, isLoading: false }),
  useProductsQuery: () => ({ data: [], isLoading: false }),
}));

vi.mock('../warranties/warranties.api', () => ({
  useWarrantiesQuery: () => ({ data: { data: [] }, isLoading: false }),
}));

import { ToastProvider } from '../../providers/ToastProvider';

describe('Reports & Analytics Page (/reports)', () => {
  const createTestQueryClient = () =>
    new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });

  const renderComponent = () => {
    const queryClient = createTestQueryClient();
    return render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter>
            <ReportsPage />
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    );
  };

  it('renders page header with Title, Subtitle, and action buttons', () => {
    renderComponent();

    expect(screen.getByRole('heading', { name: /Reports/i })).toBeDefined();
    expect(
      screen.getByText(/Real-time business performance/i)
    ).toBeDefined();
    expect(screen.getByRole('button', { name: /Export Report/i })).toBeDefined();
  });

  it('renders all 5 top KPI metric cards with expected titles and values', () => {
    renderComponent();

    expect(screen.getByText('Total Revenue')).toBeDefined();
    expect(screen.getByText('Total Sales')).toBeDefined();
    expect(screen.getByText('Total Customers')).toBeDefined();
    expect(screen.getByText('Services Completed')).toBeDefined();
    expect(screen.getByText('Outstanding Balance')).toBeDefined();
  });

  it('renders report control bar with report tabs and date filters', () => {
    renderComponent();

    expect(screen.getByRole('button', { name: /Overview/i })).toBeDefined();
    expect(screen.getAllByRole('button', { name: /Sales/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Customers/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Services/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Invoices/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Payments/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Products/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Technicians/i })).toBeDefined();
  });

  it('renders main analytical sections in overview mode', () => {
    renderComponent();

    // Chart titles
    expect(screen.getByText(/Revenue & Realization Trajectory/i)).toBeDefined();
    expect(screen.getByText('Gross Billed')).toBeDefined();

    // Sections
    expect(screen.getByText('Sales Performance')).toBeDefined();
    expect(screen.getByText('Customer Insights')).toBeDefined();
    expect(screen.getByText('Service Performance')).toBeDefined();
    expect(screen.getByText('Financial Overview')).toBeDefined();
    expect(screen.getByText(/Product Performance & Catalog/i)).toBeDefined();
    expect(screen.getByText(/Technician Performance & Workforce/i)).toBeDefined();
    expect(screen.getByText(/Warranty & Service Alerts/i)).toBeDefined();
    expect(screen.getByText('Business Insights')).toBeDefined();
  });

  it('opens and closes export modal when export button is clicked', () => {
    renderComponent();

    const exportBtn = screen.getByRole('button', { name: /Export Report/i });
    fireEvent.click(exportBtn);

    // Modal should be open
    expect(screen.getByText('Export Analytics Report')).toBeDefined();
    expect(screen.getByText('CSV Dataset')).toBeDefined();

    // Cancel modal
    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelBtn);

    // Modal should close
    expect(screen.queryByText('Export Analytics Report')).toBeNull();
  });

  it('filters view to Sales tab when clicked', () => {
    renderComponent();

    const salesTab = screen.getAllByRole('button', { name: /Sales/i })[0]!;
    fireEvent.click(salesTab);

    expect(screen.getByText('Total Sales Revenue')).toBeDefined();
    expect(screen.getByText('Sales Performance')).toBeDefined();
  });

  it('filters view to Customers tab when clicked', () => {
    renderComponent();

    const customersTab = screen.getByRole('button', { name: /Customers/i });
    fireEvent.click(customersTab);

    expect(screen.getByText('Registered Customers')).toBeDefined();
    expect(screen.getByText('Customer Insights')).toBeDefined();
  });

  it('filters view to Services tab when clicked', () => {
    renderComponent();

    const servicesTab = screen.getByRole('button', { name: /Services/i });
    fireEvent.click(servicesTab);

    expect(screen.getByText('Total Service Tickets')).toBeDefined();
    expect(screen.getByText('Service Performance')).toBeDefined();
  });

  it('filters view to Invoices tab when clicked', () => {
    renderComponent();

    const invoicesTab = screen.getByRole('button', { name: /Invoices/i });
    fireEvent.click(invoicesTab);

    expect(screen.getByText('Gross Invoiced')).toBeDefined();
    expect(screen.getByText('Financial Overview')).toBeDefined();
  });

  it('filters view to Payments tab when clicked', () => {
    renderComponent();

    const paymentsTab = screen.getByRole('button', { name: /Payments/i });
    fireEvent.click(paymentsTab);

    expect(screen.getByText(/Payment Collections & Cashflow/i)).toBeDefined();
  });

  it('filters view to Products tab when clicked', () => {
    renderComponent();

    const productsTab = screen.getByRole('button', { name: /Products/i });
    fireEvent.click(productsTab);

    expect(screen.getByText('Product Catalog Value')).toBeDefined();
  });

  it('filters view to Technicians tab when clicked', () => {
    renderComponent();

    const techniciansTab = screen.getByRole('button', { name: /Technicians/i });
    fireEvent.click(techniciansTab);

    expect(screen.getByText('Registered Technicians')).toBeDefined();
  });

  it('renders genuine financial metrics without duplicate inflation or arbitrary multipliers', () => {
    renderComponent();

    // Verify gross billed renders exact value from overview without multiplier
    expect(screen.getAllByText(/₹\s*8,75,450/i).length).toBeGreaterThan(0);
    // Verify no arbitrary completed * 450 artifact is present
    expect(screen.queryByText(/₹\s*450\.00/i)).toBeNull();
  });
});
