import React, { useState } from 'react';
import {
  Receipt,
  PlusCircle,
  History,
  HandCoins,
  RefreshCw,
  Landmark,
  LayoutDashboard,
  Calendar,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Tabs, type TabItem } from '../../components/ui/Tabs';
import { useExpensesOverview, useMonthlyReconciliationQuery } from './expenses.api';
import { useCashHandoverSummary } from '../payments/cash-handovers.api';
import { ExpensesOverviewCards } from './components/ExpensesOverviewCards';
import { RecordExpenseForm } from './components/RecordExpenseForm';
import { ExpenseHistoryTable } from './components/ExpenseHistoryTable';
import { TechnicianCashHandoverView } from './components/TechnicianCashHandoverView';
import { BankReconciliationTab } from './components/BankReconciliationTab';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const ExpensesPage: React.FC = () => {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1);
  const [activeTab, setActiveTab] = useState<'overview' | 'record' | 'history' | 'handover' | 'reconciliation'>('overview');

  // Query general period expenses
  const {
    data: overview,
    isLoading: isOverviewLoading,
    refetch: refetchOverview,
    isRefetching: isOverviewRefetching,
  } = useExpensesOverview();

  // Query authoritative monthly reconciliation & savings
  const {
    data: reconciliationSummary,
    isLoading: isReconciliationLoading,
    refetch: refetchReconciliation,
    isFetching: isReconciliationFetching,
  } = useMonthlyReconciliationQuery({
    year: selectedYear,
    month: selectedMonth,
  });

  // Query authoritative 4-pillar technician cash handovers
  const {
    data: handoverSummary,
    refetch: refetchHandovers,
    isFetching: isHandoversFetching,
  } = useCashHandoverSummary();

  const isRefreshing = isOverviewRefetching || isReconciliationFetching || isHandoversFetching;

  const handleRefresh = async () => {
    await Promise.all([
      refetchOverview(),
      refetchReconciliation(),
      refetchHandovers(),
    ]);
  };

  const handlePeriodChange = (year: number, month: number) => {
    setSelectedYear(year);
    setSelectedMonth(month);
  };

  const currentMonthName = MONTH_NAMES[selectedMonth - 1] || 'Current Month';

  // Informative tab badges
  const pendingHandoversCount = handoverSummary?.totalPending && handoverSummary.totalPending > 0
    ? 1
    : undefined;

  const hasReconciliationAlert = reconciliationSummary && reconciliationSummary.reconciliationDifference < 0
    ? 1
    : undefined;

  const tabs: TabItem[] = [
    {
      id: 'overview',
      label: 'Financial Dashboard',
    },
    {
      id: 'record',
      label: 'Record Expense',
    },
    {
      id: 'history',
      label: 'Expense History',
    },
    {
      id: 'handover',
      label: 'Technician Cash & Handover',
      count: pendingHandoversCount,
    },
    {
      id: 'reconciliation',
      label: 'Bank & Savings Reconciliation',
      count: hasReconciliationAlert,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Expenses & Cash-In-Hand"
        description={`Executive financial dashboard, operating profit analysis, bank reconciliation, and technician field cash tracking for ${currentMonthName} ${selectedYear}.`}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </Button>
            <Button
              size="sm"
              onClick={() => setActiveTab('record')}
              className="text-xs"
            >
              <PlusCircle className="w-3.5 h-3.5 mr-1.5" />
              <span>Record Expense</span>
            </Button>
          </div>
        }
      />

      {/* Tabs */}
      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onChange={(tabId) => setActiveTab(tabId as any)}
      />

      {/* Tab Panels */}
      <div className="animate-in fade-in duration-150">
        {activeTab === 'overview' && (
          <ExpensesOverviewCards
            overview={overview}
            reconciliationSummary={reconciliationSummary}
            handoverSummary={handoverSummary}
            isLoading={isOverviewLoading}
            isReconciliationLoading={isReconciliationLoading}
            selectedYear={selectedYear}
            selectedMonth={selectedMonth}
            onPeriodChange={handlePeriodChange}
            onNavigateTab={(tab) => setActiveTab(tab)}
          />
        )}

        {activeTab === 'record' && (
          <RecordExpenseForm />
        )}

        {activeTab === 'history' && (
          <ExpenseHistoryTable />
        )}

        {activeTab === 'handover' && (
          <TechnicianCashHandoverView />
        )}

        {activeTab === 'reconciliation' && (
          <BankReconciliationTab
            initialYear={selectedYear}
            initialMonth={selectedMonth}
            onPeriodChange={handlePeriodChange}
          />
        )}
      </div>
    </div>
  );
};

export default ExpensesPage;
