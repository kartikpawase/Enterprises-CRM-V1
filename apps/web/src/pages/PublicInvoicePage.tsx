import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { apiClient } from '../lib/api-client';
import { cn } from '../lib/utils';
import { CRM_OFFICIAL_LOGO_B64, OFFICIAL_LOWER_SECTION_B64 } from '../assets/invoiceAssets';
import {
  Printer,
  Phone,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  CreditCard,
  Building2,
  QrCode,
} from 'lucide-react';
import { RevampInvoiceView } from '../components/invoices/RevampInvoiceView';

interface PublicInvoiceData {
  id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  customerGst?: string | null;
  invoiceDate: string;
  dueDate: string;
  poNumber?: string | null;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  totalAmount: string;
  paidAmount: string;
  outstandingAmount: string;
  status: 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  notes?: string | null;
  items?: Array<{
    id: string;
    nameSnapshot: string;
    quantity: number;
    unitPriceSnapshot: string;
    discountAmount: string;
    taxRatePercent: string;
    taxAmount: string;
    lineTotal: string;
  }>;
  addresses?: Array<{
    addressLine1: string;
    addressLine2?: string | null;
    city: string;
    state: string;
    postalCode: string;
    isDefault?: boolean;
  }>;
}

export const PublicInvoicePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<PublicInvoiceData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (!id) {
      setError('Invoice identifier is required.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    apiClient
      .get<PublicInvoiceData>(`/public/invoices/${encodeURIComponent(id)}`)
      .then((res: any) => {
        if (!isMounted) return;
        const data = res?.data?.data || res?.data || res;
        if (data && (data.invoiceNumber || data.id)) {
          setInvoice(data);
        } else {
          setError('Invoice record could not be found.');
        }
      })
      .catch((err: any) => {
        if (!isMounted) return;
        setError(err?.message || 'Invoice record could not be found. Please check your link or contact support.');
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [id]);

  const handlePrint = () => {
    window.print();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-2xl w-full space-y-4 animate-pulse">
          <div className="h-10 bg-slate-200 rounded-lg w-1/3 mx-auto" />
          <div className="h-64 bg-white rounded-2xl shadow-sm border border-slate-200" />
          <div className="h-32 bg-white rounded-2xl shadow-sm border border-slate-200" />
        </div>
        <p className="text-sm font-medium text-slate-500 mt-4">Loading your official invoice...</p>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl p-8 border border-slate-200 shadow-sm text-center">
          <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Invoice Not Found</h1>
          <p className="text-sm text-slate-600 mb-6 leading-relaxed">
            {error || 'The requested invoice could not be located. It may have been updated or removed.'}
          </p>
          <div className="pt-4 border-t border-slate-100 flex flex-col gap-2">
            <a
              href="tel:"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl shadow-xs transition-colors"
            >
              <Phone className="w-4 h-4" />
              Call Enterprises CRM
            </a>
            <Link
              to="/"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition-colors"
            >
              Return to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const customerName = (invoice.customerName || 'Valued Customer').toUpperCase();
  const customerPhone = invoice.customerPhone || 'N/A';
  const invoiceNo = invoice.invoiceNumber;
  const invoiceDate = new Date(invoice.invoiceDate).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const totalAmountNum = parseFloat(invoice.totalAmount || '0');
  const discountAmountNum = parseFloat(invoice.discountAmount || '0');
  const paidAmountNum = parseFloat(invoice.paidAmount || '0');
  const outstandingNum = parseFloat(invoice.outstandingAmount || '0');
  const isPaid = invoice.status === 'PAID' || outstandingNum <= 0.01;
  const isPartiallyPaid = invoice.status === 'PARTIALLY_PAID' || (paidAmountNum > 0 && outstandingNum > 0);

  const formattedTotalAmount = totalAmountNum.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const formattedReceivedAmount = paidAmountNum.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const formattedBalanceAmount = outstandingNum.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const formattedDiscountAmount = discountAmountNum.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const totalQty = invoice.items?.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0) || 1;
  const poNumber = invoice.poNumber || '';
  const noteText = invoice.notes ? String(invoice.notes).trim() : '';

  const biz = (invoice as any)?.businessDetails;
  const bizPhone = biz?.phone || '';

  return (
    <div className="min-h-screen bg-slate-100 py-6 sm:py-10 px-2 sm:px-4 text-slate-900 font-sans print:bg-white print:p-0">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Top Floating Action Bar (Hidden on Print) */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm p-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center border border-sky-200">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900 font-display">Official Tax Invoice</span>
                <span className="font-mono text-xs font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md border border-sky-200">
                  {invoiceNo}
                </span>
              </div>
              <p className="text-xs text-slate-500">Enterprises CRM • Commercial Invoice</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              type="button"
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              <Printer className="w-4 h-4" /> Print / Save PDF
            </button>
            {bizPhone ? (
              <a
                href={`tel:${bizPhone}`}
                className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 rounded-xl border border-slate-200 text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                <Phone className="w-4 h-4 text-slate-500" /> Help: {bizPhone}
              </a>
            ) : null}
          </div>
        </div>

        {/* Status Indicator Banner (Hidden on Print) */}
        <div
          className={cn(
            'p-4 rounded-2xl border shadow-xs flex items-center justify-between gap-3 print:hidden',
            isPaid
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : isPartiallyPaid
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-blue-50 border-blue-200 text-blue-900'
          )}
        >
          <div className="flex items-center gap-3">
            {isPaid ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
            ) : isPartiallyPaid ? (
              <CreditCard className="w-6 h-6 text-amber-600 shrink-0" />
            ) : (
              <Clock className="w-6 h-6 text-blue-600 shrink-0" />
            )}
            <div>
              <div className="text-sm font-extrabold flex items-center gap-2">
                <span>
                  {isPaid
                    ? 'Payment Status: Fully Paid'
                    : isPartiallyPaid
                    ? 'Payment Status: Partially Paid'
                    : 'Payment Status: Payment Due'}
                </span>
              </div>
              <p className="text-xs opacity-90 mt-0.5 font-medium">
                {isPaid
                  ? `All dues of ₹ ${formattedTotalAmount} have been cleared.`
                  : `Remaining balance: ₹ ${formattedBalanceAmount} (Total: ₹ ${formattedTotalAmount})`}
              </p>
            </div>
          </div>

          {!isPaid && (
            <div className="text-right shrink-0">
              <span className="text-2xs uppercase tracking-wider font-bold block opacity-80">Due Amount</span>
              <span className="text-base font-extrabold font-mono">₹ {formattedBalanceAmount}</span>
            </div>
          )}
        </div>

        {/* Revamp Invoice for Service/JobCard Invoices OR Enterprises CRM Printable Invoice */}
        {Boolean((invoice as any).serviceId || (invoice as any).jobCardId || (invoice as any).template === 'REVAMP') ? (
          <div className="overflow-x-auto pb-2 -mx-1 sm:mx-0 print:overflow-visible print:m-0 print:p-0">
            <RevampInvoiceView invoice={invoice as any} />
          </div>
        ) : (
          <div className="overflow-x-auto pb-2 -mx-1 sm:mx-0 print:overflow-visible print:m-0 print:p-0">
          <div
            id="printable-tax-invoice"
            className="bg-white p-4 md:p-8 rounded-2xl border border-slate-200 shadow-sm text-black font-sans space-y-2 printable-tax-invoice print:border-none print:shadow-none print:p-0 print:m-0 print:space-y-0 min-w-[650px] sm:min-w-0"
          >
          {/* Top INVOICE Label: Positioned Above Inner Invoice Rectangle */}
          <div className="mb-2 flex items-center justify-start">
            <span className="inline-block border border-black px-2.5 py-0.5 text-[9px] font-bold tracking-wider uppercase">
              TAX INVOICE / BILL OF SUPPLY
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
              {/* Row 1: Bill To & Invoice Meta Details */}
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

                {/* Meta Details: Invoice No, Invoice Date & PO Number */}
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

              {/* Row 2: Items Table (10 Slots) */}
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
                    const actualItems = invoice.items && invoice.items.length > 0
                      ? invoice.items
                      : [
                          {
                            id: 'default-item',
                            nameSnapshot: 'Standard Equipment Service / Maintenance',
                            quantity: 1,
                            unitPriceSnapshot: String(totalAmountNum),
                            lineTotal: String(totalAmountNum),
                          },
                        ];

                    return Array.from({ length: 10 }).map((_, slotIdx) => {
                      const item = actualItems[slotIdx];

                      if (item) {
                        const unitRate = parseFloat(String(item.unitPriceSnapshot || '0')).toLocaleString('en-IN', { maximumFractionDigits: 2 });
                        const lineAmt = parseFloat(String(item.lineTotal || '0')).toLocaleString('en-IN', { maximumFractionDigits: 2 });
                        return (
                          <tr key={item.id || slotIdx} className="h-6">
                            <td className="border-r border-black py-1 px-1 text-center align-top">{slotIdx + 1}</td>
                            <td className="border-r border-black py-1 px-2 text-left font-medium align-top">{item.nameSnapshot}</td>
                            <td className="border-r border-black py-1 px-1 text-center align-top">{item.quantity ?? 1} PCS</td>
                            <td className="border-r border-black py-1 px-2 text-right font-mono align-top">{unitRate}</td>
                            <td className="py-1 px-2 text-right font-mono font-medium align-top">{lineAmt}</td>
                          </tr>
                        );
                      }

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
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}

        {/* Footer Support Info (Hidden on Print) */}
        <div className="text-center py-4 text-xs text-slate-500 print:hidden space-y-1">
          <p>© {new Date().getFullYear()} Enterprises CRM. All rights reserved.</p>
          {(() => {
            const biz = (invoice as any)?.businessDetails;
            if (biz?.phone || biz?.email) {
              return (
                <p>
                  For any queries, please{' '}
                  {biz?.phone && <>call us at {biz.phone}</>}
                  {biz?.phone && biz?.email && <> or </>}
                  {biz?.email && <>email {biz.email}</>}
                </p>
              );
            }
            return null;
          })()}
        </div>
      </div>
    </div>
  );
};
