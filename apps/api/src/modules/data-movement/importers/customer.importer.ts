/**
 * Customer Importer
 * Robust, production-grade Excel & CSV importer for SR Enterprises CRM.
 * Supports .xlsx, .xls, .csv, flexible column name variations, duplicate detection,
 * collision-free sequential numbers, and high-performance transactional batching for 10,000+ records.
 */

import { BaseImporter, type ImporterContext } from './base.importer';
import type {
  ImportEntityType,
  ImportDuplicatePolicy,
  ImportPreviewResult,
  ImportExecuteResult,
  ImportRowError,
  ImportRowWarning,
} from '@crm/types';
import { db } from '../../../database/client';
import { customers, customerAddresses } from '../../../database/schema/customers';
import { auditLogs } from '../../../database/schema/audit';
import { ilike, inArray, eq } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export class CustomerImporter extends BaseImporter {
  readonly entityType: ImportEntityType = 'customer';
  readonly requiredColumns = ['fullName', 'phone'];
  readonly optionalColumns = [
    'email',
    'customerType',
    'companyName',
    'gstNumber',
    'addressLine1',
    'addressLine2',
    'landmark',
    'city',
    'state',
    'postalCode',
    'notes',
  ];

  getTemplate() {
    return {
      headers: [
        'customerNumber',
        'fullName',
        'phone',
        'email',
        'customerType',
        'companyName',
        'gstNumber',
        'addressLine1',
        'city',
        'state',
        'postalCode',
        'notes',
      ],
      exampleRows: [
        {
          customerNumber: '',
          fullName: 'Rajesh Sharma',
          phone: '9876543210',
          email: 'rajesh.sharma@example.com',
          customerType: 'INDIVIDUAL',
          companyName: '',
          gstNumber: '',
          addressLine1: 'Flat 402, Sunshine Heights, Baner Road',
          city: 'Pune',
          state: 'Maharashtra',
          postalCode: '411045',
          notes: 'Standard residential RO installation',
        },
        {
          customerNumber: '',
          fullName: 'Amit Patil',
          phone: '9123456780',
          email: 'info@techcorp.in',
          customerType: 'COMMERCIAL',
          companyName: 'TechCorp Solutions Pvt Ltd',
          gstNumber: '27AABCT3518Q1ZT',
          addressLine1: 'Plot 12, Hinjewadi Phase 1',
          city: 'Pune',
          state: 'Maharashtra',
          postalCode: '411057',
          notes: 'Commercial 50 LPH RO unit installed',
        },
      ],
    };
  }

  /**
   * Helper to extract customer fields flexibly from any Excel/CSV column variation
   */
  public extractCustomerFields(raw: Record<string, any>): {
    fullName: string;
    rawPhone: string;
    phone: string;
    email: string;
    customerType: 'INDIVIDUAL' | 'COMMERCIAL';
    companyName: string;
    gstNumber: string;
    addressLine1: string;
    addressLine2: string;
    landmark: string;
    city: string;
    state: string;
    postalCode: string;
    notes: string;
  } {
    const keys = Object.keys(raw);
    const getVal = (pattern: RegExp): string => {
      const matchKey = keys.find((k) => {
        const normalized = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        return pattern.test(normalized);
      });
      if (matchKey && raw[matchKey] !== undefined && raw[matchKey] !== null) {
        return String(raw[matchKey]).trim();
      }
      return '';
    };

    // 1. Full Name
    let fullName = getVal(
      /^(fullname|name|customername|clientname|client|customer|partyname|contactname|accountname|user|username)$/i
    );

    // 2. Phone
    let rawPhone = getVal(
      /^(phone|mobile|phonenumber|mobilenumber|contact|contactnumber|contactno|mobileno|phoneno|cell|tel|telephone|primaryphone|whatsapp|whatsappnumber|altcontact|customerphone|customermobile)$/i
    );

    // If still empty, check positional heuristics only if not matched by another known column
    if (!fullName && keys.length > 0) {
      for (const k of keys) {
        const norm = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!/^(notes|remarks|comment|comments|description|date|createdat|updatedat|taxid|gst|gstin|amount|price|qty|quantity)$/i.test(norm)) {
          const val = String(raw[k] ?? '').trim();
          if (val && !/^\d{7,}$/.test(val)) {
            fullName = val;
            break;
          }
        }
      }
    }

    if (!rawPhone && keys.length > 1) {
      for (const k of keys) {
        const val = String(raw[k] ?? '').trim();
        if (/\d{7,}/.test(val)) {
          rawPhone = val;
          break;
        }
      }
    }

    const phone = this.normalizePhone(rawPhone);

    // 3. Email
    let email = getVal(/^(email|emailaddress|emailid|mail|primaryemail)$/i).toLowerCase();

    // 4. Customer Type
    const typeStr = getVal(/^(customertype|type|category|customercategory|clienttype)$/i);
    const customerType: 'INDIVIDUAL' | 'COMMERCIAL' = /comm|corp|firm|bus|comp/i.test(typeStr)
      ? 'COMMERCIAL'
      : 'INDIVIDUAL';

    // 5. Company Name
    const companyName = getVal(/^(companyname|company|firm|firmname|businessname|org|organization)$/i);

    // 6. GST Number
    const gstNumber = getVal(/^(gstnumber|gst|gstin|gstno|taxid|taxnumber)$/i).toUpperCase();

    // 7. Address Line 1
    let addressLine1 = getVal(
      /^(addressline1|addressline|address1|address|customeraddress|fulladdress|street|streetaddress|serviceaddress|location|sitelocation|siteaddress)$/i
    );
    if (!addressLine1) {
      addressLine1 = fullName || 'Main Service Location';
    }

    // 8. Address Line 2
    const addressLine2 = getVal(/^(addressline2|address2|area|locality|colony)$/i);

    // 9. Landmark
    const landmark = getVal(/^(landmark|near|landmarkname)$/i);

    // 10. City
    const city = getVal(/^(city|town|district|taluka)$/i);

    // 11. State
    const state = getVal(/^(state|province|region)$/i);

    // 12. Postal Code / Pincode
    let postalCode = getVal(/^(postalcode|pincode|pincodeno|pin|zip|zipcode)$/i);
    if (postalCode) {
      postalCode = postalCode.replace(/\D/g, '').slice(0, 6);
    }

    // 13. Notes
    const notes = getVal(/^(notes|remarks|comment|comments|description|info)$/i);

    return {
      fullName,
      rawPhone,
      phone,
      email,
      customerType,
      companyName,
      gstNumber,
      addressLine1,
      addressLine2,
      landmark,
      city,
      state,
      postalCode,
      notes,
    };
  }

  async preview(
    rows: Array<Record<string, any>>,
    _context?: ImporterContext
  ): Promise<ImportPreviewResult> {
    const errors: ImportRowError[] = [];
    const warnings: ImportRowWarning[] = [];
    const sampleValid: Array<Record<string, any>> = [];
    const sampleInvalid: Array<{ rowNumber: number; data: Record<string, any>; errors: ImportRowError[] }> = [];

    let validRows = 0;
    let invalidRows = 0;
    let duplicateRows = 0;

    // Fetch existing phone numbers and emails from database for duplicate verification
    const existingPhones = new Set<string>();
    const existingEmails = new Set<string>();

    try {
      const dbCusts = await db
        .select({ phone: customers.phone, email: customers.email })
        .from(customers);
      for (const c of dbCusts) {
        if (c.phone) existingPhones.add(this.normalizePhone(c.phone));
        if (c.email) existingEmails.add(c.email.trim().toLowerCase());
      }
    } catch {}

    const seenPhonesInFile = new Set<string>();
    const seenEmailsInFile = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const rowNumber = i + 1;
      const raw = rows[i];
      const rowErrors: ImportRowError[] = [];

      const fields = this.extractCustomerFields(raw);

      // Skip completely blank rows
      if (!fields.fullName && !fields.rawPhone && !fields.email) {
        continue;
      }

      // Validate required name
      if (!fields.fullName) {
        rowErrors.push({
          rowNumber,
          field: 'fullName',
          code: 'REQUIRED_FIELD',
          message: `Row ${rowNumber}: Full Name is required.`,
        });
      }

      // Validate required phone
      if (!fields.rawPhone) {
        rowErrors.push({
          rowNumber,
          field: 'phone',
          code: 'REQUIRED_FIELD',
          message: `Row ${rowNumber}: Phone number is required.`,
        });
      } else if (!fields.phone || fields.phone.length < 10) {
        rowErrors.push({
          rowNumber,
          field: 'phone',
          code: 'INVALID_FORMAT',
          message: `Row ${rowNumber}: Phone number '${fields.rawPhone}' is invalid. Must contain at least 10 digits.`,
          value: fields.rawPhone,
        });
      }

      // Validate email format if provided
      if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
        rowErrors.push({
          rowNumber,
          field: 'email',
          code: 'INVALID_FORMAT',
          message: `Row ${rowNumber}: Email '${fields.email}' is invalid format.`,
          value: fields.email,
        });
      }

      // Check duplicates for phone and email
      let isDuplicate = false;
      if (fields.phone && (existingPhones.has(fields.phone) || seenPhonesInFile.has(fields.phone))) {
        isDuplicate = true;
        duplicateRows++;
        rowErrors.push({
          rowNumber,
          field: 'phone',
          code: 'DUPLICATE',
          message: `Row ${rowNumber}: Customer with phone '${fields.phone}' already exists.`,
          value: fields.phone,
        });
      } else if (fields.email && (existingEmails.has(fields.email) || seenEmailsInFile.has(fields.email))) {
        isDuplicate = true;
        duplicateRows++;
        rowErrors.push({
          rowNumber,
          field: 'email',
          code: 'DUPLICATE',
          message: `Row ${rowNumber}: Customer with email '${fields.email}' already exists.`,
          value: fields.email,
        });
      }

      if (fields.phone) seenPhonesInFile.add(fields.phone);
      if (fields.email) seenEmailsInFile.add(fields.email);

      const normalized = {
        rowNumber,
        ...fields,
        name: fields.fullName,
      };

      if (rowErrors.length > 0) {
        invalidRows++;
        errors.push(...rowErrors);
        if (sampleInvalid.length < 5) {
          sampleInvalid.push({ rowNumber, data: normalized, errors: rowErrors });
        }
      } else {
        validRows++;
        if (sampleValid.length < 5) {
          sampleValid.push(normalized);
        }
      }
    }

    return {
      entityType: this.entityType,
      totalRows: rows.length,
      validRows,
      invalidRows,
      duplicateRows,
      missingReferenceRows: 0,
      errors,
      warnings,
      sampleValid,
      sampleInvalid,
      canProceed: validRows > 0,
    };
  }

  async execute(
    records: Array<Record<string, any>>,
    duplicatePolicy: ImportDuplicatePolicy = 'CREATE',
    context?: ImporterContext
  ): Promise<ImportExecuteResult> {
    const startTime = Date.now();
    const errors: ImportRowError[] = [];
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    // 1. Calculate base date prefix and track existing sequence numbers for today
    const now = new Date();
    const year2 = String(now.getFullYear()).slice(-2);
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${day}${month}${year2}`;

    const existingCustomerNumberSet = new Set<string>();
    let maxSeq = 0;

    try {
      const existing = await db
        .select({ customerNumber: customers.customerNumber })
        .from(customers)
        .where(ilike(customers.customerNumber, `CX-${dateStr}%`));

      for (const rec of existing) {
        if (rec.customerNumber) {
          existingCustomerNumberSet.add(rec.customerNumber);
          const suffix = rec.customerNumber.replace(`CX-${dateStr}`, '');
          const n = parseInt(suffix || '0', 10);
          if (!isNaN(n) && n > maxSeq) {
            maxSeq = n;
          }
        }
      }
    } catch {}

    // Also track numbers from memory store
    try {
      const { memoryCustomers } = await import('../../customers/customer.repository');
      for (const mc of memoryCustomers) {
        if (mc.customerNumber) {
          existingCustomerNumberSet.add(mc.customerNumber);
          if (mc.customerNumber.startsWith(`CX-${dateStr}`)) {
            const suffix = mc.customerNumber.replace(`CX-${dateStr}`, '');
            const n = parseInt(suffix || '0', 10);
            if (!isNaN(n) && n > maxSeq) {
              maxSeq = n;
            }
          }
        }
      }
    } catch {}

    let seqCounter = maxSeq;

    // 2. Fetch existing customers map for duplicate policies (SKIP / UPDATE)
    const existingCustomerPhoneMap = new Map<string, any>();
    if (duplicatePolicy !== 'CREATE') {
      try {
        const allCust = await db
          .select({
            id: customers.id,
            phone: customers.phone,
            fullName: customers.fullName,
            customerNumber: customers.customerNumber,
          })
          .from(customers);
        for (const c of allCust) {
          if (c.phone) {
            existingCustomerPhoneMap.set(this.normalizePhone(c.phone), c);
          }
        }
      } catch {}

      try {
        const { memoryCustomers } = await import('../../customers/customer.repository');
        for (const c of memoryCustomers) {
          if (c.phone) {
            existingCustomerPhoneMap.set(this.normalizePhone(c.phone), c);
          }
        }
      } catch {}
    }

    const processedPhonesInBatch = new Set<string>();

    // 3. Process records in high-performance transactions (batches of 250)
    const CHUNK_SIZE = 250;

    for (let chunkIdx = 0; chunkIdx < records.length; chunkIdx += CHUNK_SIZE) {
      const chunk = records.slice(chunkIdx, chunkIdx + CHUNK_SIZE);
      const customersToInsert: any[] = [];
      const addressesToInsert: any[] = [];

      for (let i = 0; i < chunk.length; i++) {
        const raw = chunk[i];
        const rowNumber = raw.rowNumber || chunkIdx + i + 1;

        const fields = this.extractCustomerFields(raw);

        // Validation
        if (!fields.fullName || !fields.phone || fields.phone.length < 10) {
          failed++;
          errors.push({
            rowNumber,
            field: !fields.fullName ? 'fullName' : 'phone',
            code: 'REQUIRED_FIELD',
            message: `Row ${rowNumber}: Valid name and 10-digit phone number are required.`,
          });
          continue;
        }

        if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
          failed++;
          errors.push({
            rowNumber,
            field: 'email',
            code: 'INVALID_FORMAT',
            message: `Row ${rowNumber}: Invalid email format '${fields.email}'.`,
          });
          continue;
        }

        // Duplicate Policy Handling
        const existingCust = existingCustomerPhoneMap.get(fields.phone);
        const isDuplicateInBatch = processedPhonesInBatch.has(fields.phone);

        if (existingCust || isDuplicateInBatch) {
          if (duplicatePolicy === 'SKIP') {
            skipped++;
            continue;
          } else if (duplicatePolicy === 'UPDATE' && existingCust) {
            // Update existing record without wiping non-empty fields with empty values
            const updateData: Record<string, any> = { updatedAt: new Date() };
            if (fields.fullName) updateData.fullName = fields.fullName;
            if (fields.email) updateData.email = fields.email;
            if (fields.companyName) updateData.companyName = fields.companyName;
            if (fields.gstNumber) updateData.gstNumber = fields.gstNumber;
            if (fields.notes) updateData.notes = fields.notes;

            try {
              await db.update(customers).set(updateData).where(eq(customers.id, existingCust.id));
              updated++;
            } catch {
              // Update fallback
              Object.assign(existingCust, updateData);
              updated++;
            }
            continue;
          }
        }

        processedPhonesInBatch.add(fields.phone);

        // Generate guaranteed collision-free customerNumber
        let customerNumber = '';
        do {
          seqCounter++;
          customerNumber = `CX-${dateStr}${String(seqCounter).padStart(4, '0')}`;
        } while (existingCustomerNumberSet.has(customerNumber));
        existingCustomerNumberSet.add(customerNumber);

        const customerId = randomUUID();

        customersToInsert.push({
          id: customerId,
          customerNumber,
          fullName: fields.fullName,
          phone: fields.phone,
          email: fields.email || null,
          customerType: fields.customerType || 'INDIVIDUAL',
          companyName: fields.companyName || null,
          gstNumber: fields.gstNumber || null,
          status: 'ACTIVE',
          notes: fields.notes || null,
          createdBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        addressesToInsert.push({
          id: randomUUID(),
          customerId,
          addressType: 'SERVICE',
          addressLine1: fields.addressLine1 || fields.fullName || 'Main Service Location',
          addressLine2: fields.addressLine2 || null,
          landmark: fields.landmark || null,
          city: fields.city || '',
          state: fields.state || '',
          postalCode: fields.postalCode || '',
          isDefault: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // Execute transactional batch with row-by-row fallback
      if (customersToInsert.length > 0) {
        let insertedInThisBatch = false;
        try {
          await db.transaction(async (tx: any) => {
            await tx.insert(customers).values(customersToInsert);
            await tx.insert(customerAddresses).values(addressesToInsert);
          });
          imported += customersToInsert.length;
          insertedInThisBatch = true;
        } catch (txErr: any) {
          console.warn(`[CustomerImporter] Batch insert fallback to single rows:`, txErr?.message);
          for (let j = 0; j < customersToInsert.length; j++) {
            const cust = customersToInsert[j];
            const addr = addressesToInsert[j];
            try {
              await db.insert(customers).values(cust);
              if (addr) {
                await db.insert(customerAddresses).values(addr);
              }
              imported++;
            } catch (rowErr: any) {
              failed++;
              errors.push({
                rowNumber: chunkIdx + j + 1,
                field: 'database',
                code: 'CONFLICT',
                message: rowErr?.message || 'Database insert error on customer record',
              });
            }
          }
        }

        // Mirror inserted records to memory store for offline and caching resilience
        try {
          const { memoryCustomers } = await import('../../customers/customer.repository');
          for (let j = 0; j < customersToInsert.length; j++) {
            const cust = customersToInsert[j];
            const addr = addressesToInsert[j];
            memoryCustomers.unshift({
              ...cust,
              addresses: addr ? [addr] : [],
            });
            existingCustomerPhoneMap.set(cust.phone, cust);
          }
        } catch {}
      }
    }


    // 4. Record structured audit log
    let auditLogId: string | undefined;
    try {
      const [audit] = await db
        .insert(auditLogs)
        .values({
          actorId: context?.userId as any,
          actorUsername: String(context?.userRole || 'SYSTEM'),
          action: 'CREATE',
          entityType: 'CUSTOMER_IMPORT',
          entityId: `IMPORT-${Date.now()}`,
          afterState: {
            totalProcessed: records.length,
            imported,
            updated,
            skipped,
            failed,
            policy: duplicatePolicy,
          },
          changeReason: `Imported ${imported} customer records via Excel/CSV Importer (${duplicatePolicy} policy)`,
          ipAddress: context?.ipAddress,
        })
        .returning();
      auditLogId = audit?.id;
    } catch {}

    return {
      entityType: this.entityType,
      totalProcessed: records.length,
      imported,
      updated,
      skipped,
      failed,
      errors,
      executionTimeMs: Date.now() - startTime,
      auditLogId,
    };
  }
}
