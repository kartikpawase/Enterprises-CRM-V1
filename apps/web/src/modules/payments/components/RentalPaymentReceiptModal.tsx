import React from 'react';
import { Button } from '../../../components/ui/Button';
import { usePublicSettingsQuery } from '../../settings/settings.api';
import { formatDate } from '../../../lib/formatters';
import type { RentalPaymentListItem } from '../../rentals/rentals.api';
import { OFFICIAL_LOWER_SECTION_B64, CRM_OFFICIAL_LOGO_B64 } from '../../../assets/invoiceAssets';
import { X, Printer } from 'lucide-react';

interface RentalPaymentReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: RentalPaymentListItem | null;
}

export const RentalPaymentReceiptModal: React.FC<RentalPaymentReceiptModalProps> = ({
  isOpen,
  onClose,
  payment,
}) => {
  if (!isOpen || !payment) return null;

  const { data: publicSettings } = usePublicSettingsQuery();

  const handlePrint = () => {
    window.print();
  };

  const companyName = publicSettings?.businessName || 'ENTERPRISES CRM';
  const companyCity = publicSettings?.city || '';
  const companyPhone = publicSettings?.phone || '';
  const companyEmail = publicSettings?.email || '';

  // Customer & Document Data
  const customerName = (payment.customerName || 'Valued Customer').toUpperCase();
  const customerPhone = payment.customerPhone || 'N/A';
  const receiptNo = payment.receiptNumber || `RCP-RNT-${new Date(payment.paymentDate).getFullYear()}-0001`;
  const paymentDate = formatDate(payment.paymentDate);
  const nextDueDate = payment.nextDueDate ? formatDate(payment.nextDueDate) : 'N/A';

  // Financial Calculations
  const paymentAmountNum = parseFloat(payment.amount || '0');
  const outstandingNum = parseFloat(payment.outstandingAmount || '0');

  const formattedPaymentAmount = paymentAmountNum.toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
  const formattedBalanceAmount = outstandingNum.toLocaleString('en-IN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });

  // Description & Notes
  const paymentTypeTitle = payment.paymentType === 'SECURITY_DEPOSIT'
    ? 'Security Deposit Collection'
    : payment.paymentType === 'ADVANCE_RENT'
    ? 'Advance Rent Payment'
    : 'Monthly Rent Subscription';

  const itemDescription = `Equipment / Product Rental (${paymentTypeTitle}) — ${payment.machineModel} (Agreement: ${payment.rentalNumber}, Serial: ${payment.serialNumber})`;

  const notesText = payment.notes
    ? `Rental payment for agreement ${payment.rentalNumber}. ${payment.notes}`
    : `Rental payment for agreement ${payment.rentalNumber} (${paymentTypeTitle}). Standard warranty & regular periodic maintenance included.`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-fast print:p-0 print:bg-transparent print:static">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden my-8 print:border-none print:shadow-none print:m-0 print:w-full print:max-w-none">
        
        {/* Modal Top Toolbar (Hidden on print) */}
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50 shrink-0 print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Official Rental Receipt</span>
            <span className="text-xs font-mono font-bold text-slate-900 bg-slate-200 px-2 py-0.5 rounded">
              {receiptNo}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={handlePrint}
              leftIcon={<Printer className="w-4 h-4" />}
              className="bg-slate-900 hover:bg-slate-800 text-white font-bold cursor-pointer"
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
        <div className="p-6 overflow-y-auto bg-white print:p-0 print:overflow-visible print:m-0" id="printable-rental-receipt">
          <div className="border-[1.5px] border-black p-4 text-black font-sans leading-tight text-[11px] bg-white">
            
            {/* Top Badges */}
            <div className="mb-2 flex items-center gap-1.5">
              <span className="inline-block border border-black px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase">
                BILL OF SUPPLY / RENTAL RECEIPT
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
                {companyCity ? (
                  <p className="text-[10px] text-slate-800 font-medium mt-0.5">
                    {companyCity}
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
              
              {/* Row 1: Bill To & Rental Meta Details */}
              <div className="grid grid-cols-12 border-b-[1.5px] border-black">
                <div className="col-span-6 border-r-[1.5px] border-black p-2.5 bg-white">
                  <p className="text-[10px] font-bold uppercase text-black">RECEIVED FROM</p>
                  <p className="text-xs font-extrabold uppercase text-black mt-0.5">{customerName}</p>
                  <p className="text-[11px] font-medium text-black mt-1">Mobile: {customerPhone}</p>
                  {payment.customerNumber && (
                    <p className="text-[10px] font-mono text-slate-600">Customer ID: {payment.customerNumber}</p>
                  )}
                </div>

                <div className="col-span-6 grid grid-cols-3 text-center bg-white">
                  <div className="border-r border-black p-2 flex flex-col justify-center items-center">
                    <span className="text-[10px] font-bold text-black">Receipt No.</span>
                    <span className="text-[11px] font-bold font-mono text-black mt-0.5">{receiptNo}</span>
                  </div>
                  <div className="border-r border-black p-2 flex flex-col justify-center items-center">
                    <span className="text-[10px] font-bold text-black">Payment Date</span>
                    <span className="text-[11px] font-bold text-black mt-0.5">{paymentDate}</span>
                  </div>
                  <div className="p-2 flex flex-col justify-center items-center">
                    <span className="text-[10px] font-bold text-black">Next Due Date</span>
                    <span className="text-[11px] font-bold text-black mt-0.5">{nextDueDate}</span>
                  </div>
                </div>
              </div>

              {/* Row 2: Items / Rental Payment Details Table */}
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="bg-slate-200/70 border-b-[1.5px] border-black font-bold">
                    <th className="w-[10.2%] border-r border-black py-1.5 px-1 text-center font-bold text-black">S.NO.</th>
                    <th className="w-[46.5%] border-r border-black py-1.5 px-2 text-center font-bold text-black">ITEMS / SERVICE DESCRIPTION</th>
                    <th className="w-[13.0%] border-r border-black py-1.5 px-1 text-center font-bold text-black">QTY.</th>
                    <th className="w-[14.0%] border-r border-black py-1.5 px-2 text-center font-bold text-black">RATE</th>
                    <th className="w-[16.3%] py-1.5 px-2 text-center font-bold text-black">AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border-r border-black py-1 px-1 text-center align-top">1</td>
                    <td className="border-r border-black py-1 px-2 text-left font-medium align-top">
                      {itemDescription}
                      {payment.referenceNumber && (
                        <div className="text-[10px] text-slate-600 font-mono">
                          Txn / Ref No: {payment.referenceNumber}
                        </div>
                      )}
                    </td>
                    <td className="border-r border-black py-1 px-1 text-center align-top">1 Cycle</td>
                    <td className="border-r border-black py-1 px-2 text-right font-mono align-top">₹ {formattedPaymentAmount}</td>
                    <td className="py-1 px-2 text-right font-mono font-medium align-top">₹ {formattedPaymentAmount}</td>
                  </tr>

                  {/* TOTAL Row */}
                  <tr className="bg-slate-200/70 border-t-[1.5px] border-b-[1.5px] border-black font-extrabold">
                    <td className="border-r border-black py-1.5 px-1"></td>
                    <td className="border-r border-black py-1.5 px-2 text-right uppercase text-black">TOTAL AMOUNT</td>
                    <td className="border-r border-black py-1.5 px-1 text-center text-black">1</td>
                    <td className="border-r border-black py-1.5 px-2 text-center"></td>
                    <td className="py-1.5 px-2 text-right font-mono font-extrabold text-black">₹ {formattedPaymentAmount}</td>
                  </tr>
                </tbody>
              </table>

              {/* Row 3: Received Amount & Remaining Balance */}
              <div className="grid grid-cols-12 border-b-[1.5px] border-black">
                <div className="col-span-6 border-r-[1.5px] border-black p-2 font-bold text-xs flex items-center">
                  <span>Received Amount:&nbsp;</span>
                  <span className="font-mono text-black font-extrabold">₹ {formattedPaymentAmount}</span>
                </div>
                <div className="col-span-6 p-2 font-bold text-xs flex items-center">
                  <span>Balance Due:&nbsp;</span>
                  <span className="font-mono text-black font-extrabold">₹ {formattedBalanceAmount}</span>
                </div>
              </div>

              {/* Row 4: Notes */}
              <div className="p-2 border-b-[1.5px] border-black bg-white text-[10.5px]">
                <strong>Notes:</strong>&nbsp;{notesText}
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
