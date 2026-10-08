import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { RevampInvoiceView } from './RevampInvoiceView';
import type { InvoiceDetailData } from '../../modules/invoices/invoices.api';

describe('RevampInvoiceView Component', () => {
  const mockInvoice: any = {
    id: 'inv-revamp-101',
    invoiceNumber: 'INV-1079',
    type: 'TAX_INVOICE',
    customerId: 'cust-1',
    customerName: 'Rahul Sharma',
    customerPhone: '9876543210',
    customerAddress: 'Flat 402, Sunshine Heights, Wakad, Pune',
    customerGstin: '27AAAAA0000A1Z5',
    subtotal: 1450,
    taxAmount: 261,
    totalAmount: 1711,
    paidAmount: 1711,
    balanceAmount: 0,
    status: 'PAID',
    paymentMethod: 'ONLINE',
    createdAt: '2026-03-15T10:00:00Z',
    serviceId: 'srv-88',
    jobCardId: 'jc-99',
    template: 'REVAMP',
    notes: 'AC servicing and filter replacement',
    items: [
      {
        id: 'item-1',
        description: 'Sediment & Carbon Filter 10 inch',
        quantity: 1,
        unitPrice: 450,
        amount: 450,
        itemType: 'SPARE_PART',
      },
      {
        id: 'item-2',
        description: 'RO Membrane 75 GPD',
        quantity: 1,
        unitPrice: 500,
        amount: 500,
        itemType: 'SPARE_PART',
      },
      {
        id: 'item-3',
        description: 'Service / Labor Charge',
        quantity: 1,
        unitPrice: 500,
        amount: 500,
        itemType: 'SERVICE',
      },
    ],
  };

  it('renders Revamp header branding, address and mobile number accurately', () => {
    render(<RevampInvoiceView invoice={mockInvoice} />);

    expect(screen.getByText('Revamp')).toBeInTheDocument();
    expect(screen.getByText(/Home Appliance Repair Service/i)).toBeInTheDocument();
    expect(screen.getByText(/Your satisfaction is our/i)).toBeInTheDocument();
    expect(screen.getByText('Priority')).toBeInTheDocument();
    expect(screen.getByText(/Akshara International School Road/i)).toBeInTheDocument();
    expect(screen.getByText(/9881647076/)).toBeInTheDocument();
  });

  it('renders Invoice title, customer details box and invoice metadata', () => {
    render(<RevampInvoiceView invoice={mockInvoice} />);

    // Header title
    expect(screen.getByRole('heading', { name: 'Invoice', level: 1 })).toBeInTheDocument();

    // Customer details
    expect(screen.getByText('Customer Name :')).toBeInTheDocument();
    expect(screen.getByText('Rahul Sharma')).toBeInTheDocument();
    expect(screen.getByText('Address :')).toBeInTheDocument();
    expect(screen.getByText(/Flat 402, Sunshine Heights/i)).toBeInTheDocument();
    expect(screen.getByText('GSTIN :')).toBeInTheDocument();
    expect(screen.getByText('27AAAAA0000A1Z5')).toBeInTheDocument();

    // Metadata
    expect(screen.getByText(/Invoice no -/)).toBeInTheDocument();
    expect(screen.getByText('INV-1079')).toBeInTheDocument();
    expect(screen.getByText(/Date :-/)).toBeInTheDocument();
  });

  it('renders line items table with particulars, quantities, rates and amounts', () => {
    render(<RevampInvoiceView invoice={mockInvoice} />);

    expect(screen.getByText(/Sr\./i)).toBeInTheDocument();
    expect(screen.getByText('PARTICULARS')).toBeInTheDocument();
    expect(screen.getByText('Qty.')).toBeInTheDocument();
    expect(screen.getByText('Rate')).toBeInTheDocument();
    expect(screen.getByText('Amount')).toBeInTheDocument();

    expect(screen.getByText('Sediment & Carbon Filter 10 inch')).toBeInTheDocument();
    expect(screen.getByText('RO Membrane 75 GPD')).toBeInTheDocument();
    expect(screen.getByText('Service / Labor Charge')).toBeInTheDocument();
  });

  it('renders amount in words, total row, and signatures', () => {
    render(<RevampInvoiceView invoice={mockInvoice} />);

    expect(screen.getByText('Rs.')).toBeInTheDocument();
    expect(screen.getByText('Only')).toBeInTheDocument();
    expect(screen.getByText('TOTAL')).toBeInTheDocument();
    expect(screen.getByText('/-')).toBeInTheDocument();
    expect(screen.getByText('Customer Signature :-')).toBeInTheDocument();
    expect(screen.getByText('For Revamp Services')).toBeInTheDocument();
    expect(screen.getByText('Proprietor')).toBeInTheDocument();
  });

  it('displays payment method and status badge', () => {
    render(<RevampInvoiceView invoice={mockInvoice} />);

    expect(screen.getByText(/Payment Method:/i)).toBeInTheDocument();
    expect(screen.getByText('ONLINE')).toBeInTheDocument();
    expect(screen.getByText('PAID')).toBeInTheDocument();
  });
});
