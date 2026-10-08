import React, { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import type { InventoryItem } from '../inventory.api';

interface InventoryItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
  item?: InventoryItem | null;
  isLoading?: boolean;
}

const CATEGORIES = [
  'General',
  'Equipment',
  'Electronics & Electrical',
  'Mechanical & Hardware',
  'Spare Parts & Components',
  'Consumables & Supplies',
  'Accessories & Tools',
  'Other',
];

export const InventoryItemModal: React.FC<InventoryItemModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  item,
  isLoading = false,
}) => {
  const isEdit = !!item;

  const [name, setName] = useState('');
  const [category, setCategory] = useState('General');
  const [brand, setBrand] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [description, setDescription] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('0');
  const [sellingPrice, setSellingPrice] = useState('0');
  const [initialStock, setInitialStock] = useState('0');
  const [minStockLevel, setMinStockLevel] = useState('2');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE' | 'DISCONTINUED'>('ACTIVE');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      setName(item.name || '');
      setCategory(item.category || 'General');
      setBrand(item.brand || '');
      setPartNumber(item.partNumber || '');
      setDescription(item.description || '');
      setPurchasePrice(String(item.purchasePrice || '0'));
      setSellingPrice(String(item.sellingPrice || '0'));
      setInitialStock(String(item.currentStock || '0'));
      setMinStockLevel(String(item.minStockLevel || '0'));
      setStatus(item.status || 'ACTIVE');
    } else {
      setName('');
      setCategory('General');
      setBrand('');
      setPartNumber('');
      setDescription('');
      setPurchasePrice('0');
      setSellingPrice('0');
      setInitialStock('0');
      setMinStockLevel('2');
      setStatus('ACTIVE');
    }
    setError(null);
  }, [item, isOpen]);

  if (!isOpen) return null;

  const buy = parseFloat(purchasePrice) || 0;
  const sell = parseFloat(sellingPrice) || 0;
  const unitProfit = sell - buy;
  const marginPercent = sell > 0 ? ((unitProfit / sell) * 100).toFixed(1) : '0';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Item name is required');
      return;
    }

    if (buy < 0 || sell < 0) {
      setError('Prices cannot be negative');
      return;
    }

    try {
      if (isEdit) {
        await onSubmit({
          id: item.id,
          name: name.trim(),
          category,
          brand: brand.trim() || undefined,
          partNumber: partNumber.trim() || undefined,
          description: description.trim() || undefined,
          purchasePrice: buy,
          sellingPrice: sell,
          minStockLevel: parseInt(minStockLevel, 10) || 0,
          status,
        });
      } else {
        await onSubmit({
          name: name.trim(),
          category,
          brand: brand.trim() || undefined,
          partNumber: partNumber.trim() || undefined,
          description: description.trim() || undefined,
          purchasePrice: buy,
          sellingPrice: sell,
          initialStock: parseInt(initialStock, 10) || 0,
          minStockLevel: parseInt(minStockLevel, 10) || 0,
          status,
        });
      }
      onClose();
    } catch (err: any) {
      const errorMsg =
        err?.message ||
        err?.details?.message ||
        (Array.isArray(err?.details) && err.details[0]?.message) ||
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        'Failed to save inventory item';
      setError(errorMsg);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col my-auto border border-gray-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {isEdit ? 'Edit Inventory Item' : 'Add New Inventory Item'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {isEdit
                ? 'Update master specifications & price levels'
                : 'Register a new item, component, or consumable in inventory'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Name & Part Number */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Item Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Standard Component / Unit Model-X"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none bg-white"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Brand / Make</label>
              <input
                type="text"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="e.g. Manufacturer / Brand Name"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">SKU / Part Number</label>
              <input
                type="text"
                value={partNumber}
                onChange={(e) => setPartNumber(e.target.value)}
                placeholder="e.g. SKU-10024-X"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none bg-white"
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
                <option value="DISCONTINUED">Discontinued</option>
              </select>
            </div>
          </div>

          {/* Pricing & Automatic Profit Preview */}
          <div className="p-3 bg-gray-50 rounded-xl border border-gray-200/80 space-y-3">
            <div className="text-xs font-bold text-gray-700 uppercase tracking-wider">
              Pricing & Automatic Profit Preview
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Purchase Price / Unit (Cost ₹) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none font-semibold text-gray-900 bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Selling Price / Unit (Sale ₹) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none font-semibold text-gray-900 bg-white"
                />
              </div>
            </div>

            {/* Calculated Profit Tag */}
            <div className="flex items-center justify-between text-xs px-3 py-2 bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-200">
              <span className="font-medium">Calculated Profit Per Unit:</span>
              <span className="font-bold text-sm">
                ₹{unitProfit.toFixed(2)} ({marginPercent}% margin)
              </span>
            </div>
          </div>

          {/* Stock Tracking */}
          <div className="grid grid-cols-2 gap-3">
            {!isEdit && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Opening Stock Quantity
                </label>
                <input
                  type="number"
                  min="0"
                  value={initialStock}
                  onChange={(e) => setInitialStock(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                />
              </div>
            )}

            <div className={isEdit ? 'col-span-2' : ''}>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Low Stock Alert Threshold
              </label>
              <input
                type="number"
                min="0"
                value={minStockLevel}
                onChange={(e) => setMinStockLevel(e.target.value)}
                placeholder="2"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
              />
              <span className="text-[10px] text-gray-400">Trigger alert when stock drops to or below this</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Notes / Description</label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Technical specifications, model compatibility, storage location..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2 text-sm font-semibold text-white bg-[#C1121F] hover:bg-[#A00E1A] rounded-lg shadow transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
