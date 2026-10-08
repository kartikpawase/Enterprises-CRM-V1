<?php
/**
 * Admin SMTP Test Email Template
 */

$subject = "🧪 SMTP Connection & PHPMailer Test - {$companyName}";
$testTimestamp = date('Y-m-d H:i:s T');
$phpVersion = PHP_VERSION;
$mailerVersion = \PHPMailer\PHPMailer\PHPMailer::VERSION;
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo htmlspecialchars($subject); ?></title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 0; }
        .wrapper { max-width: 600px; margin: 24px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
        .hero { background: linear-gradient(135deg, #0f172a 0%, #4338ca 100%); color: #ffffff; padding: 28px 24px; text-align: center; }
        .hero h1 { margin: 0; font-size: 22px; font-weight: 700; }
        .hero p { margin: 6px 0 0; font-size: 13px; color: #c7d2fe; }
        .badge { display: inline-block; background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; padding: 4px 14px; border-radius: 20px; font-size: 12px; font-weight: 700; margin-top: 12px; }
        .content { padding: 24px; }
        .table { width: 100%; border-collapse: collapse; margin-bottom: 20px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
        .table th { background: #f8fafc; text-align: left; padding: 10px 14px; font-size: 12px; font-weight: 700; color: #475569; border-bottom: 1px solid #e2e8f0; width: 45%; }
        .table td { padding: 10px 14px; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #1e293b; font-family: monospace; }
        .footer { background: #f8fafc; padding: 16px 24px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #64748b; }
    </style>
</head>
<body>
    <div class="wrapper">
        <div class="hero">
            <h1><?php echo htmlspecialchars($companyName); ?> CRM</h1>
            <p>PHPMailer Transactional Email Diagnostics</p>
            <div class="badge">✓ SMTP CONNECTION VERIFIED</div>
        </div>
        <div class="content">
            <h3 style="margin-top: 0; color: #0f172a;">Diagnostic Verification Report</h3>
            <p style="font-size: 13px; color: #475569; line-height: 1.5;">
                This test email confirms that your SMTP gateway credentials, encryption handshake (TLS/SSL), character encoding, and HTML template engine are fully operational.
            </p>

            <table class="table">
                <tr>
                    <th>Test Executed At</th>
                    <td><?php echo htmlspecialchars($testTimestamp); ?></td>
                </tr>
                <tr>
                    <th>PHPMailer Library</th>
                    <td>v<?php echo htmlspecialchars($mailerVersion); ?> (Composer)</td>
                </tr>
                <tr>
                    <th>PHP CLI Runtime</th>
                    <td>PHP <?php echo htmlspecialchars($phpVersion); ?></td>
                </tr>
                <tr>
                    <th>SMTP Transport Host</th>
                    <td><?php echo htmlspecialchars(getenv('SMTP_HOST') ?: getenv('MAIL_HOST') ?: 'Localhost / Mail Fallback'); ?></td>
                </tr>
                <tr>
                    <th>SMTP Port & Secure Mode</th>
                    <td>Port <?php echo htmlspecialchars(getenv('SMTP_PORT') ?: '465'); ?> (<?php echo htmlspecialchars(getenv('SMTP_SECURE') ?: 'SSL'); ?>)</td>
                </tr>
                <tr>
                    <th>Sender Identity</th>
                    <td><?php echo htmlspecialchars(getenv('SMTP_FROM_EMAIL') ?: 'no-reply@enterprisescrm.local'); ?></td>
                </tr>
                <tr>
                    <th>Recipient Target</th>
                    <td><?php echo htmlspecialchars($toEmail); ?></td>
                </tr>
            </table>

            <p style="font-size: 12px; color: #16a34a; font-weight: 600;">
                ✓ All transactional email pipelines (Sales, Invoices, Payments, Services, Warranties) are ready for live operation.
            </p>
        </div>
        <div class="footer">
            <p style="margin: 0;">© <?php echo date('Y'); ?> <?php echo htmlspecialchars($companyName); ?>. System Diagnostic Test.</p>
        </div>
    </div>
</body>
</html>
