import React from 'react';
import { Package, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { formatCurrency, formatNumber } from '../../../lib/formatters';
import type { TopProductItem } from '../reports.types';
import type { ProductAnalytics } from '@crm/types';
import type { ProductCatalogItem } from '../../sales/sales.api';

interface ProductPerformanceSectionProps {
  productData?: ProductAnalytics;
  catalogProducts?: ProductCatalogItem[];
}

export const ProductPerformanceSection: React.FC<ProductPerformanceSectionProps> = ({
  productData,
  catalogProducts,
}) => {
  const topProducts = productData?.topProducts ?? [];
  const totalRevenue = topProducts.reduce((sum, p) => sum + (p.revenue || 0), 0) || 1;

  let items: TopProductItem[] = [];

  if (topProducts.length > 0) {
    items = topProducts.map((prod, idx) => ({
      rank: idx + 1,
      name: prod.productName || 'Equipment',
      category: prod.category || 'Equipment',
      unitsSold: prod.unitsSold || 0,
      revenue: formatCurrency(prod.revenue || 0),
      rawRevenue: prod.revenue || 0,
      growth: prod.trendPercentage ?? 0,
      sharePercentage: Math.round(((prod.revenue || 0) / totalRevenue) * 100),
    }));
  } else if (catalogProducts && catalogProducts.length > 0) {
    items = catalogProducts.map((prod, idx) => ({
      rank: idx + 1,
      name: prod.name,
      category: prod.productType ? prod.productType.replace(/_/g, ' ') : 'RO Machine',
      unitsSold: 0,
      revenue: formatCurrency(0),
      rawRevenue: 0,
      growth: 0,
      sharePercentage: 0,
    }));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
          <Package className="w-4 h-4" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-900 font-display">Product Performance &amp; Catalog</h2>
          <p className="text-xs text-slate-500 font-sans">Revenue contribution, units sold, catalog price, and market share</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold text-slate-500 uppercase tracking-wider font-sans">
                <th className="py-3 px-4 w-12 text-center">Rank</th>
                <th className="py-3 px-4">Product Name</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4 text-center">Units Sold</th>
                <th className="py-3 px-4 text-right">Price / Revenue</th>
                <th className="py-3 px-4 text-center">Growth</th>
                <th className="py-3 px-4 w-44">Revenue Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 font-medium">
                    No product records found in the database.
                  </td>
                </tr>
              ) : (
                items.map((prod) => (
                  <tr key={prod.rank} className="hover:bg-slate-50/70 transition-colors">
                    {/* Rank */}
                    <td className="py-3 px-4 text-center font-bold text-slate-700 font-mono">
                      {prod.rank === 1 ? (
                        <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-extrabold inline-flex items-center justify-center">
                          1
                        </span>
                      ) : (
                        <span>{prod.rank}</span>
                      )}
                    </td>

                    {/* Product */}
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                          <Package className="w-3.5 h-3.5 text-slate-600" />
                        </div>
                        <span>{prod.name}</span>
                      </div>
                    </td>

                    {/* Category */}
                    <td className="py-3 px-4 text-slate-500 font-medium">{prod.category}</td>

                    {/* Units Sold */}
                    <td className="py-3 px-4 text-center font-semibold text-slate-800 font-mono">
                      {formatNumber(prod.unitsSold)}
                    </td>

                    {/* Revenue */}
                    <td className="py-3 px-4 text-right font-bold text-slate-900 font-mono">
                      {prod.revenue}
                    </td>

                    {/* Growth */}
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-flex items-center gap-0.5 font-semibold text-[11px] font-mono ${
                          prod.growth >= 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {prod.growth >= 0 ? (
                          <ArrowUpRight className="w-3 h-3" />
                        ) : (
                          <ArrowDownRight className="w-3 h-3" />
                        )}
                        {prod.growth >= 0 ? `+${prod.growth}%` : `${prod.growth}%`}
                      </span>
                    </td>

                    {/* Share Progress Bar */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-primary-600 h-full rounded-full transition-all"
                            style={{ width: `${Math.min(100, prod.sharePercentage)}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-slate-600 w-8 text-right font-mono">
                          {prod.sharePercentage}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
