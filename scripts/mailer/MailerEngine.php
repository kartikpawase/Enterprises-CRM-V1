<?php
/**
 * SR Enterprises CRM - Centralized PHPMailer Engine
 * 
 * Provides production-grade SMTP connection management, environment configuration,
 * HTML & plain-text compilation, attachment handling, and standardized output.
 */

namespace SREnterprises\Mailer;

require_once __DIR__ . '/vendor/autoload.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;
use PHPMailer\PHPMailer\SMTP;

class MailerEngine {
    private static bool $envLoaded = false;

    /**
     * Load environment configuration from .env files
     */
    public static function loadEnvironment(): void {
        if (self::$envLoaded) return;

        $projectRoot = dirname(__DIR__, 2);
        $paths = [
            $projectRoot . '/.env',
            $projectRoot . '/apps/api/.env',
            getcwd() . '/.env',
            getcwd() . '/apps/api/.env',
        ];

        foreach ($paths as $path) {
            if (!file_exists($path)) continue;
            $lines = file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            if (!$lines) continue;

            foreach ($lines as $line) {
                $line = trim($line);
                if (empty($line) || $line[0] === '#') continue;
                $parts = explode('=', $line, 2);
                if (count($parts) === 2) {
                    $k = trim($parts[0]);
                    $v = trim(trim($parts[1]), '"\'');
                    if ($v !== '') {
                        putenv("$k=$v");
                        $_ENV[$k] = $v;
                        $_SERVER[$k] = $v;
                    }
                }
            }
        }

        self::$envLoaded = true;
    }

    /**
     * Create and configure a secure PHPMailer instance
     */
    public static function createMailer(): PHPMailer {
        self::loadEnvironment();

        $mail = new PHPMailer(true);
        $mail->CharSet = 'UTF-8';
        $mail->Encoding = 'base64';
        $mail->Timeout = 10; // 10 seconds connection timeout

        $smtpHost = getenv('SMTP_HOST') ?: getenv('MAIL_HOST') ?: $_ENV['SMTP_HOST'] ?? $_ENV['MAIL_HOST'] ?? $_SERVER['SMTP_HOST'] ?? $_SERVER['MAIL_HOST'] ?? 'smtp.gmail.com';
        $smtpPort = (int)(getenv('SMTP_PORT') ?: getenv('MAIL_PORT') ?: $_ENV['SMTP_PORT'] ?? $_ENV['MAIL_PORT'] ?? $_SERVER['SMTP_PORT'] ?? $_SERVER['MAIL_PORT'] ?? 465);
        $smtpUser = getenv('SMTP_USER') ?: getenv('SMTP_USERNAME') ?: getenv('MAIL_USERNAME') ?: $_ENV['SMTP_USER'] ?? $_ENV['SMTP_USERNAME'] ?? $_ENV['MAIL_USERNAME'] ?? $_SERVER['SMTP_USER'] ?? $_SERVER['SMTP_USERNAME'] ?? $_SERVER['MAIL_USERNAME'] ?? 'notifications@enterprisescrm.local';
        $smtpPass = str_replace(' ', '', (getenv('SMTP_PASS') ?: getenv('SMTP_PASSWORD') ?: getenv('MAIL_PASSWORD') ?: getenv('GMAIL_APP_PASSWORD') ?: $_ENV['SMTP_PASS'] ?? $_ENV['SMTP_PASSWORD'] ?? $_ENV['MAIL_PASSWORD'] ?? $_ENV['GMAIL_APP_PASSWORD'] ?? $_SERVER['SMTP_PASS'] ?? $_SERVER['SMTP_PASSWORD'] ?? $_SERVER['MAIL_PASSWORD'] ?? $_SERVER['GMAIL_APP_PASSWORD'] ?? ''));
        $smtpSecure = strtolower(getenv('SMTP_SECURE') ?: getenv('MAIL_ENCRYPTION') ?: $_ENV['SMTP_SECURE'] ?? $_ENV['MAIL_ENCRYPTION'] ?? $_SERVER['SMTP_SECURE'] ?? $_SERVER['MAIL_ENCRYPTION'] ?? ($smtpPort === 465 ? 'ssl' : 'tls'));
        
        $fromEmail = getenv('SMTP_FROM_EMAIL') ?: getenv('SMTP_FROM') ?: getenv('MAIL_FROM_ADDRESS') ?: ($smtpUser ?: 'notifications@enterprisescrm.local');
        $fromName = getenv('SMTP_FROM_NAME') ?: getenv('MAIL_FROM_NAME') ?: 'Enterprises CRM';
        $supportEmail = getenv('SUPPORT_EMAIL') ?: ($smtpUser ?: 'support@enterprisescrm.local');

        // Optional server-side secure SMTP debug logging
        if (filter_var(getenv('SMTP_DEBUG') ?: false, FILTER_VALIDATE_BOOLEAN)) {
            $mail->SMTPDebug = SMTP::DEBUG_SERVER;
            $mail->Debugoutput = function($str, $level) {
                $clean = preg_replace('/(AUTH PLAIN|AUTH LOGIN|password).*$/i', '$1 [REDACTED]', $str);
                error_log("[PHPMailer Debug Level {$level}] {$clean}");
            };
        } else {
            $mail->SMTPDebug = SMTP::DEBUG_OFF;
        }

        if (!empty($smtpHost) && !empty($smtpUser)) {
            $mail->isSMTP();
            $mail->Host = $smtpHost;
            $mail->SMTPAuth = true;
            $mail->Username = $smtpUser;
            $mail->Password = $smtpPass;
            
            if ($smtpSecure === 'ssl' || $smtpPort === 465) {
                $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
            } elseif ($smtpSecure === 'tls' || $smtpSecure === 'starttls' || $smtpPort === 587) {
                $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
            } else {
                $mail->SMTPSecure = '';
                $mail->SMTPAutoTLS = false;
            }

            $mail->Port = $smtpPort;
            $mail->SMTPKeepAlive = false;
            $mail->SMTPOptions = [
                'ssl' => [
                    'verify_peer' => true,
                    'verify_peer_name' => true,
                    'allow_self_signed' => false,
                ],
            ];
        } else {
            // Local simulation / fallback mailer
            $mail->isMail();
        }

        $mail->setFrom($fromEmail, $fromName);
        $mail->addReplyTo($supportEmail, $fromName);

        return $mail;
    }

    /**
     * Send email with payload, templates and optional PDF attachments
     * 
     * @param array $payload
     * @return array Standardized result array
     */
    public static function sendEmail(array $payload): array {
        self::loadEnvironment();

        $eventType = $payload['eventType'] ?? $payload['event_type'] ?? 'GENERAL';
        $toEmail = trim($payload['toEmail'] ?? $payload['to_email'] ?? $payload['recipientEmail'] ?? '');
        $toName = trim($payload['toName'] ?? $payload['to_name'] ?? $payload['recipientName'] ?? 'Valued Customer');
        $subject = $payload['subject'] ?? '';

        // Validate recipient email
        if (empty($toEmail) || !filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
            return [
                'success' => false,
                'status' => 'SKIPPED',
                'reason' => 'EMAIL_SKIPPED_NO_VALID_ADDRESS',
                'error' => 'Invalid or missing recipient email address: ' . ($toEmail ?: '(empty)'),
                'recipient' => $toEmail,
            ];
        }

        // Development mode override check
        $devMode = filter_var(getenv('DEVELOPMENT_MODE') ?: getenv('MAIL_DEV_MODE') ?: false, FILTER_VALIDATE_BOOLEAN);
        $devOverride = getenv('DEV_EMAIL_OVERRIDE') ?: getenv('MAIL_DEV_OVERRIDE') ?: '';
        if ($devMode && !empty($devOverride) && filter_var($devOverride, FILTER_VALIDATE_EMAIL)) {
            $toName = "[DEV - Real Recipient: {$toEmail}] " . $toName;
            $toEmail = $devOverride;
        }

        // Support pre-rendered HTML/text if provided by caller (e.g. OTP verification templates)
        $htmlBody = $payload['html'] ?? $payload['payload']['html'] ?? null;
        $plainText = $payload['text'] ?? $payload['payload']['text'] ?? null;
        if (empty($subject)) {
            $subject = $payload['subject'] ?? $payload['payload']['subject'] ?? '';
        }

        if (empty($htmlBody)) {
            $rendered = self::renderTemplate($eventType, $payload);
            $htmlBody = $rendered['html'];
            if (empty($plainText)) {
                $plainText = $rendered['text'];
            }
            if (empty($subject)) {
                $subject = $rendered['subject'];
            }
        } elseif (empty($plainText)) {
            $plainText = strip_tags(str_replace(['<br>', '<br/>', '</p>', '</tr>', '</div>'], "\n", $htmlBody));
            $plainText = trim(preg_replace("/[\r\n]+/", "\n", $plainText));
        }

        if (empty($subject)) {
            $subject = 'Notification from ' . (getenv('COMPANY_NAME') ?: 'Enterprises CRM');
        }

        $mail = self::createMailer();
        $tempPdfPath = null;

        $mailDriver = strtolower(getenv('MAIL_DRIVER') ?: '');
        $isMock = ($mailDriver === 'log' || $mailDriver === 'mock' || getenv('MOCK_MAIL') === 'true' || (!empty($payload['mock']) && $payload['mock'] === true));
        $smtpHost = getenv('SMTP_HOST') ?: getenv('MAIL_HOST') ?: $_ENV['SMTP_HOST'] ?? $_ENV['MAIL_HOST'] ?? $_SERVER['SMTP_HOST'] ?? $_SERVER['MAIL_HOST'] ?? 'smtp.gmail.com';
        $smtpUser = getenv('SMTP_USER') ?: getenv('SMTP_USERNAME') ?: getenv('MAIL_USERNAME') ?: $_ENV['SMTP_USER'] ?? $_ENV['SMTP_USERNAME'] ?? $_ENV['MAIL_USERNAME'] ?? $_SERVER['SMTP_USER'] ?? $_SERVER['SMTP_USERNAME'] ?? $_SERVER['MAIL_USERNAME'] ?? 'notifications@enterprisescrm.local';
        $smtpPass = str_replace(' ', '', (getenv('SMTP_PASS') ?: getenv('SMTP_PASSWORD') ?: getenv('MAIL_PASSWORD') ?: getenv('GMAIL_APP_PASSWORD') ?: $_ENV['SMTP_PASS'] ?? $_ENV['SMTP_PASSWORD'] ?? $_ENV['MAIL_PASSWORD'] ?? $_ENV['GMAIL_APP_PASSWORD'] ?? $_SERVER['SMTP_PASS'] ?? $_SERVER['SMTP_PASSWORD'] ?? $_SERVER['MAIL_PASSWORD'] ?? $_SERVER['GMAIL_APP_PASSWORD'] ?? ''));

        try {
            $mail->addAddress($toEmail, $toName);
            $mail->isHTML(true);
            $mail->Subject = $subject;
            $mail->Body = $htmlBody;
            $mail->AltBody = $plainText;

            // Generate and attach PDF if requested
            if (!empty($payload['attachInvoicePdf']) || $eventType === 'PAYMENT_RECEIPT' || $eventType === 'SALE_CONFIRMATION') {
                require_once __DIR__ . '/PdfInvoiceGenerator.php';
                require_once __DIR__ . '/PdfReceiptGenerator.php';
                
                $invoiceData = (!empty($payload['invoiceData']) && is_array($payload['invoiceData'])) 
                    ? $payload['invoiceData'] 
                    : $payload;

                if (empty($invoiceData['customerName']) && !empty($toName)) {
                    $invoiceData['customerName'] = $toName;
                }
                if (empty($invoiceData['customerEmail']) && !empty($toEmail)) {
                    $invoiceData['customerEmail'] = $toEmail;
                }
                if (empty($invoiceData['invoiceNumber']) && !empty($payload['invoiceNumber'])) {
                    $invoiceData['invoiceNumber'] = $payload['invoiceNumber'];
                }

                if ($eventType === 'PAYMENT_RECEIPT') {
                    $pdfResult = PdfReceiptGenerator::generateReceiptPdf($invoiceData);
                } else {
                    $pdfResult = PdfInvoiceGenerator::generateInvoicePdf($invoiceData);
                }

                if (!empty($pdfResult['success']) && !empty($pdfResult['filePath']) && file_exists($pdfResult['filePath']) && filesize($pdfResult['filePath']) > 0) {
                    $tempPdfPath = $pdfResult['filePath'];
                    $pdfFilename = $pdfResult['filename'] ?? ($eventType === 'PAYMENT_RECEIPT' ? ('Receipt-' . ($payload['paymentNumber'] ?? $payload['invoiceNumber'] ?? 'REC') . '.pdf') : ('Invoice-' . ($payload['invoiceNumber'] ?? 'INV') . '.pdf'));
                    $mail->addAttachment($tempPdfPath, $pdfFilename, 'base64', 'application/pdf');
                }
            } elseif (!empty($payload['attachmentPath']) && file_exists($payload['attachmentPath']) && filesize($payload['attachmentPath']) > 0) {
                // Attach pre-generated trusted internal file
                $attachmentName = $payload['attachmentName'] ?? basename($payload['attachmentPath']);
                $mail->addAttachment($payload['attachmentPath'], $attachmentName);
            }

            // If running in Mock / Log driver mode (e.g. automated test suites), log to outbox and return success
            if ($isMock) {
                self::logOutbox($payload, $mail, 'SENT', 'Mock Mail Driver (Local Simulation)');
                return [
                    'success' => true,
                    'status' => 'SENT',
                    'message' => 'Email rendered and saved to outbox (Mock Driver / Test Mode)',
                    'messageId' => 'mock-' . uniqid(),
                    'recipient' => $toEmail,
                    'subject' => $subject,
                    'eventType' => $eventType,
                    'pdfAttached' => !empty($tempPdfPath) || !empty($payload['attachmentPath']),
                    'timestamp' => date('c'),
                ];
            }

            // In live mode, verify that SMTP host, user, and password are configured
            if (empty($smtpHost) || empty($smtpUser) || empty($smtpPass)) {
                $unconfiguredMsg = 'Email could not be sent. SMTP is not configured in server environment. Please set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS in .env';
                
                self::logOutbox($payload, $mail, 'FAILED', $unconfiguredMsg);

                return [
                    'success' => false,
                    'status' => 'FAILED',
                    'error' => $unconfiguredMsg,
                    'recipient' => $toEmail,
                    'subject' => $subject,
                    'eventType' => $eventType,
                    'pdfAttached' => !empty($tempPdfPath) || !empty($payload['attachmentPath']),
                    'timestamp' => date('c'),
                ];
            }

            // Send via PHPMailer SMTP with automatic port/encryption fallback
            try {
                $mail->send();
            } catch (\Throwable $sendError) {
                $err = !empty($mail->ErrorInfo) ? $mail->ErrorInfo : $sendError->getMessage();
                $isConnectionTimeout = stripos($err, 'timed out') !== false || stripos($err, 'Failed to connect') !== false || stripos($err, 'Could not connect') !== false;

                if ($isConnectionTimeout) {
                    if ($mail->Port !== 465) {
                        try {
                            $mail->Port = 465;
                            $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
                            $mail->send();
                        } catch (\Throwable $retryError) {
                            throw $sendError;
                        }
                    } elseif ($mail->Port === 465) {
                        try {
                            $mail->Port = 587;
                            $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
                            $mail->send();
                        } catch (\Throwable $retryError) {
                            throw $sendError;
                        }
                    } else {
                        throw $sendError;
                    }
                } else {
                    throw $sendError;
                }
            }
            self::logOutbox($payload, $mail, 'SENT');

            return [
                'success' => true,
                'status' => 'SENT',
                'message' => "Email sent successfully via PHPMailer SMTP ({$smtpHost})",
                'messageId' => $mail->MessageID ?: ('msg-' . uniqid()),
                'recipient' => $toEmail,
                'subject' => $subject,
                'eventType' => $eventType,
                'pdfAttached' => !empty($tempPdfPath) || !empty($payload['attachmentPath']),
                'timestamp' => date('c'),
            ];
        } catch (\Throwable $e) {
            $mailError = !empty($mail->ErrorInfo) ? $mail->ErrorInfo : $e->getMessage();
            $errorMsg = 'PHPMailer SMTP delivery failed: ' . $mailError;
            self::logOutbox($payload, $mail, 'FAILED', $errorMsg);

            return [
                'success' => false,
                'status' => 'FAILED',
                'error' => $errorMsg,
                'recipient' => $toEmail,
                'subject' => $subject,
                'eventType' => $eventType,
            ];
        } finally {
            // Clean up temporary generated PDF file if created
            if ($tempPdfPath && file_exists($tempPdfPath)) {
                @unlink($tempPdfPath);
            }
        }
    }

    /**
     * Render Template for Event Type
     */
    private static function renderTemplate(string $eventType, array $data): array {
        $templateFile = __DIR__ . '/templates/' . strtolower(preg_replace('/[^a-zA-Z0-9_]/', '_', $eventType)) . '.php';
        
        if (!file_exists($templateFile)) {
            // Fallback generic template
            $templateFile = __DIR__ . '/templates/generic.php';
        }

        // Shared metadata variables
        $companyName = getenv('COMPANY_NAME') ?: 'Enterprises CRM';
        $supportPhone = getenv('SUPPORT_PHONE') ?: '+91 98200 11223';
        $supportEmail = getenv('SUPPORT_EMAIL') ?: 'support@enterprisescrm.local';
        $upiId = getenv('UPI_ID') ?: 'enterprises.crm@upi';

        // Extract variables for template rendering
        extract($data);
        
        // Capture HTML Output
        ob_start();
        $subject = null;
        $plainText = null;
        include $templateFile;
        $html = ob_get_clean();

        // Default subject & plain text if not explicitly set in template
        if (empty($subject)) {
            $subject = "Notification from {$companyName}";
        }
        if (empty($plainText)) {
            $plainText = strip_tags(str_replace(['<br>', '<br/>', '</p>', '</tr>'], "\n", $html));
            $plainText = trim(preg_replace("/[\r\n]+/", "\n", $plainText));
        }

        return [
            'subject' => $subject,
            'html' => $html,
            'text' => $plainText,
        ];
    }

    /**
     * Audit log outgoing messages in local desktop outbox directory
     */
    private static function logOutbox(array $payload, PHPMailer $mail, string $status, ?string $error = null): void {
        try {
            $outboxDir = __DIR__ . '/outbox';
            if (!is_dir($outboxDir)) {
                @mkdir($outboxDir, 0777, true);
            }

            $ref = preg_replace('/[^a-zA-Z0-9_-]/', '', $payload['referenceId'] ?? $payload['invoiceNumber'] ?? $payload['saleNumber'] ?? 'mail');
            $filename = $outboxDir . '/' . date('Ymd_His') . '_' . $status . '_' . $ref . '.json';

            @file_put_contents($filename, json_encode([
                'timestamp' => date('c'),
                'status' => $status,
                'eventType' => $payload['eventType'] ?? 'UNKNOWN',
                'recipient' => $mail->getToAddresses()[0][0] ?? ($payload['toEmail'] ?? ''),
                'recipientName' => $mail->getToAddresses()[0][1] ?? ($payload['toName'] ?? ''),
                'subject' => $mail->Subject,
                'mailer' => $mail->Mailer,
                'error' => $error,
            ], JSON_PRETTY_PRINT));
        } catch (\Throwable $t) {
            // Suppress non-critical outbox logging errors
        }
    }
}
