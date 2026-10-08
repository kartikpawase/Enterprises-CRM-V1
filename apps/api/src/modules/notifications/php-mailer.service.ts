import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import { configService } from '../system/configuration.service';
import type { BusinessSettings } from '@crm/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface TransactionalEmailPayload {
  eventType:
    | 'SALE_CONFIRMATION'
    | 'PAYMENT_RECEIPT'
    | 'SERVICE_COMPLETED'
    | 'SERVICE_REMINDER'
    | 'PAYMENT_REMINDER'
    | 'THANK_YOU'
    | 'WARRANTY_EXPIRY_REMINDER'
    | 'INVOICE_EMAIL'
    | 'ADMIN_TEST'
    | 'TECHNICIAN_OTP'
    | 'OTP'
    | 'GENERAL';
  toEmail: string;
  toName?: string;
  subject?: string;
  customerId?: string;
  referenceType?: string;
  referenceId?: string;
  attachInvoicePdf?: boolean;
  invoiceData?: Record<string, any>;
  attachmentPath?: string;
  attachmentName?: string;
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface PhpMailerResult {
  success: boolean;
  status: 'SENT' | 'FAILED' | 'SKIPPED' | 'PENDING';
  message?: string;
  messageId?: string;
  notificationId?: string;
  recipient?: string;
  subject?: string;
  eventType?: string;
  pdfAttached?: boolean;
  reason?: string;
  error?: string;
  timestamp?: string;
}

export class PhpMailerService {
  private scriptPath: string;
  private projectRoot: string;

  constructor() {
    this.projectRoot = path.resolve(__dirname, '../../../../..');
    const possiblePaths = [
      path.join(this.projectRoot, 'scripts/mailer/dispatch_email.php'),
      path.resolve(process.cwd(), 'scripts/mailer/dispatch_email.php'),
      path.resolve(__dirname, '../../../../../scripts/mailer/dispatch_email.php'),
    ];

    this.scriptPath = possiblePaths.find((p) => fs.existsSync(p)) || possiblePaths[0]!;
  }

  /**
   * Main dispatch method: Uses existing PHPMailer CLI engine
   */
  public async dispatch(payload: TransactionalEmailPayload): Promise<PhpMailerResult> {
    const toEmail = (payload.toEmail || '').trim();

    // Validate recipient email
    if (!toEmail || !toEmail.includes('@') || !toEmail.includes('.')) {
      return {
        success: false,
        status: 'SKIPPED',
        reason: 'EMAIL_SKIPPED_NO_VALID_ADDRESS',
        error: `Invalid or empty recipient email: '${toEmail}'`,
        recipient: toEmail,
        eventType: payload.eventType,
        timestamp: new Date().toISOString(),
      };
    }

    // Direct dispatch via existing PHPMailer CLI engine
    const phpResult = await this.dispatchViaPhpCli(payload);
    if (phpResult.success || phpResult.status === 'SKIPPED') {
      return phpResult;
    }

    // Graceful fallback: If PHP CLI fails, attempt direct dispatch via NodeMailer
    try {
      const nodeResult = await this.dispatchViaNodeMailer(payload);
      if (nodeResult.success) {
        return nodeResult;
      }
    } catch {}

    return phpResult;
  }

  /**
   * Native Node.js / Nodemailer Transactional Mailer Engine
   */
  private async dispatchViaNodeMailer(payload: TransactionalEmailPayload): Promise<PhpMailerResult> {
    const eventType = payload.eventType || 'GENERAL';
    const toEmail = (payload.toEmail || '').trim();
    const toName = (payload.toName || 'Valued Customer').trim();
    
    // Render HTML & Plain text
    const { subject, html, text } = this.renderEmailTemplate(eventType, payload);
    const finalSubject = payload.subject || payload.payload?.subject || subject;
    const finalHtml = payload.html || payload.payload?.html || html;
    const finalText = payload.text || payload.payload?.text || text;

    const smtpHost = process.env.SMTP_HOST || process.env.MAIL_HOST || 'smtp.gmail.com';
    const smtpPort = parseInt(process.env.SMTP_PORT || process.env.MAIL_PORT || '465', 10);
    const smtpUser = process.env.SMTP_USER || process.env.SMTP_USERNAME || process.env.MAIL_USERNAME || '';
    const smtpPass = (process.env.SMTP_PASS || process.env.SMTP_PASSWORD || process.env.MAIL_PASSWORD || process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
    const smtpSecure = (process.env.SMTP_SECURE || process.env.MAIL_ENCRYPTION || '').toLowerCase() === 'ssl' || smtpPort === 465;

    let configuredBizName = 'Enterprises CRM';
    let configuredBizEmail = '';
    try {
      const bizConfig = await configService.get<BusinessSettings>('BUSINESS');
      if (bizConfig?.businessName) configuredBizName = bizConfig.businessName;
      if (bizConfig?.email) configuredBizEmail = bizConfig.email;
    } catch {}

    const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_FROM || process.env.MAIL_FROM_ADDRESS || configuredBizEmail || 'notifications@enterprisescrm.local';
    const fromName = process.env.SMTP_FROM_NAME || process.env.MAIL_FROM_NAME || configuredBizName;
    const supportEmail = process.env.SUPPORT_EMAIL || configuredBizEmail;

    const mailDriver = (process.env.MAIL_DRIVER || '').toLowerCase();
    const isMock = mailDriver === 'log' || mailDriver === 'mock' || process.env.MOCK_MAIL === 'true' || Boolean(payload.mock);

    const attachments: any[] = [];
    if (payload.attachmentPath && fs.existsSync(payload.attachmentPath)) {
      attachments.push({
        filename: payload.attachmentName || path.basename(payload.attachmentPath),
        path: payload.attachmentPath,
      });
    }

    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}@srenterprises.com`;

    // If running in Mock / Log driver mode (e.g. automated test suites), log to outbox and return success
    if (isMock) {
      this.logOutbox(payload, 'SENT', finalSubject, 'Mock Mail Driver (Local Simulation)');
      return {
        success: true,
        status: 'SENT',
        message: 'Email rendered and saved to outbox (Mock Driver / Test Mode)',
        messageId: `mock-${Date.now()}`,
        recipient: toEmail,
        subject: finalSubject,
        eventType,
        pdfAttached: attachments.length > 0 || Boolean(payload.attachInvoicePdf),
        timestamp: new Date().toISOString(),
      };
    }

    // If live SMTP credentials are configured and not in mock mode, send over SMTP
    if (smtpHost && smtpUser && smtpPass) {
      try {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpSecure,
          auth: {
            user: smtpUser,
            pass: smtpPass,
          },
          tls: {
            rejectUnauthorized: false,
          },
          connectionTimeout: 10000,
        });

        await transporter.sendMail({
          from: `"${fromName}" <${fromEmail}>`,
          replyTo: supportEmail,
          to: `"${toName}" <${toEmail}>`,
          subject: finalSubject,
          text: finalText,
          html: finalHtml,
          attachments,
          messageId,
        });

        this.logOutbox(payload, 'SENT', finalSubject, `Sent via SMTP (${smtpHost}:${smtpPort})`);

        return {
          success: true,
          status: 'SENT',
          message: `Email sent successfully via SMTP (${smtpHost})`,
          messageId,
          recipient: toEmail,
          subject: finalSubject,
          eventType,
          pdfAttached: attachments.length > 0 || Boolean(payload.attachInvoicePdf),
          timestamp: new Date().toISOString(),
        };
      } catch (err: any) {
        // Automatic port fallback: if port was not 465 (e.g. 587 timed out), retry with port 465 SSL
        if (smtpPort !== 465) {
          try {
            const fallbackTransporter = nodemailer.createTransport({
              host: smtpHost,
              port: 465,
              secure: true,
              auth: {
                user: smtpUser,
                pass: smtpPass,
              },
              tls: {
                rejectUnauthorized: false,
              },
              connectionTimeout: 10000,
            });

            await fallbackTransporter.sendMail({
              from: `"${fromName}" <${fromEmail}>`,
              replyTo: supportEmail,
              to: `"${toName}" <${toEmail}>`,
              subject: finalSubject,
              text: finalText,
              html: finalHtml,
              attachments,
              messageId,
            });

            this.logOutbox(payload, 'SENT', finalSubject, `Sent via SMTP fallback (${smtpHost}:465)`);

            return {
              success: true,
              status: 'SENT',
              message: `Email sent successfully via SMTP fallback (${smtpHost}:465)`,
              messageId,
              recipient: toEmail,
              subject: finalSubject,
              eventType,
              pdfAttached: attachments.length > 0 || Boolean(payload.attachInvoicePdf),
              timestamp: new Date().toISOString(),
            };
          } catch {}
        }

        const errorMsg = err?.message || 'SMTP delivery failed';
        this.logOutbox(payload, 'FAILED', finalSubject, errorMsg);

        return {
          success: false,
          status: 'FAILED',
          error: errorMsg,
          messageId,
          recipient: toEmail,
          subject: finalSubject,
          eventType,
          pdfAttached: attachments.length > 0 || Boolean(payload.attachInvoicePdf),
          timestamp: new Date().toISOString(),
        };
      }
    } else {
      const errorMsg = 'SMTP credentials not configured in server environment. Please set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS in .env';

      this.logOutbox(payload, 'FAILED', finalSubject, errorMsg);

      return {
        success: false,
        status: 'FAILED',
        error: errorMsg,
        messageId,
        recipient: toEmail,
        subject: finalSubject,
        eventType,
        pdfAttached: attachments.length > 0 || Boolean(payload.attachInvoicePdf),
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Primary PHP CLI Dispatcher using PHPMailer engine
   */
  private async dispatchViaPhpCli(payload: TransactionalEmailPayload, initialError?: any): Promise<PhpMailerResult> {
    return new Promise((resolve) => {
      const base64Data = Buffer.from(JSON.stringify(payload)).toString('base64');
      const args = [this.scriptPath, `--base64=${base64Data}`];

      execFile(
        'php',
        args,
        {
          timeout: 30000,
          maxBuffer: 10 * 1024 * 1024,
          env: { ...process.env },
        },
        (error, stdout, stderr) => {
          const rawOutput = (stdout || '').trim();

          if (error) {
            try {
              const parsed = JSON.parse(rawOutput);
              return resolve(parsed);
            } catch {
              // Fallback gracefully to native Nodemailer engine if PHP CLI is unavailable (e.g. Render Node runtime)
              return resolve(this.dispatchViaNodeMailer(payload));
            }
          }

          try {
            const parsed = JSON.parse(rawOutput);
            return resolve(parsed);
          } catch {
            return resolve({
              success: false,
              status: 'FAILED',
              error: `PHPMailer returned unexpected output: ${rawOutput || stderr || 'Empty output'}`,
              recipient: payload.toEmail,
              eventType: payload.eventType,
              timestamp: new Date().toISOString(),
            });
          }
        }
      );
    });
  }

  /**
   * Log outgoing email to scripts/mailer/outbox for audit and offline testing
   */
  private logOutbox(payload: TransactionalEmailPayload, status: string, subject: string, notes?: string): void {
    try {
      const outboxDir = path.join(this.projectRoot, 'scripts/mailer/outbox');
      if (!fs.existsSync(outboxDir)) {
        fs.mkdirSync(outboxDir, { recursive: true });
      }

      const ref = (payload.referenceId || payload.invoiceNumber || payload.saleNumber || 'mail')
        .toString()
        .replace(/[^a-zA-Z0-9_-]/g, '');
      const dateStr = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
      const filename = path.join(outboxDir, `${dateStr}_${status}_${ref}.json`);

      fs.writeFileSync(
        filename,
        JSON.stringify(
          {
            timestamp: new Date().toISOString(),
            status,
            eventType: payload.eventType || 'UNKNOWN',
            recipient: payload.toEmail,
            recipientName: payload.toName || '',
            subject,
            notes,
            payload,
          },
          null,
          2
        )
      );
    } catch {
      // Non-critical
    }
  }

  /**
   * Render High-Fidelity Transactional HTML & Text Templates
   */
  private renderEmailTemplate(
    eventType: TransactionalEmailPayload['eventType'],
    data: Record<string, any>
  ): { subject: string; html: string; text: string } {
    const customerName = data.customerName || data.toName || data.recipientName || 'Valued Customer';
    const companyName = process.env.COMPANY_NAME || 'Enterprises CRM';
    const supportPhone = process.env.SUPPORT_PHONE || '';
    const supportEmail = process.env.SUPPORT_EMAIL || 'support@enterprisescrm.local';
    const companyAddress = '';

    let subject = `Notification from ${companyName}`;
    let bodyContent = '';

    switch (eventType) {
      case 'SALE_CONFIRMATION': {
        const saleNumber = data.saleNumber || data.referenceId || 'N/A';
        const totalAmount = (data.totalAmount || 0).toLocaleString('en-IN');
        subject = `Order Confirmation: Sale #${saleNumber} - ${companyName}`;
        bodyContent = `
          <h2 style="color: #0284C7; margin-top: 0;">🎉 Thank You for Your Order!</h2>
          <p>Dear <strong>${customerName}</strong>,</p>
          <p>We are delighted to confirm that your order <strong>#${saleNumber}</strong> has been successfully placed with ${companyName}.</p>
          <div style="background-color: #F0F9FF; border-left: 4px solid #0284C7; padding: 12px 16px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 4px 0;"><strong>Sale Number:</strong> #${saleNumber}</p>
            <p style="margin: 4px 0;"><strong>Total Amount:</strong> ₹${totalAmount}</p>
            <p style="margin: 4px 0;"><strong>Date:</strong> ${data.saleDate || new Date().toISOString().split('T')[0]}</p>
          </div>
          <p>Our expert technician will contact you shortly to schedule installation and servicing.</p>
        `;
        break;
      }

      case 'PAYMENT_RECEIPT': {
        const paymentNumber = data.paymentNumber || data.referenceId || 'N/A';
        const invoiceNumber = data.invoiceNumber || 'N/A';
        const amount = (data.amount || data.totalPaidAmount || 0).toLocaleString('en-IN');
        const remaining = (data.remainingBalance || 0).toLocaleString('en-IN');
        subject = `Payment Receipt: ${paymentNumber} for Invoice #${invoiceNumber}`;
        bodyContent = `
          <h2 style="color: #059669; margin-top: 0;">✅ Payment Receipt Received</h2>
          <p>Dear <strong>${customerName}</strong>,</p>
          <p>We have successfully received your payment of <strong>₹${amount}</strong>.</p>
          <div style="background-color: #ECFDF5; border-left: 4px solid #059669; padding: 12px 16px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 4px 0;"><strong>Receipt Number:</strong> ${paymentNumber}</p>
            <p style="margin: 4px 0;"><strong>Invoice Reference:</strong> #${invoiceNumber}</p>
            <p style="margin: 4px 0;"><strong>Amount Paid:</strong> ₹${amount}</p>
            <p style="margin: 4px 0;"><strong>Payment Method:</strong> ${data.paymentMethod || 'UPI / Cash'}</p>
            <p style="margin: 4px 0;"><strong>Remaining Balance:</strong> ₹${remaining}</p>
          </div>
        `;
        break;
      }

      case 'PAYMENT_REMINDER': {
        const invoiceNumber = data.invoiceNumber || 'N/A';
        const dueAmount = (data.dueAmount || data.remainingBalance || data.totalAmount || 0).toLocaleString('en-IN');
        const dueDate = data.dueDate || 'Immediate';
        subject = `Payment Reminder: Invoice #${invoiceNumber} (Due: ₹${dueAmount})`;
        bodyContent = `
          <h2 style="color: #D97706; margin-top: 0;">⏰ Payment Reminder</h2>
          <p>Dear <strong>${customerName}</strong>,</p>
          <p>This is a gentle reminder that an outstanding payment of <strong>₹${dueAmount}</strong> for Invoice <strong>#${invoiceNumber}</strong> is due on <strong>${dueDate}</strong>.</p>
          <div style="background-color: #FFFBEB; border-left: 4px solid #D97706; padding: 12px 16px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 4px 0;"><strong>Invoice Number:</strong> #${invoiceNumber}</p>
            <p style="margin: 4px 0;"><strong>Outstanding Due:</strong> ₹${dueAmount}</p>
            <p style="margin: 4px 0;"><strong>Due Date:</strong> ${dueDate}</p>
            <p style="margin: 4px 0;"><strong>UPI ID:</strong> enterprises.crm@upi</p>
          </div>
          <p>Kindly settle the balance at your earliest convenience to maintain uninterrupted service coverage.</p>
        `;
        break;
      }

      case 'SERVICE_COMPLETED': {
        const serviceNumber = data.serviceNumber || 'N/A';
        subject = `Service Completed: #${serviceNumber} - ${companyName}`;
        bodyContent = `
          <h2 style="color: #059669; margin-top: 0;">🔧 Service Completed Successfully</h2>
          <p>Dear <strong>${customerName}</strong>,</p>
          <p>Your service ticket <strong>#${serviceNumber}</strong> has been completed by our certified technician.</p>
          <div style="background-color: #F0FDF4; border-left: 4px solid #059669; padding: 12px 16px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 4px 0;"><strong>Service Ticket:</strong> #${serviceNumber}</p>
            <p style="margin: 4px 0;"><strong>Technician:</strong> ${data.technicianName || `${companyName} Service Specialist`}</p>
            <p style="margin: 4px 0;"><strong>Work Details:</strong> ${data.serviceDescription || 'Comprehensive Inspection & Maintenance'}</p>
          </div>
          <p>Thank you for choosing ${companyName}!</p>
        `;
        break;
      }

      case 'SERVICE_REMINDER': {
        subject = `Upcoming Periodic Service Reminder - ${companyName}`;
        bodyContent = `
          <h2 style="color: #0284C7; margin-top: 0;">📅 Upcoming Service Schedule</h2>
          <p>Dear <strong>${customerName}</strong>,</p>
          <p>Your scheduled service visit is confirmed for <strong>${data.scheduledDate || 'Upcoming Date'}</strong>.</p>
          <div style="background-color: #F0F9FF; border-left: 4px solid #0284C7; padding: 14px 18px; margin: 20px 0; border-radius: 6px;">
            <p style="margin: 4px 0;"><strong>Service Reference:</strong> #${data.serviceNumber || 'N/A'}</p>
            <p style="margin: 4px 0;"><strong>Service Type:</strong> ${data.serviceType || 'Periodic Maintenance'}</p>
            <p style="margin: 4px 0;"><strong>Equipment / Asset:</strong> ${data.machineName || 'Equipment'}</p>
            ${data.serialNumber && data.serialNumber !== 'N/A' ? `<p style="margin: 4px 0;"><strong>Serial Number:</strong> ${data.serialNumber}</p>` : ''}
            <p style="margin: 4px 0;"><strong>Visit Date:</strong> ${data.scheduledDate || 'Pending confirmation'}</p>
            <p style="margin: 4px 0;"><strong>Time Slot:</strong> ${data.timeSlot || '10:00 AM - 12:00 PM'}</p>
            <p style="margin: 4px 0;"><strong>Assigned Technician:</strong> ${data.technicianName || 'Certified Technician'}</p>
          </div>
          <p style="color: #475569; font-size: 13px;">Our technician will contact you prior to arrival. If you need to reschedule, please contact our support desk.</p>
        `;
        break;
      }

      case 'WARRANTY_EXPIRY_REMINDER': {
        const days = data.daysRemaining ?? 30;
        subject = `Warranty Expiry Notice: ${days} Days Remaining - ${companyName}`;
        bodyContent = `
          <h2 style="color: #EA580C; margin-top: 0;">🛡️ Warranty Expiry Notice</h2>
          <p>Dear <strong>${customerName}</strong>,</p>
          <p>The warranty on your equipment (Model: <strong>${data.machineModel || 'Equipment'}</strong>) has <strong>${days} days remaining</strong>.</p>
          <div style="background-color: #FFF7ED; border-left: 4px solid #EA580C; padding: 12px 16px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 4px 0;"><strong>Serial Number:</strong> ${data.serialNumber || 'N/A'}</p>
            <p style="margin: 4px 0;"><strong>Warranty Expiry Date:</strong> ${data.endDate || 'Upcoming'}</p>
          </div>
          <p>Contact us today to renew your Comprehensive Annual Maintenance Contract (AMC).</p>
        `;
        break;
      }

      case 'ADMIN_TEST': {
        subject = `🧪 PHPMailer Diagnostic Test - ${companyName}`;
        bodyContent = `
          <h2 style="color: #0284C7; margin-top: 0;">🧪 Transactional Mailer Diagnostic Test</h2>
          <p>Hello Administrator,</p>
          <p>The ${companyName} transactional email engine is fully functional and ready to dispatch customer communications.</p>
          <div style="background-color: #F8FAFC; border-left: 4px solid #0284C7; padding: 12px 16px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 4px 0;"><strong>Engine:</strong> PHPMailer & Nodemailer Bridge</p>
            <p style="margin: 4px 0;"><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
            <p style="margin: 4px 0;"><strong>Status:</strong> Operational</p>
          </div>
        `;
        break;
      }

      case 'TECHNICIAN_OTP':
      case 'OTP': {
        const otpCode = data.otp || data.payload?.otp || '------';
        const expiresMinutes = data.expiresMinutes || data.payload?.expiresMinutes || 10;
        subject = data.subject || data.payload?.subject || `Your Technician Portal Verification Code: ${otpCode}`;
        bodyContent = `
          <h2 style="color: #0284C7; margin-top: 0;">🔐 Field Technician Verification Code</h2>
          <p>Hello <strong>${customerName}</strong>,</p>
          <p>Use the following single-use verification code to securely access your technician field workspace:</p>
          <div style="background-color: #0F172A; border: 1px solid #38BDF8; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
            <div style="font-family: monospace; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #38BDF8;">${otpCode}</div>
            <div style="font-size: 12px; color: #94A3B8; margin-top: 8px;">Valid for ${expiresMinutes} minutes • Single-use code</div>
          </div>
          <p style="color: #64748B; font-size: 12px;">🛡️ <strong>Security Notice:</strong> Never share this verification code with anyone. System administration will never ask you for your code.</p>
        `;
        break;
      }

      default: {
        bodyContent = `
          <h2 style="color: #0284C7; margin-top: 0;">Notification from ${companyName}</h2>
          <p>Dear <strong>${customerName}</strong>,</p>
          <p>${data.message || data.body || `Thank you for choosing ${companyName}.`}</p>
        `;
        break;
      }
    }

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F4F6F8; margin: 0; padding: 20px; color: #1E293B; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #E2E8F0; }
    .header { background: #00152B; color: #FFFFFF; padding: 24px 32px; text-align: center; }
    .header h1 { margin: 0; font-size: 20px; letter-spacing: 1px; text-transform: uppercase; font-weight: 800; }
    .header p { margin: 4px 0 0 0; font-size: 11px; color: #38BDF8; letter-spacing: 2px; text-transform: uppercase; font-family: monospace; font-weight: bold; }
    .content { padding: 32px; }
    .footer { background: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 20px 32px; text-align: center; font-size: 11px; color: #64748B; }
    .footer a { color: #0284C7; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${companyName}</h1>
      <p>Field Service &amp; Business Management</p>
    </div>
    <div class="content">
      ${bodyContent}
    </div>
    <div class="footer">
      <p style="margin: 0 0 4px 0;"><strong>${companyName}</strong></p>
      <p style="margin: 0 0 4px 0;">${companyAddress}</p>
      <p style="margin: 0;">Phone: <a href="tel:${supportPhone}">${supportPhone}</a> | Email: <a href="mailto:${supportEmail}">${supportEmail}</a></p>
    </div>
  </div>
</body>
</html>
    `.trim();

    const text = `
${companyName} - Field Service & Business Management
======================================================
${subject}

Dear ${customerName},

${data.message || data.serviceDescription || 'Thank you for your business.'}

Contact: ${supportPhone} | ${supportEmail}
${companyAddress}
    `.trim();

    return { subject, html, text };
  }

  /**
   * Backward-compatible payment due email helper
   */
  public async sendPaymentDueEmail(payload: {
    toEmail: string;
    toName: string;
    invoiceNumber: string;
    totalAmount: number;
    paidAmount?: number;
    dueAmount: number;
    dueDate: string;
    customerNumber?: string;
    notes?: string;
  }): Promise<PhpMailerResult> {
    return this.dispatch({
      eventType: 'PAYMENT_REMINDER',
      toEmail: payload.toEmail,
      toName: payload.toName,
      invoiceNumber: payload.invoiceNumber,
      totalAmount: payload.totalAmount,
      paidAmount: payload.paidAmount || 0,
      dueAmount: payload.dueAmount,
      dueDate: payload.dueDate,
      customerNumber: payload.customerNumber || '',
      notes: payload.notes || '',
    });
  }
}

export const phpMailerService = new PhpMailerService();
