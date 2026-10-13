import React, { useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Plus, Receipt, FileText, HandCoins, Search } from 'lucide-react';
import { usePayments, usePaymentKPIs } from './payments.api';
import type { PaymentItem } from './payments.api';
import { useRentalPaymentsQuery, type RentalPaymentListItem } from '../rentals/rentals.api';
import { useCashHandovers, useCashHandoverSummary } from './cash-handovers.api';
import type { CashHandoverItem } from '@crm/types';
import { CashHandoverSummaryCards } from './components/CashHandoverSummaryCards';
import { CashHandoverTable } from './components/CashHandoverTable';
import { ConfirmCashHandoverModal } from './components/ConfirmCashHandoverModal';
import { PaymentSummaryCards } from './components/PaymentSummaryCards';
import { PaymentToolbar } from './components/PaymentToolbar';
import { PaymentTable } from './components/PaymentTable';
import { RentalPaymentToolbar } from './components/RentalPaymentToolbar';
import { RentalPaymentTable } from './components/RentalPaymentTable';
import { RecordPaymentModal } from './components/RecordPaymentModal';
import { PaymentReceiptModal } from './components/PaymentReceiptModal';
import { RentalPaymentReceiptModal } from './components/RentalPaymentReceiptModal';
import { CancelPaymentModal } from './components/CancelPaymentModal';

export const PaymentsDirectory: React.FC = () => {
  // Main Category Tab: 'invoices' | 'rentals' | 'cash-handover'
  const [activeMainTab, setActiveMainTab] = useState<'invoices' | 'rentals' | 'cash-handover'>('invoices');

  // Invoice Payments State
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [paymentMethod, setPaymentMethod] = useState('ALL');

  // Rental Payments State
  const [rentalPage, setRentalPage] = useState(1);
  const [rentalSearch, setRentalSearch] = useState('');
  const [rentalPaymentType, setRentalPaymentType] = useState('ALL');
  const [rentalPaymentMethod, setRentalPaymentMethod] = useState('ALL');

  // Cash Handover State
  const [cashPage, setCashPage] = useState(1);
  const [cashSearch, setCashSearch] = useState('');
  const [cashStatus, setCashStatus] = useState('ALL');
  const [confirmHandoverTarget, setConfirmHandoverTarget] = useState<CashHandoverItem | null>(null);

  // Modals state
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [recordModalInvoiceId, setRecordModalInvoiceId] = useState<string | undefined>(undefined);
  const [receiptPayment, setReceiptPayment] = useState<PaymentItem | null>(null);
  const [rentalReceiptPayment, setRentalReceiptPayment] = useState<RentalPaymentListItem | null>(null);
  const [cancelPaymentTarget, setCancelPaymentTarget] = useState<PaymentItem | null>(null);

  // Queries
  const { data: kpis, isLoading: isLoadingKPIs } = usePaymentKPIs();
  const { data: cashSummary, isLoading: isLoadingCashSummary } = useCashHandoverSummary();

  const { data: cashHandoversResponse, isLoading: isLoadingCashHandovers } = useCashHandovers({
    page: cashPage,
    limit: 10,
    search: cashSearch.trim() || undefined,
    status: cashStatus as any,
  });
  
  const { data: paymentsData, isLoading: isLoadingPayments } = usePayments({
    page,
    limit: 10,
    search: search.trim() || undefined,
    status: status as any,
    paymentMethod: paymentMethod as any,
    sortBy: 'paymentNumber',
    sortOrder: 'desc',
  });

  const { data: rentalPaymentsData, isLoading: isLoadingRentalPayments } = useRentalPaymentsQuery({
    page: rentalPage,
    limit: 10,
    search: rentalSearch.trim() || undefined,
    paymentType: rentalPaymentType !== 'ALL' ? rentalPaymentType : undefined,
    paymentMethod: rentalPaymentMethod !== 'ALL' ? rentalPaymentMethod : undefined,
  });

  const handleOpenRecordModal = (invoiceId?: string) => {
    setRecordModalInvoiceId(invoiceId);
    setIsRecordModalOpen(true);
  };

  const paymentsList: PaymentItem[] = Array.isArray(paymentsData)
    ? paymentsData
    : Array.isArray((paymentsData as any)?.data)
    ? (paymentsData as any).data
    : [];

  const rentalPaymentsList: RentalPaymentListItem[] = Array.isArray(rentalPaymentsData)
    ? rentalPaymentsData
    : Array.isArray((rentalPaymentsData as any)?.data)
    ? (rentalPaymentsData as any).data
    : [];

  const rentalTotalCount =
    rentalPaymentsData?.pagination?.total ??
    (Array.isArray(rentalPaymentsData) ? rentalPaymentsData.length : rentalPaymentsList.length);
  const invoiceTotalCount =
    paymentsData?.pagination?.total ??
    (Array.isArray(paymentsData) ? paymentsData.length : paymentsList.length);

  return (
    <div className="space-y-6 animate-in fade-in duration-fast">
      {/* Page Header */}
      <PageHeader
        title="Payments & Collections"
        description="Authoritative financial ledger tracking realized payments, customer receipts, and uncollected dues."
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Payments' }]}
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleOpenRecordModal()}
            leftIcon={<Plus className="w-4 h-4" />}
            className="shadow-sm"
          >
            Record Payment
          </Button>
        }
      />

      {/* KPI Overview Cards */}
      <PaymentSummaryCards kpis={kpis} isLoading={isLoadingKPIs} />

      {/* Main Tab Navigation: Invoice Payments vs Rental Payments */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveMainTab('invoices')}
          className={`px-4 py-2 text-xs font-bold transition-all rounded-lg cursor-pointer flex items-center gap-2 ${
            activeMainTab === 'invoices'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Invoice Payments</span>
          {invoiceTotalCount > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                activeMainTab === 'invoices' ? 'bg-primary-500 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {invoiceTotalCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveMainTab('rentals')}
          className={`px-4 py-2 text-xs font-bold transition-all rounded-lg cursor-pointer flex items-center gap-2 ${
            activeMainTab === 'rentals'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>Rental Payments</span>
          {rentalTotalCount > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                activeMainTab === 'rentals' ? 'bg-primary-500 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {rentalTotalCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveMainTab('cash-handover')}
          className={`px-4 py-2 text-xs font-bold transition-all rounded-lg cursor-pointer flex items-center gap-2 ${
            activeMainTab === 'cash-handover'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <HandCoins className="w-4 h-4" />
          <span>Cash Handover</span>
          {cashSummary && cashSummary.totalPending > 0 && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold ${
                activeMainTab === 'cash-handover' ? 'bg-amber-500 text-white' : 'bg-amber-100 text-amber-800'
              }`}
            >
              Pending
            </span>
          )}
        </button>
      </div>

      {/* Tab 1: Invoice Payments */}
      {activeMainTab === 'invoices' && (
        <div className="space-y-4">
          {/* Toolbar & Filters */}
          <PaymentToolbar
            search={search}
            onSearchChange={(val) => {
              setSearch(val);
              setPage(1);
            }}
            status={status}
            onStatusChange={(val) => {
              setStatus(val);
              setPage(1);
            }}
            paymentMethod={paymentMethod}
            onPaymentMethodChange={(val) => {
              setPaymentMethod(val);
              setPage(1);
            }}
            onRecordPayment={() => handleOpenRecordModal()}
          />

          {/* Payments Data Table */}
          <PaymentTable
            payments={paymentsList}
            isLoading={isLoadingPayments}
            pagination={paymentsData?.pagination}
            onPageChange={setPage}
            onViewReceipt={(p) => setReceiptPayment(p)}
            onCancelPayment={(p) => setCancelPaymentTarget(p)}
            onRecordPaymentForInvoice={(invId) => handleOpenRecordModal(invId)}
          />
        </div>
      )}

      {/* Tab 2: Rental Payments */}
      {activeMainTab === 'rentals' && (
        <div className="space-y-4">
          {/* Rental Payments Toolbar */}
          <RentalPaymentToolbar
            search={rentalSearch}
            onSearchChange={(val) => {
              setRentalSearch(val);
              setRentalPage(1);
            }}
            paymentType={rentalPaymentType}
            onPaymentTypeChange={(val) => {
              setRentalPaymentType(val);
              setRentalPage(1);
            }}
            paymentMethod={rentalPaymentMethod}
            onPaymentMethodChange={(val) => {
              setRentalPaymentMethod(val);
              setRentalPage(1);
            }}
          />

          {/* Rental Payments Table */}
          <RentalPaymentTable
            payments={rentalPaymentsList}
            isLoading={isLoadingRentalPayments}
            pagination={rentalPaymentsData?.pagination}
            onPageChange={setRentalPage}
            onViewReceipt={(p) => setRentalReceiptPayment(p)}
          />
        </div>
      )}

      {/* Tab 3: Cash Handover */}
      {activeMainTab === 'cash-handover' && (
        <div className="space-y-4">
          {/* Summary & Technician-wise Breakdown */}
          <CashHandoverSummaryCards summary={cashSummary} isLoading={isLoadingCashSummary} />

          {/* Simple Toolbar / Filter */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-white border border-slate-200/90 rounded-xl shadow-2xs">
            <div className="relative w-full sm:w-72">
              <input
                type="text"
                placeholder="Search technician, service, customer..."
                value={cashSearch}
                onChange={(e) => {
                  setCashSearch(e.target.value);
                  setCashPage(1);
                }}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:bg-white"
              />
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs font-medium text-slate-500">Status:</span>
              <select
                value={cashStatus}
                onChange={(e) => {
                  setCashStatus(e.target.value);
                  setCashPage(1);
                }}
                className="text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="ALL">All Status</option>
                <option value="PENDING">Pending Handover</option>
                <option value="RECEIVED">Received</option>
              </select>
            </div>
          </div>

          {/* Cash Handover Table */}
          <CashHandoverTable
            handovers={cashHandoversResponse?.items || []}
            isLoading={isLoadingCashHandovers}
            pagination={cashHandoversResponse?.pagination}
            onPageChange={setCashPage}
            onMarkReceived={(handover) => setConfirmHandoverTarget(handover)}
          />
        </div>
      )}

      {/* Record Payment Modal */}
      <RecordPaymentModal
        isOpen={isRecordModalOpen}
        initialInvoiceId={recordModalInvoiceId}
        onClose={() => {
          setIsRecordModalOpen(false);
          setRecordModalInvoiceId(undefined);
        }}
      />

      {/* Official Invoice Receipt Modal */}
      <PaymentReceiptModal
        isOpen={Boolean(receiptPayment)}
        onClose={() => setReceiptPayment(null)}
        payment={receiptPayment}
      />

      {/* Official Rental Receipt Modal */}
      <RentalPaymentReceiptModal
        isOpen={Boolean(rentalReceiptPayment)}
        onClose={() => setRentalReceiptPayment(null)}
        payment={rentalReceiptPayment}
      />

      {/* Cancel Payment Modal */}
      <CancelPaymentModal
        isOpen={Boolean(cancelPaymentTarget)}
        onClose={() => setCancelPaymentTarget(null)}
        payment={cancelPaymentTarget}
      />

      {/* Confirm Cash Handover Modal */}
      <ConfirmCashHandoverModal
        isOpen={Boolean(confirmHandoverTarget)}
        onClose={() => setConfirmHandoverTarget(null)}
        handover={confirmHandoverTarget}
      />
    </div>
  );
};
