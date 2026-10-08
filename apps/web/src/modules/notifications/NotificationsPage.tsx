import React, { useState } from 'react';
import {
  Bell,
  CheckCheck,
  Clock,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  Info,
  Search,
  ExternalLink,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import {
  useNotificationsQuery,
  useUnreadNotificationCountQuery,
  useMarkNotificationReadMutation,
  useMarkAllNotificationsReadMutation,
  useSendAdminTestEmailMutation,
} from './notifications.api';
import { useToast } from '../../providers/ToastProvider';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import type { NotificationItem, NotificationSeverity } from '@crm/types';

export const NotificationsPage: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [readFilter, setReadFilter] = useState<'ALL' | 'UNREAD' | 'READ'>('ALL');
  const [isTestEmailModalOpen, setIsTestEmailModalOpen] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('');

  const queryFilter = {
    search: searchTerm || undefined,
    severity: severityFilter !== 'ALL' ? (severityFilter as NotificationSeverity) : undefined,
    isRead: readFilter === 'UNREAD' ? false : readFilter === 'READ' ? true : undefined,
  };

  const { data: notifData, isLoading } = useNotificationsQuery(queryFilter);
  const { data: unreadSummary } = useUnreadNotificationCountQuery();
  const markReadMutation = useMarkNotificationReadMutation();
  const markAllReadMutation = useMarkAllNotificationsReadMutation();
  const sendTestEmailMutation = useSendAdminTestEmailMutation();

  const notifications = notifData?.data || [];
  const unreadCount = unreadSummary?.unreadCount ?? 0;

  const handleNotificationClick = (notif: NotificationItem) => {
    if (!notif.isRead) {
      markReadMutation.mutate(notif.id);
    }
    if (notif.actionUrl) {
      navigate(notif.actionUrl);
    }
  };

  const getSeverityIcon = (severity: NotificationSeverity) => {
    switch (severity) {
      case 'CRITICAL':
        return <AlertCircle className="w-5 h-5 text-rose-600" />;
      case 'WARNING':
        return <ShieldAlert className="w-5 h-5 text-amber-600" />;
      case 'SUCCESS':
        return <CheckCircle2 className="w-5 h-5 text-emerald-600" />;
      case 'INFO':
      default:
        return <Info className="w-5 h-5 text-blue-600" />;
    }
  };

  const getSeverityBadge = (severity: NotificationSeverity) => {
    switch (severity) {
      case 'CRITICAL':
        return <Badge variant="danger">Critical Alert</Badge>;
      case 'WARNING':
        return <Badge variant="warning">Warning</Badge>;
      case 'SUCCESS':
        return <Badge variant="success">Success</Badge>;
      case 'INFO':
      default:
        return <Badge variant="neutral">Info</Badge>;
    }
  };

  const handleSendTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (testEmailAddress && (!testEmailAddress.includes('@') || !testEmailAddress.includes('.'))) {
      toast.error('Please enter a valid recipient email address.', 'Invalid Email');
      return;
    }

    try {
      const res = await sendTestEmailMutation.mutateAsync(testEmailAddress || undefined);
      if (res?.success === false) {
        toast.error(res.error || res.message || 'Test email failed.', 'SMTP / Mailer Error');
      } else {
        toast.success(
          `Test email dispatched successfully to ${res.recipient || testEmailAddress || 'system default'} via PHPMailer.`,
          'PHPMailer Test Succeeded'
        );
        setIsTestEmailModalOpen(false);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to dispatch test email.', 'PHPMailer Error');
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title="Notifications & Operational Alerts"
        description="Centralized inbox of service schedules, payment receipts, warranty expirations, and website leads"
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Notifications Center' },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsTestEmailModalOpen(true)}
              className="gap-1.5 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
            >
              <span>Test PHPMailer / SMTP</span>
            </Button>
            {unreadCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                className="gap-1.5"
              >
                <CheckCheck className="w-4 h-4 text-primary-600" />
                <span>Mark all {unreadCount} as read</span>
              </Button>
            )}
          </div>
        }
      />

      {/* Filter Toolbar */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search alerts by title or message..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                {(['ALL', 'UNREAD', 'READ'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReadFilter(r)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
                      readFilter === r ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {r === 'ALL' ? 'All Alerts' : r === 'UNREAD' ? `Unread (${unreadCount})` : 'Read'}
                  </button>
                ))}
              </div>

              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary-500 text-slate-700 cursor-pointer"
              >
                <option value="ALL">All Severities</option>
                <option value="CRITICAL">Critical Alerts</option>
                <option value="WARNING">Warnings</option>
                <option value="SUCCESS">Success Updates</option>
                <option value="INFO">Information</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notifications List */}
      <Card>
        <CardContent className="p-0 divide-y divide-slate-100">
          {isLoading ? (
            <div className="p-12 text-center text-xs text-slate-400">Loading notifications directory...</div>
          ) : notifications.length === 0 ? (
            <div className="p-16 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Bell className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-700">No notifications found</p>
              <p className="text-xs text-slate-400">There are no alerts matching your current filter criteria</p>
            </div>
          ) : (
            notifications.map((notif) => (
              <div
                key={notif.id}
                onClick={() => handleNotificationClick(notif)}
                className={`p-4 flex items-start justify-between gap-4 transition-colors cursor-pointer ${
                  notif.isRead ? 'bg-white hover:bg-slate-50/80' : 'bg-blue-50/30 hover:bg-blue-50/60'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center justify-center shrink-0 mt-0.5">
                    {getSeverityIcon(notif.severity)}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className={`text-sm ${notif.isRead ? 'font-semibold text-slate-800' : 'font-bold text-blue-950'}`}>
                        {notif.title}
                      </h4>
                      {!notif.isRead && (
                        <span className="w-2 h-2 rounded-full bg-primary-600" />
                      )}
                      {getSeverityBadge(notif.severity)}
                    </div>

                    <p className="text-xs text-slate-600 max-w-3xl leading-relaxed">
                      {notif.message}
                    </p>

                    <div className="flex items-center gap-3 pt-1 text-xs text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {new Date(notif.createdAt).toLocaleString('en-IN', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </span>

                      {notif.actionUrl && (
                        <span className="text-primary-600 font-medium hover:underline inline-flex items-center gap-1">
                          View details <ExternalLink className="w-3 h-3" />
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {!notif.isRead && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      markReadMutation.mutate(notif.id);
                    }}
                    className="text-xs text-slate-500 hover:text-slate-900"
                  >
                    Mark read
                  </Button>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* PHPMailer / SMTP Diagnostic Modal */}
      <Modal
        isOpen={isTestEmailModalOpen}
        onClose={() => setIsTestEmailModalOpen(false)}
        title="Test PHPMailer & SMTP Service"
      >
        <form onSubmit={handleSendTestEmail} className="space-y-4">
          <p className="text-sm text-slate-600">
            Send a live diagnostic test email through the server-side PHPMailer engine to verify SMTP credentials,
            connection health, and template rendering.
          </p>

          <Input
            label="Recipient Email Address (Optional)"
            type="email"
            placeholder="e.g. admin@enterprisescrm.local"
            value={testEmailAddress}
            onChange={(e) => setTestEmailAddress(e.target.value)}
            helperText="Leave blank to use the default configured SUPPORT_EMAIL or SMTP_USER."
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsTestEmailModalOpen(false)}
              disabled={sendTestEmailMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={sendTestEmailMutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {sendTestEmailMutation.isPending ? 'Sending Test Email...' : 'Send Test Email'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

