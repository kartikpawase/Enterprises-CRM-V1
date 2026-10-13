import React, { useState } from 'react';
import {
  PlusCircle,
  Clock,
  CheckCircle2,
  AlertCircle,
  Repeat,
  Calendar,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import { formatINR } from '../../../lib/formatters';
import {
  useCreateExpenseMutation,
  useCreateExpenseScheduleMutation,
  useExpenseSchedulesQuery,
  useToggleScheduleMutation,
  useRecordScheduleOccurrenceMutation,
} from '../expenses.api';
import { EXPENSE_CATEGORIES, isHomeExpense, type ExpenseFrequency } from '@crm/types';

const PAYMENT_METHODS = [
  { value: 'Cash', label: 'Cash (Physical Shop Cash)' },
  { value: 'UPI', label: 'UPI (GPay / PhonePe / Paytm)' },
  { value: 'Bank Transfer', label: 'Bank Transfer (NEFT / IMPS)' },
  { value: 'Card', label: 'Card (Debit / Credit)' },
  { value: 'Other', label: 'Other' },
];

const FREQUENCIES: { value: ExpenseFrequency; label: string }[] = [
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'YEARLY', label: 'Yearly' },
];

function getTodayStr(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export const RecordExpenseForm: React.FC = () => {
  const [mode, setMode] = useState<'ONE_TIME' | 'RECURRING'>('ONE_TIME');

  // One-time form states
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [customCategory, setCustomCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState(getTodayStr());
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [notes, setNotes] = useState('');

  // Recurring form states
  const [recTitle, setRecTitle] = useState('');
  const [recCategory, setRecCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [recCustomCategory, setRecCustomCategory] = useState('');
  const [recAmount, setRecAmount] = useState('');
  const [recFrequency, setRecFrequency] = useState<ExpenseFrequency>('MONTHLY');
  const [recStartDate, setRecStartDate] = useState(getTodayStr());
  const [recEndDate, setRecEndDate] = useState('');
  const [recPaymentMethod, setRecPaymentMethod] = useState('Bank Transfer');
  const [recNotes, setRecNotes] = useState('');

  // Feedback states
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const createExpenseMutation = useCreateExpenseMutation();
  const createScheduleMutation = useCreateExpenseScheduleMutation();
  const { data: schedules = [], isLoading: isSchedulesLoading } = useExpenseSchedulesQuery();
  const toggleScheduleMutation = useToggleScheduleMutation();
  const recordOccurrenceMutation = useRecordScheduleOccurrenceMutation();

  const handleRecordOneTime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createExpenseMutation.isPending) return;
    setFeedback(null);

    const effectiveCategory = category === 'Other' && customCategory.trim() ? customCategory.trim() : category;
    const numAmount = parseFloat(amount);

    if (!title.trim()) {
      setFeedback({ type: 'error', message: 'Expense title is required.' });
      return;
    }
    if (isNaN(numAmount) || numAmount <= 0) {
      setFeedback({ type: 'error', message: 'Expense amount must be greater than zero.' });
      return;
    }
    if (!expenseDate) {
      setFeedback({ type: 'error', message: 'Expense date is required.' });
      return;
    }

    try {
      await createExpenseMutation.mutateAsync({
        title: title.trim(),
        category: effectiveCategory,
        amount: Number(numAmount.toFixed(2)),
        expenseDate,
        paymentMethod,
        notes: notes.trim() || undefined,
      });

      setFeedback({
        type: 'success',
        message: `Expense of ₹${Number(numAmount.toFixed(2)).toLocaleString()} recorded successfully.`,
      });
      setTitle('');
      setAmount('');
      setNotes('');
      setCustomCategory('');
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.response?.data?.error?.message || err?.message || 'Failed to record expense.',
      });
    }
  };

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createScheduleMutation.isPending) return;
    setFeedback(null);

    const effectiveCategory = recCategory === 'Other' && recCustomCategory.trim() ? recCustomCategory.trim() : recCategory;
    const numAmount = parseFloat(recAmount);

    if (!recTitle.trim()) {
      setFeedback({ type: 'error', message: 'Schedule title is required.' });
      return;
    }
    if (isNaN(numAmount) || numAmount <= 0) {
      setFeedback({ type: 'error', message: 'Amount must be greater than zero.' });
      return;
    }
    if (!recStartDate) {
      setFeedback({ type: 'error', message: 'Start date is required.' });
      return;
    }

    try {
      await createScheduleMutation.mutateAsync({
        title: recTitle.trim(),
        category: effectiveCategory,
        amount: numAmount,
        frequency: recFrequency,
        startDate: recStartDate,
        endDate: recEndDate || undefined,
        paymentMethod: recPaymentMethod,
        notes: recNotes.trim() || undefined,
      });

      setFeedback({
        type: 'success',
        message: `Recurring schedule for ${recTitle.trim()} (${recFrequency.toLowerCase()}) created successfully.`,
      });
      setRecTitle('');
      setRecAmount('');
      setRecNotes('');
      setRecCustomCategory('');
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.response?.data?.error?.message || err?.message || 'Failed to create recurring schedule.',
      });
    }
  };

  const handleRecordOccurrence = async (scheduleId: string, scheduleTitle: string) => {
    try {
      setFeedback(null);
      await recordOccurrenceMutation.mutateAsync({ id: scheduleId, expenseDate: getTodayStr() });
      setFeedback({
        type: 'success',
        message: `Occurrence recorded for "${scheduleTitle}" as of today. Idempotent check ensures no duplicate for period.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.response?.data?.error?.message || err?.message || 'Failed to record occurrence.',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Mode Switcher */}
      <div className="flex items-center gap-3 bg-slate-100/80 p-1.5 rounded-xl max-w-md border border-slate-200">
        <button
          type="button"
          onClick={() => {
            setMode('ONE_TIME');
            setFeedback(null);
          }}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer ${
            mode === 'ONE_TIME'
              ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <PlusCircle className="w-3.5 h-3.5 text-primary-600" />
          <span>Record Expense</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('RECURRING');
            setFeedback(null);
          }}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer ${
            mode === 'RECURRING'
              ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Repeat className="w-3.5 h-3.5 text-indigo-600" />
          <span>Recurring Schedule</span>
        </button>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center gap-2.5 border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {mode === 'ONE_TIME' ? (
        <Card className="p-6 border-slate-200/90 shadow-2xs">
          <div className="mb-5 pb-3 border-b border-slate-100">
            <h2 className="text-base font-bold text-slate-900">Record Company Expense</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Accurately log operational expenses. Physical cash expenses immediately update shop cash balance.
            </p>
          </div>

          <form onSubmit={handleRecordOneTime} className="space-y-4 max-w-2xl">
            {/* Title */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Expense Title <span className="text-rose-500">*</span>
              </label>
              <Input
                placeholder="e.g. Petrol for service van, Electricity bill, Office water cans"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Category */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Category <span className="text-rose-500">*</span>
                </label>
                <Select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c }))}
                />
                {isHomeExpense(category) && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200/80 rounded-md p-1.5 mt-1.5 font-medium">
                    🏠 Home Expense — Segregated from CRM operational business burn rate.
                  </p>
                )}
                {category === 'Other' && (
                  <div className="mt-2">
                    <Input
                      placeholder="Specify custom category..."
                      value={customCategory}
                      onChange={(e) => setCustomCategory(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Amount (₹ INR) <span className="text-rose-500">*</span>
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Date */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Expense Date <span className="text-rose-500">*</span>
                </label>
                <Input
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
                  required
                />
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Payment Method <span className="text-rose-500">*</span>
                </label>
                <Select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  options={PAYMENT_METHODS}
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  {paymentMethod === 'Cash'
                    ? '⚠️ Cash outflow reduces physical shop cash balance.'
                    : 'ℹ️ Digital outflow; does not decrease physical shop cash.'}
                </p>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Notes / Reference (Optional)
              </label>
              <Textarea
                placeholder="Bill number, receipt reference, or vendor details..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                disabled={createExpenseMutation.isPending}
                className="w-full sm:w-auto"
              >
                {createExpenseMutation.isPending ? 'Saving Expense...' : 'Record Expense'}
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Recurring Schedule Creator */}
          <Card className="p-6 border-slate-200/90 shadow-2xs">
            <div className="mb-5 pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">Create Recurring Expense Schedule</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure schedules for recurring commitments (Rent, Internet, Insurance). Occurrences are tracked
                separately so scheduled items are not marked paid prematurely.
              </p>
            </div>

            <form onSubmit={handleCreateSchedule} className="space-y-4 max-w-2xl">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Schedule Title <span className="text-rose-500">*</span>
                </label>
                <Input
                  placeholder="e.g. Monthly Shop Rent, Broadband Internet, Weekly Van Service"
                  value={recTitle}
                  onChange={(e) => setRecTitle(e.target.value)}
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Frequency <span className="text-rose-500">*</span>
                  </label>
                  <Select
                    value={recFrequency}
                    onChange={(e) => setRecFrequency(e.target.value as ExpenseFrequency)}
                    options={FREQUENCIES}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Amount (₹ INR) <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={recAmount}
                    onChange={(e) => setRecAmount(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Category <span className="text-rose-500">*</span>
                  </label>
                  <Select
                    value={recCategory}
                    onChange={(e) => setRecCategory(e.target.value)}
                    options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c }))}
                  />
                  {recCategory === 'Other' && (
                    <div className="mt-2">
                      <Input
                        placeholder="Custom category..."
                        value={recCustomCategory}
                        onChange={(e) => setRecCustomCategory(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Payment Method <span className="text-rose-500">*</span>
                  </label>
                  <Select
                    value={recPaymentMethod}
                    onChange={(e) => setRecPaymentMethod(e.target.value)}
                    options={PAYMENT_METHODS}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Start Date <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    type="date"
                    value={recStartDate}
                    onChange={(e) => setRecStartDate(e.target.value)}
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    End Date (Optional)
                  </label>
                  <Input
                    type="date"
                    value={recEndDate}
                    onChange={(e) => setRecEndDate(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Notes (Optional)
                </label>
                <Textarea
                  placeholder="Terms, landlord account number, or vendor details..."
                  value={recNotes}
                  onChange={(e) => setRecNotes(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={createScheduleMutation.isPending}
                  className="w-full sm:w-auto"
                >
                  {createScheduleMutation.isPending ? 'Creating Schedule...' : 'Save Recurring Schedule'}
                </Button>
              </div>
            </form>
          </Card>

          {/* Active Recurring Schedules List */}
          <Card className="p-6 border-slate-200/90 shadow-2xs">
            <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center justify-between">
              <span>Active Recurring Schedules</span>
              <span className="text-xs font-normal text-slate-500 font-mono">
                {schedules.length} schedules registered
              </span>
            </h3>

            {isSchedulesLoading ? (
              <div className="animate-pulse space-y-3">
                <div className="h-14 bg-slate-100 rounded-lg" />
                <div className="h-14 bg-slate-100 rounded-lg" />
              </div>
            ) : schedules.length === 0 ? (
              <p className="text-xs text-slate-400 py-4">No recurring schedules set up yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {schedules.map((sch) => (
                  <div
                    key={sch.id}
                    className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-slate-900">{sch.title}</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {sch.frequency}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            sch.isActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {sch.isActive ? 'Active' : 'Paused'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-1">
                        <span>{sch.category}</span>
                        <span>•</span>
                        <span>{sch.paymentMethod}</span>
                        <span>•</span>
                        <span>From: {sch.startDate}</span>
                        {sch.nextDueDate && (
                          <>
                            <span>•</span>
                            <span>Next Due: {sch.nextDueDate}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-sm font-bold text-slate-900 font-mono">
                          {formatINR(sch.amount)}
                        </div>
                        <div className="text-[10px] text-slate-400">per {sch.frequency.toLowerCase()}</div>
                      </div>

                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={recordOccurrenceMutation.isPending || !sch.isActive}
                        onClick={() => handleRecordOccurrence(sch.id, sch.title)}
                        className="text-xs"
                      >
                        Record Due Occurrence
                      </Button>

                      <button
                        type="button"
                        onClick={() => toggleScheduleMutation.mutate(sch.id)}
                        className="text-[11px] text-slate-500 hover:text-slate-800 underline cursor-pointer"
                      >
                        {sch.isActive ? 'Pause' : 'Resume'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
};
