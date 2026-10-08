import React, { useState, useEffect } from 'react';
import { X, UserPlus, AlertCircle } from 'lucide-react';
import {
  useCreateTechnicianMutation,
  useUpdateTechnicianMutation,
  type TechnicianItem,
} from '../technicians.api';

export interface TechnicianModalProps {
  isOpen: boolean;
  onClose: () => void;
  technician?: TechnicianItem | null;
}

export const TechnicianModal: React.FC<TechnicianModalProps> = ({
  isOpen,
  onClose,
  technician,
}) => {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'ON_LEAVE' | 'INACTIVE'>('ACTIVE');
  const [portalEnabled, setPortalEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createMutation = useCreateTechnicianMutation();
  const updateMutation = useUpdateTechnicianMutation();

  useEffect(() => {
    if (technician) {
      setFullName(technician.fullName);
      setPhone(technician.phone);
      setEmail(technician.email || '');
      setAddress(technician.address || '');
      setEmergencyContact(technician.emergencyContact || '');
      setStatus(technician.status);
      setPortalEnabled(Boolean(technician.portalEnabled));
    } else {
      setFullName('');
      setPhone('');
      setEmail('');
      setAddress('');
      setEmergencyContact('');
      setStatus('ACTIVE');
      setPortalEnabled(false);
    }
    setError(null);
  }, [technician, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || fullName.trim().length < 2) {
      setError('Please enter a valid technician full name');
      return;
    }
    if (!phone.trim() || phone.trim().length < 10) {
      setError('Please enter a valid 10-digit phone number');
      return;
    }

    setError(null);
    try {
      if (technician) {
        await updateMutation.mutateAsync({
          id: technician.id,
          data: {
            fullName: fullName.trim(),
            phone: phone.trim(),
            email: email.trim() || null,
            address: address.trim() || null,
            emergencyContact: emergencyContact.trim() || null,
            status,
            skills: technician.skills || [],
            portalEnabled,
          },
        });
      } else {
        await createMutation.mutateAsync({
          fullName: fullName.trim(),
          phone: phone.trim(),
          email: email.trim() || null,
          address: address.trim() || null,
          emergencyContact: emergencyContact.trim() || null,
          status,
          skills: [],
          portalEnabled,
        });
      }
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || 'Failed to save technician');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {technician ? 'Edit Technician Profile' : 'Add New Technician'}
              </h3>
              <p className="text-xs text-slate-700">Register field workforce personnel</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Full Name & Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Full Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                placeholder="e.g. Ramesh Kumar"
                className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Phone Number <span className="text-rose-500">*</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                placeholder="e.g. 9876543210"
                className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Email & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Email (Optional)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. ramesh@enterprisescrm.local"
                className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Current Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              >
                <option value="ACTIVE">Active & Available</option>
                <option value="ON_LEAVE">On Leave</option>
                <option value="INACTIVE">Inactive / Suspended</option>
              </select>
            </div>
          </div>

          {/* Portal Access Control */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
            <div>
              <span className="block text-xs font-semibold text-slate-800 uppercase tracking-wider">
                Technician Portal Access
              </span>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Enable mobile login and digital job card access for this technician.
              </p>
            </div>
            <select
              value={portalEnabled ? 'ENABLED' : 'DISABLED'}
              onChange={(e) => setPortalEnabled(e.target.value === 'ENABLED')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                portalEnabled
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                  : 'bg-white text-slate-700 border-slate-300'
              }`}
            >
              <option value="DISABLED">DISABLED (Default)</option>
              <option value="ENABLED">ENABLED</option>
            </select>
          </div>

          {/* Address & Emergency Contact */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Operating Area / Address
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. Sector 14, Gurgaon"
                className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Emergency Contact
              </label>
              <input
                type="text"
                value={emergencyContact}
                onChange={(e) => setEmergencyContact(e.target.value)}
                placeholder="e.g. 9811122233 (Spouse)"
                className="w-full px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>


          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-sm rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-sm rounded-xl shadow-xs transition-all cursor-pointer"
            >
              {technician ? 'Update Profile' : 'Save Technician'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
