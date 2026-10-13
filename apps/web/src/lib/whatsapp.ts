/**
 * Utility to generate and trigger direct WhatsApp Web / Mobile chat with customers
 */
export interface SendInvoiceWhatsAppParams {
  phone?: string | null;
  orderNumber?: string;
  invoiceNumber?: string;
  invoiceId?: string;
  customerName?: string;
  totalAmount?: string | number | null;
  paidAmount?: string | number | null;
  balanceAmount?: string | number | null;
  publicUrl?: string;
  companyName?: string;
}

export function sendInvoiceViaWhatsApp({
  phone,
  orderNumber,
  invoiceNumber,
  invoiceId,
  customerName,
  totalAmount,
  balanceAmount,
  publicUrl,
  companyName,
}: SendInvoiceWhatsAppParams): { success: boolean; url?: string; error?: string } {
  if (!phone || !phone.trim()) {
    return { success: false, error: 'Customer phone number is missing.' };
  }

  // Remove non-digit characters
  let cleanPhone = phone.replace(/[^0-9]/g, '');
  if (cleanPhone.length === 10) {
    cleanPhone = `91${cleanPhone}`;
  }

  const orderId = orderNumber || invoiceNumber || 'Order';
  const invNumber = invoiceNumber || orderNumber || 'Invoice';
  const invoiceKey = invoiceId || invoiceNumber || orderNumber || '';
  const company = companyName?.trim() || 'Enterprises CRM';

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const viewUrl = publicUrl || (origin && invoiceKey ? `${origin}/invoice/view/${encodeURIComponent(invoiceKey)}` : '');

  let message = `Hello Customer,\nThanks for choosing ${company}. Here is your invoice for order ${orderId},\nInvoice No: ${invNumber}`;

  if (totalAmount && Number(totalAmount) > 0) {
    message += `\nTotal Amount: ₹ ${Number(totalAmount).toLocaleString('en-IN')}`;
  }

  if (balanceAmount && Number(balanceAmount) > 0) {
    message += `\nBalance Due: ₹ ${Number(balanceAmount).toLocaleString('en-IN')}`;
  }

  if (viewUrl) {
    message += `\n\nView and download your official invoice online:\n${viewUrl}`;
  }

  const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;

  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return { success: true, url };
}

/**
 * Normalizes a phone number safely for WhatsApp international click-to-chat format (wa.me/<digits>).
 * Strips formatting, handles 10-digit Indian numbers and leading zero prefixes,
 * and ensures numbers are between 10 and 15 digits.
 * Returns null if the phone is missing, invalid, or cannot be safely interpreted.
 */
export function normalizeWhatsAppPhone(phone?: string | null): string | null {
  if (!phone || typeof phone !== 'string') {
    return null;
  }

  const digits = phone.replace(/[^0-9]/g, '');
  if (!digits || digits.length < 10 || digits.length > 15) {
    return null;
  }

  // Handle leading 091 prefix (13 digits: 0919820011223 -> 919820011223)
  if (digits.length === 13 && digits.startsWith('091')) {
    return digits.substring(1);
  }

  // Handle leading 0 prefix for Indian 10-digit mobiles (11 digits: 09820011223 -> 919820011223)
  if (digits.length === 11 && digits.startsWith('0')) {
    return `91${digits.substring(1)}`;
  }

  // Handle 10-digit Indian number: prefix standard country code 91
  if (digits.length === 10) {
    return `91${digits}`;
  }

  // If already 12 digits starting with 91, keep as-is (919820011223)
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits;
  }

  // International format already containing country code (11 to 15 digits)
  return digits;
}

export const GOOGLE_REVIEW_URL = 'https://g.page/r/CVKBWHq37pD_EBE/review';

export const GOOGLE_REVIEW_DEFAULT_MESSAGE =
  'Hello! Thank you for choosing Revamp for your service. 😊 We hope your service experience was satisfactory. Please take a moment to share your valuable feedback on Google: https://g.page/r/CVKBWHq37pD_EBE/review Thank you for your support! — Revamp';

export interface RequestGoogleReviewWhatsAppParams {
  phone?: string | null;
  message?: string;
  autoOpen?: boolean;
}

export interface RequestGoogleReviewWhatsAppResult {
  success: boolean;
  url?: string;
  error?: string;
}

/**
 * Builds the WhatsApp click-to-chat URL for Google Review request.
 */
export function buildGoogleReviewWhatsAppUrl({
  phone,
  message = GOOGLE_REVIEW_DEFAULT_MESSAGE,
}: {
  phone?: string | null;
  message?: string;
}): { success: boolean; url?: string; error?: string } {
  const normalizedPhone = normalizeWhatsAppPhone(phone);
  if (!normalizedPhone) {
    return {
      success: false,
      error: 'Customer phone number is missing or invalid. Please ensure a valid mobile number is registered.',
    };
  }

  const encodedMessage = encodeURIComponent(message);
  const url = `https://wa.me/${normalizedPhone}?text=${encodedMessage}`;

  return { success: true, url };
}

/**
 * Opens WhatsApp Web/app in a new tab with prefilled Google Review request message for the customer.
 * Only opens the chat interface; does not automatically dispatch without user confirmation.
 */
export function requestGoogleReviewViaWhatsApp({
  phone,
  message = GOOGLE_REVIEW_DEFAULT_MESSAGE,
  autoOpen = true,
}: RequestGoogleReviewWhatsAppParams): RequestGoogleReviewWhatsAppResult {
  const buildResult = buildGoogleReviewWhatsAppUrl({ phone, message });
  if (!buildResult.success || !buildResult.url) {
    return buildResult;
  }

  if (autoOpen && typeof window !== 'undefined') {
    window.open(buildResult.url, '_blank', 'noopener,noreferrer');
  }

  return {
    success: true,
    url: buildResult.url,
  };
}

