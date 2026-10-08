/**
 * Product & Spare Part Importer
 * Handles catalog validation, price parsing, duplicate SKU detection, and atomic catalog importing.
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
import { products } from '../../../database/schema/products';
import { inventoryBalances, inventoryTransactions } from '../../../database/schema/inventory';
import { auditLogs } from '../../../database/schema/audit';
import { eq, inArray } from 'drizzle-orm';

export class ProductImporter extends BaseImporter {
  readonly entityType: ImportEntityType = 'product';
  readonly requiredColumns = ['sku', 'name', 'unitPrice'];
  readonly optionalColumns = [
    'productType',
    'brand',
    'model',
    'description',
    'taxRatePercent',
    'defaultWarrantyMonths',
    'defaultServiceIntervalMonths',
    'initialStock',
  ];

  getTemplate() {
    return {
      headers: [
        'sku',
        'name',
        'productType',
        'brand',
        'model',
        'description',
        'unitPrice',
        'taxRatePercent',
        'defaultWarrantyMonths',
        'defaultServiceIntervalMonths',
        'initialStock',
      ],
      exampleRows: [
        {
          sku: 'RO-KENT-GP',
          name: 'Kent Grand Plus RO',
          productType: 'RO_MACHINE',
          brand: 'Kent',
          model: 'Grand Plus 2026',
          description: '8L Storage, RO+UV+UF+TDS Controller',
          unitPrice: '18500',
          taxRatePercent: '18',
          defaultWarrantyMonths: '12',
          defaultServiceIntervalMonths: '6',
          initialStock: '10',
        },
        {
          sku: 'SP-MEM-75GPD',
          name: 'RO Membrane 75 GPD',
          productType: 'SPARE_PART',
          brand: 'Dow Filmtec',
          model: 'BW60-1812-75',
          description: 'High rejection RO membrane element',
          unitPrice: '1800',
          taxRatePercent: '18',
          defaultWarrantyMonths: '6',
          defaultServiceIntervalMonths: '12',
          initialStock: '50',
        },
      ],
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

    const seenSkus = new Set<string>();
    const skusToCheck: string[] = [];

    const validatedRows: Array<{
      rowNumber: number;
      normalized: Record<string, any>;
      rowErrors: ImportRowError[];
    }> = [];

    for (let i = 0; i < rows.length; i++) {
      const rowNumber = i + 1;
      const raw = rows[i];
      const rowErrors: ImportRowError[] = [];

      const sku = this.normalizeString(raw.sku || raw.SKU || raw['Product Code']).toUpperCase();
      const name = this.normalizeString(raw.name || raw['Product Name'] || raw.ProductName);
      const rawType = this.normalizeString(raw.productType || raw.type || raw['Product Type']).toUpperCase();
      const productType = rawType === 'SPARE_PART' ? 'SPARE_PART' : 'RO_MACHINE';
      const brand = this.normalizeString(raw.brand || raw['Brand']) || 'Generic';
      const model = this.normalizeString(raw.model || raw['Model']);
      const description = this.normalizeString(raw.description || raw['Description']);
      const unitPrice = this.parseSafeNumber(raw.unitPrice || raw.price || raw['Unit Price'] || raw.SellingPrice);
      const taxRatePercent = this.parseSafeNumber(raw.taxRatePercent || raw.tax || raw['Tax Rate']) ?? 18;
      const defaultWarrantyMonths = Math.max(0, parseInt(String(raw.defaultWarrantyMonths || raw['Warranty Months'] || 12), 10) || 12);
      const defaultServiceIntervalMonths = Math.max(0, parseInt(String(raw.defaultServiceIntervalMonths || raw['Service Interval'] || 6), 10) || 6);
      const initialStock = Math.max(0, parseInt(String(raw.initialStock || raw['Initial Stock'] || 0), 10) || 0);

      // Required: SKU
      if (!sku) {
        rowErrors.push({
          rowNumber,
          field: 'sku',
          code: 'REQUIRED_FIELD',
          message: 'Product SKU is required.',
        });
      }

      // Required: Name
      if (!name) {
        rowErrors.push({
          rowNumber,
          field: 'name',
          code: 'REQUIRED_FIELD',
          message: 'Product name is required.',
        });
      }

      // Required: Unit Price
      if (unitPrice === null) {
        rowErrors.push({
          rowNumber,
          field: 'unitPrice',
          code: 'REQUIRED_FIELD',
          message: 'Unit price is required and must be a valid number.',
        });
      } else if (unitPrice < 0) {
        rowErrors.push({
          rowNumber,
          field: 'unitPrice',
          code: 'INVALID_AMOUNT',
          message: 'Unit price cannot be negative.',
          value: unitPrice,
        });
      }

      // Intra-file duplicate check
      if (sku) {
        if (seenSkus.has(sku)) {
          rowErrors.push({
            rowNumber,
            field: 'sku',
            code: 'DUPLICATE',
            message: `Duplicate SKU '${sku}' found within uploaded file.`,
            value: sku,
          });
        } else {
          seenSkus.add(sku);
          skusToCheck.push(sku);
        }
      }

      const normalized = {
        rowNumber,
        sku,
        name,
        productType,
        brand,
        model: model || undefined,
        description: description || undefined,
        unitPrice: unitPrice ?? 0,
        taxRatePercent,
        defaultWarrantyMonths,
        defaultServiceIntervalMonths,
        initialStock,
      };

      validatedRows.push({ rowNumber, normalized, rowErrors });
    }

    // Check DB duplicates
    const existingDbSkus = new Set<string>();
    if (skusToCheck.length > 0) {
      try {
        const found = await db
          .select({ sku: products.sku })
          .from(products)
          .where(inArray(products.sku, skusToCheck));
        for (const f of found) {
          if (f.sku) existingDbSkus.add(f.sku);
        }
      } catch {
        // Fallback in mock/test
      }
    }

    let duplicateRows = 0;
    let validRows = 0;
    let invalidRows = 0;

    for (const item of validatedRows) {
      const { rowNumber, normalized, rowErrors } = item;

      if (normalized.sku && existingDbSkus.has(normalized.sku)) {
        rowErrors.push({
          rowNumber,
          field: 'sku',
          code: 'DUPLICATE',
          message: `Product with SKU '${normalized.sku}' already exists in database.`,
          value: normalized.sku,
        });
      }

      if (rowErrors.length > 0) {
        invalidRows++;
        errors.push(...rowErrors);
        if (rowErrors.some((e) => e.code === 'DUPLICATE')) {
          duplicateRows++;
        }
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

    await db.transaction(async (tx) => {
      for (let i = 0; i < records.length; i++) {
        const raw = records[i];
        const rowNumber = raw.rowNumber || i + 1;
        const sku = this.normalizeString(raw.sku).toUpperCase();
        const name = this.normalizeString(raw.name);
        const unitPrice = this.parseSafeNumber(raw.unitPrice);

        if (!sku || !name || unitPrice === null) {
          failed++;
          errors.push({
            rowNumber,
            field: !sku ? 'sku' : !name ? 'name' : 'unitPrice',
            code: 'REQUIRED_FIELD',
            message: 'Invalid product record during transactional import.',
          });
          continue;
        }

        const existing = await tx.query.products.findFirst({
          where: eq(products.sku, sku),
        });

        if (existing) {
          if (duplicatePolicy === 'SKIP') {
            skipped++;
            continue;
          } else if (duplicatePolicy === 'UPDATE') {
            await tx
              .update(products)
              .set({
                name,
                productType: raw.productType || existing.productType,
                brand: raw.brand || existing.brand,
                model: raw.model || existing.model,
                description: raw.description || existing.description,
                unitPrice: String(unitPrice),
                taxRatePercent: String(raw.taxRatePercent ?? existing.taxRatePercent),
                defaultWarrantyMonths: raw.defaultWarrantyMonths ?? existing.defaultWarrantyMonths,
                defaultServiceIntervalMonths: raw.defaultServiceIntervalMonths ?? existing.defaultServiceIntervalMonths,
                updatedAt: new Date(),
              })
              .where(eq(products.id, existing.id));

            updated++;
            continue;
          } else {
            failed++;
            errors.push({
              rowNumber,
              field: 'sku',
              code: 'DUPLICATE',
              message: `Product SKU '${sku}' already exists.`,
            });
            continue;
          }
        }

        // Insert new product
        const [newProduct] = await tx
          .insert(products)
          .values({
            sku,
            name,
            productType: raw.productType || 'RO_MACHINE',
            brand: raw.brand || 'Generic',
            model: raw.model || null,
            description: raw.description || null,
            unitPrice: String(unitPrice),
            taxRatePercent: String(raw.taxRatePercent ?? '18.00'),
            defaultWarrantyMonths: raw.defaultWarrantyMonths ?? 12,
            defaultServiceIntervalMonths: raw.defaultServiceIntervalMonths ?? 6,
            isActive: true,
          })
          .returning();

        // Create opening inventory balance & transaction if initial stock > 0
        const initialStock = parseInt(String(raw.initialStock || 0), 10);
        if (newProduct && initialStock > 0) {
          await tx.insert(inventoryBalances).values({
            productId: newProduct.id,
            currentStock: initialStock,
            minimumAlertStock: 5,
          });

          await tx.insert(inventoryTransactions).values({
            productId: newProduct.id,
            type: 'PURCHASE',
            quantity: initialStock,
            previousStock: 0,
            resultingStock: initialStock,
            reason: 'Opening Balance Data Import',
            referenceType: 'OPENING_BALANCE',
            actorName: context?.userRole || 'SYSTEM',
          });
        }

        imported++;
      }
    });

    let auditLogId: string | undefined;
    try {
      const [audit] = await db
        .insert(auditLogs)
        .values({
          actorId: context?.userId as any,
          actorUsername: context?.userRole || 'SYSTEM',
          action: 'CREATE',
          entityType: 'PRODUCT_IMPORT',
          entityId: `IMPORT-${Date.now()}`,
          afterState: {
            totalProcessed: records.length,
            imported,
            updated,
            skipped,
            failed,
            duplicatePolicy,
          },
          changeReason: `Imported ${imported} products via Data Import Engine`,
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
