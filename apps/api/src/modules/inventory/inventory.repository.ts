import { eq, and, desc, sql, count } from 'drizzle-orm';
import { db } from '../../database/client';
import { inventoryBalances, inventoryTransactions, products } from '../../database/schema/index';
import { randomUUID } from 'crypto';
import type { InventoryAdjustmentInput, InventoryQueryFilter } from '@crm/validation';

// Resilient memory state for offline desktop and local development
const memoryStockBalances: Map<string, { currentStock: number; minimumAlertStock: number; updatedAt: Date }> = new Map([
  ['p1111111-1111-1111-1111-111111111111', { currentStock: 25, minimumAlertStock: 5, updatedAt: new Date() }],
  ['p2222222-2222-2222-2222-222222222222', { currentStock: 10, minimumAlertStock: 3, updatedAt: new Date() }],
  ['p3333333-3333-3333-3333-333333333333', { currentStock: 50, minimumAlertStock: 10, updatedAt: new Date() }],
]);

const memoryTransactions: any[] = [];

export class InventoryRepository {
  /**
   * Get current stock balance for a product
   */
  async getStockBalance(productId: string, database = db) {
    try {
      const [record] = await database
        .select()
        .from(inventoryBalances)
        .where(eq(inventoryBalances.productId, productId));
      return record ?? null;
    } catch {
      const mem = memoryStockBalances.get(productId);
      if (mem) {
        return {
          id: randomUUID(),
          productId,
          currentStock: mem.currentStock,
          minimumAlertStock: mem.minimumAlertStock,
          updatedAt: mem.updatedAt,
        };
      }
      return {
        id: randomUUID(),
        productId,
        currentStock: 0,
        minimumAlertStock: 5,
        updatedAt: new Date(),
      };
    }
  }

  /**
   * Find paginated inventory stock levels across all products
   */
  async findStockLevels(filters: InventoryQueryFilter, database = db) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const offset = (page - 1) * limit;

    try {
      const [totalRes] = await database.select({ count: count() }).from(products);
      const total = totalRes?.count ?? 0;

      const rows = await database
        .select({
          productId: products.id,
          productName: products.name,
          sku: products.sku,
          brand: products.brand,
          productType: products.productType,
          unitPrice: products.unitPrice,
          currentStock: sql<number>`COALESCE(${inventoryBalances.currentStock}, 0)::int`,
          minimumAlertStock: sql<number>`COALESCE(${inventoryBalances.minimumAlertStock}, 5)::int`,
          updatedAt: inventoryBalances.updatedAt,
        })
        .from(products)
        .leftJoin(inventoryBalances, eq(products.id, inventoryBalances.productId))
        .limit(limit)
        .offset(offset)
        .orderBy(desc(products.createdAt));

      return {
        data: rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch {
      const data: any[] = [];
      return {
        data,
        pagination: {
          page: 1,
          limit,
          total: 0,
          totalPages: 0,
        },
      };
    }
  }

  /**
   * Adjust product stock atomically and log immutable transaction
   */
  async recordAdjustment(
    input: InventoryAdjustmentInput,
    actorId?: string | null,
    actorName?: string | null,
    database = db
  ) {
    const isAdding = ['PURCHASE', 'RETURN', 'ADJUSTMENT_IN'].includes(input.type);
    const delta = isAdding ? input.quantity : -input.quantity;

    try {
      // 1. Fetch current balance
      const [currentRecord] = await database
        .select()
        .from(inventoryBalances)
        .where(eq(inventoryBalances.productId, input.productId));

      const previousStock = currentRecord?.currentStock ?? 0;
      const resultingStock = previousStock + delta;

      // 2. Upsert balance (allows unrestricted sales and manual recording)
      if (currentRecord) {
        await database
          .update(inventoryBalances)
          .set({ currentStock: resultingStock, updatedAt: new Date() })
          .where(eq(inventoryBalances.productId, input.productId));
      } else {
        await database.insert(inventoryBalances).values({
          productId: input.productId,
          currentStock: resultingStock,
          minimumAlertStock: 5,
        });
      }

      // 3. Log transaction
      const [transaction] = await database
        .insert(inventoryTransactions)
        .values({
          productId: input.productId,
          type: input.type,
          quantity: input.quantity,
          previousStock,
          resultingStock,
          reason: input.reason,
          referenceType: input.referenceType ?? 'MANUAL',
          referenceId: input.referenceId ?? null,
          actorId: actorId ?? null,
          actorName: actorName ?? 'System',
        })
        .returning();

      return transaction;
    } catch (err: any) {
      console.error('[Inventory.recordAdjustment ERROR]', err);
      throw err;
    }
  }

  /**
   * Find paginated inventory transactions
   */
  async findTransactions(filters: InventoryQueryFilter, database = db) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const offset = (page - 1) * limit;

    try {
      const conditions: any[] = [];
      if (filters.productId) {
        conditions.push(eq(inventoryTransactions.productId, filters.productId));
      }
      if (filters.type) {
        conditions.push(eq(inventoryTransactions.type, filters.type as any));
      }
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [totalRes] = await database.select({ count: count() }).from(inventoryTransactions).where(whereClause);
      const total = totalRes?.count ?? 0;

      const rows = await database
        .select()
        .from(inventoryTransactions)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(inventoryTransactions.createdAt));

      return {
        data: rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch {
      let filtered = [...memoryTransactions];
      if (filters.productId) {
        filtered = filtered.filter((t) => t.productId === filters.productId);
      }
      if (filters.type) {
        filtered = filtered.filter((t) => t.type === filters.type);
      }
      return {
        data: filtered.slice(offset, offset + limit),
        pagination: {
          page,
          limit,
          total: filtered.length,
          totalPages: Math.ceil(filtered.length / limit) || 1,
        },
      };
    }
  }
}

export const inventoryRepository = new InventoryRepository();
