import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable, type ColumnDef } from '../../../components/ui/DataTable';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { HoldStatusModal, type HoldStatusData } from '../../../components/ui/HoldStatusModal';
import {
  Wrench,
  User,
  Cpu,
  Calendar,
  Eye,
  CheckCircle,
  UserCheck,
  ShieldCheck,
  Clock,
  MessageSquare,
  Send,
  Trash2,
  Pencil,
  PauseCircle,
} from 'lucide-react';
import {
  useNotifyServiceTechnicianWhatsAppMutation,
  useNotifyServiceCustomerWhatsAppMutation,
  useDeleteServiceMutation,
  type ServiceItem,
} from '../services.api';
import { useToast } from '../../../providers/ToastProvider';
import { requestGoogleReviewViaWhatsApp } from '../../../lib/whatsapp';
import { useAuth } from '../../../providers/AuthBoundary';

export interface ServiceTableProps {
  services: ServiceItem[];
  isLoading: boolean;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onOpenCompleteModal: (service: ServiceItem) => void;
  onOpenQuickAssign: (service: ServiceItem) => void;
  onOpenEditModal?: (service: ServiceItem) => void;
}

function formatSystemDate(dateVal: string | Date | null | undefined): string {
  if (!dateVal) return '—';
  if (typeof dateVal === 'string') {
    const match = dateVal.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1;
      const day = parseInt(match[3], 10);
      const d = new Date(year, month, day);
      return d.toLocaleDateString(undefined, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    }
  }
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatSystemTime(dateVal: string | Date | null | undefined, timeSlot?: string | null): string {
  if (timeSlot) return timeSlot;
  if (!dateVal) return '10:00 AM - 12:00 PM';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '10:00 AM - 12:00 PM';
  // If time is exact midnight (00:00:00 UTC or Local), default to morning slot
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) {
    return '10:00 AM - 12:00 PM';
  }
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

export const ServiceTable: React.FC<ServiceTableProps> = ({
  services,
  isLoading,
  pagination,
  onPageChange,
  onOpenCompleteModal,
  onOpenQuickAssign,
  onOpenEditModal,
}) => {
  const navigate = useNavigate();
  const toast = useToast();
  const notifyWhatsAppMutation = useNotifyServiceTechnicianWhatsAppMutation();
  const notifyCustomerWhatsAppMutation = useNotifyServiceCustomerWhatsAppMutation();
  const deleteServiceMutation = useDeleteServiceMutation();
  const [selectedHoldService, setSelectedHoldService] = useState<HoldStatusData | null>(null);
  const { user, hasRole, hasPermission } = useAuth();
  const isAuthorized =
    !user ||
    (typeof hasRole === 'function' && hasRole('Admin', 'Super Admin')) ||
    user?.role === 'Admin' ||
    user?.role === 'Super Admin' ||
    (typeof hasPermission === 'function' && (hasPermission('whatsapp.send') || hasPermission('services.update')));

  const handleRequestGoogleReview = (row: ServiceItem) => {
    if (!isAuthorized) {
      toast.error('You are not authorized to send WhatsApp review requests.', 'Unauthorized');
      return;
    }
    if (row.status !== 'COMPLETED') {
      toast.error('Google review requests can only be sent for completed services.', 'Service Not Completed');
      return;
    }

    const result = requestGoogleReviewViaWhatsApp({
      phone: row.customerPhone,
    });

    if (result.success) {
      toast.success(
        `WhatsApp opened with Google Review request for ${row.customerName || 'customer'}`,
        'WhatsApp Opened'
      );
    } else {
      toast.error(
        result.error || 'Customer phone number is missing or invalid.',
        'Invalid Phone Number'
      );
    }
  };

  const handleNotifyCustomerWhatsApp = async (row: ServiceItem) => {
    try {
      const res = await notifyCustomerWhatsAppMutation.mutateAsync(row.id);
      const resData = (res as any)?.data || res;
      const directUrl = resData?.directUrl || res?.directUrl;
      if (directUrl && typeof window !== 'undefined') {
        window.open(directUrl, '_blank', 'noopener,noreferrer');
      }
      toast.success(
        res?.message || `WhatsApp service details opened for client ${row.customerName || 'customer'}`,
        'WhatsApp Sent'
      );
    } catch {
      const phone = (row.customerPhone || '').replace(/[^0-9]/g, '');
      if (phone) {
        const cleanPhone = phone.length === 10 ? `91${phone}` : (phone.length === 11 && !phone.startsWith('91') ? `91${phone}` : phone);
        const dateDisplay = formatSystemDate(row.scheduledDate);
        const timeDisplay = formatSystemTime(row.scheduledDate, row.scheduledTimeSlot);
        const techInfo = row.technicianPhone ? `${row.technicianName || 'Specialist'} (${row.technicianPhone})` : (row.technicianName || 'Assigned Technician');
        const msg = `Hello ${row.customerName || 'Valued Customer'},\n\nYour service visit with Enterprises CRM has been confirmed!\n\nService #: ${row.serviceNumber}\nProduct: ${row.productName || 'Product / Equipment'}${row.serialNumber ? ` (SN: ${row.serialNumber})` : ''}\nDate: ${dateDisplay}\nTime Slot: ${timeDisplay}\nAssigned Technician: ${techInfo}\n\nOur technician will contact you prior to arrival. Thank you!`;
        const directUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
        if (typeof window !== 'undefined') {
          window.open(directUrl, '_blank', 'noopener,noreferrer');
        }
        toast.success(`Opened WhatsApp for client ${row.customerName || 'customer'}`, 'WhatsApp Opened');
      } else {
        toast.error('Customer phone number is missing.', 'WhatsApp Error');
      }
    }
  };

  const priorityColors: Record<string, string> = {
    URGENT: 'bg-rose-100 text-rose-800 border-rose-200',
    HIGH: 'bg-amber-100 text-amber-800 border-amber-200',
    NORMAL: 'bg-slate-100 text-slate-700 border-slate-200',
    LOW: 'bg-slate-50 text-slate-500 border-slate-200',
  };

  const statusVariantMap: Record<string, any> = {
    SCHEDULED: 'warning',
    ASSIGNED: 'active',
    IN_PROGRESS: 'active',
    COMPLETED: 'active',
    OVERDUE: 'inactive',
    CANCELLED: 'archived',
  };

  const columns: ColumnDef<ServiceItem>[] = [
    {
      key: 'serviceNumber',
      header: 'Service #',
      render: (row: ServiceItem) => (
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
            <Wrench className="w-4 h-4" />
          </div>
          <div>
            <div
              className="font-bold text-slate-900 font-mono text-xs hover:text-primary-600 cursor-pointer flex items-center gap-1.5"
              onClick={() => navigate(`/services/${row.id}`)}
            >
              {row.serviceNumber}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded border uppercase tracking-wider ${
                  priorityColors[row.priority] || priorityColors.NORMAL
                }`}
              >
                {row.priority}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {row.serviceLocation === 'DOORSTEP' ? 'Doorstep' : 'In-Shop'}
              </span>
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer Details',
      render: (row: ServiceItem) => (
        <div>
          <div
            className="font-bold text-slate-900 hover:text-primary-600 cursor-pointer flex items-center gap-1 text-xs"
            onClick={() => row.customerId && navigate(`/customers/${row.customerId}`)}
          >
            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            {row.customerName || 'Customer'}
          </div>
          <div className="flex items-center justify-between gap-1 mt-0.5">
            <span className="text-[11px] text-slate-500 font-mono">{row.customerPhone || '—'}</span>
            {row.customerPhone && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleNotifyCustomerWhatsApp(row);
                }}
                disabled={notifyCustomerWhatsAppMutation.isPending}
                className="p-1 text-emerald-700 hover:bg-emerald-50 bg-emerald-50/60 rounded-md border border-emerald-200 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                title={`Send WhatsApp service details to client ${row.customerName || ''}`}
              >
                <MessageSquare className="w-3 h-3 text-emerald-600" />
              </button>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'asset',
      header: 'Equipment / Asset',
      render: (row: ServiceItem) => {
        const rawName = row.productName || (row as any).customName || (row as any).customAssetName;
        const displayName =
          rawName && rawName.toLowerCase() !== 'customer ro water purifier' && rawName.toLowerCase() !== 'ro machine'
            ? rawName
            : row.productBrand
            ? `${row.productBrand} Equipment`
            : 'Equipment';

        return (
          <div>
            <div className="font-semibold text-slate-900 text-xs flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              {displayName}
            </div>
            <div className="text-[11px] text-slate-500 font-mono mt-0.5">
              {row.serialNumber ? (
                <span className="font-semibold text-slate-700">SN: {row.serialNumber}</span>
              ) : (
                <span className="italic text-slate-400">Non-serialized</span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: 'classification',
      header: 'Classification & Payment',
      render: (row: ServiceItem) => {
        const isPaid = (row as any).paymentStatus === 'PAID' || (row as any).invoice?.status === 'PAID';
        const isPartial = (row as any).paymentStatus === 'PARTIALLY_PAID' || (row as any).invoice?.status === 'PARTIALLY_PAID';
        const isPending = (row as any).paymentStatus === 'PENDING' || (row.status === 'COMPLETED' && Number(row.totalCharges || 0) > 0 && !isPaid && !isPartial);

        return (
          <div>
            {row.serviceClassification === 'WARRANTY' ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                <ShieldCheck className="w-3 h-3" />
                Warranty Free
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                General Service
              </span>
            )}

            {isPaid ? (
              <div className="mt-0.5">
                <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Payment Complete
                </span>
              </div>
            ) : isPartial ? (
              <div className="mt-0.5">
                <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                  Partially Paid
                </span>
              </div>
            ) : isPending ? (
              <div className="mt-0.5">
                <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-orange-50 text-orange-700 border border-orange-200">
                  Payment Pending
                </span>
              </div>
            ) : null}

            <div className="text-[10px] text-slate-500 mt-0.5 font-medium">
              {(row.serviceType || 'GENERAL').replace(/_/g, ' ')}
            </div>
          </div>
        );
      },
    },
    {
      key: 'scheduledDate',
      header: 'Scheduled Date & Time',
      render: (row: ServiceItem) => {
        const formattedDate = formatSystemDate(row.scheduledDate);
        const timeDisplay = row.scheduledTimeSlot || (row.scheduledDate ? formatSystemTime(row.scheduledDate) : null);

        return (
          <div className="min-w-[140px]">
            <div className="text-xs font-semibold text-slate-800 flex items-center gap-1.5 whitespace-nowrap">
              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>{formattedDate}</span>
            </div>
            {timeDisplay && (
              <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5 font-medium whitespace-nowrap">
                <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                <span>{timeDisplay}</span>
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: 'technician',
      header: 'Assigned Tech',
      render: (row: ServiceItem) => (
        <div>
          {row.technicianName ? (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-[10px] border border-slate-200 shrink-0">
                  {(row.technicianName || 'T').charAt(0)}
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-900">{row.technicianName}</div>
                  <div className="text-[10px] text-slate-400 font-mono">{row.technicianPhone}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    const res = await notifyWhatsAppMutation.mutateAsync(row.id);
                    const resData = (res as any)?.data || res;
                    const directUrl = resData?.directUrl || res?.directUrl;
                    if (directUrl && typeof window !== 'undefined') {
                      window.open(directUrl, '_blank', 'noopener,noreferrer');
                    }
                    toast.success(
                      res?.message || `WhatsApp notification opened for ${row.technicianName}`,
                      'WhatsApp Sent'
                    );
                  } catch {
                    const phone = (row.technicianPhone || '').replace(/[^0-9]/g, '');
                    if (phone) {
                      const cleanPhone = phone.length === 10 ? `91${phone}` : (phone.length === 11 && !phone.startsWith('91') ? `91${phone}` : phone);
                      const dateDisplay = formatSystemDate(row.scheduledDate);
                      const timeDisplay = formatSystemTime(row.scheduledDate, row.scheduledTimeSlot);
                      const msg = `New Service Job Assigned\n\nCustomer: ${row.customerName || 'Valued Customer'}\nCustomer Phone: ${row.customerPhone || 'N/A'}\nProduct: ${row.productName || 'Product / Equipment'}\nSerial Number: ${row.serialNumber || 'N/A'}\nService Type: ${row.serviceType || 'Periodic Maintenance'}\nVisit Date: ${dateDisplay}\nTime Slot: ${timeDisplay}\nLocation: ${row.serviceLocation === 'IN_SHOP' ? 'In-Shop' : 'Doorstep'}\nPriority: ${row.priority || 'Normal'}\n\nService #: ${row.serviceNumber}\n\nPlease check the CRM for complete job details.`;
                      const directUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
                      if (typeof window !== 'undefined') {
                        window.open(directUrl, '_blank', 'noopener,noreferrer');
                      }
                      toast.success(`Opened WhatsApp for ${row.technicianName}`, 'WhatsApp Opened');
                    } else {
                      toast.error('Technician phone number is missing.', 'WhatsApp Error');
                    }
                  }
                }}
                disabled={notifyWhatsAppMutation.isPending}
                className="p-1 text-emerald-700 hover:bg-emerald-50 bg-emerald-50/60 rounded-md border border-emerald-200 transition-colors cursor-pointer disabled:opacity-50"
                title={`Send WhatsApp notification to ${row.technicianName}`}
              >
                <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => onOpenQuickAssign(row)}
              className="inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-800 font-semibold bg-amber-50 hover:bg-amber-100 px-2 py-0.5 rounded border border-amber-200 transition-colors cursor-pointer"
            >
              <UserCheck className="w-3 h-3" />
              Assign Tech
            </button>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row: ServiceItem) => {
        const isOnHold = row.status === 'ON_HOLD' || row.jobCardStatus === 'ON_HOLD';
        if (isOnHold) {
          const holdNotes = row.jobCardTechnicianNotes || row.technicianNotes || row.internalNotes;
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedHoldService({
                  serviceNumber: row.serviceNumber,
                  jobCardNumber: row.jobCardNumber,
                  technicianName: row.technicianName,
                  technicianPhone: row.technicianPhone,
                  customerName: row.customerName,
                  notes: holdNotes,
                  updatedAt: (row as any).updatedAt || row.createdAt,
                });
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 hover:border-amber-400 transition-all cursor-pointer shadow-xs group"
              title="Click to view hold status note"
            >
              <PauseCircle className="w-3.5 h-3.5 text-amber-600 group-hover:scale-110 transition-transform shrink-0" />
              <span>On Hold</span>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
            </button>
          );
        }

        return (
          <StatusBadge
            status={statusVariantMap[row.status] || 'active'}
            label={(row.status || 'SCHEDULED').replace(/_/g, ' ')}
          />
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row: ServiceItem) => (
        <div className="flex items-center justify-end gap-1.5">
          {/* View Details */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigate(`/services/${row.id}`)}
            className="h-8 px-2 text-xs border-slate-200 text-slate-700 hover:bg-slate-50"
            title="View full service and job card"
          >
            <Eye className="w-3.5 h-3.5 mr-1" />
            Details
          </Button>

          {/* Edit Service */}
          {onOpenEditModal && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onOpenEditModal(row)}
              className="h-8 px-2 text-xs border-slate-200 text-slate-700 hover:bg-slate-50"
              title="Edit service details"
            >
              <Pencil className="w-3.5 h-3.5 mr-1 text-slate-500" />
              Edit
            </Button>
          )}

          {/* Request Google Review (Only when service is COMPLETED) */}
          {row.status === 'COMPLETED' && isAuthorized && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleRequestGoogleReview(row)}
              className="h-8 px-2.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-300 shadow-2xs"
              title="Open WhatsApp with Google Review request"
            >
              <MessageSquare className="w-3.5 h-3.5 mr-1 text-emerald-600" />
              Request Google Review
            </Button>
          )}

          {/* Mark Complete Action if not already finished */}
          {row.status !== 'COMPLETED' && row.status !== 'CANCELLED' && (
            <Button
              size="sm"
              onClick={() => onOpenCompleteModal(row)}
              className="h-8 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-2xs"
              title="Complete service and fill job card"
            >
              <CheckCircle className="w-3.5 h-3.5 mr-1" />
              Complete
            </Button>
          )}

          {/* Delete Service Action */}
          <button
            type="button"
            onClick={async (e) => {
              e.stopPropagation();
              if (window.confirm(`Are you sure you want to delete service ${row.serviceNumber}? This will permanently remove the service record and its job card from the database.`)) {
                try {
                  await deleteServiceMutation.mutateAsync(row.id);
                  toast.success(`Service ${row.serviceNumber} deleted successfully.`, 'Service Deleted');
                } catch (err: any) {
                  toast.error(err.message || 'Failed to delete service', 'Delete Failed');
                }
              }
            }}
            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg border border-transparent hover:border-rose-200 transition-colors cursor-pointer"
            title="Delete service"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <DataTable<ServiceItem>
          columns={columns}
          data={services}
          isLoading={isLoading}
          keyExtractor={(item) => item.id}
          pagination={{
            page: pagination.page,
            pageSize: pagination.limit || 10,
            total: pagination.total,
          }}
          onPageChange={onPageChange}
          emptyTitle="No services found"
          emptyDescription="Schedule a periodic maintenance visit, repair task, or service check to get started."
        />
      </div>

      <HoldStatusModal
        isOpen={Boolean(selectedHoldService)}
        onClose={() => setSelectedHoldService(null)}
        data={selectedHoldService}
      />
    </>
  );
};
