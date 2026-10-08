import React, { useState, useEffect } from 'react';
import { Building2, Save, RotateCcw, CheckCircle2, ShieldCheck, AlertCircle } from 'lucide-react';
import { useCategorySettingsQuery, useUpdateSettingsMutation, useResetSettingsMutation } from '../settings.api';
import type { BusinessSettings } from '@crm/types';
import { useToast } from '../../../providers/ToastProvider';

export const BusinessSettingsSection: React.FC = () => {
  const toast = useToast();
  const { data, isLoading, error } = useCategorySettingsQuery<BusinessSettings>('BUSINESS');
  const updateMutation = useUpdateSettingsMutation<BusinessSettings>();
  const resetMutation = useResetSettingsMutation();

  const [form, setForm] = useState<BusinessSettings>({
    businessName: '',
    legalName: '',
    address: '',
    city: '',
    state: '',
    postalCode: '',
    country: '',
    phone: '',
    email: '',
    website: '',
    gstin: '',
    panNumber: '',
    logoUrl: '',
  });

  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (data?.value) {
      setForm(data.value);
      setIsDirty(false);
    }
  }, [data]);

  const handleChange = (field: keyof BusinessSettings, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateMutation.mutateAsync({
        category: 'BUSINESS',
        data: form,
        expectedVersion: data?.version,
      });
      setIsDirty(false);
      toast.success('Business and organization profile updated successfully.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update business settings.');
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Are you sure you want to restore business settings to system defaults?')) {
      return;
    }
    try {
      await resetMutation.mutateAsync({ category: 'BUSINESS' });
      toast.success('Business settings restored to system defaults.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to reset settings.');
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 bg-white rounded-xl border border-slate-200/90 shadow-2xs animate-pulse space-y-4">
        <div className="h-6 bg-slate-200 rounded w-1/4" />
        <div className="h-20 bg-slate-100 rounded" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 rounded-xl border border-red-200 text-red-700 flex items-center gap-3">
        <AlertCircle className="w-5 h-5 flex-shrink-0" />
        <p className="text-sm">Failed to load business profile settings: {(error as any)?.message}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
      <div className="p-6 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-200/80 flex items-center justify-center text-primary-600 shadow-2xs">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-display font-bold text-slate-900">Organization Profile</h2>
            <p className="text-xs text-slate-500">Official business identity displayed on invoices, receipts, and customer documents.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
            <ShieldCheck className="w-3.5 h-3.5" /> Live Consumer Active
          </span>
          <button
            type="button"
            onClick={handleReset}
            disabled={resetMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset Defaults
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 font-mono">
              Business Trading Name *
            </label>
            <input
              type="text"
              required
              value={form.businessName}
              onChange={(e) => handleChange('businessName', e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-medium text-slate-900"
              placeholder="e.g. Enterprises CRM"
            />
            <p className="text-[11px] text-slate-500 mt-1">Appears on invoices, SMS, and WhatsApp dispatches.</p>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 font-mono">
              Legal Registered Name *
            </label>
            <input
              type="text"
              required
              value={form.legalName}
              onChange={(e) => handleChange('legalName', e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-medium text-slate-900"
              placeholder="e.g. Enterprises Private Limited"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 font-mono">
              Operating Office Address *
            </label>
            <input
              type="text"
              required
              value={form.address}
              onChange={(e) => handleChange('address', e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-medium text-slate-900"
              placeholder="e.g. Shop 4, Om Heights, Baner Road"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 font-mono">City *</label>
            <input
              type="text"
              required
              value={form.city}
              onChange={(e) => handleChange('city', e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-medium text-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 font-mono">State *</label>
            <input
              type="text"
              required
              value={form.state}
              onChange={(e) => handleChange('state', e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-medium text-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 font-mono">PIN / Postal Code *</label>
            <input
              type="text"
              required
              pattern="^\d{6}$"
              value={form.postalCode}
              onChange={(e) => handleChange('postalCode', e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono text-slate-900"
              placeholder="e.g. 411045"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 font-mono">Country *</label>
            <input
              type="text"
              required
              value={form.country}
              onChange={(e) => handleChange('country', e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-medium text-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 font-mono">
              Customer Support Line (10 Digits) *
            </label>
            <input
              type="tel"
              required
              pattern="^\d{10}$"
              value={form.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono text-slate-900"
              placeholder="9876543210"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 font-mono">
              Transactional Dispatch Email *
            </label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => handleChange('email', e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono text-slate-900"
              placeholder="business@example.com"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 font-mono">GSTIN Number</label>
            <input
              type="text"
              value={form.gstin || ''}
              onChange={(e) => handleChange('gstin', e.target.value.toUpperCase())}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono text-slate-900"
              placeholder="27AAAAA0000A1Z5"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 font-mono">PAN Number</label>
            <input
              type="text"
              value={form.panNumber || ''}
              onChange={(e) => handleChange('panNumber', e.target.value.toUpperCase())}
              className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 font-mono text-slate-900"
              placeholder="AAAAA0000A"
            />
          </div>
        </div>

        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 flex items-start gap-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-slate-600 space-y-1">
            <p className="font-bold text-slate-800">Target Consumers &amp; Immediate Effects:</p>
            <ul className="list-disc list-inside space-y-0.5 text-slate-500">
              <li>Public Invoice Page &amp; PDF Header: Automatically displays updated business name, phone, and email.</li>
              <li>PHPMailer / Notification Dispatch: From-name and reply-to email dynamically updated.</li>
              <li>Customer WhatsApp Sharing: Messages dynamically adopt configured trading name.</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="p-6 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between">
        <span className="text-xs font-mono text-slate-500">
          Version: {data?.version ?? 1} • Source: PostgreSQL app_settings
        </span>
        <button
          type="submit"
          disabled={!isDirty || updateMutation.isPending}
          className="inline-flex items-center gap-2 px-5 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
        >
          <Save className="w-4 h-4" />
          {updateMutation.isPending ? 'Saving...' : isDirty ? 'Save Changes' : 'Saved'}
        </button>
      </div>
    </form>
  );
};
