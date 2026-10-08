import { eq, and, or, ilike, sql, desc } from 'drizzle-orm';
import { db } from '../../database/client';
import { products } from '../../database/schema/index';
import { randomUUID } from 'crypto';
import type { ProductQueryFilter, CreateProductInput, UpdateProductInput } from '@crm/validation';

// Resilient memory state for offline desktop and local development
const memoryProducts: any[] = [];

export class ProductRepository {
  async findPaginated(filters: ProductQueryFilter, database = db) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const offset = (page - 1) * limit;

    try {
      const conditions: any[] = [];

      if (filters.search?.trim()) {
        const term = `%${filters.search.trim()}%`;
        conditions.push(
          or(
            ilike(products.name, term),
            ilike(products.sku, term),
            ilike(products.brand, term),
            ilike(products.model, term)
          )
        );
      }

      if (filters.productType) {
        conditions.push(eq(products.productType, filters.productType));
      }

      if (filters.brand) {
        conditions.push(ilike(products.brand, `%${filters.brand.trim()}%`));
      }

      if (filters.isActive !== undefined) {
        conditions.push(eq(products.isActive, filters.isActive));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [totalRes] = await database
        .select({ count: sql<number>`count(*)::int` })
        .from(products)
        .where(whereClause);

      const total = totalRes?.count ?? 0;

      const data = await database
        .select()
        .from(products)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(products.createdAt));

      return {
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch {
      let filtered = [...memoryProducts];
      if (filters.search?.trim()) {
        const q = filters.search.trim().toLowerCase();
        filtered = filtered.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q) ||
            p.brand.toLowerCase().includes(q)
        );
      }
      if (filters.productType) {
        filtered = filtered.filter((p) => p.productType === filters.productType);
      }
      if (filters.brand) {
        filtered = filtered.filter((p) => p.brand.toLowerCase().includes(filters.brand!.toLowerCase()));
      }
      if (filters.isActive !== undefined) {
        filtered = filtered.filter((p) => p.isActive === filters.isActive);
      }

      const total = filtered.length;
      return {
        data: filtered.slice(offset, offset + limit),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1,
        },
      };
    }
  }

  async findById(id: string, database = db) {
    try {
      const [item] = await database.select().from(products).where(eq(products.id, id));
      return item ?? null;
    } catch {
      return memoryProducts.find((p) => p.id === id) ?? null;
    }
  }

  async findBySku(sku: string, database = db) {
    const cleanSku = sku.trim();
    try {
      const [item] = await database.select().from(products).where(eq(products.sku, cleanSku));
      return item ?? null;
    } catch {
      return memoryProducts.find((p) => p.sku.toLowerCase() === cleanSku.toLowerCase()) ?? null;
    }
  }

  async create(data: CreateProductInput, database = db) {
    try {
      const [item] = await database
        .insert(products)
        .values({
          sku: data.sku.trim(),
          name: data.name.trim(),
          productType: data.productType,
          brand: data.brand.trim(),
          model: data.model ? data.model.trim() : null,
          description: data.description ? data.description.trim() : null,
          unitPrice: (data.sellingPrice || data.unitPrice).toFixed(2),
          taxRatePercent: data.taxRatePercent.toFixed(2),
          defaultWarrantyMonths: data.warrantyMonths || data.defaultWarrantyMonths,
          defaultServiceIntervalMonths: data.serviceIntervalMonths || data.defaultServiceIntervalMonths,
          isActive: data.isActive ?? true,
        })
        .returning();
      return item;
    } catch {
      const item = {
        id: randomUUID(),
        sku: data.sku.trim(),
        name: data.name.trim(),
        productType: data.productType,
        brand: data.brand.trim(),
        model: data.model ? data.model.trim() : null,
        description: data.description ? data.description.trim() : null,
        unitPrice: (data.sellingPrice || data.unitPrice).toFixed(2),
        taxRatePercent: data.taxRatePercent.toFixed(2),
        defaultWarrantyMonths: data.warrantyMonths || data.defaultWarrantyMonths,
        defaultServiceIntervalMonths: data.serviceIntervalMonths || data.defaultServiceIntervalMonths,
        isActive: data.isActive ?? true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      memoryProducts.unshift(item);
      return item;
    }
  }

  async update(id: string, data: UpdateProductInput, database = db) {
    try {
      const updateValues: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (data.name !== undefined) updateValues.name = data.name.trim();
      if (data.sku !== undefined) updateValues.sku = data.sku.trim();
      if (data.productType !== undefined) updateValues.productType = data.productType;
      if (data.brand !== undefined) updateValues.brand = data.brand.trim();
      if (data.model !== undefined) updateValues.model = data.model ? data.model.trim() : null;
      if (data.description !== undefined) updateValues.description = data.description ? data.description.trim() : null;
      if (data.unitPrice !== undefined || data.sellingPrice !== undefined) {
        updateValues.unitPrice = (data.sellingPrice || data.unitPrice)!.toFixed(2);
      }
      if (data.taxRatePercent !== undefined) updateValues.taxRatePercent = data.taxRatePercent.toFixed(2);
      if (data.defaultWarrantyMonths !== undefined || data.warrantyMonths !== undefined) {
        updateValues.defaultWarrantyMonths = data.warrantyMonths || data.defaultWarrantyMonths;
      }
      if (data.defaultServiceIntervalMonths !== undefined || data.serviceIntervalMonths !== undefined) {
        updateValues.defaultServiceIntervalMonths = data.serviceIntervalMonths || data.defaultServiceIntervalMonths;
      }
      if (data.isActive !== undefined) updateValues.isActive = data.isActive;

      const [updated] = await database
        .update(products)
        .set(updateValues)
        .where(eq(products.id, id))
        .returning();

      return updated ?? null;
    } catch {
      const target = memoryProducts.find((p) => p.id === id);
      if (target) {
        if (data.name !== undefined) target.name = data.name.trim();
        if (data.sku !== undefined) target.sku = data.sku.trim();
        if (data.productType !== undefined) target.productType = data.productType;
        if (data.brand !== undefined) target.brand = data.brand.trim();
        if (data.model !== undefined) target.model = data.model ? data.model.trim() : null;
        if (data.description !== undefined) target.description = data.description ? data.description.trim() : null;
        if (data.unitPrice !== undefined || data.sellingPrice !== undefined) {
          target.unitPrice = (data.sellingPrice || data.unitPrice)!.toFixed(2);
        }
        if (data.taxRatePercent !== undefined) target.taxRatePercent = data.taxRatePercent.toFixed(2);
        if (data.isActive !== undefined) target.isActive = data.isActive;
        target.updatedAt = new Date();
      }
      return target ?? null;
    }
  }

  async archive(id: string, database = db) {
    try {
      const [updated] = await database
        .update(products)
        .set({ isActive: false, archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(products.id, id))
        .returning();
      return updated ?? null;
    } catch {
      const target = memoryProducts.find((p) => p.id === id);
      if (target) {
        target.isActive = false;
        target.archivedAt = new Date();
        target.updatedAt = new Date();
      }
      return target ?? null;
    }
  }
}

export const productRepository = new ProductRepository();
