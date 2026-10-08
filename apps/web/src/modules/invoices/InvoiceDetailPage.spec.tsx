import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InvoiceDetailPage } from './InvoiceDetailPage';

vi.mock('../../providers/AuthBoundary', () => ({
  useAuth: () => ({
    hasPermission: () => true,
    user: { id: 'test-user', fullName: 'Staff Member' },
  }),
}));

vi.mock('./invoices.api', () => ({
  useInvoiceQuery: () => ({
    data: {
      id: '33333333-3333-3333-3333-333333333333',
      invoiceNumber: 'INV-2026-0001',
      customerId: '22222222-2222-2222-2222-222222222222',
      customerName: 'Aarav Sharma',
      customerNumber: 'CUST-2026-0001',
      customerPhone: '+919876543210',
      customerEmail: 'aarav@example.com',
      customerGst: '22ABCDE1234F1Z5',
      invoiceDate: new Date('2026-03-01').toISOString(),
      dueDate: new Date('2026-03-16').toISOString(),
      subtotal: '10000.00',
      discountAmount: '0.00',
      taxAmount: '1800.00',
      totalAmount: '11800.00',
      paidAmount: '0.00',
      outstandingAmount: '11800.00',
      status: 'ISSUED',
      items: [
        {
          id: 'item-1',
          nameSnapshot: 'Commercial Equipment System',
          descriptionSnapshot: 'Standard Configuration',
          quantity: 1,
          unitPriceSnapshot: '10000.00',
          discountAmount: '0.00',
          taxAmount: '1800.00',
          lineTotal: '11800.00',
        },
      ],
      addresses: [
        {
          id: 'addr-1',
          isDefault: true,
          addressLine1: 'Plot 42, GE Road',
          city: 'Raipur',
          state: 'Chhattisgarh',
          postalCode: '492001',
        },
      ],
    },
    isLoading: false,
  }),
  useCancelInvoiceMutation: () => ({
    mutateAsync: vi.fn(),
  }),
  useCreateInvoiceMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useUpdateInvoiceMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useSendInvoiceDueMailMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useInvoices: () => ({
    data: { data: [] },
    isLoading: false,
  }),
  useInvoicesQuery: () => ({
    data: { data: [] },
    isLoading: false,
  }),
}));

vi.mock('../payments/payments.api', () => ({
  useInvoicePayments: () => ({
    data: [],
    isLoading: false,
  }),
  useRecordPayment: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

import { ToastProvider } from '../../providers/ToastProvider';

describe('InvoiceDetailPage Component & Print Isolation', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  it('renders invoice details, printable tax invoice container, and print button', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

    render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter>
            <InvoiceDetailPage />
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    );

    // Verify Header and Action buttons
    expect(screen.getByText('Print Invoice')).toBeDefined();

    // Verify Printable Document Container
    const printableDoc = document.getElementById('printable-tax-invoice');
    expect(printableDoc).toBeDefined();
    expect(printableDoc?.classList.contains('printable-tax-invoice')).toBe(true);

    // Verify Invoice Content
    expect(screen.getAllByText('INV-2026-0001').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Aarav Sharma/i)).toBeDefined();
    expect(screen.getByText('Commercial Equipment System')).toBeDefined();
    expect(screen.getByText('Enterprises CRM')).toBeDefined();

    // Trigger Print
    const printBtn = screen.getByText('Print Invoice');
    fireEvent.click(printBtn);
    expect(printSpy).toHaveBeenCalled();

    printSpy.mockRestore();
  });
});
