import React, { useState } from 'react';
import {
  ShoppingBag,
  Plus,
  MoreVertical,
  Wrench,
  Cog,
  Shield,
  User,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Trash2,
} from 'lucide-react';
import { useDeleteSaleMutation, type SaleSummaryData } from '../sales.api';
import { useToast } from '../../../providers/ToastProvider';

export interface SalesOrderRow {
  id: string;
  orderNo: string;
  saleNumber?: string;
  invoiceNo?: string;
  customerName: string;
  customerLocation: string;
  customerAvatar?: {
    type: 'icon' | 'initials';
    initials?: string;
    bgClass?: string;
    textClass?: string;
  };
  productName: string;
  productSubtext: string;
  productType: 'equipment' | 'ro' | 'service' | 'maintenance' | 'filter';
  amount: string;
  status: 'Delivered' | 'Processing' | 'Pending' | 'Cancelled';
  paymentMethod: 'Paid' | 'Partially Paid' | 'COD' | 'UPI' | 'Pending';
  date: string;
  time: string;
}

// Default reference sales orders (empty on clean unseeded state)
export const DEFAULT_SALES_ORDERS: SalesOrderRow[] = [];

interface SalesOrdersTableProps {
  apiSales?: SaleSummaryData[];
  isLoading?: boolean;
  totalRecords?: number;
  currentPage?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  onAddSale?: () => void;
  onSelectOrder?: (orderId: string) => void;
}

export const SalesOrdersTable: React.FC<SalesOrdersTableProps> = ({
  apiSales,
  isLoading = false,
  totalRecords = 0,
  currentPage = 1,
  pageSize = 10,
  onPageChange,
  onPageSizeChange,
  onAddSale,
  onSelectOrder,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const deleteSaleMutation = useDeleteSaleMutation();
  const toast = useToast();

  // Convert live API data to row model
  const rows: SalesOrderRow[] = (apiSales || []).map((sale, idx) => {
    const dateObj = new Date(sale.saleDate);
    return {
      id: sale.id,
      orderNo: sale.invoice?.invoiceNumber || sale.saleNumber,
      saleNumber: sale.saleNumber,
      invoiceNo: sale.invoice?.invoiceNumber || undefined,
      customerName: sale.customerName,
      customerLocation: 'Pune',
      customerAvatar: {
        type: 'initials',
        initials: sale.customerName
          ? sale.customerName
              .split(' ')
              .map((n) => n[0])
              .slice(0, 2)
              .join('')
              .toUpperCase()
          : 'CU',
        bgClass: ['bg-blue-100', 'bg-emerald-100', 'bg-amber-100', 'bg-purple-100', 'bg-orange-100'][idx % 5],
        textClass: ['text-blue-800', 'text-emerald-800', 'text-amber-800', 'text-purple-800', 'text-orange-800'][idx % 5],
      },
      productName: (sale as any).items && (sale as any).items.length > 0
        ? (sale as any).items.map((i: any) => i.productNameSnapshot).join(', ')
        : (sale as any).notes || 'Equipment',
      productSubtext: (sale as any).items && (sale as any).items.length > 0
        ? `${(sale as any).items.reduce((sum: number, i: any) => sum + (i.quantity || 1), 0)} Unit(s)`
        : '1 Unit',
      productType: 'equipment',
      amount: `₹ ${parseFloat(sale.totalAmount || '0').toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
      status: sale.status === 'COMPLETED' ? 'Delivered' : sale.status === 'CANCELLED' ? 'Cancelled' : 'Processing',
      paymentMethod:
        sale.invoice?.status === 'PAID' || (sale as any).paymentStatus === 'PAID'
          ? 'Paid'
          : sale.invoice?.status === 'PARTIALLY_PAID' || (sale as any).paymentStatus === 'PARTIALLY_PAID'
          ? 'Partially Paid'
          : 'Pending',
      date: dateObj.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }),
      time: dateObj.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true }),
    };
  });

  const toggleSelectAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
  };

  const toggleSelectRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const renderProductIcon = (type: SalesOrderRow['productType']) => {
    switch (type) {
      case 'service':
        return (
          <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
            <Wrench className="w-4 h-4" />
          </div>
        );
      case 'maintenance':
        return (
          <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
            <Cog className="w-4 h-4" />
          </div>
        );
      case 'filter':
        return (
          <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4" />
          </div>
        );
      case 'equipment':
      case 'ro':
      default:
        return (
          <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0 border border-slate-200">
            <svg className="w-4 h-4 text-slate-700" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm0-8c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" />
            </svg>
          </div>
        );
    }
  };

  const getStatusBadge = (status: SalesOrderRow['status']) => {
    switch (status) {
      case 'Delivered':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            Delivered
          </span>
        );
      case 'Processing':
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            Processing
          </span>
        );
    }
  };

  const getPaymentBadge = (method: SalesOrderRow['paymentMethod']) => {
    switch (method) {
      case 'Paid':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            Payment Complete
          </span>
        );
      case 'Partially Paid':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            Partially Paid
          </span>
        );
      case 'COD':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            COD
          </span>
        );
      case 'UPI':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            UPI
          </span>
        );
      case 'Pending':
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-orange-50 text-orange-700 border border-orange-200">
            Payment Pending
          </span>
        );
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col">
      {/* Table Header / Action Top Row */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-500 border border-rose-100 flex items-center justify-center">
            <ShoppingBag className="w-4 h-4" />
          </div>
          <h2 className="text-base font-bold text-slate-900">Sales Orders</h2>
        </div>

        <button
          type="button"
          onClick={onAddSale}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Sale</span>
        </button>
      </div>

      {/* Responsive Table Container */}
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <th className="py-3 px-4 w-10 text-center">
                <input
                  type="checkbox"
                  checked={selectedIds.size === rows.length && rows.length > 0}
                  onChange={toggleSelectAll}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </th>
              <th className="py-3 px-4">Order No.</th>
              <th className="py-3 px-4">Customer</th>
              <th className="py-3 px-4">Products</th>
              <th className="py-3 px-4">Amount</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Payment</th>
              <th className="py-3 px-4">Date</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-slate-500">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                      <ShoppingBag className="w-6 h-6" />
                    </div>
                    <p className="font-semibold text-slate-700 text-sm">
                      {isLoading ? 'Loading sales orders...' : 'No sales found'}
                    </p>
                    <p className="text-xs text-slate-400 max-w-sm">
                      {isLoading
                        ? 'Fetching records from database...'
                        : 'No sales orders match your selected filters. Try adjusting your search or filters.'}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isSelected = selectedIds.has(row.id);
                return (
                  <tr
                    key={row.id}
                    className={`hover:bg-slate-50/70 transition-colors ${
                      isSelected ? 'bg-blue-50/40' : ''
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="py-3.5 px-4 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectRow(row.id)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>

                    {/* Order Number & Sale/Invoice Identifiers */}
                    <td className="py-3.5 px-4">
                      <div
                        className="font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
                        onClick={() => onSelectOrder?.(row.id)}
                      >
                        {row.orderNo}
                      </div>
                      {row.saleNumber && row.saleNumber !== row.orderNo && (
                        <div className="text-[10px] text-slate-400 font-mono">{row.saleNumber}</div>
                      )}
                      {row.invoiceNo && row.invoiceNo !== row.orderNo && (
                        <div className="text-[10px] text-slate-400 font-mono">{row.invoiceNo}</div>
                      )}
                    </td>

                    {/* Customer */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        {row.customerAvatar?.type === 'icon' ? (
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${row.customerAvatar.bgClass} ${row.customerAvatar.textClass}`}
                          >
                            <User className="w-3.5 h-3.5" />
                          </div>
                        ) : (
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 ${
                              row.customerAvatar?.bgClass || 'bg-slate-100'
                            } ${row.customerAvatar?.textClass || 'text-slate-700'}`}
                          >
                            {row.customerAvatar?.initials || 'CU'}
                          </div>
                        )}
                        <div>
                          <div className="font-semibold text-slate-900">{row.customerName}</div>
                          <div className="text-[11px] text-slate-400">{row.customerLocation}</div>
                        </div>
                      </div>
                    </td>

                    {/* Products */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        {renderProductIcon(row.productType)}
                        <div>
                          <div className="font-semibold text-slate-800">{row.productName}</div>
                          <div className="text-[11px] text-slate-400">{row.productSubtext}</div>
                        </div>
                      </div>
                    </td>

                    {/* Amount */}
                    <td className="py-3.5 px-4 font-bold text-slate-900">{row.amount}</td>

                    {/* Status */}
                    <td className="py-3.5 px-4">{getStatusBadge(row.status)}</td>

                    {/* Payment */}
                    <td className="py-3.5 px-4">{getPaymentBadge(row.paymentMethod)}</td>

                    {/* Date & Time */}
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-800">{row.date}</div>
                      <div className="text-[11px] text-slate-400">{row.time}</div>
                    </td>

                    {/* Actions (Three Dots) */}
                    <td className="py-3.5 px-4 text-right relative">
                      <button
                        type="button"
                        onClick={() => setActiveMenuId(activeMenuId === row.id ? null : row.id)}
                        className="p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {activeMenuId === row.id && (
                        <div className="absolute right-4 top-10 w-36 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-30 text-left">
                          <button
                            onClick={() => {
                              setActiveMenuId(null);
                              onSelectOrder?.(row.id);
                            }}
                            className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 text-left cursor-pointer"
                          >
                            View Details
                          </button>
                          <button
                            onClick={() => setActiveMenuId(null)}
                            className="w-full px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 text-left cursor-pointer"
                          >
                            Print Invoice
                          </button>
                          <button
                            onClick={async () => {
                              setActiveMenuId(null);
                              if (window.confirm(`Are you sure you want to delete order ${row.orderNo}? This will permanently remove the sale and associated invoice.`)) {
                                try {
                                  await deleteSaleMutation.mutateAsync(row.id);
                                  toast.success(`Order ${row.orderNo} deleted successfully.`);
                                } catch (err: any) {
                                  toast.error(err.message || 'Failed to delete sale order.');
                                }
                              }
                            }}
                            className="w-full px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 text-left cursor-pointer flex items-center gap-1.5 font-medium border-t border-slate-100"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                            <span>Delete Order</span>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer Bar */}
      <div className="px-5 py-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
        <div>
          {totalRecords > 0
            ? `Showing ${(currentPage - 1) * pageSize + 1} to ${Math.min(currentPage * pageSize, totalRecords)} of ${totalRecords} sales`
            : 'Showing 0 sales'}
        </div>

        {/* Page navigation */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => onPageChange?.(currentPage - 1)}
            className="p-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4 text-slate-500" />
          </button>
          <span className="px-2 font-medium text-slate-700">
            Page {currentPage} of {Math.max(1, Math.ceil(totalRecords / pageSize))}
          </span>
          <button
            type="button"
            disabled={currentPage >= Math.ceil(totalRecords / pageSize)}
            onClick={() => onPageChange?.(currentPage + 1)}
            className="p-1 rounded border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Rows per page dropdown */}
        <div className="relative">
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
            className="appearance-none bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium text-xs rounded-lg px-2.5 py-1.5 pr-6 border border-slate-200 focus:outline-none cursor-pointer"
          >
            <option value="10">10 / page</option>
            <option value="20">20 / page</option>
            <option value="50">50 / page</option>
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>
    </div>
  );
};
