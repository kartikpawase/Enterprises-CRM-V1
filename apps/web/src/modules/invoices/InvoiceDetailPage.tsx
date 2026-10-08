import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { useInvoiceQuery, useCancelInvoiceMutation, useSendInvoiceDueMailMutation } from './invoices.api';
import { useInvoicePayments, type PaymentItem } from '../payments/payments.api';
import { RecordPaymentModal } from '../payments/components/RecordPaymentModal';
import { PaymentReceiptModal } from '../payments/components/PaymentReceiptModal';
import { useToast } from '../../providers/ToastProvider';
import { useAuth } from '../../providers/AuthBoundary';
import { formatINR, formatDate } from '../../lib/formatters';
import { cn } from '../../lib/utils';
import { sendInvoiceViaWhatsApp } from '../../lib/whatsapp';
import { OFFICIAL_LOWER_SECTION_B64, CRM_OFFICIAL_LOGO_B64 } from '../../assets/invoiceAssets';
import { RevampInvoiceView } from '../../components/invoices/RevampInvoiceView';
import {
  Printer,
  ArrowLeft,
  XCircle,
  AlertTriangle,
  CreditCard,
  Receipt,
  Plus,
  MessageCircle,
  Mail,
  Edit,
} from 'lucide-react';
import { InvoiceFormModal } from './components/InvoiceFormModal';

export const InvoiceDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { hasPermission } = useAuth();

  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [receiptTarget, setReceiptTarget] = useState<PaymentItem | null>(null);

  const { data: invoice, isLoading } = useInvoiceQuery(id);
  const { data: invoicePayments } = useInvoicePayments(id || '');
  const cancelMutation = useCancelInvoiceMutation();
  const sendDueMailMutation = useSendInvoiceDueMailMutation();
  const canCancel = hasPermission('invoices.cancel');
  const canRecordPayment = hasPermission('payments.create');

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-pulse py-8">
        <div className="h-8 bg-slate-200 rounded w-1/3"></div>
        <div className="h-96 bg-slate-100 rounded-xl"></div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="max-w-xl mx-auto text-center py-16">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-800">Invoice Not Found</h2>
        <p className="text-sm text-slate-500 mt-1 mb-4">
          The requested invoice record could not be found.
        </p>
        <Button variant="outline" onClick={() => navigate('/invoices')} leftIcon={<ArrowLeft className="w-4 h-4" />}>
          Return to Invoices
        </Button>
      </div>
    );
  }

  const handlePrint = () => {
    window.print();
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) {
      toast.error('Please provide a cancellation reason.', 'Reason Required');
      return;
    }

    try {
      await cancelMutation.mutateAsync({ id: invoice.id, data: { reason: cancelReason } });
      toast.success(
        `Invoice ${invoice.invoiceNumber} has been cancelled.`,
        'Invoice Cancelled'
      );
      setIsCancelModalOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Unable to cancel invoice.', 'Cancellation Failed');
    }
  };

  const handleWhatsAppShare = () => {
    if (!invoice.customerPhone) {
      toast.error('Customer phone number is not available.', 'Phone Missing');
      return;
    }

    const res = sendInvoiceViaWhatsApp({
      phone: invoice.customerPhone,
      orderNumber: (invoice as any).saleNumber || invoice.invoiceNumber,
      invoiceNumber: invoice.invoiceNumber,
      invoiceId: invoice.id,
      customerName: invoice.customerName,
      totalAmount: invoice.totalAmount,
      paidAmount: invoice.paidAmount,
      balanceAmount: invoice.outstandingAmount,
    });

    if (res.success) {
      toast.success(
        `Opening WhatsApp chat with ${invoice.customerName} (${invoice.customerPhone})...`,
        'WhatsApp Invoice Sent'
      );
    } else {
      toast.error(res.error || 'Failed to open WhatsApp.', 'WhatsApp Error');
    }
  };

  const handleSendEmail = async () => {
    if (!invoice.customerEmail || !invoice.customerEmail.includes('@')) {
      toast.error(
        `Customer ${invoice.customerName} has no valid email address in the database.`,
        'Email Missing'
      );
      return;
    }

    try {
      const res: any = await sendDueMailMutation.mutateAsync(invoice.id);
      if (!res || res.success === false || res.data?.success === false) {
        toast.error(
          res?.data?.message || res?.message || 'Unable to send email reminder. Please verify SMTP configuration.',
          'Email Dispatch Failed'
        );
      } else {
        toast.success(
          `Payment reminder email sent successfully to ${invoice.customerEmail} via PHPMailer.`,
          'Email Sent'
        );
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to dispatch email. Please check SMTP configuration.', 'Email Error');
    }
  };

  const statusVariantMap: Record<string, any> = {
    ISSUED: 'warning',
    PAID: 'active',
    PARTIALLY_PAID: 'warning',
    OVERDUE: 'inactive',
    CANCELLED: 'archived',
  };

  const defaultAddress = invoice.addresses?.find((a) => a.isDefault) || invoice.addresses?.[0];

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16 print:space-y-0 print:max-w-none print:m-0 print:p-0 print:pb-0">
      {/* Top Action Bar (Hidden during Print) */}
      <div className="print:hidden">
        <PageHeader
          title={`Invoice: ${invoice.invoiceNumber}`}
          description={`Issued on ${new Date(invoice.invoiceDate).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}`}
          breadcrumbs={[
            { label: 'Home', href: '/dashboard' },
            { label: 'Invoices', href: '/invoices' },
            { label: invoice.invoiceNumber },
          ]}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => navigate('/invoices')} leftIcon={<ArrowLeft className="w-4 h-4" />}>
                Back
              </Button>
              {invoice.customerPhone && (
                <Button
                  variant="primary"
                  onClick={handleWhatsAppShare}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                  leftIcon={<MessageCircle className="w-4 h-4" />}
                >
                  Send via WhatsApp
                </Button>
              )}
              {invoice.status !== 'CANCELLED' && (
                <Button
                  variant="outline"
                  onClick={handleSendEmail}
                  disabled={sendDueMailMutation.isPending}
                  className="hover:bg-slate-50 text-slate-700 font-semibold"
                  leftIcon={<Mail className="w-4 h-4 text-indigo-600" />}
                >
                  {sendDueMailMutation.isPending ? 'Sending Email...' : 'Send Email'}
                </Button>
              )}
              {invoice.status !== 'CANCELLED' && invoice.status !== 'PAID' && canRecordPayment && (
                <Button
                  variant="primary"
                  onClick={() => setIsRecordPaymentOpen(true)}
                  leftIcon={<CreditCard className="w-4 h-4" />}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Record Payment
                </Button>
              )}
              {invoice.status !== 'CANCELLED' && (
                <Button
                  variant="outline"
                  onClick={() => setIsEditModalOpen(true)}
                  leftIcon={<Edit className="w-4 h-4 text-blue-600" />}
                >
                  Edit Invoice
                </Button>
              )}
              <Button variant="outline" onClick={handlePrint} leftIcon={<Printer className="w-4 h-4" />}>
                Print Invoice
              </Button>
              {invoice.status !== 'CANCELLED' && canCancel && (
                <Button
                  variant="outline"
                  onClick={() => setIsCancelModalOpen(true)}
                  leftIcon={<XCircle className="w-4 h-4 text-red-500" />}
                >
                  Cancel
                </Button>
              )}
            </div>
          }
        />
      </div>

      {/* Cancellation Banner */}
      {invoice.status === 'CANCELLED' && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-start gap-3 print:hidden">
          <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-bold">This Tax Invoice has been Voided / Cancelled</div>
            <div className="text-xs text-red-600 mt-0.5">
              Reason: {invoice.cancelReason || 'No reason specified'} • Cancelled at:{' '}
              {invoice.cancelledAt ? new Date(invoice.cancelledAt).toLocaleString('en-IN') : 'N/A'}
            </div>
          </div>
        </div>
      )}

      {/* Partially Paid & Next Payment Due Date Banner */}
      {invoice.status === 'PARTIALLY_PAID' && (
        <div className="p-4 bg-amber-50 border border-amber-200/90 rounded-xl text-amber-900 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-sm text-amber-950 flex items-center gap-2">
                <span>Partially Paid Invoice</span>
                <span className="px-2 py-0.5 bg-amber-200/60 text-amber-900 rounded font-semibold text-2xs uppercase">
                  Remaining Balance: {formatINR(parseFloat(invoice.outstandingAmount))}
                </span>
              </div>
              <div className="text-amber-800 text-xs mt-0.5 font-medium">
                Next Payment Due Date:{' '}
                <strong className="text-slate-900 font-semibold underline">
                  {new Date(invoice.dueDate).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </strong>
              </div>
            </div>
          </div>

          {canRecordPayment && (
            <Button
              size="sm"
              onClick={() => setIsRecordPaymentOpen(true)}
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
            >
              Record Next Payment
            </Button>
          )}
        </div>
      )}
      {/* Revamp Invoice for Service/JobCard Invoices OR Standard Invoices */}
      {Boolean(invoice.serviceId || invoice.jobCardId || (invoice as any).template === 'REVAMP') ? (
        <div className="overflow-x-auto pb-2 -mx-1 sm:mx-0 print:overflow-visible print:m-0 print:p-0">
          <RevampInvoiceView invoice={invoice as any} />
        </div>
      ) : (
        /* Printable Tax Invoice / Bill of Supply */
        (() => {
          const customerName = (invoice.customerName || 'Valued Customer').toUpperCase();
        const customerPhone = invoice.customerPhone || 'N/A';
        const invoiceNo = invoice.invoiceNumber || 'N/A';
        const invoiceDate = new Date(invoice.invoiceDate).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
        const dueDate = new Date(invoice.dueDate).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });

        const totalAmountNum = parseFloat(invoice.totalAmount || '0');
        const discountAmountNum = parseFloat(invoice.discountAmount || '0');
        const paidAmountNum = parseFloat(invoice.paidAmount || '0');
        const outstandingNum = parseFloat(invoice.outstandingAmount || '0');
        const hasOutstanding = outstandingNum > 0.001 && invoice.status !== 'PAID';

        const formattedTotalAmount = totalAmountNum.toLocaleString('en-IN', { maximumFractionDigits: 2 });
        const formattedReceivedAmount = paidAmountNum.toLocaleString('en-IN', { maximumFractionDigits: 2 });
        const formattedBalanceAmount = outstandingNum.toLocaleString('en-IN', { maximumFractionDigits: 2 });
        const formattedDiscountAmount = discountAmountNum.toLocaleString('en-IN', { maximumFractionDigits: 2 });

        const totalQty = invoice.items?.reduce((sum: number, item: any) => sum + (Number(item.quantity) || 1), 0) || 1;
        const noteText = invoice.notes ? String(invoice.notes).trim() : '';

        const defaultAddress = invoice.addresses?.find((a) => a.isDefault) || invoice.addresses?.[0];
        const poNumber = invoice.poNumber || (invoice as any).po_number || '';

        return (
          <div className="overflow-x-auto pb-2 -mx-1 sm:mx-0 print:overflow-visible print:m-0 print:p-0">
            <div
              id="printable-tax-invoice"
              className={cn(
                "bg-white p-4 md:p-8 rounded-xl border border-slate-200 shadow-sm text-black font-sans space-y-2 printable-tax-invoice print:border-none print:shadow-none print:p-0 print:m-0 print:space-y-0 min-w-[650px] sm:min-w-0",
                receiptTarget && "print:hidden"
              )}
            >
            {/* Top INVOICE Label: Positioned Above Inner Invoice Rectangle (Left-Aligned) */}
            <div className="mb-2 flex items-center justify-start">
              <span className="inline-block border border-black px-2.5 py-0.5 text-[9px] font-bold tracking-wider uppercase">
                INVOICE
              </span>
            </div>

            <div className="border-[1.5px] border-black p-4 text-black font-sans leading-tight text-[11px] bg-white">
              {/* Header: Logo & Company Name */}
              <div className="flex items-center mb-3 pb-2">
                <div className="w-20 shrink-0 flex items-center justify-center">
                  <img
                    src={CRM_OFFICIAL_LOGO_B64}
                    alt="Enterprises CRM Logo"
                    className="w-20 h-20 object-contain select-none"
                  />
                </div>

                <div className="text-center flex-1 px-2">
                  <h1 className="text-xl font-extrabold tracking-wide uppercase text-black font-sans">
                    {(invoice as any)?.businessDetails?.companyName || 'Enterprises CRM'}
                  </h1>
                  {(() => {
                    const biz = (invoice as any)?.businessDetails;
                    const addr = [biz?.addressLine1, biz?.addressLine2, biz?.city, biz?.state, biz?.pincode]
                      .filter(Boolean)
                      .join(', ');
                    return (
                      <>
                        {addr && <p className="text-[10px] text-slate-800 font-medium mt-0.5">{addr}</p>}
                        {(biz?.phone || biz?.email) && (
                          <p className="text-[11px] font-bold text-black mt-1">
                            {biz?.phone && `Mobile: ${biz.phone}`}
                            {biz?.phone && biz?.email && ' \u00A0\u00A0\u00A0\u00A0 '}
                            {biz?.email && `Email: ${biz.email}`}
                          </p>
                        )}
                        {biz?.gstin && (
                          <p className="text-[10px] text-slate-800 font-medium mt-0.5">GSTIN: {biz.gstin}</p>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Main Flat Grid Border Wrapper */}
              <div className="border-[1.5px] border-black">
                {/* Row 1: Bill To & Invoice Meta Details (SUPPLY removed) */}
                <div className="grid grid-cols-12 border-b-[1.5px] border-black">
                  {/* BILL TO */}
                  <div className="col-span-7 border-r-[1.5px] border-black p-2.5 bg-white flex flex-col justify-center">
                    <p className="text-[10px] font-bold uppercase text-black">BILL TO</p>
                    <p className="text-xs font-extrabold uppercase text-black mt-0.5">{customerName}</p>
                    <p className="text-[11px] font-medium text-black mt-0.5">Mobile: {customerPhone}</p>
                    {invoice.customerGst && (
                      <p className="text-[10px] font-medium text-black mt-0.5">GSTIN: {invoice.customerGst}</p>
                    )}
                  </div>

                  {/* Meta Details: Invoice No, Invoice Date & PO Number (Due Date removed) */}
                  <div className="col-span-5 grid grid-cols-2 text-center bg-white">
                    <div className="border-r border-b border-black p-1.5 flex flex-col justify-center items-center">
                      <span className="text-[10px] font-bold text-black">Invoice No.</span>
                      <span className="text-[11px] font-bold font-mono text-black mt-0.5">{invoiceNo}</span>
                    </div>
                    <div className="border-b border-black p-1.5 flex flex-col justify-center items-center">
                      <span className="text-[10px] font-bold text-black">Invoice Date</span>
                      <span className="text-[11px] font-bold text-black mt-0.5">{invoiceDate}</span>
                    </div>
                    <div className="col-span-2 p-1.5 flex flex-col justify-center items-center min-h-[38px]">
                      <span className="text-[10px] font-bold text-black">PO Number</span>
                      <span className="text-[11px] font-bold font-mono text-black mt-0.5 min-h-[14px]">
                        {poNumber || ''}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Row 2: Items Table (10 Default Rows) */}
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-slate-200/70 border-b-[1.5px] border-black font-bold">
                      <th className="w-[10.2%] border-r border-black py-1.5 px-1 text-center font-bold text-black">S.NO.</th>
                      <th className="w-[46.5%] border-r border-black py-1.5 px-2 text-center font-bold text-black">ITEMS</th>
                      <th className="w-[13.0%] border-r border-black py-1.5 px-1 text-center font-bold text-black">QTY.</th>
                      <th className="w-[14.0%] border-r border-black py-1.5 px-2 text-center font-bold text-black">RATE</th>
                      <th className="w-[16.3%] py-1.5 px-2 text-center font-bold text-black">AMOUNT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const actualItems: Array<Partial<any>> = invoice.items && invoice.items.length > 0
                        ? invoice.items
                        : [
                            {
                              id: 'default-item',
                              nameSnapshot: '25LPH Ro Plant With 18L Tank',
                              quantity: 1,
                              unitPriceSnapshot: String(totalAmountNum || 16500),
                              lineTotal: String(totalAmountNum || 16500),
                            },
                          ];

                      return Array.from({ length: 10 }).map((_, slotIdx) => {
                        const item = actualItems[slotIdx];

                        if (item) {
                          const unitRate = parseFloat(String(item.unitPriceSnapshot || item.unitPrice || '0')).toLocaleString('en-IN', { maximumFractionDigits: 2 });
                          const lineAmt = parseFloat(String(item.lineTotal || '0')).toLocaleString('en-IN', { maximumFractionDigits: 2 });
                          return (
                            <tr key={item.id || slotIdx} className="h-6">
                              <td className="border-r border-black py-1 px-1 text-center align-top">{slotIdx + 1}</td>
                              <td className="border-r border-black py-1 px-2 text-left font-medium align-top">{item.nameSnapshot || item.name || ''}</td>
                              <td className="border-r border-black py-1 px-1 text-center align-top">{item.quantity ?? 1} PCS</td>
                              <td className="border-r border-black py-1 px-2 text-right font-mono align-top">{unitRate}</td>
                              <td className="py-1 px-2 text-right font-mono font-medium align-top">{lineAmt}</td>
                            </tr>
                          );
                        }

                        // Blank slot row to ensure exactly 10 slots
                        return (
                          <tr key={`blank-slot-${slotIdx}`} className="h-6">
                            <td className="border-r border-black py-1 px-1 text-center">&nbsp;</td>
                            <td className="border-r border-black py-1 px-2">&nbsp;</td>
                            <td className="border-r border-black py-1 px-1 text-center">&nbsp;</td>
                            <td className="border-r border-black py-1 px-2 text-right">&nbsp;</td>
                            <td className="py-1 px-2 text-right">&nbsp;</td>
                          </tr>
                        );
                      });
                    })()}

                    {/* Discount Row */}
                    {discountAmountNum > 0 && (
                      <tr>
                        <td className="border-r border-black py-1 px-1"></td>
                        <td className="border-r border-black py-1 px-2 text-right italic font-medium">Discount</td>
                        <td className="border-r border-black py-1 px-1 text-center">-</td>
                        <td className="border-r border-black py-1 px-2 text-center">-</td>
                        <td className="py-1 px-2 text-right font-mono text-black font-semibold">- ₹ {formattedDiscountAmount}</td>
                      </tr>
                    )}

                    {/* TOTAL Row */}
                    <tr className="bg-slate-200/70 border-t-[1.5px] border-b-[1.5px] border-black font-extrabold">
                      <td className="border-r border-black py-1.5 px-1"></td>
                      <td className="border-r border-black py-1.5 px-2 text-right uppercase text-black">TOTAL</td>
                      <td className="border-r border-black py-1.5 px-1 text-center text-black">{totalQty}</td>
                      <td className="border-r border-black py-1.5 px-2 text-center"></td>
                      <td className="py-1.5 px-2 text-right font-mono font-extrabold text-black">₹ {formattedTotalAmount}</td>
                    </tr>
                  </tbody>
                </table>

                {/* Row 3: Received Amount & Balance Amount */}
                <div className="grid grid-cols-12 border-b-[1.5px] border-black">
                  <div className="col-span-6 border-r-[1.5px] border-black p-2 font-bold text-xs flex items-center">
                    <span>Received Amount:&nbsp;</span>
                    <span className="font-mono text-black font-extrabold">₹ {formattedReceivedAmount}</span>
                  </div>
                  <div className="col-span-6 p-2 font-bold text-xs flex items-center">
                    <span>Balance Amount:&nbsp;</span>
                    <span className="font-mono text-black font-extrabold">₹ {formattedBalanceAmount}</span>
                  </div>
                </div>

                {/* Row 4: Dynamic Note */}
                <div className="p-2 border-b-[1.5px] border-black bg-white text-[10.5px] min-h-[26px]">
                  <strong>Notes:</strong>{noteText ? <>&nbsp;{noteText}</> : null}
                </div>

                {/* PART B: Official Enterprises CRM Lower Section (Bank Details, Payment QR, Terms & Signatory) */}
                <div className="w-full bg-white leading-none relative" data-testid="invoice-lower-section">
                  <img
                    src={OFFICIAL_LOWER_SECTION_B64}
                    alt="Official Enterprises CRM Bank, QR, Terms & Signatory"
                    className="w-full h-auto block select-none"
                  />
                  <div className="sr-only">
                    <div>Bank Details: Bank: State Bank of India, Name: Enterprises CRM, A/c No: 30998877665, IFSC: SBIN0001234, Branch: Main Branch, Pune</div>
                    <div>Payment QR Code: Scan &amp; Pay (UPI), UPI ID: enterprises.crm@upi</div>
                    <div>Terms and Conditions: 1) Goods once sold will not be taken back or exchanged, 2) Warranty as per manufacturer terms &amp; conditions, 3) Service charges applicable for out-of-warranty services, 4) Subject to local jurisdiction, 5) Payment due immediately or as per agreed terms</div>
                    <div>Authorised Signatory For ENTERPRISES CRM</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>
        );
      })())}

      {/* Payment History & Realized Collections Ledger (Screen Only) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4 print:hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Payment History & Collections</h3>
              <p className="text-xs text-slate-500">All realized customer collections applied to this tax invoice</p>
            </div>
          </div>
          {invoice.status !== 'CANCELLED' && invoice.status !== 'PAID' && canRecordPayment && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsRecordPaymentOpen(true)}
              leftIcon={<Plus className="w-3.5 h-3.5" />}
            >
              Record Payment
            </Button>
          )}
        </div>

        {(!invoicePayments || invoicePayments.length === 0) ? (
          <div className="p-6 text-center bg-slate-50 rounded-lg border border-slate-100 text-xs text-slate-500">
            No payments have been recorded for this invoice yet.
          </div>
        ) : (
          <div className="border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 text-left">Payment #</th>
                  <th className="py-2.5 px-3 text-left">Date</th>
                  <th className="py-2.5 px-3 text-left">Method</th>
                  <th className="py-2.5 px-3 text-left">Reference / Notes</th>
                  <th className="py-2.5 px-3 text-right">Amount</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoicePayments.map((p: any) => (
                  <tr key={p.id} className="hover:bg-slate-50/50">
                    <td className="py-2.5 px-3 font-mono font-semibold text-primary-700">{p.paymentNumber}</td>
                    <td className="py-2.5 px-3 text-slate-600">{formatDate(p.paymentDate)}</td>
                    <td className="py-2.5 px-3">
                      <span className="font-semibold text-[11px] text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                        {p.paymentMethod}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                      {p.referenceNumber && <span className="font-mono font-medium text-slate-700 block">Ref: {p.referenceNumber}</span>}
                      {p.notes && <span className="italic">{p.notes}</span>}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                      {formatINR(p.amount)}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        p.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        p.status === 'CANCELLED' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => setReceiptTarget({
                          ...p,
                          invoiceId: invoice.id,
                          invoiceNumber: invoice.invoiceNumber,
                          invoiceTotal: invoice.totalAmount,
                          invoiceStatus: invoice.status,
                          dueDate: invoice.dueDate,
                          customerId: invoice.customerId,
                          customerName: invoice.customerName,
                          customerPhone: invoice.customerPhone,
                          customerNumber: invoice.customerNumber,
                          createdAt: p.createdAt,
                          updatedAt: p.createdAt,
                        })}
                        className="inline-flex items-center gap-1 text-primary-600 hover:text-primary-800 font-semibold text-xs"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        Receipt
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Payment Modal */}
      <RecordPaymentModal
        isOpen={isRecordPaymentOpen}
        onClose={() => setIsRecordPaymentOpen(false)}
        initialInvoiceId={invoice.id}
      />

      {/* Payment Receipt Modal */}
      <PaymentReceiptModal
        isOpen={Boolean(receiptTarget)}
        onClose={() => setReceiptTarget(null)}
        payment={receiptTarget}
      />

      {/* Cancel Modal */}
      <Modal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        title="Cancel Tax Invoice"
      >
        <div className="space-y-4 text-sm">
          <p className="text-slate-600">
            Cancelling invoice <strong>{invoice.invoiceNumber}</strong> will void the tax document while preserving historical audit evidence.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Cancellation Reason <span className="text-red-500">*</span>
            </label>
            <Input
              placeholder="e.g. Billing address error, customer cancellation"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="outline" onClick={() => setIsCancelModalOpen(false)}>
              Keep Invoice
            </Button>
            <Button
              variant="destructive"
              isLoading={cancelMutation.isPending}
              onClick={handleCancel}
            >
              Confirm Void
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Invoice Modal */}
      {isEditModalOpen && (
        <InvoiceFormModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          initialInvoice={invoice}
        />
      )}
    </div>
  );
};
