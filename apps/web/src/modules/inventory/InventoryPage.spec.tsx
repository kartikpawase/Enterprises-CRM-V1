import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../providers/ToastProvider';
import { InventoryPage } from './InventoryPage';
import * as inventoryApi from './inventory.api';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ToastProvider>{ui}</ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const mockAnalytics = {
  period: 'month',
  startDate: '2026-09-01T00:00:00.000Z',
  endDate: '2026-09-30T23:59:59.999Z',
  kpis: {
    totalSales: 25000,
    totalPurchases: 18000,
    totalCostOfGoodsSold: 14000,
    netProfit: 11000,
    grossMarginPercent: 44,
    totalQtySold: 35,
    totalQtyPurchased: 50,
    salesTransactionCount: 12,
    purchaseTransactionCount: 4,
    totalActiveItems: 8,
    totalStockQuantity: 120,
    currentStockValuation: 45000,
    lowStockItemsCount: 2,
  },
  topSellingItems: [
    {
      itemId: 'item-1',
      name: 'Standard Spare Part A',
      category: 'Electronics',
      totalQuantitySold: 20,
      totalRevenue: '7000.00',
      totalProfit: '3000.00',
    },
  ],
  topProfitableItems: [
    {
      itemId: 'item-2',
      name: 'Replacement Module B',
      category: 'Hardware',
      totalQuantitySold: 10,
      totalProfit: '6500.00',
      marginPercent: 43.3,
    },
  ],
  lowStockAlerts: [
    {
      id: 'item-3',
      name: 'Power Supply Unit C',
      category: 'Electrical',
      brand: 'PowerCorp',
      currentStock: 1,
      minStockLevel: 3,
    },
  ],
  dailySeries: [
    { date: '2026-09-01', sales: 4000, costs: 2200, profit: 1800 },
    { date: '2026-09-02', sales: 6500, costs: 3800, profit: 2700 },
  ],
};

const mockItems = [
  {
    id: 'item-1',
    name: 'Standard Spare Part A',
    category: 'Electronics',
    brand: 'GenericBrand',
    partNumber: 'SP-10',
    purchasePrice: 200,
    sellingPrice: 350,
    currentStock: 15,
    minStockLevel: 5,
    status: 'ACTIVE' as const,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  },
  {
    id: 'item-2',
    name: 'Replacement Module B',
    category: 'Hardware',
    brand: 'ApexTech',
    partNumber: 'MOD-75',
    purchasePrice: 850,
    sellingPrice: 1500,
    currentStock: 1,
    minStockLevel: 3,
    status: 'ACTIVE' as const,
    createdAt: '2026-09-01T10:00:00Z',
    updatedAt: '2026-09-01T10:00:00Z',
  },
];

const mockPurchases = [
  {
    id: 'pur-1',
    purchaseNumber: 'PUR-2026-0001',
    itemId: 'item-1',
    itemName: 'Standard Spare Part A',
    category: 'Electronics',
    supplierName: 'Apex Supplies',
    purchaseDate: '2026-09-01T10:00:00Z',
    quantity: 20,
    remainingQuantity: 15,
    purchasePricePerUnit: 200,
    totalAmount: 4000,
    notes: 'Lot #1',
    createdAt: '2026-09-01T10:00:00Z',
  },
];

const mockSales = [
  {
    id: 'sale-1',
    saleNumber: 'INV-SALE-2026-0001',
    itemId: 'item-1',
    itemName: 'Standard Spare Part A',
    category: 'Electronics',
    customerName: 'Kishore Kumar',
    customerPhone: '9876543210',
    saleDate: '2026-09-02T11:00:00Z',
    quantity: 5,
    sellingPricePerUnit: 350,
    purchaseCostPerUnit: 200,
    totalSaleAmount: 1750,
    totalCostAmount: 1000,
    profit: 750,
    paymentStatus: 'COMPLETED',
    notes: 'Counter delivery',
    createdAt: '2026-09-02T11:00:00Z',
  },
];

const mockProfitLedger = [
  {
    id: 'sale-1',
    saleNumber: 'INV-SALE-2026-0001',
    saleDate: '2026-09-02T11:00:00Z',
    itemId: 'item-1',
    itemName: 'Standard Spare Part A',
    category: 'Electronics',
    customerName: 'Kishore Kumar',
    quantity: 5,
    purchaseCostPerUnit: 200,
    sellingPricePerUnit: 350,
    totalCostAmount: 1000,
    totalSaleAmount: 1750,
    profit: 750,
    marginPercent: 42.9,
  },
];

describe('InventoryPage Frontend Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.spyOn(inventoryApi, 'useInventoryAnalyticsQuery').mockReturnValue({
      data: mockAnalytics,
      isLoading: false,
    } as any);

    vi.spyOn(inventoryApi, 'useInventoryItemsQuery').mockReturnValue({
      data: { data: mockItems, pagination: { page: 1, limit: 50, total: 2, totalPages: 1 } },
      isLoading: false,
    } as any);

    vi.spyOn(inventoryApi, 'useInventoryPurchasesQuery').mockReturnValue({
      data: { data: mockPurchases, pagination: { page: 1, limit: 50, total: 1, totalPages: 1 } },
      isLoading: false,
    } as any);

    vi.spyOn(inventoryApi, 'useInventorySalesQuery').mockReturnValue({
      data: { data: mockSales, pagination: { page: 1, limit: 50, total: 1, totalPages: 1 } },
      isLoading: false,
    } as any);

    vi.spyOn(inventoryApi, 'useInventoryProfitLedgerQuery').mockReturnValue({
      data: { data: mockProfitLedger, pagination: { page: 1, limit: 50, total: 1, totalPages: 1 } },
      isLoading: false,
    } as any);
  });

  it('1. Renders Inventory page title and action buttons', () => {
    renderWithProviders(<InventoryPage />);

    expect(screen.getByText('Inventory & Spare Parts')).toBeDefined();
    expect(screen.getByRole('button', { name: /add item/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /record purchase/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /record sale/i })).toBeDefined();
  });

  it('2. Renders all 5 navigation tabs', () => {
    renderWithProviders(<InventoryPage />);

    expect(screen.getByRole('button', { name: /overview & analytics/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /inventory items/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /purchases \(inward\)/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /sales \(outward\)/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /profit ledger/i })).toBeDefined();
  });

  it('3. Renders Overview KPI cards on initial view', () => {
    renderWithProviders(<InventoryPage />);

    expect(screen.getByText('Total Sales')).toBeDefined();
    expect(screen.getByText('Cost of Goods Sold')).toBeDefined();
    expect(screen.getAllByText('Net Profit').length).toBeGreaterThan(0);
    expect(screen.getByText('Stock Value')).toBeDefined();
    expect(screen.getByText('Low Stock Items')).toBeDefined();
    expect(screen.getByText('44% Gross Margin')).toBeDefined();
  });

  it('4. Navigates to Inventory Items tab and displays items with stock badges', () => {
    renderWithProviders(<InventoryPage />);

    const itemsTab = screen.getByRole('button', { name: /inventory items/i });
    fireEvent.click(itemsTab);

    expect(screen.getByText('Standard Spare Part A')).toBeDefined();
    expect(screen.getByText('Replacement Module B')).toBeDefined();
    expect(screen.getByText('15 units')).toBeDefined();
    expect(screen.getByText('1 units')).toBeDefined();
  });

  it('5. Navigates to Purchases tab and displays inward records', () => {
    renderWithProviders(<InventoryPage />);

    const purchasesTab = screen.getByRole('button', { name: /purchases \(inward\)/i });
    fireEvent.click(purchasesTab);

    expect(screen.getByText('PUR-2026-0001')).toBeDefined();
    expect(screen.getByText('Apex Supplies')).toBeDefined();
  });

  it('6. Navigates to Sales tab and displays outward records', () => {
    renderWithProviders(<InventoryPage />);

    const salesTab = screen.getByRole('button', { name: /sales \(outward\)/i });
    fireEvent.click(salesTab);

    expect(screen.getByText('INV-SALE-2026-0001')).toBeDefined();
    expect(screen.getByText('Kishore Kumar')).toBeDefined();
  });

  it('7. Navigates to Profit Ledger tab and displays margin and profit calculations', () => {
    renderWithProviders(<InventoryPage />);

    const profitTab = screen.getByRole('button', { name: /profit ledger/i });
    fireEvent.click(profitTab);

    expect(screen.getByText('Transaction-Level Profit Ledger')).toBeDefined();
    expect(screen.getByText('+₹750.00')).toBeDefined();
    expect(screen.getByText('42.9%')).toBeDefined();
  });

  it('8. Renders Delete button for items and opens Delete Confirmation Modal', () => {
    renderWithProviders(<InventoryPage />);

    const itemsTab = screen.getByRole('button', { name: /inventory items/i });
    fireEvent.click(itemsTab);

    const deleteButtons = screen.getAllByTitle('Delete Item');
    expect(deleteButtons.length).toBe(2);

    // Click delete on first item
    fireEvent.click(deleteButtons[0]);

    expect(screen.getByText('Delete Inventory Item?')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete:/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Standard Spare Part A/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /delete item/i }).length).toBeGreaterThan(0);
  });

  it('9. Cancels deletion when clicking Cancel in confirmation modal', () => {
    renderWithProviders(<InventoryPage />);

    const itemsTab = screen.getByRole('button', { name: /inventory items/i });
    fireEvent.click(itemsTab);

    const deleteButtons = screen.getAllByTitle('Delete Item');
    fireEvent.click(deleteButtons[0]);

    expect(screen.getByText('Delete Inventory Item?')).toBeInTheDocument();

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    expect(screen.queryByText('Delete Inventory Item?')).not.toBeInTheDocument();
  });

  it('10. Executes delete mutation when confirming Delete Item in modal', async () => {
    const mockDelete = vi.fn().mockResolvedValue({ success: true });
    vi.spyOn(inventoryApi, 'useDeleteInventoryItemMutation').mockReturnValue({
      mutateAsync: mockDelete,
      isPending: false,
    } as any);

    renderWithProviders(<InventoryPage />);

    const itemsTab = screen.getByRole('button', { name: /inventory items/i });
    fireEvent.click(itemsTab);

    const deleteButtons = screen.getAllByTitle('Delete Item');
    fireEvent.click(deleteButtons[0]);

    // Find the destructive button inside the modal
    const modalButtons = screen.getAllByRole('button', { name: /delete item/i });
    // The modal confirmation button is the one rendered inside the modal footer
    const confirmButton = modalButtons[modalButtons.length - 1];
    fireEvent.click(confirmButton);

    expect(mockDelete).toHaveBeenCalledWith('item-1');
  });

  it('11. Purchases tab renders View, Edit, and Delete action buttons for each purchase row', () => {
    renderWithProviders(<InventoryPage />);

    const purchasesTab = screen.getByRole('button', { name: /purchases \(inward\)/i });
    fireEvent.click(purchasesTab);

    expect(screen.getByTitle('View Purchase Details')).toBeInTheDocument();
    expect(screen.getByTitle('Edit Purchase & Recalculate')).toBeInTheDocument();
    expect(screen.getByTitle('Delete Purchase')).toBeInTheDocument();
  });

  it('12. Clicking View Purchase opens the View Purchase Modal', () => {
    renderWithProviders(<InventoryPage />);

    const purchasesTab = screen.getByRole('button', { name: /purchases \(inward\)/i });
    fireEvent.click(purchasesTab);

    const viewButton = screen.getByTitle('View Purchase Details');
    fireEvent.click(viewButton);

    expect(screen.getByText('Purchase Details')).toBeInTheDocument();
    expect(screen.getByText('Inward inventory batch specification')).toBeInTheDocument();
    expect(screen.getByText('Stock & Financial Breakdown')).toBeInTheDocument();
  });

  it('13. Clicking Edit Purchase opens the Edit Purchase Modal with recalculation notice', () => {
    renderWithProviders(<InventoryPage />);

    const purchasesTab = screen.getByRole('button', { name: /purchases \(inward\)/i });
    fireEvent.click(purchasesTab);

    const editButton = screen.getByTitle('Edit Purchase & Recalculate');
    fireEvent.click(editButton);

    expect(screen.getByText('Edit Purchase Record')).toBeInTheDocument();
    expect(screen.getByText(/Stock & Calculation Notice:/i)).toBeInTheDocument();
    expect(screen.getByText('Recalculated Inward Amount')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes & recalculate/i })).toBeInTheDocument();
  });

  it('14. Clicking Delete Purchase opens Delete Purchase Confirmation Modal', () => {
    renderWithProviders(<InventoryPage />);

    const purchasesTab = screen.getByRole('button', { name: /purchases \(inward\)/i });
    fireEvent.click(purchasesTab);

    const deleteButton = screen.getByTitle('Delete Purchase');
    fireEvent.click(deleteButton);

    expect(screen.getByText('Delete Purchase Record?')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete purchase:/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete & deduct stock/i })).toBeInTheDocument();
  });

  it('15. Sales tab renders View, Edit, and Delete action buttons for each sale row', () => {
    renderWithProviders(<InventoryPage />);

    const salesTab = screen.getByRole('button', { name: /sales \(outward\)/i });
    fireEvent.click(salesTab);

    expect(screen.getByTitle('View Sale Details')).toBeInTheDocument();
    expect(screen.getByTitle('Edit Sale & Recalculate')).toBeInTheDocument();
    expect(screen.getByTitle('Delete Sale')).toBeInTheDocument();
  });

  it('16. Clicking View Sale opens View Sale Modal and Clicking Edit opens Edit Sale Modal', () => {
    renderWithProviders(<InventoryPage />);

    const salesTab = screen.getByRole('button', { name: /sales \(outward\)/i });
    fireEvent.click(salesTab);

    // View Sale
    const viewButton = screen.getByTitle('View Sale Details');
    fireEvent.click(viewButton);

    expect(screen.getByText('Sale Details')).toBeInTheDocument();
    expect(screen.getByText('Sale Revenue & Profit Breakdown')).toBeInTheDocument();

    // Close view modal
    const closeButtons = screen.getAllByRole('button', { name: /close/i });
    fireEvent.click(closeButtons[closeButtons.length - 1]);

    // Edit Sale
    const editButton = screen.getByTitle('Edit Sale & Recalculate');
    fireEvent.click(editButton);

    expect(screen.getByText('Edit Sale Record')).toBeInTheDocument();
    expect(screen.getByText(/Recalculation Notice:/i)).toBeInTheDocument();
    expect(screen.getByText('Recalculated Financial Impact')).toBeInTheDocument();
  });

  it('17. Clicking Delete Sale opens Delete Sale Confirmation Modal', () => {
    renderWithProviders(<InventoryPage />);

    const salesTab = screen.getByRole('button', { name: /sales \(outward\)/i });
    fireEvent.click(salesTab);

    const deleteButton = screen.getByTitle('Delete Sale');
    fireEvent.click(deleteButton);

    expect(screen.getByText('Delete Sale Record?')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete sale:/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete & restore stock/i })).toBeInTheDocument();
  });
});
