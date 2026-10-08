import React from 'react';

export interface RevampInvoiceItem {
  id?: string;
  nameSnapshot?: string;
  name?: string;
  itemType?: string;
  quantity: number | string;
  unitPriceSnapshot?: number | string;
  unitPrice?: number | string;
  lineTotal?: number | string;
  total?: number | string;
  isWarrantyCovered?: boolean;
}

export interface RevampInvoiceData {
  id?: string;
  invoiceNumber: string;
  invoiceDate: string | Date;
  dueDate?: string | Date | null;
  customerName?: string | null;
  customerPhone?: string | null;
  customerAddress?: string | null;
  customerGst?: string | null;
  customerGstin?: string | null;
  addresses?: Array<{
    addressLine1?: string;
    city?: string;
    state?: string;
    pincode?: string;
    isDefault?: boolean;
  }>;
  items?: any[];
  subtotal?: number | string | null;
  taxAmount?: number | string | null;
  totalAmount?: number | string | null;
  paidAmount?: number | string | null;
  outstandingAmount?: number | string | null;
  balanceAmount?: number | string | null;
  status?: string | null;
  notes?: string | null;
  jobCardId?: string | null;
  serviceId?: string | null;
  paymentMethod?: string | null;
  template?: string | null;
}

interface RevampInvoiceViewProps {
  invoice: RevampInvoiceData;
  className?: string;
}

/**
 * Converts a number into Indian currency words representation
 */
export function numberToWordsIndian(amount: number): string {
  if (!amount || isNaN(amount) || amount <= 0) return 'Zero';
  
  const singleDigits = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertTwoDigits(n: number): string {
    if (n < 10) return singleDigits[n];
    if (n >= 10 && n < 20) return teens[n - 10];
    const ten = Math.floor(n / 10);
    const unit = n % 10;
    return `${tens[ten]}${unit ? ' ' + singleDigits[unit] : ''}`;
  }

  function convertThreeDigits(n: number): string {
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    let res = '';
    if (hundred > 0) {
      res += `${singleDigits[hundred]} Hundred`;
      if (rest > 0) res += ' ';
    }
    if (rest > 0) {
      res += convertTwoDigits(rest);
    }
    return res;
  }

  let num = Math.floor(amount);
  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  const remainder = num;

  const parts: string[] = [];
  if (crore > 0) parts.push(`${convertTwoDigits(crore)} Crore`);
  if (lakh > 0) parts.push(`${convertTwoDigits(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${convertTwoDigits(thousand)} Thousand`);
  if (remainder > 0) parts.push(convertThreeDigits(remainder));

  return parts.join(' ').trim() || 'Zero';
}

export const RevampInvoiceView: React.FC<RevampInvoiceViewProps> = ({ invoice, className = '' }) => {
  const customerName = invoice.customerName || 'Valued Customer';
  
  // Resolve address
  let address = invoice.customerAddress || '';
  if (!address && invoice.addresses && invoice.addresses.length > 0) {
    const def = invoice.addresses.find((a) => a.isDefault) || invoice.addresses[0];
    address = [def.addressLine1, def.city, def.state, def.pincode].filter(Boolean).join(', ');
  }
  if (!address) {
    address = 'Wakad, Pune, Maharashtra';
  }

  const invoiceNo = invoice.invoiceNumber || '1079';
  const invoiceDateStr = invoice.invoiceDate
    ? new Date(invoice.invoiceDate).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });

  const totalNum = parseFloat(String(invoice.totalAmount || 0));
  const totalFormatted = totalNum.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const amountWords = numberToWordsIndian(totalNum);

  const items = invoice.items && invoice.items.length > 0 ? invoice.items : [
    {
      nameSnapshot: 'Appliance Repair & Servicing',
      quantity: 1,
      unitPriceSnapshot: totalNum > 0 ? totalNum : 500,
      lineTotal: totalNum > 0 ? totalNum : 500,
    }
  ];

  // Minimum filler rows to achieve full-height bill format matching physical template
  const minRows = 8;
  const fillerCount = Math.max(0, minRows - items.length);

  return (
    <div
      className={`bg-white text-black p-6 md:p-10 rounded-xl border border-slate-300 shadow-sm font-sans mx-auto max-w-[850px] print:border-none print:shadow-none print:p-0 print:max-w-none print:m-0 ${className}`}
      id="printable-revamp-invoice"
    >
      {/* Header Row: Revamp Wordmark & Address Block */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4">
        {/* Left: Brand Identity */}
        <div className="shrink-0">
          <div className="text-4xl md:text-5xl font-black text-[#EA580C] tracking-tight leading-none">
            Revamp
          </div>
          <div className="mt-1">
            <span className="inline-block bg-[#0B3C7B] text-white font-bold text-xs md:text-sm px-2.5 py-0.5 rounded-xs tracking-wide">
              Home Appliance Repair Service
            </span>
          </div>
          <div className="text-xs md:text-sm font-bold text-[#0B3C7B] mt-1">
            Your satisfaction is our{' '}
            <span className="border-b-2 border-[#EA580C] pb-0.5">Priority</span>
          </div>
        </div>

        {/* Right: Authoritative Registered Business Address */}
        <div className="text-left text-xs md:text-[13px] text-black leading-relaxed max-w-[380px]">
          <div>Io Gate, Akshara International School Road, opposite Sukhwani Skylines,</div>
          <div>next to Pandurangbaug Washing Center, Wakad, Pune, Pimpri-Chinchwad,</div>
          <div>Maharashtra 411057</div>
          <div className="mt-2 font-bold text-sm md:text-base">
            Mob No : 9881647076
          </div>
        </div>
      </div>

      {/* Invoice Title */}
      <h1 className="text-center font-serif text-2xl md:text-3xl font-bold my-4 md:my-5 tracking-wide text-black">
        Invoice
      </h1>

      {/* Customer & Invoice Metadata Box */}
      <div className="border-[1.5px] border-black grid grid-cols-1 sm:grid-cols-12 mb-3 text-xs md:text-sm leading-relaxed">
        {/* Customer Details */}
        <div className="sm:col-span-8 p-3 sm:border-r-[1.5px] border-black space-y-1">
          <div>
            <span className="font-bold">Customer Name : </span>
            <span className="font-medium">{customerName}</span>
          </div>
          <div>
            <span className="font-bold">Address : </span>
            <span className="font-medium">{address}</span>
          </div>
          <div>
            <span className="font-bold">GSTIN : </span>
            <span className="font-medium">{invoice.customerGst || (invoice as any).customerGstin || ''}</span>
          </div>
        </div>

        {/* Invoice Number & Date */}
        <div className="sm:col-span-4 flex flex-col justify-between border-t-[1.5px] sm:border-t-0 border-black">
          <div className="p-3 border-b-[1.5px] border-black">
            <span className="font-bold">Invoice no - </span>
            <span className="font-semibold">{invoiceNo}</span>
          </div>
          <div className="p-3">
            <span className="font-bold">Date :- </span>
            <span className="font-semibold">{invoiceDateStr}</span>
          </div>
        </div>
      </div>

      {/* Main Items Table */}
      <div className="border-[1.5px] border-black overflow-hidden text-xs md:text-sm">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-[1.5px] border-black font-bold text-center bg-transparent">
              <th className="w-[8%] border-r-[1.5px] border-black py-2 px-1">
                Sr.<br />No.
              </th>
              <th className="w-[52%] border-r-[1.5px] border-black py-2 px-3 text-center">
                PARTICULARS
              </th>
              <th className="w-[10%] border-r-[1.5px] border-black py-2 px-1 text-center">
                Qty.
              </th>
              <th className="w-[15%] border-r-[1.5px] border-black py-2 px-2 text-center">
                Rate
              </th>
              <th className="w-[15%] py-2 px-2 text-center">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, idx) => {
              const name = item.nameSnapshot || item.name || (item as any).description || (item as any).partName || ((item as any).itemType === 'SERVICE' ? 'Service / Labor Charge' : 'Spare Part / Service');
              const qty = Number(item.quantity) || 1;
              const rate = Number(item.unitPriceSnapshot ?? item.unitPrice ?? 0);
              const amt = Number(item.lineTotal ?? item.total ?? rate * qty);

              return (
                <tr key={idx} className="min-h-[26px]">
                  <td className="border-r-[1.5px] border-black text-center py-1.5 px-1 align-top font-medium">
                    {idx + 1}
                  </td>
                  <td className="border-r-[1.5px] border-black text-left py-1.5 px-3 align-top font-medium">
                    {name}
                  </td>
                  <td className="border-r-[1.5px] border-black text-center py-1.5 px-1 align-top">
                    {qty}
                  </td>
                  <td className="border-r-[1.5px] border-black text-right py-1.5 px-3 align-top">
                    {rate.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="text-right py-1.5 px-3 align-top font-medium">
                    {amt.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              );
            })}

            {/* Continuous vertical lines for filler rows to match standard physical bill book */}
            {Array.from({ length: fillerCount }).map((_, fIdx) => (
              <tr key={`fill-${fIdx}`} className="h-7">
                <td className="border-r-[1.5px] border-black">&nbsp;</td>
                <td className="border-r-[1.5px] border-black">&nbsp;</td>
                <td className="border-r-[1.5px] border-black">&nbsp;</td>
                <td className="border-r-[1.5px] border-black">&nbsp;</td>
                <td>&nbsp;</td>
              </tr>
            ))}

            {/* Total Row with Amount in Words */}
            <tr className="border-t-[1.5px] border-black font-bold min-h-[36px]">
              <td colSpan={2} className="border-r-[1.5px] border-black py-2.5 px-3 align-middle text-left">
                <span>Rs. </span>
                <span className="inline-block border-b border-black min-w-[220px] px-2 font-normal">
                  {amountWords}
                </span>
                <span> Only</span>
              </td>
              <td colSpan={3} className="py-2.5 px-3 align-middle text-left">
                <div className="flex items-center justify-between sm:justify-start gap-2">
                  <span>TOTAL</span>
                  <span className="inline-block border-b border-black min-w-[100px] text-right pr-2">
                    {totalFormatted}
                  </span>
                  <span>/-</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Footer / Signatures Area */}
      <div className="flex flex-col sm:flex-row justify-between items-end mt-8 md:mt-12 text-xs md:text-sm">
        {/* Customer Signature */}
        <div className="font-bold flex items-center gap-2 mb-6 sm:mb-0">
          <span>Customer Signature :-</span>
          <span className="inline-block border-b border-black w-36 md:w-48"></span>
        </div>

        {/* Company Signatory */}
        <div className="text-center sm:text-right">
          <div className="font-bold text-sm md:text-base mb-8">
            For Revamp Services
          </div>
          <div className="border-b border-black w-36 md:w-44 inline-block mb-1"></div>
          <div className="text-xs md:text-sm font-medium pr-4">Proprietor</div>
        </div>
      </div>

      {/* Screen-only CRM Payment & Verification Badge */}
      {((invoice as any).paymentMethod || invoice.status) && (
        <div className="mt-8 pt-3 border-t border-dashed border-slate-300 flex flex-wrap items-center justify-between text-xs text-slate-600 print:hidden gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">Payment Method:</span>
            <span className="font-bold text-slate-900 uppercase">{(invoice as any).paymentMethod || 'N/A'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-700">Status:</span>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${
              invoice.status === 'PAID' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
            }`}>
              {invoice.status}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
