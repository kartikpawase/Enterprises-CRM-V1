import React from 'react';
import { Card, CardHeader, CardContent } from '../../../components/ui/Card';
import { StatusBadge } from '../../../components/ui/StatusBadge';
import { FileText, ShieldCheck, CheckCircle2 } from 'lucide-react';
import type { ServiceDetail } from '../services.api';

export interface JobCardDetailCardProps {
  service: ServiceDetail;
  onEditJobCard?: () => void;
}

export const JobCardDetailCard: React.FC<JobCardDetailCardProps> = ({ service }) => {
  const rawParts = service.partsReplaced;
  let parts: any[] = [];
  if (Array.isArray(rawParts)) {
    parts = rawParts;
  } else if (typeof rawParts === 'string' && (rawParts as string).trim()) {
    try {
      const parsed = JSON.parse(rawParts);
      if (Array.isArray(parsed)) parts = parsed;
    } catch {}
  }

  return (
    <Card className="rounded-2xl border-slate-200/90 shadow-xs overflow-hidden">
      <CardHeader className="bg-slate-50/80 border-b border-slate-100 p-4 sm:p-5 flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              Job Card Details
              {service.jobCardNumber && (
                <span className="font-mono text-xs text-purple-700 bg-purple-100/70 px-2 py-0.5 rounded-md font-bold">
                  {service.jobCardNumber}
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500">Technical diagnosis, spare parts replaced, and billing charges</p>
          </div>
        </div>

        <StatusBadge
          status={service.jobCardStatus === 'COMPLETED' ? 'active' : 'warning'}
          label={service.jobCardStatus ? service.jobCardStatus.replace(/_/g, ' ') : 'PENDING'}
        />
      </CardHeader>

      <CardContent className="p-5 space-y-5 text-xs">
        {/* Diagnosis & Work Performed */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70 space-y-1">
            <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block">
              Problem Reported & Diagnosis
            </span>
            <div className="text-slate-900 font-medium">{service.problemReported || 'None recorded'}</div>
            {service.diagnosis && (
              <div className="text-slate-600 pt-1 border-t border-slate-200/60 mt-1">
                <span className="font-semibold text-slate-700">Diagnosis:</span> {service.diagnosis}
              </div>
            )}
          </div>

          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/70 space-y-1">
            <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block">
              Work Performed
            </span>
            <div className="text-slate-900 font-medium">
              {service.workPerformed || 'Service work pending execution'}
            </div>
            {service.technicianNotes && (
              <div className="text-slate-600 pt-1 border-t border-slate-200/60 mt-1">
                <span className="font-semibold text-slate-700">Technician Notes:</span> {service.technicianNotes}
              </div>
            )}
          </div>
        </div>

        {/* Replaced Parts Breakdown Table */}
        <div className="space-y-2">
          <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block">
            Replaced Spares & Parts ({parts.length})
          </span>

          {parts.length === 0 ? (
            <div className="p-4 text-center text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
              No replacement parts logged for this job card.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2.5 pl-3">Part Name</th>
                    <th className="p-2.5">Source</th>
                    <th className="p-2.5">SKU</th>
                    <th className="p-2.5 text-center">Qty</th>
                    <th className="p-2.5 text-right">Unit Price</th>
                    <th className="p-2.5 text-center">Warranty</th>
                    <th className="p-2.5 text-right pr-3">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parts.map((p, idx) => {
                    const pName = p.itemName || p.partName || p.name || 'Spare Part';
                    const isInv = Boolean(p.productId || p.inventoryItemId);
                    const uPrice = Number(p.unitPrice ?? p.price ?? 0);
                    const qVal = Number(p.quantity || 1);
                    const tVal = Number(p.lineTotal ?? p.totalPrice ?? (uPrice * qVal));
                    return (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="p-2.5 pl-3 font-medium text-slate-900">{pName}</td>
                        <td className="p-2.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              isInv
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}
                          >
                            {isInv ? 'Inventory' : 'Manual'}
                          </span>
                        </td>
                        <td className="p-2.5 font-mono text-slate-500">{p.partSku || p.sku || '—'}</td>
                        <td className="p-2.5 text-center font-bold">{qVal}</td>
                        <td className="p-2.5 text-right font-mono">₹{uPrice.toFixed(2)}</td>
                        <td className="p-2.5 text-center">
                          {p.isWarrantyCovered ? (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded">
                              <ShieldCheck className="w-3 h-3" />
                              Covered
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">Billable</span>
                          )}
                        </td>
                        <td className="p-2.5 text-right pr-3 font-mono font-bold text-slate-900">
                          ₹{p.isWarrantyCovered ? '0.00' : tVal.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Financial Charges Breakdown */}
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="font-bold text-slate-700 uppercase tracking-wider text-[10px] block">
              Charges Summary
            </span>
            <div className="flex items-center gap-4 text-slate-600 text-xs">
              <span>
                Labor: <strong className="text-slate-900 font-mono">₹{Number(service.laborCharges || 0)}</strong>
              </span>
              <span>•</span>
              <span>
                Parts: <strong className="text-slate-900 font-mono">₹{Number(service.partsCharges || 0)}</strong>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-xs font-bold text-slate-500">Total Billed:</span>
            <span className="text-base font-extrabold font-mono text-emerald-700">
              ₹{Number(service.totalCharges || 0).toLocaleString('en-IN')}
            </span>
          </div>
        </div>

        {/* Customer Remarks */}
        {service.customerRemarks && (
          <div className="p-3 bg-emerald-50/60 border border-emerald-200/80 rounded-xl text-emerald-900 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Customer Remarks:</span> {service.customerRemarks}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
