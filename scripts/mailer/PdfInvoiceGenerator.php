<?php
/**
 * Enterprises CRM - Official Invoice & Receipt PDF Generator
 * 
 * Generates the official Bill of Supply / Receipt template
 * on STRICTLY 1 SINGLE PAGE with pixel-perfect visual fidelity.
 */

namespace SREnterprises\Mailer;

require_once __DIR__ . '/vendor/autoload.php';
require_once __DIR__ . '/assets/lower_section_b64.php';

use Dompdf\Dompdf;
use Dompdf\Options;

class PdfInvoiceGenerator {
    /**
     * Generate an Official Receipt / Bill of Supply PDF file on disk
     * 
     * @param array $receiptData Real persisted payment record + invoice + line items + customer info
     * @return array ['success' => bool, 'filePath' => string, 'filename' => string, 'error' => string|null]
     */
    public static function generateReceiptPdf(array $receiptData): array {
        return self::generateDocumentPdf($receiptData, 'Receipt');
    }

    /**
     * Generate an Official Invoice / Bill of Supply PDF file on disk
     * 
     * @param array $invoiceData Real persisted invoice record + line items + customer info
     * @return array ['success' => bool, 'filePath' => string, 'filename' => string, 'error' => string|null]
     */
    public static function generateInvoicePdf(array $invoiceData): array {
        return self::generateDocumentPdf($invoiceData, 'Invoice');
    }

    /**
     * Core PDF generation method for official Enterprises CRM documents
     */
    public static function generateDocumentPdf(array $docData, string $docTypePrefix = 'Invoice'): array {
        try {
            $options = new Options();
            $options->set('isHtml5ParserEnabled', true);
            $options->set('isRemoteEnabled', true);
            $options->set('defaultFont', 'Helvetica');
            $options->set('dpi', 150);

            $dompdf = new Dompdf($options);

            $isRevamp = !empty($docData['serviceId']) || !empty($docData['jobCardId']) || (!empty($docData['template']) && strtoupper($docData['template']) === 'REVAMP');
            $html = $isRevamp ? self::renderRevampInvoiceHtml($docData) : self::renderOfficialDocumentHtml($docData);
            $dompdf->loadHtml($html);
            $dompdf->setPaper('A4', 'portrait');
            $dompdf->render();

            $invoiceNumber = $docData['invoiceNumber'] ?? $docData['invoice_number'] ?? '82026' . date('d');
            $cleanNum = preg_replace('/[^a-zA-Z0-9_-]/', '', $invoiceNumber);
            $filename = "{$docTypePrefix}-{$cleanNum}.pdf";

            $tempDir = sys_get_temp_dir() . '/sr_crm_documents';
            if (!is_dir($tempDir)) {
                @mkdir($tempDir, 0777, true);
            }

            $filePath = $tempDir . '/' . uniqid(strtolower($docTypePrefix) . '_', true) . '_' . $filename;
            $outputBytes = $dompdf->output();
            file_put_contents($filePath, $outputBytes);

            return [
                'success' => true,
                'filePath' => $filePath,
                'filename' => $filename,
                'fileSizeBytes' => filesize($filePath),
            ];
        } catch (\Throwable $e) {
            return [
                'success' => false,
                'error' => "{$docTypePrefix} PDF generation failed: " . $e->getMessage(),
            ];
        }
    }

    /**
     * Build the official Enterprises CRM Bill of Supply / Receipt HTML layout on a single page
     */
    public static function renderOfficialDocumentHtml(array $data): string {
        $biz = $data['businessDetails'] ?? [];
        $companyName = htmlspecialchars($biz['companyName'] ?? 'Enterprises CRM');
        $addrParts = array_filter([
            $biz['addressLine1'] ?? '',
            $biz['addressLine2'] ?? '',
            $biz['city'] ?? '',
            $biz['state'] ?? '',
            $biz['pincode'] ?? ''
        ]);
        $companyAddress = htmlspecialchars(implode(', ', $addrParts));
        $companyAddressHtml = !empty($companyAddress) ? "<div style=\"font-size: 8px; color: #111; margin-top: 2px; font-weight: 500;\">{$companyAddress}</div>" : '';
        $companyPhone = htmlspecialchars($biz['phone'] ?? '');
        $companyEmail = htmlspecialchars($biz['email'] ?? '');
        $contactItems = [];
        if ($companyPhone) $contactItems[] = "Mobile: {$companyPhone}";
        if ($companyEmail) $contactItems[] = "Email: {$companyEmail}";
        $contactLine = implode(' &nbsp;&nbsp;&nbsp;&nbsp; ', $contactItems);
        $companyContactHtml = !empty($contactLine) ? "<div style=\"font-size: 9px; font-weight: bold; color: #000; margin-top: 2px;\">{$contactLine}</div>" : '';
        $companyGstin = htmlspecialchars($biz['gstin'] ?? '');
        $companyGstinHtml = !empty($companyGstin) ? "<div style=\"font-size: 8px; color: #111; margin-top: 1px; font-weight: bold;\">GSTIN: {$companyGstin}</div>" : '';

        $customerName = htmlspecialchars(strtoupper($data['customerName'] ?? $data['toName'] ?? 'Valued Customer'));
        $customerPhone = htmlspecialchars($data['customerPhone'] ?? $data['phone'] ?? '');
        $customerGst = !empty($data['customerGst']) ? htmlspecialchars($data['customerGst']) : (!empty($data['gstNumber']) ? htmlspecialchars($data['gstNumber']) : '');
        $gstHtml = $customerGst ? "<div style='font-size: 8px; font-weight: bold; color: #000; margin-top: 1px;'>GSTIN: {$customerGst}</div>" : '';

        // Supply Information from available customer / sale / invoice address
        $supplyAddr = '';
        if (!empty($data['supplyAddress'])) {
            $supplyAddr = $data['supplyAddress'];
        } elseif (!empty($data['addresses']) && is_array($data['addresses']) && !empty($data['addresses'][0])) {
            $addr = $data['addresses'][0];
            $parts = array_filter([$addr['addressLine1'] ?? '', $addr['city'] ?? '', $addr['state'] ?? '']);
            $supplyAddr = implode(', ', $parts);
        } elseif (!empty($data['customerAddress'])) {
            $supplyAddr = $data['customerAddress'];
        } elseif (!empty($data['customerCity']) || !empty($data['customerState'])) {
            $supplyAddr = trim(($data['customerCity'] ?? '') . ', ' . ($data['customerState'] ?? ''), ', ');
        }
        $supplyAddress = htmlspecialchars($supplyAddr);

        $rawInvoiceNo = $data['invoiceNumber'] ?? $data['invoice_number'] ?? '0926251';
        $invoiceNo = htmlspecialchars($rawInvoiceNo);

        $poNumber = !empty($data['poNumber']) ? htmlspecialchars(trim($data['poNumber'])) : '';

        $invoiceDate = !empty($data['invoiceDate']) ? date('d/m/Y', strtotime($data['invoiceDate'])) : date('d/m/Y');
        $rawDueDate = !empty($data['dueDate']) ? $data['dueDate'] : (!empty($data['nextDueDate']) ? $data['nextDueDate'] : null);
        $dueDate = !empty($rawDueDate) ? date('d/m/Y', strtotime($rawDueDate)) : date('d/m/Y', strtotime($invoiceDate . ' +15 days'));

        $items = $data['items'] ?? [];
        $totalAmount = (float)($data['totalAmount'] ?? $data['total_amount'] ?? 0);
        $discountAmount = (float)($data['discountAmount'] ?? $data['discount_amount'] ?? 0);
        $receivedAmount = (float)($data['paidAmount'] ?? $data['paid_amount'] ?? $data['amount'] ?? 0);
        $balanceAmount = (float)($data['outstandingAmount'] ?? $data['outstanding_amount'] ?? max(0, $totalAmount - $receivedAmount));

        if ($receivedAmount <= 0 && !empty($data['amount'])) {
            $receivedAmount = (float)$data['amount'];
            $balanceAmount = max(0, $totalAmount - $receivedAmount);
        }

        // Build item rows (up to 10 rows)
        $actualItems = !empty($items) && is_array($items) ? $items : [
            [
                'nameSnapshot' => 'Standard Services',
                'quantity' => 1,
                'unit' => 'PCS',
                'unitPriceSnapshot' => $totalAmount > 0 ? $totalAmount : 0,
                'lineTotal' => $totalAmount > 0 ? $totalAmount : 0,
            ]
        ];

        $itemRowsHtml = '';
        $totalQty = 0;

        for ($slotIdx = 0; $slotIdx < 10; $slotIdx++) {
            if (isset($actualItems[$slotIdx])) {
                $item = $actualItems[$slotIdx];
                $name = htmlspecialchars($item['nameSnapshot'] ?? $item['productName'] ?? $item['name'] ?? $item['description'] ?? 'Standard Services');
                $qty = (int)($item['quantity'] ?? 1);
                $unit = htmlspecialchars($item['unit'] ?? 'PCS');
                $rate = (float)($item['unitPriceSnapshot'] ?? $item['unitPrice'] ?? $item['rate'] ?? 0);
                $amt = (float)($item['lineTotal'] ?? ($qty * $rate));

                $totalQty += $qty;
                $formattedRate = number_format($rate);
                $formattedAmt = number_format($amt);
                $displayIdx = $slotIdx + 1;

                $itemRowsHtml .= "
                    <tr style='height: 18px;'>
                        <td style='border-right: 1px solid #000; padding: 2px 2px; font-size: 8.5px; text-align: center; vertical-align: top;'>{$displayIdx}</td>
                        <td style='border-right: 1px solid #000; padding: 2px 6px; font-size: 8.5px; text-align: left; vertical-align: top;'>{$name}</td>
                        <td style='border-right: 1px solid #000; padding: 2px 2px; font-size: 8.5px; text-align: center; vertical-align: top;'>{$qty} {$unit}</td>
                        <td style='border-right: 1px solid #000; padding: 2px 4px; font-size: 8.5px; text-align: right; vertical-align: top;'>{$formattedRate}</td>
                        <td style='padding: 2px 6px; font-size: 8.5px; text-align: right; vertical-align: top;'>{$formattedAmt}</td>
                    </tr>
                ";
            } else {
                $itemRowsHtml .= "
                    <tr style='height: 18px;'>
                        <td style='border-right: 1px solid #000; padding: 2px 2px; font-size: 8.5px; text-align: center;'>&nbsp;</td>
                        <td style='border-right: 1px solid #000; padding: 2px 6px; font-size: 8.5px; text-align: left;'>&nbsp;</td>
                        <td style='border-right: 1px solid #000; padding: 2px 2px; font-size: 8.5px; text-align: center;'>&nbsp;</td>
                        <td style='border-right: 1px solid #000; padding: 2px 4px; font-size: 8.5px; text-align: right;'>&nbsp;</td>
                        <td style='padding: 2px 6px; font-size: 8.5px; text-align: right;'>&nbsp;</td>
                    </tr>
                ";
            }
        }

        // Discount row
        $discountRowHtml = '';
        if ($discountAmount > 0) {
            $formattedDiscount = number_format($discountAmount);
            $discountRowHtml = "
                <tr>
                    <td style='border-right: 1px solid #000;'></td>
                    <td style='border-right: 1px solid #000; padding: 3px 6px; font-size: 8.5px; text-align: right;'><em>Discount</em></td>
                    <td style='border-right: 1px solid #000; padding: 3px 2px; font-size: 8.5px; text-align: center;'>-</td>
                    <td style='border-right: 1px solid #000; padding: 3px 4px; font-size: 8.5px; text-align: center;'>-</td>
                    <td style='padding: 3px 6px; font-size: 8.5px; text-align: right;'>- ₹ {$formattedDiscount}</td>
                </tr>
            ";
        }

        $formattedTotalAmount = number_format($totalAmount > 0 ? $totalAmount : 16500);
        $formattedReceivedAmount = number_format($receivedAmount);
        $formattedBalanceAmount = number_format($balanceAmount);

        $status = strtoupper($data['status'] ?? '');

        // Notes (dynamic only, no hardcoded fallback)
        $notesText = isset($data['notes']) ? trim($data['notes']) : '';
        $warrantyNotes = !empty($notesText) ? htmlspecialchars($notesText) : '';

        // Authoritative static lower section and logo
        $logoSvg = self::getLogoSvgBase64();
        $lowerSectionImg = InvoiceAssets::$OFFICIAL_LOWER_SECTION_B64;
        $qrSvg = self::getQrCodeSvgBase64();
        $sigSvg = self::getSignatureSvgBase64();

        return <<<HTML
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Official Bill / Receipt - {$companyName}</title>
<style>
    @page {
        size: A4 portrait;
        margin: 15mm 12mm 10mm 12mm;
    }
    * {
        box-sizing: border-box;
    }
    body {
        font-family: Helvetica, Arial, sans-serif;
        color: #000000;
        margin: 0;
        padding: 0;
        font-size: 8.5px;
        line-height: 1.2;
    }
    
    .doc-container {
        width: 100%;
        max-width: 190mm;
        margin: 0 auto;
        page-break-inside: avoid;
    }
    
    .top-badges {
        margin-bottom: 4px;
    }
    .badge-tag {
        display: inline-block;
        border: 1px solid #000;
        padding: 1.5px 5px;
        font-size: 7px;
        font-weight: bold;
        letter-spacing: 0.5px;
        text-transform: uppercase;
    }
    .badge-tag-muted {
        display: inline-block;
        border: 1px solid #777;
        padding: 1.5px 5px;
        font-size: 7px;
        color: #555;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        margin-left: 2px;
    }
    
    .header-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 6px;
    }
    
    .flat-grid {
        width: 100%;
        border: 1.5px solid #000;
        border-collapse: collapse;
        margin-bottom: -1.5px;
    }
    
    .flat-grid td, .flat-grid th {
        box-sizing: border-box;
    }
</style>
</head>
<body>

<div class="doc-container">

    <!-- TOP BADGES: Single INVOICE Label -->
    <div class="top-badges" style="text-align: left; margin-bottom: 6px;">
        <span class="badge-tag">INVOICE</span>
    </div>

    <!-- HEADER TABLE -->
    <table class="header-table">
        <tr>
            <td style="width: 70px; vertical-align: middle; text-align: center;">
                <img src="{$logoSvg}" style="width: 60px; height: 60px; object-fit: contain;" alt="Enterprises CRM Logo" />
            </td>
            <td style="text-align: center; vertical-align: middle; padding: 0 10px;">
                <div style="font-size: 19px; font-weight: bold; color: #000; letter-spacing: 0.5px; line-height: 1.1;">{$companyName}</div>
                {$companyAddressHtml}
                {$companyContactHtml}
                {$companyGstinHtml}
            </td>
        </tr>
    </table>

    <!-- SECTION 1: BILL TO & INVOICE DETAILS GRID (SUPPLY removed) -->
    <table class="flat-grid">
        <tr>
            <td style="width: 58%; border-right: 1.5px solid #000; padding: 4px 6px; vertical-align: middle;">
                <div style="font-size: 8px; font-weight: bold; color: #000; margin-bottom: 2px; text-transform: uppercase;">BILL TO</div>
                <div style="font-size: 9.5px; font-weight: bold; color: #000; text-transform: uppercase;">{$customerName}</div>
                <div style="font-size: 8.5px; font-weight: 500; color: #000; margin-top: 1px;">Mobile: {$customerPhone}</div>
                {$gstHtml}
            </td>
            <td style="width: 42%; vertical-align: top; padding: 0;">
                <table style="width: 100%; border-collapse: collapse; text-align: center;">
                    <tr>
                        <td style="width: 50%; border-right: 1px solid #000; border-bottom: 1px solid #000; padding: 3px 2px; text-align: center; vertical-align: middle;">
                            <div style="font-size: 7.5px; font-weight: bold; color: #000;">Invoice No.</div>
                            <div style="font-size: 8.5px; font-weight: bold; font-family: monospace; color: #000; margin-top: 2px;">{$invoiceNo}</div>
                        </td>
                        <td style="width: 50%; border-bottom: 1px solid #000; padding: 3px 2px; text-align: center; vertical-align: middle;">
                            <div style="font-size: 7.5px; font-weight: bold; color: #000;">Invoice Date</div>
                            <div style="font-size: 8.5px; font-weight: bold; color: #000; margin-top: 2px;">{$invoiceDate}</div>
                        </td>
                    </tr>
                    <tr>
                        <td colspan="2" style="padding: 4px 2px; text-align: center; vertical-align: middle;">
                            <div style="font-size: 7.5px; font-weight: bold; color: #000;">PO Number</div>
                            <div style="font-size: 8.5px; font-weight: bold; font-family: monospace; color: #000; margin-top: 2px; min-height: 10px;">{$poNumber}</div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>

    <!-- SECTION 2: ITEMS TABLE -->
    <table class="flat-grid">
        <thead>
            <tr style="background-color: #e5e7eb; border-bottom: 1.5px solid #000;">
                <th style="width: 10.2%; border-right: 1px solid #000; padding: 3px 2px; font-size: 8px; font-weight: bold; text-align: center;">S.NO.</th>
                <th style="width: 46.5%; border-right: 1px solid #000; padding: 3px 6px; font-size: 8px; font-weight: bold; text-align: center;">ITEMS</th>
                <th style="width: 13.0%; border-right: 1px solid #000; padding: 3px 2px; font-size: 8px; font-weight: bold; text-align: center;">QTY.</th>
                <th style="width: 14.0%; border-right: 1px solid #000; padding: 3px 4px; font-size: 8px; font-weight: bold; text-align: center;">RATE</th>
                <th style="width: 16.3%; padding: 3px 6px; font-size: 8px; font-weight: bold; text-align: center;">AMOUNT</th>
            </tr>
        </thead>
        <tbody>
            {$itemRowsHtml}
            {$discountRowHtml}
            <!-- TOTAL ROW -->
            <tr style="background-color: #e5e7eb; border-top: 1.5px solid #000; font-weight: bold;">
                <td style="border-right: 1px solid #000; padding: 3px 2px;"></td>
                <td style="border-right: 1px solid #000; padding: 3px 6px; font-size: 9px; text-align: right;">TOTAL</td>
                <td style="border-right: 1px solid #000; padding: 3px 2px; font-size: 9px; text-align: center;">{$totalQty}</td>
                <td style="border-right: 1px solid #000; padding: 3px 4px; font-size: 9px; text-align: center;"></td>
                <td style="padding: 3px 6px; font-size: 9px; text-align: right;">₹ {$formattedTotalAmount}</td>
            </tr>
        </tbody>
    </table>

    <!-- SECTION 3: RECEIVED AMOUNT & BALANCE AMOUNT -->
    <table class="flat-grid">
        <tr style="border-bottom: 1.5px solid #000;">
            <td style="width: 50%; border-right: 1.5px solid #000; padding: 4px 6px; font-size: 9px; font-weight: bold;">
                Received Amount: ₹ {$formattedReceivedAmount}
            </td>
            <td style="width: 50%; padding: 4px 6px; font-size: 9px; font-weight: bold;">
                Balance Amount: ₹ {$formattedBalanceAmount}
            </td>
        </tr>
        <!-- SECTION 4: NOTES -->
        <tr>
            <td colspan="2" style="padding: 4px 6px; font-size: 8px;">
                <strong>Notes:</strong> {$warrantyNotes}
            </td>
        </tr>
    </table>

    <!-- SECTION 5: BANK DETAILS, PAYMENT QR, TERMS & SIGNATORY -->
    <table class="flat-grid" style="border-top: none; margin-top: 0; width: 100%;">
        <tr>
            <td style="width: 26%; border-right: 1.5px solid #000; padding: 4px 6px; vertical-align: top;">
                <div style="font-size: 8px; font-weight: bold; margin-bottom: 3px; color: #000;">Bank Details</div>
                <div style="font-size: 7px; line-height: 1.5; color: #111;">
                    <strong>Bank:</strong> State Bank of India<br/>
                    <strong>Name:</strong> Enterprises CRM<br/>
                    <strong>A/c No:</strong> 30998877665<br/>
                    <strong>IFSC:</strong> SBIN0001234<br/>
                    <strong>Branch:</strong> Main Branch, Pune
                </div>
            </td>
            <td style="width: 24%; border-right: 1.5px solid #000; padding: 4px 6px; vertical-align: top;">
                <div style="font-size: 8px; font-weight: bold; margin-bottom: 2px; color: #000;">Payment QR Code</div>
                <div style="font-size: 6.8px; line-height: 1.25; color: #111;">
                    Scan &amp; Pay (UPI)<br/>
                    <strong>UPI:</strong> enterprises.crm@upi
                </div>
                <div style="margin-top: 4px; text-align: left;">
                    <img src="{$qrSvg}" alt="Payment QR Code" style="width: 52px; height: 52px; display: inline-block;" />
                </div>
            </td>
            <td style="width: 32%; border-right: 1.5px solid #000; padding: 4px 6px; vertical-align: top;">
                <div style="font-size: 8px; font-weight: bold; margin-bottom: 2px; color: #000;">Terms and Conditions</div>
                <div style="font-size: 6.5px; line-height: 1.25; color: #222;">
                    1) Goods once sold will not be taken back or exchanged<br/>
                    2) Warranty as per manufacturer terms &amp; conditions<br/>
                    3) Service charges applicable for out-of-warranty services<br/>
                    4) Subject to local jurisdiction
                </div>
            </td>
            <td style="width: 18%; padding: 4px 6px; vertical-align: top; text-align: center;">
                <div style="margin-top: 2px; margin-bottom: 4px;">
                    <img src="{$sigSvg}" alt="Authorised Signatory" style="height: 36px; display: inline-block;" />
                </div>
                <div style="font-size: 7.5px; font-weight: bold; color: #000; line-height: 1.2;">
                    Authorised Signatory For<br/>
                    ENTERPRISES CRM
                </div>
            </td>
        </tr>
    </table>

</div>

</body>
</html>
HTML;
    }

    /**
     * Vector logo asset as base64
     */
    private static function getLogoSvgBase64(): string {
        $svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
            <circle cx="50" cy="50" r="47" fill="#ffffff" stroke="#1d4ed8" stroke-width="3"/>
            <circle cx="50" cy="50" r="41" fill="#ffffff" stroke="#1d4ed8" stroke-width="1.5" stroke-dasharray="2,2"/>
            <circle cx="50" cy="50" r="36" fill="#f8fafc" stroke="#1d4ed8" stroke-width="1"/>
            <path id="curveTop" d="M 20 50 A 30 30 0 0 1 80 50" fill="none"/>
            <text font-family="Arial, Helvetica, sans-serif" font-size="7.5" font-weight="bold" fill="#1d4ed8" text-anchor="middle">
                <textPath href="#curveTop" startOffset="50%">ENTERPRISES CRM</textPath>
            </text>
            <circle cx="50" cy="50" r="22" fill="#1d4ed8"/>
            <text x="50" y="56" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="900" fill="#ffffff" text-anchor="middle">CRM</text>
        </svg>';
        return 'data:image/svg+xml;base64,' . base64_encode($svg);
    }

    /**
     * Enterprises CRM UPI QR Code (enterprises.crm@upi) as base64 PNG
     */
    private static function getQrCodeSvgBase64(): string {
        return 'data:image/png;base64,' . InvoiceAssets::$AU_BANK_QR_B64;
    }

    /**
     * Vector Signature asset as base64 matching the official signature in the image
     */
    private static function getSignatureSvgBase64(): string {
        $svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 60" width="140" height="60">
            <path d="M 20 48 C 15 25 22 10 32 8 C 42 6 48 18 45 32 C 43 42 32 46 25 45 C 38 43 52 28 58 16 C 63 8 70 8 74 14 C 77 22 75 36 68 45" fill="none" stroke="#000000" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M 52 24 C 62 18 72 20 82 28 C 88 34 94 36 102 36" fill="none" stroke="#000000" stroke-width="1.5" stroke-linecap="round"/>
            <path d="M 68 44 C 82 43 105 40 128 38" fill="none" stroke="#000000" stroke-width="1.2" stroke-linecap="round"/>
        </svg>';
        return 'data:image/svg+xml;base64,' . base64_encode($svg);
    }

    /**
     * Convert an Indian numerical amount to words for invoice display
     */
    public static function convertNumberToWords(float $number): string {
        $no = floor($number);
        $digits_1 = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
        $digits_2 = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

        $words = [];
        $i = 0;
        while ($no > 0) {
            $divider = ($i == 2) ? 10 : 100;
            $num = $no % $divider;
            $no = floor($no / $divider);
            $i += ($divider == 10) ? 1 : 2;
            if ($num) {
                $sub = '';
                if ($num < 20) {
                    $sub = $digits_1[$num];
                } else {
                    $sub = $digits_2[floor($num / 10)] . ' ' . $digits_1[$num % 10];
                }
                $unit = '';
                if ($i == 3) $unit = ' Hundred';
                elseif ($i == 4 || $i == 5) $unit = ' Thousand';
                elseif ($i == 6 || $i == 7) $unit = ' Lakh';
                elseif ($i >= 8) $unit = ' Crore';
                
                $words[] = trim($sub) . $unit;
            }
        }
        $words = array_reverse($words);
        $result = implode(' ', $words);
        return trim($result) ?: 'Zero';
    }

    /**
     * Build the EXACT official Revamp Home Appliance Repair Service Invoice HTML layout
     * matching the user-supplied physical template with pixel-perfect visual fidelity.
     */
    public static function renderRevampInvoiceHtml(array $data): string {
        $biz = $data['businessDetails'] ?? [];
        $revampCompanyName = htmlspecialchars($biz['companyName'] ?? 'Revamp');
        $addrParts = array_filter([
            $biz['addressLine1'] ?? '',
            $biz['addressLine2'] ?? '',
            $biz['city'] ?? '',
            $biz['state'] ?? '',
            $biz['pincode'] ?? ''
        ]);
        $defaultRevampAddr = "Io Gate, Akshara International School Road, opposite Sukhwani Skylines,<br>next to Pandurangbaug Washing Center, Wakad, Pune, Pimpri-Chinchwad,<br>Maharashtra 411057";
        $revampAddress = !empty($addrParts) ? htmlspecialchars(implode(', ', $addrParts)) : $defaultRevampAddr;
        $revampPhone = htmlspecialchars($biz['phone'] ?? '9881647076');

        $customerName = htmlspecialchars($data['customerName'] ?? (isset($data['customer']['fullName']) ? $data['customer']['fullName'] : 'Valued Customer'));
        
        $customerAddress = '';
        if (!empty($data['supplyAddress'])) {
            $customerAddress = $data['supplyAddress'];
        } elseif (!empty($data['customerAddress'])) {
            $customerAddress = $data['customerAddress'];
        } elseif (!empty($data['addresses']) && is_array($data['addresses']) && !empty($data['addresses'][0])) {
            $addr = $data['addresses'][0];
            $parts = array_filter([$addr['addressLine1'] ?? '', $addr['city'] ?? '', $addr['state'] ?? '']);
            $customerAddress = implode(', ', $parts);
        } elseif (!empty($data['customer']['addresses']) && is_array($data['customer']['addresses']) && !empty($data['customer']['addresses'][0])) {
            $addr = $data['customer']['addresses'][0];
            $parts = array_filter([$addr['addressLine1'] ?? '', $addr['city'] ?? '', $addr['state'] ?? '']);
            $customerAddress = implode(', ', $parts);
        }
        $customerAddress = htmlspecialchars($customerAddress);

        $customerGst = !empty($data['customerGst']) ? htmlspecialchars($data['customerGst']) : (!empty($data['gstNumber']) ? htmlspecialchars($data['gstNumber']) : '');
        $invoiceNo = htmlspecialchars($data['invoiceNumber'] ?? $data['invoice_number'] ?? '1079');
        $invoiceDate = !empty($data['invoiceDate']) ? date('d/m/Y', strtotime($data['invoiceDate'])) : date('d/m/Y');

        $totalAmount = (float)($data['totalAmount'] ?? $data['total_amount'] ?? 0);
        $totalFormatted = number_format($totalAmount, 2, '.', ',');
        $amountWords = self::convertNumberToWords($totalAmount);

        $items = $data['items'] ?? [];
        $actualItems = !empty($items) && is_array($items) ? $items : [
            [
                'nameSnapshot' => 'Appliance Repair & Servicing',
                'quantity' => 1,
                'unitPriceSnapshot' => $totalAmount > 0 ? $totalAmount : 500,
                'lineTotal' => $totalAmount > 0 ? $totalAmount : 500,
            ]
        ];

        $itemRows = '';
        $sr = 1;
        foreach ($actualItems as $item) {
            $name = htmlspecialchars($item['nameSnapshot'] ?? $item['name'] ?? 'Service Item');
            $qty = (int)($item['quantity'] ?? 1);
            $rate = number_format((float)($item['unitPriceSnapshot'] ?? $item['unitPrice'] ?? 0), 2, '.', ',');
            $amt = number_format((float)($item['lineTotal'] ?? $item['total'] ?? 0), 2, '.', ',');
            $itemRows .= "
            <tr style=\"height: 24px;\">
                <td style=\"border-right: 1.5px solid #000; text-align: center; padding: 4px; vertical-align: top;\">{$sr}</td>
                <td style=\"border-right: 1.5px solid #000; text-align: left; padding: 4px 8px; vertical-align: top;\">{$name}</td>
                <td style=\"border-right: 1.5px solid #000; text-align: center; padding: 4px; vertical-align: top;\">{$qty}</td>
                <td style=\"border-right: 1.5px solid #000; text-align: right; padding: 4px 8px; vertical-align: top;\">{$rate}</td>
                <td style=\"text-align: right; padding: 4px 8px; vertical-align: top;\">{$amt}</td>
            </tr>";
            $sr++;
        }

        // Fill remaining height with empty rows having full-length vertical borders
        $fillRowsCount = max(1, 10 - count($actualItems));
        $fillHeight = min(360, max(200, $fillRowsCount * 35));
        $itemRows .= "
        <tr style=\"height: {$fillHeight}px;\">
            <td style=\"border-right: 1.5px solid #000;\">&nbsp;</td>
            <td style=\"border-right: 1.5px solid #000;\">&nbsp;</td>
            <td style=\"border-right: 1.5px solid #000;\">&nbsp;</td>
            <td style=\"border-right: 1.5px solid #000;\">&nbsp;</td>
            <td>&nbsp;</td>
        </tr>";

        return <<<HTML
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
    @page {
        margin: 24px 30px;
        size: A4 portrait;
    }
    body {
        font-family: Arial, Helvetica, sans-serif;
        color: #000000;
        margin: 0;
        padding: 0;
        background: #fff;
    }
    table {
        border-collapse: collapse;
        width: 100%;
    }
</style>
</head>
<body>

<!-- Header Section -->
<table style="width: 100%; margin-bottom: 8px;">
    <tr>
        <td style="width: 48%; vertical-align: top;">
            <div style="font-size: 34px; font-weight: 900; color: #EB3D24; letter-spacing: -0.5px; line-height: 1;">{$revampCompanyName}</div>
            <div style="margin-top: 4px;">
                <span style="background-color: #0B3C7B; color: #ffffff; font-weight: bold; font-size: 11px; padding: 3px 8px; border-radius: 2px; display: inline-block;">Home Appliance Repair Service</span>
            </div>
            <div style="font-size: 11px; font-weight: bold; color: #0B3C7B; margin-top: 4px;">
                Your satisfaction is our <span style="border-bottom: 2px solid #EB3D24; padding-bottom: 1px;">Priority</span>
            </div>
        </td>
        <td style="width: 52%; vertical-align: top; font-size: 11px; line-height: 1.35; padding-left: 10px;">
            {$revampAddress}<br>
            <div style="margin-top: 6px;">
                <strong style="font-size: 12px;">Mob No : {$revampPhone}</strong>
            </div>
        </td>
    </tr>
</table>

<!-- Document Title -->
<div style="text-align: center; font-family: 'Times New Roman', Times, serif; font-size: 26px; font-weight: bold; margin: 12px 0 10px 0;">
    Invoice
</div>

<!-- Customer & Invoice Metadata Box -->
<table style="border: 1.5px solid #000; margin-bottom: 10px; font-size: 12px;">
    <tr>
        <td style="width: 65%; border-right: 1.5px solid #000; padding: 6px 10px; vertical-align: top; line-height: 1.5;">
            <div><strong>Customer Name : </strong>{$customerName}</div>
            <div style="margin-top: 3px;"><strong>Address : </strong>{$customerAddress}</div>
            <div style="margin-top: 3px;"><strong>GSTIN : </strong>{$customerGst}</div>
        </td>
        <td style="width: 35%; padding: 0; vertical-align: top;">
            <div style="padding: 7px 10px; border-bottom: 1.5px solid #000;">
                <strong>Invoice no - </strong>{$invoiceNo}
            </div>
            <div style="padding: 7px 10px;">
                <strong>Date :- </strong>{$invoiceDate}
            </div>
        </td>
    </tr>
</table>

<!-- Particulars / Line Items Table -->
<table style="border: 1.5px solid #000; font-size: 12px;">
    <thead>
        <tr style="border-bottom: 1.5px solid #000; height: 26px;">
            <th style="width: 8%; border-right: 1.5px solid #000; text-align: center; font-weight: bold; padding: 4px;">Sr.<br>No.</th>
            <th style="width: 54%; border-right: 1.5px solid #000; text-align: center; font-weight: bold; padding: 4px;">PARTICULARS</th>
            <th style="width: 10%; border-right: 1.5px solid #000; text-align: center; font-weight: bold; padding: 4px;">Qty.</th>
            <th style="width: 14%; border-right: 1.5px solid #000; text-align: center; font-weight: bold; padding: 4px;">Rate</th>
            <th style="width: 14%; text-align: center; font-weight: bold; padding: 4px;">Amount</th>
        </tr>
    </thead>
    <tbody>
        {$itemRows}
        <!-- Total & Amount in Words row -->
        <tr style="border-top: 1.5px solid #000; height: 32px;">
            <td colspan="2" style="border-right: 1.5px solid #000; padding: 6px 10px; vertical-align: middle;">
                <strong>Rs. </strong><span style="border-bottom: 1px solid #000; display: inline-block; min-width: 250px; padding: 0 4px;">{$amountWords}</span><strong> Only</strong>
            </td>
            <td colspan="3" style="padding: 6px 10px; vertical-align: middle; text-align: left;">
                <strong>TOTAL </strong><span style="border-bottom: 1px solid #000; display: inline-block; min-width: 80px; text-align: right; padding-right: 6px;">{$totalFormatted}</span><strong> /-</strong>
            </td>
        </tr>
    </tbody>
</table>

<!-- Signatures / Footer -->
<table style="width: 100%; margin-top: 35px;">
    <tr>
        <td style="width: 55%; vertical-align: bottom; font-size: 12px; font-weight: bold;">
            Customer Signature :- <span style="border-bottom: 1px solid #000; display: inline-block; width: 180px;"></span>
        </td>
        <td style="width: 45%; vertical-align: bottom; text-align: right;">
            <div style="font-size: 13px; font-weight: bold; margin-bottom: 30px; padding-right: 15px;">For Revamp Services</div>
            <div style="border-bottom: 1px solid #000; width: 160px; display: inline-block; margin-bottom: 4px;"></div>
            <div style="font-size: 11px; padding-right: 50px;">Proprietor</div>
        </td>
    </tr>
</table>

</body>
</html>
HTML;
    }
}

