import React, { useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Textarea';
import { useCreateInquiry } from '../inquiries.api';
import { useToast } from '../../../providers/ToastProvider';
import { INQUIRY_TYPES, INQUIRY_SOURCES, INQUIRY_PRIORITIES } from '@crm/types';

interface InquiryFormModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InquiryFormModal: React.FC<InquiryFormModalProps> = ({ isOpen, onClose }) => {
  const toast = useToast();
  const createMutation = useCreateInquiry();

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    city: 'Pune',
    productInterest: '',
    serviceInterest: '',
    inquiryType: 'GENERAL',
    source: 'DIRECT',
    priority: 'NORMAL',
    followUpDate: '',
    notes: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.name.trim()) errs.name = 'Customer name is required';
    if (!formData.phone.trim()) errs.phone = 'Mobile number is required';
    else if (formData.phone.trim().length < 10) errs.phone = 'Mobile number must be at least 10 digits';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      await createMutation.mutateAsync({
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim() || undefined,
        address: formData.address.trim() || undefined,
        city: formData.city.trim() || undefined,
        productInterest: formData.productInterest.trim() || undefined,
        serviceInterest: formData.serviceInterest.trim() || undefined,
        inquiryType: formData.inquiryType as any,
        source: formData.source as any,
        priority: formData.priority as any,
        followUpDate: formData.followUpDate || undefined,
        notes: formData.notes.trim() || undefined,
      });

      toast.success('Inquiry registered successfully in CRM', 'Inquiry Created');
      onClose();
      setFormData({
        name: '',
        phone: '',
        email: '',
        address: '',
        city: 'Pune',
        productInterest: '',
        serviceInterest: '',
        inquiryType: 'GENERAL',
        source: 'DIRECT',
        priority: 'NORMAL',
        followUpDate: '',
        notes: '',
      });
    } catch (err: any) {
      toast.error(err.message || 'Failed to create inquiry', 'Error');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Inquiry / Lead"
      description="Register an incoming phone call, walk-in, or direct customer lead"
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-3 w-full">
          <Button variant="outline" size="sm" onClick={onClose} disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            isLoading={createMutation.isPending}
          >
            Create Inquiry
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Customer Name *"
            placeholder="e.g. Rahul Sharma"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            error={errors.name}
            required
          />

          <Input
            label="Mobile Number *"
            placeholder="e.g. 9876543210"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            error={errors.phone}
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Email Address"
            type="email"
            placeholder="e.g. rahul@example.com"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />

          <Input
            label="City"
            placeholder="City / Area (e.g. Pune)"
            value={formData.city}
            onChange={(e) => setFormData({ ...formData, city: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Select
            label="Inquiry Type"
            value={formData.inquiryType}
            onChange={(e) => setFormData({ ...formData, inquiryType: e.target.value as any })}
            options={INQUIRY_TYPES.map((t) => ({
              value: t,
              label: t.replace(/_/g, ' '),
            }))}
          />

          <Select
            label="Inquiry Source"
            value={formData.source}
            onChange={(e) => setFormData({ ...formData, source: e.target.value as any })}
            options={INQUIRY_SOURCES.map((s) => ({
              value: s,
              label: s.replace(/_/g, ' '),
            }))}
          />

          <Select
            label="Priority"
            value={formData.priority}
            onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
            options={INQUIRY_PRIORITIES.map((p) => ({
              value: p,
              label: p,
            }))}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Product Interest"
            placeholder="e.g. SR Commercial 50 LPH RO"
            value={formData.productInterest}
            onChange={(e) => setFormData({ ...formData, productInterest: e.target.value })}
          />

          <Input
            label="Service Interest"
            placeholder="e.g. Equipment Maintenance / Installation"
            value={formData.serviceInterest}
            onChange={(e) => setFormData({ ...formData, serviceInterest: e.target.value })}
          />
        </div>

        <Input
          label="Physical Address / Location"
          placeholder="e.g. Flat 402, Shivam Heights, Kothrud"
          value={formData.address}
          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Initial Follow-Up Date"
            type="date"
            value={formData.followUpDate}
            onChange={(e) => setFormData({ ...formData, followUpDate: e.target.value })}
          />
        </div>

        <Textarea
          label="Internal Notes / Customer Request"
          placeholder="Any specific customer requirements, remarks, or notes..."
          rows={3}
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
        />
      </form>
    </Modal>
  );
};
