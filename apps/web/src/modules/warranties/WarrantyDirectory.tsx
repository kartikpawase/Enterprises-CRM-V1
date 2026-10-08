import React, { useState } from 'react';
import { PageHeader } from '../../components/ui/PageHeader';
import { WarrantySummaryCards } from './components/WarrantySummaryCards';
import { WarrantyToolbar } from './components/WarrantyToolbar';
import { WarrantyTable } from './components/WarrantyTable';
import { CreateWarrantyModal } from './components/CreateWarrantyModal';
import { ExtendWarrantyModal } from './components/ExtendWarrantyModal';
import {
  useWarrantiesQuery,
  useWarrantyKPIsQuery,
  type WarrantyItem,
} from './warranties.api';
import { Pagination } from '../../components/ui/Pagination';

export const WarrantyDirectory: React.FC = () => {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [expiringOnly, setExpiringOnly] = useState(false);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedWarranty, setSelectedWarranty] = useState<WarrantyItem | null>(null);

  // Queries
  const { data: kpis, isLoading: isKPIsLoading } = useWarrantyKPIsQuery();

  const { data: warrantiesResponse, isLoading: isWarrantiesLoading } = useWarrantiesQuery({
    page,
    limit: pageSize,
    search: search.trim() || undefined,
    status: statusFilter as any,
    warrantyType: typeFilter as any,
    expiringDays: expiringOnly ? 30 : undefined,
    sortBy: 'endDate',
    sortOrder: 'asc',
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Top Header */}
      <PageHeader
        title="Warranty & AMC Management"
        description="Monitor active customer equipment warranties, extended AMC coverage, expiration alerts, and terms."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Warranties' },
        ]}
      />

      {/* Summary Operational KPIs */}
      <WarrantySummaryCards
        kpis={kpis}
        isLoading={isKPIsLoading}
        activeFilter={statusFilter}
        onFilterSelect={(status) => {
          setStatusFilter(status);
          setPage(1);
        }}
      />

      {/* Main Filter Toolbar */}
      <WarrantyToolbar
        search={search}
        onSearchChange={(val) => {
          setSearch(val);
          setPage(1);
        }}
        statusFilter={statusFilter}
        onStatusFilterChange={(st) => {
          setStatusFilter(st);
          setPage(1);
        }}
        typeFilter={typeFilter}
        onTypeFilterChange={(tp) => {
          setTypeFilter(tp);
          setPage(1);
        }}
        expiringOnly={expiringOnly}
        onExpiringOnlyChange={(val) => {
          setExpiringOnly(val);
          setPage(1);
        }}
        onOpenCreateModal={() => setIsCreateModalOpen(true)}
      />

      {/* Warranties Table */}
      <WarrantyTable
        warranties={warrantiesResponse?.data || []}
        isLoading={isWarrantiesLoading}
        onOpenExtendModal={(w) => setSelectedWarranty(w)}
      />

      {/* Pagination */}
      {warrantiesResponse && warrantiesResponse.pagination.totalPages > 1 && (
        <Pagination
          currentPage={page}
          totalPages={warrantiesResponse.pagination.totalPages}
          onPageChange={setPage}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          totalItems={warrantiesResponse.pagination.total}
        />
      )}

      {/* Register Warranty Modal */}
      <CreateWarrantyModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      {/* Manage / Extend Warranty Modal */}
      <ExtendWarrantyModal
        isOpen={Boolean(selectedWarranty)}
        onClose={() => setSelectedWarranty(null)}
        warranty={selectedWarranty}
      />
    </div>
  );
};
