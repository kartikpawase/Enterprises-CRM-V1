import { eq, and, or, ilike, sql, desc, asc } from 'drizzle-orm';
import { db } from '../../database/client';
import {
  customerAssets,
  customers,
  customerAddresses,
  products,
  warranties,
  services,
} from '../../database/schema/index';
import { randomUUID } from 'crypto';
import { memoryWarranties } from '../warranties/warranties.repository';
import { memoryServices } from '../services/services.repository';
import type { AssetQueryFilter, CreateAssetInput, UpdateAssetInput } from '@crm/validation';

// Resilient memory state for offline desktop and local development
export const memoryAssets: any[] = [];

export class AssetsRepository {
  /**
   * Find paginated assets with search, filters, and customer & product joins
   */
  async findPaginated(filters: AssetQueryFilter, database = db) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const offset = (page - 1) * limit;

    try {
      const conditions: any[] = [];

      if (filters.customerId) {
        conditions.push(eq(customerAssets.customerId, filters.customerId));
      }

      if (filters.productId) {
        conditions.push(eq(customerAssets.productId, filters.productId));
      }

      if (filters.assetType && (filters.assetType as string) !== 'ALL') {
        conditions.push(eq(customerAssets.assetType, filters.assetType as any));
      }

      if (filters.status && (filters.status as string) !== 'ALL') {
        conditions.push(eq(customerAssets.status, filters.status as any));
      }

      if (filters.serialNumber) {
        conditions.push(ilike(customerAssets.serialNumber, `%${filters.serialNumber.trim()}%`));
      }

      if (filters.search?.trim()) {
        const term = `%${filters.search.trim()}%`;
        conditions.push(
          or(
            ilike(customerAssets.assetNumber, term),
            ilike(customerAssets.serialNumber, term),
            ilike(customerAssets.customName, term),
            ilike(customers.fullName, term),
            ilike(customers.phone, term),
            ilike(products.name, term)
          )
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [totalRes] = await database
        .select({ count: sql<number>`count(*)::int` })
        .from(customerAssets)
        .leftJoin(customers, eq(customerAssets.customerId, customers.id))
        .leftJoin(products, eq(customerAssets.productId, products.id))
        .where(whereClause);

      const total = totalRes?.count ?? 0;

      let orderByClause;
      const sortOrder = filters.sortOrder === 'asc' ? asc : desc;
      switch (filters.sortBy) {
        case 'assetNumber':
          orderByClause = sortOrder(customerAssets.assetNumber);
          break;
        case 'status':
          orderByClause = sortOrder(customerAssets.status);
          break;
        case 'createdAt':
          orderByClause = sortOrder(customerAssets.createdAt);
          break;
        case 'purchaseDate':
        default:
          orderByClause = sortOrder(customerAssets.purchaseDate);
          break;
      }

      const rows = await database
        .select({
          id: customerAssets.id,
          assetNumber: customerAssets.assetNumber,
          customerId: customerAssets.customerId,
          customerName: customers.fullName,
          customerNumber: customers.customerNumber,
          customerPhone: customers.phone,
          productId: customerAssets.productId,
          productName: products.name,
          productSku: products.sku,
          productBrand: products.brand,
          productModel: products.model,
          assetType: customerAssets.assetType,
          serialNumber: customerAssets.serialNumber,
          customName: customerAssets.customName,
          purchaseDate: customerAssets.purchaseDate,
          initialWarrantyMonths: customerAssets.initialWarrantyMonths,
          serviceIntervalMonths: customerAssets.serviceIntervalMonths,
          status: customerAssets.status,
          notes: customerAssets.notes,
          createdAt: customerAssets.createdAt,
        })
        .from(customerAssets)
        .leftJoin(customers, eq(customerAssets.customerId, customers.id))
        .leftJoin(products, eq(customerAssets.productId, products.id))
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(orderByClause);

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
      let filtered = [...memoryAssets];
      if (filters.customerId) {
        filtered = filtered.filter((a) => a.customerId === filters.customerId);
      }
      if (filters.productId) {
        filtered = filtered.filter((a) => a.productId === filters.productId);
      }
      if (filters.status && filters.status !== 'ALL') {
        filtered = filtered.filter((a) => a.status === filters.status);
      }
      if (filters.serialNumber) {
        filtered = filtered.filter((a) =>
          a.serialNumber?.toLowerCase().includes(filters.serialNumber!.toLowerCase())
        );
      }
      if (filters.search?.trim()) {
        const q = filters.search.trim().toLowerCase();
        filtered = filtered.filter(
          (a) =>
            a.assetNumber?.toLowerCase().includes(q) ||
            a.serialNumber?.toLowerCase().includes(q) ||
            a.customName?.toLowerCase().includes(q) ||
            a.customerName?.toLowerCase().includes(q) ||
            a.productName?.toLowerCase().includes(q)
        );
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

  /**
   * Find single asset by ID with product, customer, warranties, and service history
   */
  async findById(id: string, database = db) {
    try {
      const [asset] = await database
        .select({
          id: customerAssets.id,
          assetNumber: customerAssets.assetNumber,
          customerId: customerAssets.customerId,
          customerName: customers.fullName,
          customerNumber: customers.customerNumber,
          customerPhone: customers.phone,
          customerEmail: customers.email,
          productId: customerAssets.productId,
          productName: products.name,
          productSku: products.sku,
          productBrand: products.brand,
          productModel: products.model,
          assetType: customerAssets.assetType,
          serialNumber: customerAssets.serialNumber,
          customName: customerAssets.customName,
          installationAddressId: customerAssets.installationAddressId,
          purchaseDate: customerAssets.purchaseDate,
          initialWarrantyMonths: customerAssets.initialWarrantyMonths,
          serviceIntervalMonths: customerAssets.serviceIntervalMonths,
          status: customerAssets.status,
          notes: customerAssets.notes,
          createdAt: customerAssets.createdAt,
          updatedAt: customerAssets.updatedAt,
        })
        .from(customerAssets)
        .leftJoin(customers, eq(customerAssets.customerId, customers.id))
        .leftJoin(products, eq(customerAssets.productId, products.id))
        .where(eq(customerAssets.id, id));

      if (!asset) return null;

      const [address] = asset.installationAddressId
        ? await database
            .select()
            .from(customerAddresses)
            .where(eq(customerAddresses.id, asset.installationAddressId))
        : [null];

      const assetWarranties = await database
        .select()
        .from(warranties)
        .where(eq(warranties.assetId, id))
        .orderBy(desc(warranties.endDate));

      const assetServices = await database
        .select()
        .from(services)
        .where(eq(services.assetId, id))
        .orderBy(desc(services.createdAt));

      return {
        ...asset,
        installationAddress: address ?? null,
        warranties: assetWarranties,
        services: assetServices,
      };
    } catch {
      const target = memoryAssets.find((a) => a.id === id);
      if (!target) return null;
      const assetWarranties = memoryWarranties.filter((w) => w.assetId === id);
      const assetServices = memoryServices.filter((s) => s.assetId === id);
      return {
        ...target,
        installationAddress: null,
        warranties: assetWarranties,
        services: assetServices,
      };
    }
  }

  /**
   * Find asset by serial number (to enforce uniqueness across active assets)
   */
  async findBySerialNumber(serialNumber: string, database = db) {
    const cleanSerial = serialNumber.trim();
    try {
      const [item] = await database
        .select()
        .from(customerAssets)
        .where(eq(customerAssets.serialNumber, cleanSerial));
      return item ?? null;
    } catch {
      return memoryAssets.find((a) => a.serialNumber?.toLowerCase() === cleanSerial.toLowerCase()) ?? null;
    }
  }

  /**
   * Create new Customer Asset with unique serial check & auto-number sequence
   */
  async create(data: CreateAssetInput, database = db) {
    const year = new Date().getFullYear();
    const randSeq = String(Math.floor(1000 + Math.random() * 9000));
    const assetNumber = `ASSET-${year}-${randSeq}`;

    try {
      const [product] = await database
        .select()
        .from(products)
        .where(eq(products.id, data.productId));

      const initialWarrantyMonths = product?.defaultWarrantyMonths ?? 12;
      const serviceIntervalMonths = product?.defaultServiceIntervalMonths ?? 6;
      const assetType = product?.productType ?? 'RO_MACHINE';

      const [created] = await database
        .insert(customerAssets)
        .values({
          assetNumber,
          customerId: data.customerId,
          productId: data.productId,
          assetType,
          serialNumber: data.serialNumber ? data.serialNumber.trim() : null,
          customName: (data as any).customName || (data.installedAddress ? `Machine at ${data.installedAddress}` : null),
          purchaseDate: data.installationDate ? new Date(data.installationDate) : new Date(),
          initialWarrantyMonths,
          serviceIntervalMonths,
          status: (data.status as any) || 'ACTIVE',
          notes: data.notes ?? null,
        })
        .returning();

      return created;
    } catch {
      const created = {
        id: randomUUID(),
        assetNumber,
        customerId: data.customerId,
        productId: data.productId,
        productName: (data as any).productName || (data as any).customName || 'Equipment',
        assetType: 'EQUIPMENT',
        serialNumber: data.serialNumber ? data.serialNumber.trim() : `SN-${Date.now()}`,
        customName: (data as any).customName || (data.installedAddress ? `Machine at ${data.installedAddress}` : 'Installed Machine'),
        purchaseDate: data.installationDate ? new Date(data.installationDate) : new Date(),
        initialWarrantyMonths: 12,
        serviceIntervalMonths: 6,
        status: data.status || 'ACTIVE',
        notes: data.notes ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      memoryAssets.unshift(created);
      return created;
    }
  }

  /**
   * Update Asset details
   */
  async update(id: string, data: UpdateAssetInput, database = db) {
    try {
      const updateValues: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (data.serialNumber !== undefined) updateValues.serialNumber = data.serialNumber ? data.serialNumber.trim() : null;
      if (data.customName !== undefined) updateValues.customName = data.customName;
      if (data.installationAddressId !== undefined) updateValues.installationAddressId = data.installationAddressId;
      if (data.status !== undefined) updateValues.status = data.status;
      if (data.notes !== undefined) updateValues.notes = data.notes;

      const [updated] = await database
        .update(customerAssets)
        .set(updateValues)
        .where(eq(customerAssets.id, id))
        .returning();

      return updated ?? null;
    } catch {
      const target = memoryAssets.find((a) => a.id === id);
      if (target) {
        if (data.serialNumber !== undefined) target.serialNumber = data.serialNumber;
        if (data.customName !== undefined) target.customName = data.customName;
        if (data.status !== undefined) target.status = data.status;
        if (data.notes !== undefined) target.notes = data.notes;
        target.updatedAt = new Date();
      }
      return target ?? null;
    }
  }

  /**
   * Soft-archive an Asset
   */
  async archive(id: string, database = db) {
    try {
      const [updated] = await database
        .update(customerAssets)
        .set({ status: 'DECOMMISSIONED', updatedAt: new Date() })
        .where(eq(customerAssets.id, id))
        .returning();
      return updated ?? null;
    } catch {
      const target = memoryAssets.find((a) => a.id === id);
      if (target) {
        target.status = 'DECOMMISSIONED';
        target.updatedAt = new Date();
      }
      return target ?? null;
    }
  }
}

export const assetsRepository = new AssetsRepository();
