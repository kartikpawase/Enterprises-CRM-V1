import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ShoppingBag, Upload, Download, Plus } from 'lucide-react';
import { useSalesQuery, useSalesStatsQuery } from './sales.api';
import { useAuth } from '../../providers/AuthBoundary';
import { SalesKpiCards } from './components/SalesKpiCards';
import { SalesFilterBar, type SalesFilterValues } from './components/SalesFilterBar';
import { SalesOrdersTable } from './components/SalesOrdersTable';
import { SalesBottomWidgets } from './components/SalesBottomWidgets';
import { SalesTrendWidget } from './components/SalesTrendWidget';
import { TopProductsWidget } from './components/TopProductsWidget';
import { RecentSalesWidget } from './components/RecentSalesWidget';
import type { SaleQueryFilter } from '@crm/validation';

export const SalesDirectory: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('sales.create');

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const [filterValues, setFilterValues] = useState<SalesFilterValues>({
    customer: searchParams.get('customerId') || searchParams.get('customer') || '',
    product: searchParams.get('productId') || searchParams.get('product') || '',
    status: searchParams.get('status') || '',
    datePreset: searchParams.get('datePreset') || '',
    search: searchParams.get('search') || '',
  });

  // Keep URL search params in sync with active filters
  useEffect(() => {
    const params = new URLSearchParams();
    if (filterValues.customer) params.set('customerId', filterValues.customer);
    if (filterValues.product) params.set('productId', filterValues.product);
    if (filterValues.status) params.set('status', filterValues.status);
    if (filterValues.datePreset) {
      params.set('datePreset', filterValues.datePreset);
    }
    if (filterValues.search) params.set('search', filterValues.search);
    setSearchParams(params, { replace: true });
  }, [filterValues, setSearchParams]);

  const apiFilters: Partial<SaleQueryFilter> = {
    page: currentPage,
    limit: pageSize,
    sortBy: 'createdAt',
    sortOrder: 'desc',
    search: filterValues.search?.trim() || undefined,
    status: (filterValues.status as any) || undefined,
    customerId: filterValues.customer || undefined,
    productId: filterValues.product || undefined,
    datePreset: filterValues.datePreset || undefined,
  };

  const { data: response, isLoading } = useSalesQuery(apiFilters);
  const { data: statsData } = useSalesStatsQuery(apiFilters);
  const sales = response?.data || [];
  const total = response?.pagination?.total || 0;

  const handleFilterChange = (key: keyof SalesFilterValues, value: string) => {
    setFilterValues((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setFilterValues({
      customer: '',
      product: '',
      status: '',
      datePreset: '',
      search: '',
    });
    setCurrentPage(1);
  };

  const handleExportCsv = () => {
    // Generate CSV for download
    const headers = ['Order No', 'Customer', 'Product', 'Amount', 'Status', 'Payment', 'Date'];
    const rows = sales.map((s) => [
      s.invoice?.invoiceNumber || s.saleNumber,
      `"${s.customerName.replace(/"/g, '""')}"`,
      `"${((s as any).items && (s as any).items.length > 0 ? (s as any).items.map((i: any) => i.productNameSnapshot).join('; ') : 'Equipment').replace(/"/g, '""')}"`,
      s.totalAmount,
      s.status,
      s.invoice?.status || 'PENDING',
      s.saleDate,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `sales_export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto pb-12">
      {/* 1. Page Header (Top Left Icon + Title + Subtitle & Top Right Actions) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Left Header info */}
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-500 border border-rose-100 flex items-center justify-center shadow-xs shrink-0">
            <ShoppingBag className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Sales</h1>
              <span className="sr-only">Sales &amp; Orders</span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 font-normal">
              Manage orders, track revenue and grow your business
            </p>
          </div>
        </div>

        {/* Right Header Action Buttons */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => alert('Import feature: Select CSV or XLSX sales file to upload.')}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs rounded-lg border border-slate-200 shadow-2xs transition-colors cursor-pointer"
          >
            <Upload className="w-4 h-4 text-slate-500" />
            <span>Import Sales</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs rounded-lg border border-slate-200 shadow-2xs transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Export</span>
          </button>

          {canCreate && (
            <button
              type="button"
              onClick={() => navigate('/sales/new')}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>New Sale</span>
              <span className="sr-only">Create Sale</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Filter Bar */}
      <SalesFilterBar
        filters={filterValues}
        onFilterChange={handleFilterChange}
        onResetFilters={handleResetFilters}
        onMoreFiltersClick={() => alert('Advanced Filter Drawer: Filter by Sales Rep, Payment Gateway, and Customer Segment')}
      />

      {/* 3. Top 5 KPI Cards */}
      <SalesKpiCards data={statsData?.kpis} trend={statsData?.trend} />

      {/* 4. Main 2-Column Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Left Column (~70% Width) */}
        <div className="lg:col-span-8 space-y-4">
          <SalesOrdersTable
            apiSales={sales}
            isLoading={isLoading}
            totalRecords={total}
            currentPage={currentPage}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(sz) => {
              setPageSize(sz);
              setCurrentPage(1);
            }}
            onAddSale={() => navigate('/sales/new')}
            onSelectOrder={(id) => navigate(`/sales/${id}`)}
          />

          {/* Bottom 4 Quick KPI Widgets */}
          <SalesBottomWidgets stats={statsData?.bottomWidgets} />
        </div>

        {/* Right Column (~30% Width) */}
        <div className="lg:col-span-4 space-y-4">
          {/* 1. Sales Trend Line Chart */}
          <SalesTrendWidget
            trend={statsData?.trend}
            totalSales={statsData?.kpis?.totalSales}
            totalSalesTrend={statsData?.kpis?.totalSalesTrend}
            period={filterValues.datePreset}
            onPeriodChange={(p) => handleFilterChange('datePreset', p)}
          />

          {/* 2. Top Products List */}
          <TopProductsWidget
            products={statsData?.topProducts}
            period={filterValues.datePreset}
            onPeriodChange={(p) => handleFilterChange('datePreset', p)}
          />

          {/* 3. Recent Sales List */}
          <RecentSalesWidget
            recentSales={statsData?.recentSales}
            onViewAll={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            onSelectSale={(id) => navigate(`/sales/${id}`)}
          />
        </div>
      </div>
    </div>
  );
};
