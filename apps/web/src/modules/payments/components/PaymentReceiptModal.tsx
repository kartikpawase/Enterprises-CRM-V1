import React from 'react';
import { Button } from '../../../components/ui/Button';
import { useInvoiceQuery } from '../../invoices/invoices.api';
import { usePublicSettingsQuery } from '../../settings/settings.api';
import { formatDate } from '../../../lib/formatters';
import type { PaymentItem } from '../payments.api';
import { OFFICIAL_LOWER_SECTION_B64, CRM_OFFICIAL_LOGO_B64 } from '../../../assets/invoiceAssets';
import { X, Printer } from 'lucide-react';

interface PaymentReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: PaymentItem | null;
}

export const PaymentReceiptModal: React.FC<PaymentReceiptModalProps> = ({
  isOpen,
  onClose,
  payment,
}) => {
  if (!isOpen || !payment) return null;

  const { data: invoice } = useInvoiceQuery(payment.invoiceId);
  const { data: publicSettings } = usePublicSettingsQuery();

  const handlePrint = () => {
    window.print();
  };

  // Business Details
  const biz = (invoice as any)?.businessDetails;
  const companyName = biz?.companyName || publicSettings?.businessName || 'ENTERPRISES CRM';
  const companyAddress = [biz?.addressLine1, biz?.city, biz?.state, biz?.pincode].filter(Boolean).join(', ');
  const companyPhone = biz?.phone || publicSettings?.phone || '';
  const companyEmail = biz?.email || publicSettings?.email || '';

  // Customer & Document Data
  const customerName = (invoice?.customerName || payment.customerName || 'Valued Customer').toUpperCase();
  const customerPhone = invoice?.customerPhone || payment.customerPhone || 'N/A';
  const invoiceNo = invoice?.invoiceNumber || payment.invoiceNumber || 'N/A';
  const rawInvoiceDate = invoice?.invoiceDate || payment.invoiceDate || payment.paymentDate;
  const invoiceDate = formatDate(rawInvoiceDate);
  const rawDueDate = invoice?.dueDate || payment.dueDate;
  const dueDate = formatDate(rawDueDate);

  // Financial Calculations
  const invoiceTotalNum = parseFloat(invoice?.totalAmount || payment.invoiceTotal || payment.amount || '0');
  const paymentAmountNum = parseFloat(payment.amount || '0');
  const paidTotalNum = invoice ? parseFloat(invoice.paidAmount || '0') : paymentAmountNum;
  const discountAmountNum = invoice ? parseFloat(invoice.discountAmount || '0') : 0;
  const outstandingNum = invoice
    ? parseFloat(invoice.outstandingAmount || '0')
    : Math.max(0, invoiceTotalNum - paidTotalNum);

  const formattedTotalAmount = invoiceTotalNum.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const formattedReceivedAmount = paidTotalNum.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const formattedBalanceAmount = outstandingNum.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const formattedDiscountAmount = discountAmountNum.toLocaleString('en-IN', { maximumFractionDigits: 2 });

  const isPaidInFull = (invoice?.status === 'PAID') || (payment.invoiceStatus === 'PAID') || outstandingNum <= 0.001;
  const hasOutstanding = !isPaidInFull && outstandingNum > 0.001;

  // Items
  const items = invoice?.items;
  const totalQty = items?.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0) || 1;

  // Notes
  const warrantyNotes = invoice?.notes || payment.notes || 'Standard Service Warranty Terms Apply';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-fast print:p-0 print:bg-transparent print:static">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden my-8 print:border-none print:shadow-none print:m-0 print:w-full print:max-w-none">
        
        {/* Modal Header Actions (Screen only) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 print:hidden">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>Official Payment Receipt</span>
              <span className="text-xs font-mono font-normal px-2 py-0.5 bg-slate-200 text-slate-700 rounded-md">
                {payment.paymentNumber}
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Verified financial receipt issued for customer collection
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={handlePrint}
              leftIcon={<Printer className="w-4 h-4" />}
              className="bg-slate-900 hover:bg-slate-800 text-white font-bold"
            >
              Print Receipt
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Official Receipt Paper Container */}
        <div className="p-6 overflow-y-auto bg-white print:p-0 print:overflow-visible print:m-0" id="printable-receipt">
          <div className="border-[1.5px] border-black p-4 text-black font-sans leading-tight text-[11px] bg-white">
            
            {/* Top Badges */}
            <div className="mb-2 flex items-center gap-1.5">
              <span className="inline-block border border-black px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase">
                BILL OF SUPPLY
              </span>
              <span className="inline-block border border-slate-500 px-1.5 py-0.5 text-[9px] text-slate-600 tracking-wider uppercase">
                ORIGINAL FOR RECIPIENT
              </span>
            </div>

            {/* Header: Logo & Company Name */}
            <div className="flex items-center justify-between mb-3 pb-2">
              <div className="w-16 shrink-0 flex items-center justify-center">
                <img
                  src={CRM_OFFICIAL_LOGO_B64}
                  alt="Enterprises CRM Logo"
                  className="w-14 h-14 object-contain select-none"
                />
              </div>

              <div className="text-center flex-1 px-2">
                <h1 className="text-xl font-extrabold tracking-wide uppercase text-black font-sans">
                  {companyName}
                </h1>
                {companyAddress ? (
                  <p className="text-[10px] text-slate-800 font-medium mt-0.5">
                    {companyAddress}
                  </p>
                ) : null}
                {(companyPhone || companyEmail) ? (
                  <p className="text-[11px] font-bold text-black mt-1">
                    {companyPhone ? <>Mobile: {companyPhone}&nbsp;&nbsp;&nbsp;&nbsp;</> : null}
                    {companyEmail ? <>Email: {companyEmail}</> : null}
                  </p>
                ) : null}
              </div>

              <div className="w-16 shrink-0" />
            </div>

            {/* Main Flat Grid Border Wrapper */}
            <div className="border-[1.5px] border-black">
              
              {/* Row 1: Bill To & Invoice Meta Details */}
              <div className="grid grid-cols-12 border-b-[1.5px] border-black">
                <div className="col-span-6 border-r-[1.5px] border-black p-2.5 bg-white">
                  <p className="text-[10px] font-bold uppercase text-black">BILL TO</p>
                  <p className="text-xs font-extrabold uppercase text-black mt-0.5">{customerName}</p>
                  <p className="text-[11px] font-medium text-black mt-1">Mobile: {customerPhone}</p>
                </div>

                <div className={`col-span-6 grid ${hasOutstanding ? 'grid-cols-3' : 'grid-cols-2'} text-center bg-white`}>
                  <div className="border-r border-black p-2 flex flex-col justify-center items-center">
                    <span className="text-[10px] font-bold text-black">Invoice No.</span>
                    <span className="text-[11px] font-bold font-mono text-black mt-0.5">{invoiceNo}</span>
                  </div>
                  <div className={`p-2 flex flex-col justify-center items-center ${hasOutstanding ? 'border-r border-black' : ''}`}>
                    <span className="text-[10px] font-bold text-black">Invoice Date</span>
                    <span className="text-[11px] font-bold text-black mt-0.5">{invoiceDate}</span>
                  </div>
                  {hasOutstanding && (
                    <div className="p-2 flex flex-col justify-center items-center">
                      <span className="text-[10px] font-bold text-black">Due Date</span>
                      <span className="text-[11px] font-bold text-black mt-0.5">{dueDate}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Row 2: Items Table */}
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
                  {items ? (
                    items.map((item, idx) => {
                      const unitRate = parseFloat(item.unitPriceSnapshot || '0').toLocaleString('en-IN', { maximumFractionDigits: 2 });
                      const lineAmt = parseFloat(item.lineTotal || '0').toLocaleString('en-IN', { maximumFractionDigits: 2 });
                      return (
                        <tr key={item.id || idx}>
                          <td className="border-r border-black py-1 px-1 text-center align-top">{idx + 1}</td>
                          <td className="border-r border-black py-1 px-2 text-left font-medium align-top">{item.nameSnapshot}</td>
                          <td className="border-r border-black py-1 px-1 text-center align-top">{item.quantity} PCS</td>
                          <td className="border-r border-black py-1 px-2 text-right font-mono align-top">{unitRate}</td>
                          <td className="py-1 px-2 text-right font-mono font-medium align-top">{lineAmt}</td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td className="border-r border-black py-1 px-1 text-center align-top">1</td>
                      <td className="border-r border-black py-1 px-2 text-left font-medium align-top">25LPH Ro Plant With 18L Tank</td>
                      <td className="border-r border-black py-1 px-1 text-center align-top">1 PCS</td>
                      <td className="border-r border-black py-1 px-2 text-right font-mono align-top">{formattedTotalAmount}</td>
                      <td className="py-1 px-2 text-right font-mono font-medium align-top">{formattedTotalAmount}</td>
                    </tr>
                  )}

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

              {/* Row 4: Notes */}
              <div className="p-2 border-b-[1.5px] border-black bg-white text-[10.5px]">
                <strong>Notes:</strong>&nbsp;{warrantyNotes}
              </div>

              {/* PART B: Static Official Enterprises CRM Lower Section Image */}
              <div className="w-full bg-white leading-none">
                <img
                  src={OFFICIAL_LOWER_SECTION_B64}
                  alt="Official Enterprises CRM Bank, QR, Terms & Signatory"
                  className="w-full h-auto block select-none"
                />
              </div>

            </div>

          </div>
        </div>
      </div>
    </div>
  );
};
