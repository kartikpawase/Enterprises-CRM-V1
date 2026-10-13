import React, { useState } from 'react';
import {
  Search,
  Filter,
  Edit2,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Repeat,
  Receipt,
  X,
  FileText,
} from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import { Pagination } from '../../../components/ui/Pagination';
import { formatINR, formatDate } from '../../../lib/formatters';
import {
  EXPENSE_CATEGORIES,
  isHomeExpense,
  type ExpenseItem,
  type ExpenseFrequency,
} from '@crm/types';
import {
  useExpensesQuery,
  useUpdateExpenseMutation,
  useVoidExpenseMutation,
} from '../expenses.api';

const BASE_CATEGORY_OPTIONS = [
  { value: '', label: 'All Categories' },
  ...EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c })),
];

const METHOD_OPTIONS = [
  { value: '', label: 'All Payment Methods' },
  { value: 'Cash', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'Bank Transfer', label: 'Bank Transfer' },
  { value: 'Card', label: 'Card' },
  { value: 'Other', label: 'Other' },
];

const STATUS_OPTIONS: { value: 'ALL' | 'RECORDED' | 'VOIDED'; label: string }[] = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'RECORDED', label: 'Paid / Recorded' },
  { value: 'VOIDED', label: 'Voided' },
];

export const ExpenseHistoryTable: React.FC = () => {
  // Filter states
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [status, setStatus] = useState<'ALL' | 'RECORDED' | 'VOIDED'>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Modals
  const [editingExpense, setEditingExpense] = useState<ExpenseItem | null>(null);
  const [voidingExpense, setVoidingExpense] = useState<ExpenseItem | null>(null);
  const [changeNote, setChangeNote] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);

  // Edit fields
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editPaymentMethod, setEditPaymentMethod] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const { data, isLoading } = useExpensesQuery({
    page,
    limit: 15,
    search: search.trim() || undefined,
    category: category || undefined,
    paymentMethod: paymentMethod || undefined,
    status: status === 'ALL' ? undefined : status,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
  });

  const categoryOptions = React.useMemo(() => {
    const opts = [...BASE_CATEGORY_OPTIONS];
    const seen = new Set(opts.map((o) => o.value.toLowerCase()));
    for (const exp of data?.items || []) {
      if (exp.category && !seen.has(exp.category.toLowerCase())) {
        opts.push({ value: exp.category, label: `${exp.category} (Historical / Custom)` });
        seen.add(exp.category.toLowerCase());
      }
    }
    return opts;
  }, [data?.items]);

  const updateMutation = useUpdateExpenseMutation();
  const voidMutation = useVoidExpenseMutation();

  const handleOpenEdit = (exp: ExpenseItem) => {
    setEditingExpense(exp);
    setEditTitle(exp.title);
    setEditCategory(exp.category);
    setEditAmount(String(exp.amount));
    setEditPaymentMethod(exp.paymentMethod);
    setEditNotes(exp.notes || '');
    setChangeNote('');
    setModalError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExpense || updateMutation.isPending) return;
    setModalError(null);

    const numAmount = parseFloat(editAmount);
    if (!editTitle.trim()) {
      setModalError('Title is required.');
      return;
    }
    if (isNaN(numAmount) || numAmount <= 0) {
      setModalError('Amount must be greater than zero.');
      return;
    }

    try {
      const combinedNotes = changeNote.trim()
        ? (editNotes.trim() ? `${editNotes.trim()} [Revision: ${changeNote.trim()}]` : `[Revision: ${changeNote.trim()}]`)
        : (editNotes.trim() || undefined);

      await updateMutation.mutateAsync({
        id: editingExpense.id,
        payload: {
          title: editTitle.trim(),
          category: editCategory,
          amount: Number(numAmount.toFixed(2)),
          paymentMethod: editPaymentMethod,
          notes: combinedNotes,
        },
      });
      setEditingExpense(null);
    } catch (err: any) {
      setModalError(err?.response?.data?.error?.message || err?.message || 'Failed to update expense.');
    }
  };

  const handleOpenVoid = (exp: ExpenseItem) => {
    setVoidingExpense(exp);
    setVoidReason('');
    setModalError(null);
  };

  const handleSaveVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidingExpense || voidMutation.isPending) return;
    setModalError(null);

    if (!voidReason.trim()) {
      setModalError('Audit reason is required to void an expense.');
      return;
    }

    try {
      await voidMutation.mutateAsync({
        id: voidingExpense.id,
        payload: {
          reason: voidReason.trim(),
        },
      });
      setVoidingExpense(null);
    } catch (err: any) {
      setModalError(err?.response?.data?.error?.message || err?.message || 'Failed to void expense.');
    }
  };

  const items = data?.items || [];
  const summary = data?.summary;
  const pagination = data?.pagination || { page: 1, limit: 15, total: 0, totalPages: 1 };

  return (
    <div className="space-y-4">
      {/* Search & Filters Bar */}
      <Card className="p-4 border-slate-200/90 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search expenses..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          </div>

          {/* Category */}
          <Select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
            options={categoryOptions}
          />

          {/* Payment Method */}
          <Select
            value={paymentMethod}
            onChange={(e) => {
              setPaymentMethod(e.target.value);
              setPage(1);
            }}
            options={METHOD_OPTIONS}
          />

          {/* Status */}
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as any);
              setPage(1);
            }}
            options={STATUS_OPTIONS}
          />

          {/* Clear Filters */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('');
              setCategory('');
              setPaymentMethod('');
              setStatus('ALL');
              setStartDate('');
              setEndDate('');
              setPage(1);
            }}
            className="text-xs text-slate-500 hover:text-slate-800"
          >
            Reset Filters
          </Button>
        </div>

        {/* Date boundaries row */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs">
          <span className="text-slate-500 font-medium">Filter by date:</span>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setPage(1);
            }}
            className="py-1 px-2.5 rounded-lg border border-slate-200 text-xs text-slate-700 focus:outline-none"
          />
          <span className="text-slate-400">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              setPage(1);
            }}
            className="py-1 px-2.5 rounded-lg border border-slate-200 text-xs text-slate-700 focus:outline-none"
          />
        </div>
      </Card>

      {/* Filtered Totals Summary Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-3 bg-slate-50/70 border-slate-200/90 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Filtered Records</span>
            <div className="text-base font-extrabold text-slate-900 font-mono mt-0.5">
              {summary?.totalCount ?? pagination.total} <span className="text-xs font-normal text-slate-500">records</span>
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-600 shadow-2xs">
            <Receipt className="w-4 h-4" />
          </div>
        </Card>

        <Card className="p-3 bg-emerald-50/40 border-emerald-200/90 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Filtered Active Total</span>
            <div className="text-base font-extrabold text-emerald-950 font-mono mt-0.5">
              {formatINR(summary?.totalAmount ?? 0)}
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-100/80 flex items-center justify-center text-emerald-700 shadow-2xs">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </Card>

        {summary && summary.voidedAmount > 0 ? (
          <Card className="p-3 bg-rose-50/40 border-rose-200/80 shadow-2xs flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">Voided in Filter</span>
              <div className="text-base font-extrabold text-rose-900 font-mono mt-0.5">
                {formatINR(summary.voidedAmount)}
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-rose-100/80 flex items-center justify-center text-rose-700 shadow-2xs">
              <Trash2 className="w-4 h-4" />
            </div>
          </Card>
        ) : null}
      </div>

      {/* Table */}
      <Card className="overflow-hidden border border-slate-200/90 shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-600 font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Expense Title</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Payment Method</th>
                <th className="py-3 px-4">Recorded By</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={9} className="py-4 px-4">
                      <div className="h-4 bg-slate-100 rounded-sm w-full" />
                    </td>
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-700">No expenses found</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Try adjusting filters or record a new expense using the Record Expense tab.
                    </p>
                  </td>
                </tr>
              ) : (
                items.map((exp) => {
                  const isVoided = exp.status === 'VOIDED';
                  return (
                    <tr
                      key={exp.id}
                      className={`hover:bg-slate-50/80 transition-colors ${
                        isVoided ? 'bg-slate-50/40 opacity-70' : ''
                      }`}
                    >
                      {/* Date */}
                      <td className="py-3 px-4 font-mono text-slate-700">
                        {exp.expenseDate}
                      </td>

                      {/* Title */}
                      <td className="py-3 px-4 font-semibold text-slate-900">
                        <div>
                          <span className={isVoided ? 'line-through text-slate-400' : ''}>
                            {exp.title}
                          </span>
                          {exp.notes && (
                            <p className="text-[10px] text-slate-400 font-normal truncate max-w-xs">
                              {exp.notes}
                            </p>
                          )}
                          {isVoided && exp.voidReason && (
                            <p className="text-[10px] text-rose-600 font-medium">
                              Voided: {exp.voidReason}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-3 px-4 text-slate-700">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] border ${
                            isHomeExpense(exp.category)
                              ? 'bg-amber-50 text-amber-800 border-amber-200 font-medium'
                              : 'bg-slate-100 text-slate-800 border-slate-200'
                          }`}
                        >
                          {exp.category}
                        </span>
                      </td>

                      {/* Type */}
                      <td className="py-3 px-4">
                        {exp.recurringScheduleId ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                            <Repeat className="w-2.5 h-2.5" />
                            <span>Recurring</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500">One-time</span>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="py-3 px-4 font-bold font-mono text-slate-900">
                        <span className={isVoided ? 'line-through text-slate-400' : ''}>
                          {formatINR(exp.amount)}
                        </span>
                      </td>

                      {/* Payment Method */}
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[11px] font-medium border ${
                            exp.paymentMethod === 'Cash'
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-blue-50 text-blue-800 border-blue-200'
                          }`}
                        >
                          {exp.paymentMethod}
                        </span>
                      </td>

                      {/* Recorded By */}
                      <td className="py-3 px-4 text-slate-600">
                        {exp.recordedByName || 'Admin'}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        {isVoided ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            Voided
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Paid
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        {!isVoided && (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(exp)}
                              title="Edit Expense"
                              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenVoid(exp)}
                              title="Void Expense"
                              className="p-1 rounded text-rose-400 hover:text-rose-700 hover:bg-rose-50 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
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

        {pagination.totalPages > 1 && (
          <div className="p-3 border-t border-slate-100 flex justify-end">
            <Pagination
              currentPage={pagination.page}
              totalPages={pagination.totalPages}
              onPageChange={setPage}
            />
          </div>
        )}
      </Card>

      {/* Edit Modal */}
      {editingExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-fast">
          <div className="bg-white rounded-xl shadow-modal w-full max-w-lg border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Edit Expense (Audited Flow)</h3>
              <button
                type="button"
                onClick={() => setEditingExpense(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              {modalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
                  {modalError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Title</label>
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                  <Select
                    value={
                      EXPENSE_CATEGORIES.includes(editCategory as any) ? editCategory : 'Other'
                    }
                    onChange={(e) => {
                      if (e.target.value !== 'Other') {
                        setEditCategory(e.target.value);
                      }
                    }}
                    options={[
                      ...EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c })),
                      ...(!EXPENSE_CATEGORIES.includes(editCategory as any) && editCategory
                        ? [{ value: editCategory, label: `${editCategory} (Custom)` }]
                        : []),
                    ]}
                  />
                  {(!EXPENSE_CATEGORIES.includes(editCategory as any) || editCategory === 'Other') && (
                    <div className="mt-1.5">
                      <Input
                        placeholder="Specify custom category..."
                        value={editCategory === 'Other' ? '' : editCategory}
                        onChange={(e) => setEditCategory(e.target.value)}
                        required
                      />
                    </div>
                  )}
                  {isHomeExpense(editCategory) && (
                    <p className="text-[10px] text-amber-700 font-medium mt-1">
                      🏠 Home expense (segregated from business operations)
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Amount (₹)</label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
                <Select
                  value={editPaymentMethod}
                  onChange={(e) => setEditPaymentMethod(e.target.value)}
                  options={METHOD_OPTIONS.filter((m) => m.value !== '')}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
                <Textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={2}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason for Revision (Audit Log)
                </label>
                <Input
                  placeholder="e.g. Correcting bill amount as per physical receipt..."
                  value={changeNote}
                  onChange={(e) => setChangeNote(e.target.value)}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditingExpense(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Void Modal */}
      {voidingExpense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-fast">
          <div className="bg-white rounded-xl shadow-modal w-full max-w-md border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-rose-50/50">
              <div className="flex items-center gap-2 text-rose-800">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <h3 className="text-sm font-bold">Void Expense Record</h3>
              </div>
              <button
                type="button"
                onClick={() => setVoidingExpense(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveVoid} className="p-6 space-y-4">
              {modalError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
                  {modalError}
                </div>
              )}

              <p className="text-xs text-slate-600">
                Are you sure you want to void this expense of{' '}
                <strong className="text-slate-900 font-mono">{formatINR(voidingExpense.amount)}</strong> for "
                {voidingExpense.title}"?
              </p>
              <p className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded border border-slate-200">
                Voiding removes the expense from operational cost calculations without destroying audit history.
              </p>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason for Voiding <span className="text-rose-500">*</span>
                </label>
                <Textarea
                  placeholder="e.g. Duplicate entry recorded, wrong payment mode, cancelled transaction..."
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  required
                  rows={2}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setVoidingExpense(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={voidMutation.isPending}
                >
                  {voidMutation.isPending ? 'Voiding...' : 'Confirm Void'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
