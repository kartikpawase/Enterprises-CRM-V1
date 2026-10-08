import React, { useState } from 'react';
import {
  PackageSearch,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  DollarSign,
  Package,
  AlertTriangle,
  Search,
  Filter,
  Eye,
  Edit2,
  Trash2,
  Calendar,
  CheckCircle2,
  ShoppingBag,
  ShoppingCart,
  Percent,
} from 'lucide-react';
import {
  useInventoryItemsQuery,
  useInventoryPurchasesQuery,
  useInventorySalesQuery,
  useInventoryAnalyticsQuery,
  useInventoryProfitLedgerQuery,
  useCreateInventoryItemMutation,
  useUpdateInventoryItemMutation,
  useDeleteInventoryItemMutation,
  useCreatePurchaseMutation,
  useUpdatePurchaseMutation,
  useDeletePurchaseMutation,
  useCreateSaleMutation,
  useUpdateSaleMutation,
  useDeleteSaleMutation,
  type InventoryItem,
  type InventoryPurchase,
  type InventorySale,
  type ProfitLedgerRow,
} from './inventory.api';
import { InventoryItemModal } from './components/InventoryItemModal';
import { RecordPurchaseModal } from './components/RecordPurchaseModal';
import { RecordSaleModal } from './components/RecordSaleModal';
import { ViewPurchaseModal } from './components/ViewPurchaseModal';
import { EditPurchaseModal } from './components/EditPurchaseModal';
import { ViewSaleModal } from './components/ViewSaleModal';
import { EditSaleModal } from './components/EditSaleModal';
import { InventoryItemDetailModal } from './components/InventoryItemDetailModal';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../providers/ToastProvider';

type TabType = 'overview' | 'items' | 'purchases' | 'sales' | 'profit';
type PeriodType = 'today' | 'week' | 'month' | 'year' | 'custom';

export const InventoryPage: React.FC = () => {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [period, setPeriod] = useState<PeriodType>('month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Search & Filters for Items tab
  const [itemSearch, setItemSearch] = useState('');
  const [itemCategory, setItemCategory] = useState('ALL');
  const [lowStockOnly, setLowStockOnly] = useState(false);

  // Modals state
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<InventoryItem | null>(null);

  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [purchasePreselectedItemId, setPurchasePreselectedItemId] = useState<string | undefined>();
  const [viewingPurchase, setViewingPurchase] = useState<InventoryPurchase | null>(null);
  const [editingPurchase, setEditingPurchase] = useState<InventoryPurchase | null>(null);
  const [deletingPurchase, setDeletingPurchase] = useState<InventoryPurchase | null>(null);

  const [isSaleModalOpen, setIsSaleModalOpen] = useState(false);
  const [salePreselectedItemId, setSalePreselectedItemId] = useState<string | undefined>();
  const [viewingSale, setViewingSale] = useState<InventorySale | null>(null);
  const [editingSale, setEditingSale] = useState<InventorySale | null>(null);
  const [deletingSale, setDeletingSale] = useState<InventorySale | null>(null);

  const [detailModalItemId, setDetailModalItemId] = useState<string | null>(null);

  // Queries
  const { data: analytics, isLoading: isAnalyticsLoading } = useInventoryAnalyticsQuery({
    period,
    startDate: period === 'custom' ? customStartDate : undefined,
    endDate: period === 'custom' ? customEndDate : undefined,
  });

  const { data: itemsData, isLoading: isItemsLoading } = useInventoryItemsQuery({
    search: itemSearch || undefined,
    category: itemCategory !== 'ALL' ? itemCategory : undefined,
    lowStockOnly: lowStockOnly || undefined,
    limit: 100,
  });

  const { data: purchasesData, isLoading: isPurchasesLoading } = useInventoryPurchasesQuery({
    limit: 50,
  });

  const { data: salesData, isLoading: isSalesLoading } = useInventorySalesQuery({
    limit: 50,
  });

  const { data: profitLedgerData, isLoading: isProfitLedgerLoading } = useInventoryProfitLedgerQuery({
    period,
    startDate: period === 'custom' ? customStartDate : undefined,
    endDate: period === 'custom' ? customEndDate : undefined,
    limit: 100,
  });

  // Mutations
  const createItemMutation = useCreateInventoryItemMutation();
  const updateItemMutation = useUpdateInventoryItemMutation();
  const deleteItemMutation = useDeleteInventoryItemMutation();
  const createPurchaseMutation = useCreatePurchaseMutation();
  const updatePurchaseMutation = useUpdatePurchaseMutation();
  const deletePurchaseMutation = useDeletePurchaseMutation();
  const createSaleMutation = useCreateSaleMutation();
  const updateSaleMutation = useUpdateSaleMutation();
  const deleteSaleMutation = useDeleteSaleMutation();

  const allItems: InventoryItem[] = Array.isArray(itemsData)
    ? itemsData
    : (Array.isArray(itemsData?.data) ? itemsData.data : []);

  const allPurchases: InventoryPurchase[] = Array.isArray(purchasesData)
    ? purchasesData
    : (Array.isArray(purchasesData?.data) ? purchasesData.data : []);

  const allSales: InventorySale[] = Array.isArray(salesData)
    ? salesData
    : (Array.isArray(salesData?.data) ? salesData.data : []);

  const allProfitLedger: ProfitLedgerRow[] = Array.isArray(profitLedgerData)
    ? profitLedgerData
    : (Array.isArray(profitLedgerData?.data) ? profitLedgerData.data : []);

  // Handlers
  const handleOpenAddItem = () => {
    setEditingItem(null);
    setIsItemModalOpen(true);
  };

  const handleOpenEditItem = (it: InventoryItem) => {
    setEditingItem(it);
    setIsItemModalOpen(true);
  };

  const handleOpenRecordPurchase = (itemId?: string) => {
    setPurchasePreselectedItemId(itemId);
    setIsPurchaseModalOpen(true);
  };

  const handleOpenRecordSale = (itemId?: string) => {
    setSalePreselectedItemId(itemId);
    setIsSaleModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingItem || deleteItemMutation.isPending) return;
    try {
      await deleteItemMutation.mutateAsync(deletingItem.id);
      toast.success(`Inventory item "${deletingItem.name}" deleted successfully.`, 'Item Deleted');
      setDeletingItem(null);
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        err?.message ||
        'Failed to delete inventory item. It may be used in existing transactions.';
      toast.error(msg, 'Delete Failed');
    }
  };

  const handleConfirmDeletePurchase = async () => {
    if (!deletingPurchase || deletePurchaseMutation.isPending) return;
    try {
      await deletePurchaseMutation.mutateAsync(deletingPurchase.id);
      toast.success(
        `Purchase record "${deletingPurchase.purchaseNumber}" deleted and stock recalculated successfully.`,
        'Purchase Deleted'
      );
      setDeletingPurchase(null);
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        err?.message ||
        'Failed to delete purchase. Some units may already have been sold.';
      toast.error(msg, 'Delete Purchase Failed');
    }
  };

  const handleConfirmDeleteSale = async () => {
    if (!deletingSale || deleteSaleMutation.isPending) return;
    try {
      await deleteSaleMutation.mutateAsync(deletingSale.id);
      toast.success(
        `Sale record "${deletingSale.saleNumber}" deleted and stock restored successfully.`,
        'Sale Deleted'
      );
      setDeletingSale(null);
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        err?.message ||
        'Failed to delete sale record.';
      toast.error(msg, 'Delete Sale Failed');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/50 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* 1. Header with Primary Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-200/80 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-600 to-[#A00E1A] text-white flex items-center justify-center shadow-md shadow-red-200">
            <PackageSearch className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">
              Inventory & Spare Parts
            </h1>
            <p className="text-xs text-gray-500 font-medium mt-0.5">
              Track spare parts stock, inward supplier purchases, outward sales, and profit analytics
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleOpenAddItem}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-[#C1121F] hover:bg-[#A00E1A] rounded-xl shadow-sm transition-all hover:shadow"
          >
            <Plus className="w-4 h-4" /> Add Item
          </button>
          <button
            type="button"
            onClick={() => handleOpenRecordPurchase()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl border border-blue-200 shadow-sm transition-all"
          >
            <ArrowDownLeft className="w-4 h-4" /> Record Purchase
          </button>
          <button
            type="button"
            onClick={() => handleOpenRecordSale()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl border border-emerald-200 shadow-sm transition-all"
          >
            <ArrowUpRight className="w-4 h-4" /> Record Sale
          </button>
        </div>
      </div>

      {/* 2. Navigation Tabs */}
      <div className="flex border-b border-gray-200 bg-white px-4 rounded-xl border border-gray-200/80 shadow-sm gap-2 overflow-x-auto">
        {[
          { key: 'overview', label: 'Overview & Analytics', icon: TrendingUp },
          { key: 'items', label: `Inventory Items (${allItems.length})`, icon: Package },
          { key: 'purchases', label: 'Purchases (Inward)', icon: ShoppingBag },
          { key: 'sales', label: 'Sales (Outward)', icon: ShoppingCart },
          { key: 'profit', label: 'Profit Ledger', icon: DollarSign },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as TabType)}
              className={`flex items-center gap-2 py-3 px-3.5 text-xs font-bold border-b-2 whitespace-nowrap transition-all ${
                isActive
                  ? 'border-[#C1121F] text-[#C1121F]'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-[#C1121F]' : 'text-gray-400'}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 3. TAB CONTENT */}

      {/* ========================================================================= */}
      {/* TAB 1: OVERVIEW & PROFIT ANALYTICS */}
      {/* ========================================================================= */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Period Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-lg">
              {(['today', 'week', 'month', 'year', 'custom'] as PeriodType[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md capitalize transition-all ${
                    period === p
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : p === 'year' ? 'This Year' : p}
                </button>
              ))}
            </div>

            {period === 'custom' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-2.5 py-1 text-xs border border-gray-300 rounded-lg outline-none"
                />
                <span className="text-xs text-gray-400">to</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-2.5 py-1 text-xs border border-gray-300 rounded-lg outline-none"
                />
              </div>
            )}
          </div>

          {/* KPI Metric Cards */}
          {isAnalyticsLoading ? (
            <div className="p-8 text-center text-sm text-gray-500 bg-white rounded-xl border">
              Loading analytics...
            </div>
          ) : analytics ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
                {/* Total Sales */}
                <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                  <div className="flex items-center justify-between text-gray-400">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      Total Sales
                    </span>
                    <ShoppingCart className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="text-xl font-black text-gray-900 mt-2">
                    ₹{analytics.kpis.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-gray-500 font-medium mt-1">
                    {analytics.kpis.salesTransactionCount} sales ({analytics.kpis.totalQtySold} units sold)
                  </div>
                </div>

                {/* Cost of Goods Sold */}
                <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                  <div className="flex items-center justify-between text-gray-400">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      Cost of Goods Sold
                    </span>
                    <ArrowDownLeft className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="text-xl font-black text-gray-900 mt-2">
                    ₹{analytics.kpis.totalCostOfGoodsSold.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-gray-500 font-medium mt-1">
                    FIFO purchase cost basis
                  </div>
                </div>

                {/* Net Profit */}
                <div className="bg-gradient-to-br from-emerald-500 to-emerald-700 p-4 rounded-2xl text-white shadow-sm shadow-emerald-200">
                  <div className="flex items-center justify-between text-emerald-100">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Net Profit</span>
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <div className="text-xl font-black mt-2">
                    ₹{analytics.kpis.netProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-emerald-100 font-semibold mt-1">
                    {analytics.kpis.grossMarginPercent}% Gross Margin
                  </div>
                </div>

                {/* Current Stock Valuation */}
                <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                  <div className="flex items-center justify-between text-gray-400">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      Stock Value
                    </span>
                    <Package className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="text-xl font-black text-blue-700 mt-2">
                    ₹{analytics.kpis.currentStockValuation.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-gray-500 font-medium mt-1">
                    {analytics.kpis.totalStockQuantity} total units on hand
                  </div>
                </div>

                {/* Low Stock Items */}
                <div
                  className={`p-4 rounded-2xl border shadow-sm ${
                    analytics.kpis.lowStockItemsCount > 0
                      ? 'bg-amber-50/70 border-amber-200'
                      : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between text-amber-700">
                    <span className="text-[11px] font-bold uppercase tracking-wider">Low Stock Items</span>
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div
                    className={`text-xl font-black mt-2 ${
                      analytics.kpis.lowStockItemsCount > 0 ? 'text-amber-800' : 'text-gray-900'
                    }`}
                  >
                    {analytics.kpis.lowStockItemsCount} items
                  </div>
                  <div className="text-[10px] text-amber-700 font-medium mt-1">
                    {analytics.kpis.lowStockItemsCount > 0 ? 'Needs reorder attention' : 'Healthy inventory'}
                  </div>
                </div>

                {/* Total Purchases */}
                <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
                  <div className="flex items-center justify-between text-gray-400">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                      Purchases (Inward)
                    </span>
                    <ShoppingBag className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="text-xl font-black text-gray-900 mt-2">
                    ₹{analytics.kpis.totalPurchases.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-gray-500 font-medium mt-1">
                    {analytics.kpis.purchaseTransactionCount} purchases ({analytics.kpis.totalQtyPurchased} units)
                  </div>
                </div>
              </div>

              {/* Trend Chart: Sales vs Costs vs Profit */}
              {analytics.dailySeries && analytics.dailySeries.length > 0 && (
                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">
                        Sales, Cost & Profit Trend ({period.toUpperCase()})
                      </h3>
                      <p className="text-xs text-gray-500">Visual comparison over time</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs font-semibold">
                      <span className="flex items-center gap-1 text-emerald-600">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Sales
                      </span>
                      <span className="flex items-center gap-1 text-gray-400">
                        <span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block" /> Cost
                      </span>
                      <span className="flex items-center gap-1 text-blue-600">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" /> Net Profit
                      </span>
                    </div>
                  </div>

                  {/* Simple Responsive SVG Chart */}
                  <div className="h-44 flex items-end gap-2 pt-4 border-b border-gray-100 overflow-x-auto">
                    {analytics.dailySeries.map((pt: any, idx: number) => {
                      const maxVal = Math.max(
                        ...analytics.dailySeries.map((d: any) => Math.max(d.sales, d.costs, d.profit, 1))
                      );
                      const salesHeight = (pt.sales / maxVal) * 120;
                      const profitHeight = (Math.max(pt.profit, 0) / maxVal) * 120;

                      return (
                        <div key={idx} className="flex-1 min-w-[36px] flex flex-col items-center gap-1 group">
                          <div className="text-[9px] text-emerald-700 font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                            ₹{pt.profit}
                          </div>
                          <div className="w-full flex items-end justify-center gap-0.5">
                            <div
                              style={{ height: `${salesHeight}px` }}
                              className="w-2.5 bg-emerald-200 rounded-t group-hover:bg-emerald-300 transition-all"
                              title={`Sales: ₹${pt.sales}`}
                            />
                            <div
                              style={{ height: `${profitHeight}px` }}
                              className="w-2.5 bg-emerald-600 rounded-t group-hover:bg-emerald-700 transition-all"
                              title={`Profit: ₹${pt.profit}`}
                            />
                          </div>
                          <div className="text-[10px] text-gray-400 font-mono rotate-45 origin-left pt-1">
                            {pt.date.slice(5)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 2-Column Ranking: Top Selling & Most Profitable */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Top Selling Items */}
                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-900">Top Selling Spare Parts</h3>
                    <span className="text-xs text-gray-400">By Quantity Sold</span>
                  </div>
                  {analytics.topSellingItems && analytics.topSellingItems.length > 0 ? (
                    <div className="divide-y divide-gray-100">
                      {analytics.topSellingItems.map((item: any, idx: number) => (
                        <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                          <div>
                            <div className="font-bold text-gray-900">{item.name}</div>
                            <div className="text-gray-400 text-[11px]">{item.category}</div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-emerald-700">{item.totalQuantitySold} units sold</div>
                            <div className="text-gray-500 text-[11px]">₹{Number(item.totalRevenue).toFixed(2)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-xs text-gray-400">No sales in this period.</div>
                  )}
                </div>

                {/* Most Profitable Items */}
                <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-900">Most Profitable Items</h3>
                    <span className="text-xs text-gray-400">By Total Profit Generated</span>
                  </div>
                  {analytics.topProfitableItems && analytics.topProfitableItems.length > 0 ? (
                    <div className="divide-y divide-gray-100">
                      {analytics.topProfitableItems.map((item: any, idx: number) => (
                        <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                          <div>
                            <div className="font-bold text-gray-900">{item.name}</div>
                            <div className="text-gray-400 text-[11px]">
                              {item.category} · {item.marginPercent}% margin
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-emerald-700">+₹{Number(item.totalProfit).toFixed(2)}</div>
                            <div className="text-gray-500 text-[11px]">{item.totalQuantitySold} units sold</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 text-center text-xs text-gray-400">No profit records in this period.</div>
                  )}
                </div>
              </div>

              {/* Low Stock Alert Section */}
              {analytics.lowStockAlerts && analytics.lowStockAlerts.length > 0 && (
                <div className="bg-amber-50/50 p-5 rounded-2xl border border-amber-200 space-y-3">
                  <div className="flex items-center gap-2 text-amber-800">
                    <AlertTriangle className="w-5 h-5" />
                    <h3 className="text-sm font-bold">Low Stock Warning & Restock Required</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {analytics.lowStockAlerts.map((ls: any) => (
                      <div
                        key={ls.id}
                        className="bg-white p-3 rounded-xl border border-amber-200 flex items-center justify-between"
                      >
                        <div>
                          <div className="font-bold text-xs text-gray-900">{ls.name}</div>
                          <div className="text-[11px] text-amber-700 font-semibold mt-0.5">
                            Stock: {ls.currentStock} units (Alert threshold: {ls.minStockLevel})
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenRecordPurchase(ls.id)}
                          className="px-2.5 py-1 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition-colors"
                        >
                          + Purchase
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: INVENTORY ITEMS MASTER */}
      {/* ========================================================================= */}
      {activeTab === 'items' && (
        <div className="space-y-4">
          {/* Search and Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative min-w-[220px] flex-1 max-w-sm">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search items by name, brand, SKU..."
                  value={itemSearch}
                  onChange={(e) => setItemSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                />
              </div>

              <select
                value={itemCategory}
                onChange={(e) => setItemCategory(e.target.value)}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none bg-white"
              >
                <option value="ALL">All Categories</option>
                <option value="General">General</option>
                <option value="Equipment">Equipment</option>
                <option value="Electronics & Electrical">Electronics & Electrical</option>
                <option value="Mechanical & Hardware">Mechanical & Hardware</option>
                <option value="Spare Parts & Components">Spare Parts & Components</option>
                <option value="Consumables & Supplies">Consumables & Supplies</option>
                <option value="Accessories & Tools">Accessories & Tools</option>
                <option value="Other">Other</option>
              </select>

              <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 cursor-pointer pl-2">
                <input
                  type="checkbox"
                  checked={lowStockOnly}
                  onChange={(e) => setLowStockOnly(e.target.checked)}
                  className="rounded text-red-600 focus:ring-red-500"
                />
                Low Stock Only
              </label>
            </div>

            <button
              type="button"
              onClick={handleOpenAddItem}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[#C1121F] hover:bg-[#A00E1A] rounded-lg shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" /> New Item
            </button>
          </div>

          {/* Items Table */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {isItemsLoading ? (
              <div className="p-8 text-center text-xs text-gray-500">Loading inventory items...</div>
            ) : allItems.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-50/80 text-gray-600 font-bold border-b border-gray-200">
                    <tr>
                      <th className="p-3.5">Item & Brand</th>
                      <th className="p-3.5">Category</th>
                      <th className="p-3.5">SKU / Part #</th>
                      <th className="p-3.5 text-center">Current Stock</th>
                      <th className="p-3.5 text-right">Cost Price (₹)</th>
                      <th className="p-3.5 text-right">Selling Price (₹)</th>
                      <th className="p-3.5 text-right">Profit / Unit</th>
                      <th className="p-3.5 text-center">Status</th>
                      <th className="p-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-medium">
                    {allItems.map((it: any) => {
                      const cost = parseFloat(String(it.purchasePrice || '0')) || 0;
                      const sell = parseFloat(String(it.sellingPrice || '0')) || 0;
                      const profit = sell - cost;
                      const isLow = it.currentStock <= it.minStockLevel;
                      const isOutOfStock = it.currentStock <= 0;

                      return (
                        <tr key={it.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="p-3.5">
                            <div className="font-bold text-gray-900 text-sm">{it.name}</div>
                            {it.brand && (
                              <div className="text-[11px] text-gray-400 font-normal">{it.brand}</div>
                            )}
                          </td>
                          <td className="p-3.5">
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-md font-medium text-[11px]">
                              {it.category}
                            </span>
                          </td>
                          <td className="p-3.5 font-mono text-gray-600">{it.partNumber || '—'}</td>
                          <td className="p-3.5 text-center">
                            <span
                              className={`px-2.5 py-1 rounded-full font-bold text-xs inline-flex items-center gap-1 ${
                                isOutOfStock
                                  ? 'bg-red-100 text-red-800'
                                  : isLow
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {it.currentStock} units
                            </span>
                          </td>
                          <td className="p-3.5 text-right font-semibold text-gray-700">₹{cost.toFixed(2)}</td>
                          <td className="p-3.5 text-right font-bold text-gray-900">₹{sell.toFixed(2)}</td>
                          <td className="p-3.5 text-right">
                            <span className="font-bold text-emerald-700">+₹{profit.toFixed(2)}</span>
                          </td>
                          <td className="p-3.5 text-center">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                it.status === 'ACTIVE'
                                  ? 'bg-emerald-50 text-emerald-700'
                                  : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {it.status}
                            </span>
                          </td>
                          <td className="p-3.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                title="View Details"
                                onClick={() => setDetailModalItemId(it.id)}
                                className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                title="Edit"
                                onClick={() => handleOpenEditItem(it)}
                                className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                title="Delete Item"
                                onClick={() => setDeletingItem(it)}
                                className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                title="Inward Purchase"
                                onClick={() => handleOpenRecordPurchase(it.id)}
                                className="px-2 py-1 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 transition-colors"
                              >
                                + Buy
                              </button>
                              <button
                                type="button"
                                title="Outward Sale"
                                disabled={it.currentStock <= 0}
                                onClick={() => handleOpenRecordSale(it.id)}
                                className="px-2 py-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded border border-emerald-200 transition-colors disabled:opacity-40"
                              >
                                + Sell
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-12 text-center text-xs text-gray-400">
                No items found. Click "+ Add Item" to register your first inventory item.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: PURCHASES (INWARD RECORDS) */}
      {/* ========================================================================= */}
      {activeTab === 'purchases' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Inward Purchase Transactions</h2>
              <p className="text-xs text-gray-500">
                Stock intake records from suppliers with batch unit purchase cost
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleOpenRecordPurchase()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" /> Record Purchase
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {isPurchasesLoading ? (
              <div className="p-8 text-center text-xs text-gray-500">Loading purchase records...</div>
            ) : allPurchases.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-50/80 text-gray-600 font-bold border-b border-gray-200">
                    <tr>
                      <th className="p-3.5">Date</th>
                      <th className="p-3.5">Purchase #</th>
                      <th className="p-3.5">Item Name & SKU</th>
                      <th className="p-3.5">Supplier</th>
                      <th className="p-3.5 text-right">Purchased Qty</th>
                      <th className="p-3.5 text-right">FIFO Remaining</th>
                      <th className="p-3.5 text-right">Unit Cost (₹)</th>
                      <th className="p-3.5 text-right">Total Amount (₹)</th>
                      <th className="p-3.5 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-medium">
                    {allPurchases.map((p: any) => (
                      <tr key={p.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="p-3.5 font-mono text-gray-600">
                          {new Date(p.purchaseDate).toLocaleDateString('en-IN')}
                        </td>
                        <td className="p-3.5 font-bold text-blue-700">{p.purchaseNumber}</td>
                        <td className="p-3.5">
                          <div className="font-bold text-gray-900">{p.itemName}</div>
                          {p.partNumber && (
                            <div className="text-[11px] text-gray-400 font-mono">{p.partNumber}</div>
                          )}
                        </td>
                        <td className="p-3.5 text-gray-700">{p.supplierName || '—'}</td>
                        <td className="p-3.5 text-right font-bold text-gray-900">{p.quantity}</td>
                        <td className="p-3.5 text-right font-mono">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] ${
                              p.remainingQuantity > 0
                                ? 'bg-emerald-50 text-emerald-700 font-semibold'
                                : 'text-gray-400'
                            }`}
                          >
                            {p.remainingQuantity}
                          </span>
                        </td>
                        <td className="p-3.5 text-right">₹{Number(p.purchasePricePerUnit).toFixed(2)}</td>
                        <td className="p-3.5 text-right font-extrabold text-gray-900">
                          ₹{Number(p.totalAmount).toFixed(2)}
                        </td>
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => setViewingPurchase(p)}
                              title="View Purchase Details"
                              className="p-1.5 text-gray-500 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingPurchase(p)}
                              title="Edit Purchase & Recalculate"
                              className="p-1.5 text-gray-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingPurchase(p)}
                              title="Delete Purchase"
                              className="p-1.5 text-gray-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-12 text-center text-xs text-gray-400">
                No purchase transactions recorded yet. Click "+ Record Purchase" to inward stock.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: SALES (OUTWARD RECORDS) */}
      {/* ========================================================================= */}
      {activeTab === 'sales' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Outward Sales History</h2>
              <p className="text-xs text-gray-500">
                Customer delivery transactions with locked purchase cost and calculated profit
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleOpenRecordSale()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" /> Record Sale
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {isSalesLoading ? (
              <div className="p-8 text-center text-xs text-gray-500">Loading sales records...</div>
            ) : allSales.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-50/80 text-gray-600 font-bold border-b border-gray-200">
                    <tr>
                      <th className="p-3.5">Date</th>
                      <th className="p-3.5">Sale #</th>
                      <th className="p-3.5">Item Name</th>
                      <th className="p-3.5">Customer</th>
                      <th className="p-3.5 text-right">Qty</th>
                      <th className="p-3.5 text-right">Sale Price (₹)</th>
                      <th className="p-3.5 text-right">FIFO Cost (₹)</th>
                      <th className="p-3.5 text-right">Total Sale (₹)</th>
                      <th className="p-3.5 text-right">Net Profit (₹)</th>
                      <th className="p-3.5 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-medium">
                    {allSales.map((s: any) => (
                      <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="p-3.5 font-mono text-gray-600">
                          {new Date(s.saleDate).toLocaleDateString('en-IN')}
                        </td>
                        <td className="p-3.5 font-bold text-emerald-700">{s.saleNumber}</td>
                        <td className="p-3.5">
                          <div className="font-bold text-gray-900">{s.itemName}</div>
                          {s.category && (
                            <div className="text-[11px] text-gray-400">{s.category}</div>
                          )}
                        </td>
                        <td className="p-3.5">
                          <div className="font-semibold text-gray-900">{s.customerName || 'Direct / Walk-in'}</div>
                          {s.customerPhone && (
                            <div className="text-[11px] text-gray-400 font-mono">{s.customerPhone}</div>
                          )}
                        </td>
                        <td className="p-3.5 text-right font-bold text-gray-900">{s.quantity}</td>
                        <td className="p-3.5 text-right">₹{Number(s.sellingPricePerUnit).toFixed(2)}</td>
                        <td className="p-3.5 text-right text-gray-500 font-mono">
                          ₹{Number(s.purchaseCostPerUnit).toFixed(2)}
                        </td>
                        <td className="p-3.5 text-right font-bold text-gray-900">
                          ₹{Number(s.totalSaleAmount).toFixed(2)}
                        </td>
                        <td className="p-3.5 text-right font-extrabold text-emerald-700">
                          +₹{Number(s.profit).toFixed(2)}
                        </td>
                        <td className="p-3.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => setViewingSale(s)}
                              title="View Sale Details"
                              className="p-1.5 text-gray-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingSale(s)}
                              title="Edit Sale & Recalculate"
                              className="p-1.5 text-gray-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingSale(s)}
                              title="Delete Sale"
                              className="p-1.5 text-gray-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-12 text-center text-xs text-gray-400">
                No sales recorded yet. Click "+ Record Sale" to dispatch stock.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: PROFIT LEDGER (SECTION 14 REQUIREMENT) */}
      {/* ========================================================================= */}
      {activeTab === 'profit' && (
        <div className="space-y-4">
          {/* Period Filter for Profit Ledger */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Transaction-Level Profit Ledger</h2>
              <p className="text-xs text-gray-500">
                Complete audit breakdown of item cost, sale price, and net profit per transaction
              </p>
            </div>

            <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-lg">
              {(['today', 'week', 'month', 'year', 'custom'] as PeriodType[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-md capitalize transition-all ${
                    period === p
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  {p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : p === 'year' ? 'This Year' : p}
                </button>
              ))}
            </div>
          </div>

          {/* Ledger Table */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {isProfitLedgerLoading ? (
              <div className="p-8 text-center text-xs text-gray-500">Loading profit ledger...</div>
            ) : allProfitLedger.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-gray-50/80 text-gray-600 font-bold border-b border-gray-200">
                    <tr>
                      <th className="p-3.5">Date</th>
                      <th className="p-3.5">Sale #</th>
                      <th className="p-3.5">Spare Part / Item</th>
                      <th className="p-3.5">Customer</th>
                      <th className="p-3.5 text-right">Quantity</th>
                      <th className="p-3.5 text-right">Buy Cost / Unit</th>
                      <th className="p-3.5 text-right">Sell Price / Unit</th>
                      <th className="p-3.5 text-right">Total Cost</th>
                      <th className="p-3.5 text-right">Total Sale</th>
                      <th className="p-3.5 text-right">Net Profit</th>
                      <th className="p-3.5 text-right">Margin %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-medium">
                    {allProfitLedger.map((row: any) => (
                      <tr key={row.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="p-3.5 font-mono text-gray-600">
                          {new Date(row.saleDate).toLocaleDateString('en-IN')}
                        </td>
                        <td className="p-3.5 font-bold text-gray-900">{row.saleNumber}</td>
                        <td className="p-3.5">
                          <div className="font-bold text-gray-900">{row.itemName}</div>
                          <div className="text-[11px] text-gray-400">{row.category}</div>
                        </td>
                        <td className="p-3.5 text-gray-800">{row.customerName || 'Direct / Walk-in'}</td>
                        <td className="p-3.5 text-right font-bold text-gray-900">{row.quantity}</td>
                        <td className="p-3.5 text-right text-gray-500 font-mono">
                          ₹{row.purchaseCostPerUnit.toFixed(2)}
                        </td>
                        <td className="p-3.5 text-right text-gray-700 font-mono">
                          ₹{row.sellingPricePerUnit.toFixed(2)}
                        </td>
                        <td className="p-3.5 text-right text-gray-500 font-semibold">
                          ₹{row.totalCostAmount.toFixed(2)}
                        </td>
                        <td className="p-3.5 text-right font-bold text-gray-900">
                          ₹{row.totalSaleAmount.toFixed(2)}
                        </td>
                        <td className="p-3.5 text-right font-black text-emerald-700 bg-emerald-50/40">
                          +₹{row.profit.toFixed(2)}
                        </td>
                        <td className="p-3.5 text-right font-bold text-emerald-700">
                          {row.marginPercent}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-12 text-center text-xs text-gray-400">
                No sales records in the selected period.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <InventoryItemModal
        isOpen={isItemModalOpen}
        onClose={() => setIsItemModalOpen(false)}
        item={editingItem}
        onSubmit={async (data) => {
          if (editingItem) {
            await updateItemMutation.mutateAsync(data);
          } else {
            await createItemMutation.mutateAsync(data);
          }
        }}
        isLoading={createItemMutation.isPending || updateItemMutation.isPending}
      />

      <RecordPurchaseModal
        isOpen={isPurchaseModalOpen}
        onClose={() => setIsPurchaseModalOpen(false)}
        items={allItems}
        preselectedItemId={purchasePreselectedItemId}
        onSubmit={async (data) => {
          await createPurchaseMutation.mutateAsync(data);
        }}
        isLoading={createPurchaseMutation.isPending}
      />

      <RecordSaleModal
        isOpen={isSaleModalOpen}
        onClose={() => setIsSaleModalOpen(false)}
        items={allItems}
        preselectedItemId={salePreselectedItemId}
        onSubmit={async (data) => {
          await createSaleMutation.mutateAsync(data);
        }}
        isLoading={createSaleMutation.isPending}
      />

      <InventoryItemDetailModal
        isOpen={!!detailModalItemId}
        onClose={() => setDetailModalItemId(null)}
        itemId={detailModalItemId || undefined}
        onEdit={(it) => {
          setDetailModalItemId(null);
          handleOpenEditItem(it);
        }}
        onRecordPurchase={(id) => {
          setDetailModalItemId(null);
          handleOpenRecordPurchase(id);
        }}
        onRecordSale={(id) => {
          setDetailModalItemId(null);
          handleOpenRecordSale(id);
        }}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={Boolean(deletingItem)}
        onClose={() => {
          if (!deleteItemMutation.isPending) {
            setDeletingItem(null);
          }
        }}
        title="Delete Inventory Item?"
        size="sm"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setDeletingItem(null)}
              disabled={deleteItemMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="md"
              onClick={handleConfirmDelete}
              isLoading={deleteItemMutation.isPending}
              disabled={deleteItemMutation.isPending}
            >
              Delete Item
            </Button>
          </>
        }
      >
        <div className="space-y-3 py-1">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-200">
              <Trash2 className="w-4 h-4" />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-slate-900">
                Are you sure you want to delete:
              </p>
              <p className="text-sm font-bold text-slate-900 bg-slate-50 p-2 rounded-lg border border-slate-200">
                {deletingItem?.name}{' '}
                {deletingItem?.partNumber && (
                  <span className="font-mono text-xs text-slate-500 font-normal">
                    ({deletingItem.partNumber})
                  </span>
                )}
              </p>
              <p className="text-xs text-slate-500 pt-1">
                This action cannot be undone. Items with historical sales or supplier purchase records cannot be deleted.
              </p>
            </div>
          </div>
        </div>
      </Modal>

      {/* View Purchase Modal */}
      <ViewPurchaseModal
        isOpen={Boolean(viewingPurchase)}
        onClose={() => setViewingPurchase(null)}
        purchase={viewingPurchase}
        onEdit={() => {
          const p = viewingPurchase;
          setViewingPurchase(null);
          setEditingPurchase(p);
        }}
      />

      {/* Edit Purchase Modal */}
      <EditPurchaseModal
        isOpen={Boolean(editingPurchase)}
        onClose={() => setEditingPurchase(null)}
        purchase={editingPurchase}
        onSubmit={async (data) => {
          await updatePurchaseMutation.mutateAsync(data);
          toast.success('Purchase updated and stock recalculated successfully.', 'Purchase Updated');
        }}
        isLoading={updatePurchaseMutation.isPending}
      />

      {/* Delete Purchase Confirmation Modal */}
      <Modal
        isOpen={Boolean(deletingPurchase)}
        onClose={() => {
          if (!deletePurchaseMutation.isPending) {
            setDeletingPurchase(null);
          }
        }}
        title="Delete Purchase Record?"
        size="sm"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setDeletingPurchase(null)}
              disabled={deletePurchaseMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="md"
              onClick={handleConfirmDeletePurchase}
              isLoading={deletePurchaseMutation.isPending}
              disabled={deletePurchaseMutation.isPending}
            >
              Delete & Deduct Stock
            </Button>
          </>
        }
      >
        <div className="space-y-3 py-1">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-200">
              <Trash2 className="w-4 h-4" />
            </div>
            <div className="space-y-1.5 text-xs">
              <p className="text-sm font-semibold text-slate-900">
                Are you sure you want to delete purchase:
              </p>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <div className="font-bold text-blue-700 font-mono">
                  {deletingPurchase?.purchaseNumber}
                </div>
                <div className="text-gray-900 font-medium">
                  {deletingPurchase?.itemName} — <strong className="text-slate-900">{deletingPurchase?.quantity} units</strong> @ ₹{Number(deletingPurchase?.purchasePricePerUnit || 0).toFixed(2)}
                </div>
                <div className="text-[11px] text-gray-500">
                  Total: ₹{Number(deletingPurchase?.totalAmount || 0).toFixed(2)}
                </div>
              </div>
              <p className="text-[11px] text-rose-600 font-medium pt-1">
                Warning: Deleting this inward purchase will deduct {deletingPurchase?.quantity} units from item stock and remove this batch from FIFO cost calculation.
              </p>
            </div>
          </div>
        </div>
      </Modal>

      {/* View Sale Modal */}
      <ViewSaleModal
        isOpen={Boolean(viewingSale)}
        onClose={() => setViewingSale(null)}
        sale={viewingSale}
        onEdit={() => {
          const s = viewingSale;
          setViewingSale(null);
          setEditingSale(s);
        }}
      />

      {/* Edit Sale Modal */}
      <EditSaleModal
        isOpen={Boolean(editingSale)}
        onClose={() => setEditingSale(null)}
        sale={editingSale}
        items={allItems}
        onSubmit={async (data) => {
          await updateSaleMutation.mutateAsync(data);
          toast.success('Sale record updated and profit recalculated successfully.', 'Sale Updated');
        }}
        isLoading={updateSaleMutation.isPending}
      />

      {/* Delete Sale Confirmation Modal */}
      <Modal
        isOpen={Boolean(deletingSale)}
        onClose={() => {
          if (!deleteSaleMutation.isPending) {
            setDeletingSale(null);
          }
        }}
        title="Delete Sale Record?"
        size="sm"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => setDeletingSale(null)}
              disabled={deleteSaleMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="md"
              onClick={handleConfirmDeleteSale}
              isLoading={deleteSaleMutation.isPending}
              disabled={deleteSaleMutation.isPending}
            >
              Delete & Restore Stock
            </Button>
          </>
        }
      >
        <div className="space-y-3 py-1">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-200">
              <Trash2 className="w-4 h-4" />
            </div>
            <div className="space-y-1.5 text-xs">
              <p className="text-sm font-semibold text-slate-900">
                Are you sure you want to delete sale:
              </p>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                <div className="font-bold text-emerald-700 font-mono">
                  {deletingSale?.saleNumber}
                </div>
                <div className="text-gray-900 font-medium">
                  {deletingSale?.itemName} — <strong className="text-slate-900">{deletingSale?.quantity} units</strong> @ ₹{Number(deletingSale?.sellingPricePerUnit || 0).toFixed(2)}
                </div>
                <div className="text-[11px] text-gray-500">
                  Customer: {deletingSale?.customerName || 'Direct / Walk-in'} | Total: ₹{Number(deletingSale?.totalSaleAmount || 0).toFixed(2)}
                </div>
              </div>
              <p className="text-[11px] text-emerald-700 font-medium pt-1">
                Notice: Deleting this outward sale will restore {deletingSale?.quantity} units back into item stock and remove this sale amount and profit from analytics.
              </p>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
