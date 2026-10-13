import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sendInvoiceViaWhatsApp,
  normalizeWhatsAppPhone,
  requestGoogleReviewViaWhatsApp,
  buildGoogleReviewWhatsAppUrl,
  GOOGLE_REVIEW_URL,
  GOOGLE_REVIEW_DEFAULT_MESSAGE,
} from './whatsapp';

describe('WhatsApp Invoice Sharing Utility', () => {
  beforeEach(() => {
    vi.stubGlobal('open', vi.fn());
  });

  it('rejects sharing when customer phone number is missing', () => {
    const res = sendInvoiceViaWhatsApp({
      phone: '',
      orderNumber: 'ORD-001',
      invoiceNumber: 'INV-2026-0001',
    });

    expect(res.success).toBe(false);
    expect(res.error).toBe('Customer phone number is missing.');
  });

  it('always starts greeting with "Hello Customer" and does not include personalized customer name (Customer 1: Rahul Sharma)', () => {
    const res = sendInvoiceViaWhatsApp({
      phone: '9876543210',
      orderNumber: 'SO-001',
      invoiceNumber: 'INV-2026-0001',
      invoiceId: 'inv-uuid-1234',
      customerName: 'Rahul Sharma',
      totalAmount: 18500,
      balanceAmount: 5000,
      companyName: 'SR Enterprises',
    });

    expect(res.success).toBe(true);
    expect(res.url).toBeDefined();
    expect(res.url).toContain('wa.me/919876543210');

    const decoded = decodeURIComponent(res.url || '');
    expect(decoded.startsWith('https://wa.me/919876543210?text=Hello Customer')).toBe(true);
    expect(decoded).toContain('Hello Customer,');
    expect(decoded).not.toContain('Rahul Sharma');
    expect(decoded).not.toContain('Rahul');
    expect(decoded).toContain('Thanks for choosing SR Enterprises.');
    expect(decoded).toContain('Here is your invoice for order SO-001,');
    expect(decoded).toContain('Invoice No: INV-2026-0001');
    expect(decoded).toContain('Total Amount: ₹ 18,500');
    expect(decoded).toContain('Balance Due: ₹ 5,000');
    expect(decoded).toContain('/invoice/view/inv-uuid-1234');
  });

  it('always starts greeting with "Hello Customer" and does not include personalized customer name (Customer 2: Priya Patil)', () => {
    const res = sendInvoiceViaWhatsApp({
      phone: '+91 98200 11223',
      orderNumber: 'SO-002',
      invoiceNumber: 'INV-2026-0002',
      invoiceId: 'inv-uuid-5678',
      customerName: 'Priya Patil',
      totalAmount: 24000,
      balanceAmount: 0,
      companyName: 'SR Enterprises',
    });

    expect(res.success).toBe(true);
    expect(res.url).toBeDefined();
    expect(res.url).toContain('wa.me/919820011223');

    const decoded = decodeURIComponent(res.url || '');
    expect(decoded.startsWith('https://wa.me/919820011223?text=Hello Customer')).toBe(true);
    expect(decoded).toContain('Hello Customer,');
    expect(decoded).not.toContain('Priya Patil');
    expect(decoded).not.toContain('Priya');
    expect(decoded).toContain('Thanks for choosing SR Enterprises.');
    expect(decoded).toContain('Here is your invoice for order SO-002,');
    expect(decoded).toContain('Invoice No: INV-2026-0002');
    expect(decoded).toContain('Total Amount: ₹ 24,000');
    expect(decoded).toContain('/invoice/view/inv-uuid-5678');
  });

  it('uses custom publicUrl if provided and maintains Hello Customer greeting', () => {
    const res = sendInvoiceViaWhatsApp({
      phone: '+91 98765 43210',
      orderNumber: 'SO-003',
      invoiceNumber: 'INV-2026-0003',
      customerName: 'Amit Sharma',
      publicUrl: 'https://crm.srenterprises.com/invoice/view/INV-2026-0003',
    });

    expect(res.success).toBe(true);
    const decoded = decodeURIComponent(res.url || '');
    expect(decoded).toContain('Hello Customer,');
    expect(decoded).not.toContain('Amit Sharma');
    expect(decoded).toContain('https://crm.srenterprises.com/invoice/view/INV-2026-0003');
  });
});

describe('WhatsApp Phone Number Normalization Utility', () => {
  it('returns null for missing, empty, or whitespace-only phone numbers', () => {
    expect(normalizeWhatsAppPhone('')).toBeNull();
    expect(normalizeWhatsAppPhone('   ')).toBeNull();
    expect(normalizeWhatsAppPhone(null)).toBeNull();
    expect(normalizeWhatsAppPhone(undefined)).toBeNull();
  });

  it('returns null for numbers with fewer than 10 digits', () => {
    expect(normalizeWhatsAppPhone('12345')).toBeNull();
    expect(normalizeWhatsAppPhone('98200')).toBeNull();
    expect(normalizeWhatsAppPhone('abc-def')).toBeNull();
  });

  it('correctly normalizes 10-digit Indian numbers by prefixing 91', () => {
    expect(normalizeWhatsAppPhone('9820011223')).toBe('919820011223');
    expect(normalizeWhatsAppPhone('9021653893')).toBe('919021653893');
  });

  it('correctly normalizes 11-digit numbers with leading zero', () => {
    expect(normalizeWhatsAppPhone('09820011223')).toBe('919820011223');
  });

  it('correctly handles 13-digit numbers with 091 prefix', () => {
    expect(normalizeWhatsAppPhone('0919820011223')).toBe('919820011223');
  });

  it('preserves numbers that already have the 91 country code without duplication', () => {
    expect(normalizeWhatsAppPhone('919820011223')).toBe('919820011223');
  });

  it('strips non-numeric characters (spaces, dashes, plus sign, parens)', () => {
    expect(normalizeWhatsAppPhone('+91 98200 11223')).toBe('919820011223');
    expect(normalizeWhatsAppPhone('+91-90216-53893')).toBe('919021653893');
    expect(normalizeWhatsAppPhone('(098) 200-11223')).toBe('919820011223');
  });

  it('safely retains valid international numbers without guessing invalid prefixes', () => {
    expect(normalizeWhatsAppPhone('+1 415 555 2671')).toBe('14155552671');
    expect(normalizeWhatsAppPhone('+44 7911 123456')).toBe('447911123456');
  });

  it('returns null for numbers exceeding 15 digits', () => {
    expect(normalizeWhatsAppPhone('12345678901234567')).toBeNull();
  });
});

describe('Google Review WhatsApp Request Utility', () => {
  beforeEach(() => {
    vi.stubGlobal('open', vi.fn());
  });

  it('contains the authoritative Google Review URL and polite message format', () => {
    expect(GOOGLE_REVIEW_URL).toBe('https://g.page/r/CVKBWHq37pD_EBE/review');
    expect(GOOGLE_REVIEW_DEFAULT_MESSAGE).toContain(GOOGLE_REVIEW_URL);
    expect(GOOGLE_REVIEW_DEFAULT_MESSAGE).toContain('Thank you for choosing Revamp for your service.');
    expect(GOOGLE_REVIEW_DEFAULT_MESSAGE).toContain('— Revamp');
  });

  it('rejects Google Review request when phone number is missing', () => {
    const res = requestGoogleReviewViaWhatsApp({ phone: '' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Customer phone number is missing or invalid/i);
    expect(window.open).not.toHaveBeenCalled();
  });

  it('rejects Google Review request when phone number is invalid (too short)', () => {
    const res = requestGoogleReviewViaWhatsApp({ phone: '12345' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Customer phone number is missing or invalid/i);
    expect(window.open).not.toHaveBeenCalled();
  });

  it('successfully generates encoded WhatsApp URL and opens WhatsApp in new tab for valid 10-digit phone', () => {
    const res = requestGoogleReviewViaWhatsApp({ phone: '9820011223' });
    expect(res.success).toBe(true);
    expect(res.url).toBeDefined();
    expect(res.url).toContain('wa.me/919820011223');

    const decoded = decodeURIComponent(res.url || '');
    expect(decoded).toContain('https://wa.me/919820011223?text=');
    expect(decoded).toContain(GOOGLE_REVIEW_URL);
    expect(decoded).toContain('Thank you for choosing Revamp for your service. 😊');
    expect(decoded).toContain('— Revamp');

    expect(window.open).toHaveBeenCalledWith(res.url, '_blank', 'noopener,noreferrer');
  });

  it('successfully formats prefilled URL for formatted Indian phone (+91 98200 11223)', () => {
    const res = requestGoogleReviewViaWhatsApp({ phone: '+91 98200 11223' });
    expect(res.success).toBe(true);
    expect(res.url).toContain('wa.me/919820011223');
    expect(window.open).toHaveBeenCalled();
  });

  it('supports custom message if specified while preserving Google Review link', () => {
    const customMsg = `Special review link: ${GOOGLE_REVIEW_URL}`;
    const res = buildGoogleReviewWhatsAppUrl({
      phone: '9820011223',
      message: customMsg,
    });
    expect(res.success).toBe(true);
    const decoded = decodeURIComponent(res.url || '');
    expect(decoded).toContain(customMsg);
  });

  it('does not call window.open when autoOpen is false', () => {
    const res = requestGoogleReviewViaWhatsApp({
      phone: '9820011223',
      autoOpen: false,
    });
    expect(res.success).toBe(true);
    expect(window.open).not.toHaveBeenCalled();
  });
});

