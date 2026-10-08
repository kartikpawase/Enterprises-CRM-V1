import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { SearchInput } from '../../components/ui/SearchInput';
import { Select } from '../../components/ui/Select';
import { DataTable, type ColumnDef } from '../../components/ui/DataTable';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { useAssetsQuery, type CustomerAssetItem } from './assets.api';
import { User, Calendar, Cpu, ArrowUpRight } from 'lucide-react';
import type { AssetQueryFilter } from '@crm/validation';

export const AssetsDirectory: React.FC = () => {
  const navigate = useNavigate();

  const [filters, setFilters] = useState<Partial<AssetQueryFilter>>({
    page: 1,
    limit: 10,
    search: '',
    assetType: undefined,
    status: undefined,
    sortBy: 'purchaseDate',
    sortOrder: 'desc',
  });

  const { data: response, isLoading } = useAssetsQuery(filters);

  const assets = response?.data || [];
  const pagination = response?.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 };

  const columns: ColumnDef<CustomerAssetItem>[] = [
    {
      key: 'assetNumber',
      header: 'Asset #',
      render: (row: CustomerAssetItem) => (
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-slate-900 font-mono text-xs">{row.assetNumber}</div>
            <div className="text-[11px] text-slate-500 font-medium">{row.assetType.replace('_', ' ')}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'product',
      header: 'Machine / Product Details',
      render: (row: CustomerAssetItem) => (
        <div>
          <div className="font-bold text-slate-900 text-xs">{row.productName}</div>
          <div className="text-xs text-slate-500 mt-0.5 font-mono">
            SKU: {row.productSku} {row.productBrand && `• Brand: ${row.productBrand}`}
          </div>
        </div>
      ),
    },
    {
      key: 'serialNumber',
      header: 'Serial Number',
      render: (row: CustomerAssetItem) =>
        row.serialNumber ? (
          <span className="font-mono text-xs font-semibold px-2 py-0.5 bg-slate-100 text-slate-800 rounded border border-slate-200">
            {row.serialNumber}
          </span>
        ) : (
          <span className="text-xs text-slate-400 italic">Non-serialized</span>
        ),
    },
    {
      key: 'customer',
      header: 'Registered Customer',
      render: (row: CustomerAssetItem) => (
        <div>
          <div
            className="font-medium text-slate-900 hover:text-primary-600 cursor-pointer flex items-center gap-1 text-xs"
            onClick={() => navigate(`/customers/${row.customerId}`)}
          >
            <User className="w-3.5 h-3.5 text-slate-400" />
            {row.customerName}
          </div>
          <div className="text-[11px] text-slate-500 font-mono">{row.customerPhone}</div>
        </div>
      ),
    },
    {
      key: 'purchaseDate',
      header: 'Purchase Date',
      render: (row: CustomerAssetItem) => (
        <div className="text-xs text-slate-600 flex items-center gap-1">
          <Calendar className="w-3 h-3 text-slate-400" />
          {new Date(row.purchaseDate).toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: CustomerAssetItem) => {
        const variantMap: Record<string, any> = {
          ACTIVE: 'active',
          IN_SERVICE: 'warning',
          REPLACED: 'inactive',
          DECOMMISSIONED: 'archived',
        };
        return (
          <StatusBadge
            status={variantMap[row.status] || 'active'}
            label={row.status.replace('_', ' ')}
          />
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row: CustomerAssetItem) => (
        <div className="flex items-center justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate(`/customers/${row.customerId}`)}
            rightIcon={<ArrowUpRight className="w-3.5 h-3.5" />}
          >
            Customer Profile
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Page Header */}
      <PageHeader
        title="Customer Assets & Equipment"
        description="Track registered equipment and assets, serial numbers, warranty coverage, and customer assignments."
        breadcrumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Assets' }]}
      />

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="w-full md:w-96">
          <SearchInput
            placeholder="Search by serial #, asset #, or customer..."
            value={filters.search || ''}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value, page: 1 }))}
            onClear={() => setFilters((prev) => ({ ...prev, search: '', page: 1 }))}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          <div className="w-40">
            <Select
              options={[
                { value: '', label: 'All Types' },
                { value: 'RO_MACHINE', label: 'RO Machines' },
                { value: 'SPARE_PART', label: 'Spare Parts' },
              ]}
              value={filters.assetType || ''}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  assetType: (e.target.value as any) || undefined,
                  page: 1,
                }))
              }
            />
          </div>

          <div className="w-40">
            <Select
              options={[
                { value: '', label: 'All Statuses' },
                { value: 'ACTIVE', label: 'Active' },
                { value: 'IN_SERVICE', label: 'In Service' },
                { value: 'REPLACED', label: 'Replaced' },
                { value: 'DECOMMISSIONED', label: 'Decommissioned' },
              ]}
              value={filters.status || ''}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  status: (e.target.value as any) || undefined,
                  page: 1,
                }))
              }
            />
          </div>
        </div>
      </div>

      {/* Main Data Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <DataTable<CustomerAssetItem>
          columns={columns}
          data={assets}
          isLoading={isLoading}
          keyExtractor={(item) => item.id}
          pagination={{
            page: pagination.page,
            pageSize: pagination.limit || 10,
            total: pagination.total,
          }}
          onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
          emptyTitle="No customer assets found"
          emptyDescription={
            filters.search || filters.assetType || filters.status
              ? 'No assets match the current search or filters.'
              : 'Customer assets are automatically generated when equipment sales are confirmed.'
          }
        />
      </div>
    </div>
  );
};
