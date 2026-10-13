import { eq, and, or, ilike, sql, desc, asc, inArray } from 'drizzle-orm';
import { db } from '../../database/client';
import {
  technicians,
  technicianPortalAccess,
  jobCards,
  services,
  customers,
  customerAssets,
  products,
  invoices,
  payments,
  auditLogs,
  appSettings,
} from '../../database/schema/index';
import { randomUUID } from 'crypto';
import { memoryJobCards } from '../job-cards/job-cards.repository';
import { memoryServices } from '../services/services.repository';
import { memoryInvoices } from '../invoices/invoices.repository';
import { memoryPayments } from '../payments/payments.repository';
import { technicianPortalRepository } from '../technician-portal/technician-portal.repository';
import { technicianAuthService } from '../technician-portal/technician-auth.service';
import type {
  TechnicianQueryFilter,
  CreateTechnicianInput,
  UpdateTechnicianInput,
} from '@crm/validation';
import type {
  TechnicianAdmin360Profile,
  TechnicianAdminServiceItem,
  TechnicianAdminJobCardItem,
  TechnicianAdminCustomerItem,
  TechnicianAdminAssetItem,
  TechnicianAdminPartItem,
  TechnicianAdminPaymentItem,
} from '@crm/types';

export const INITIAL_TECHNICIANS: any[] = [];

// In-memory mirror for offline fallback
export const memoryTechnicians: any[] = [];

export class TechniciansRepository {
  private hasEnsuredInitial = true;

  /**
   * Ensure default workforce check (no seeded mock workforce).
   */
  async ensureDefaultTechnicians(_database = db) {
    this.hasEnsuredInitial = true;
  }

  /**
   * Find paginated technicians with active & completed job aggregations
   */
  async findPaginated(filters: TechnicianQueryFilter, database = db) {
    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 10));
    const offset = (page - 1) * limit;

    try {
      await this.ensureDefaultTechnicians(database);

      const conditions: any[] = [];

      if (filters.status && (filters.status as string) !== 'ALL') {
        const queryStatus = (filters.status as string) === 'SUSPENDED' ? 'INACTIVE' : filters.status;
        conditions.push(eq(technicians.status, queryStatus as any));
      }

      if (filters.search?.trim()) {
        const term = `%${filters.search.trim()}%`;
        conditions.push(
          or(
            ilike(technicians.fullName, term),
            ilike(technicians.phone, term),
            ilike(technicians.email, term),
            ilike(technicians.address, term)
          )
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const isAsc = filters.sortOrder === 'asc';
      let orderExpr = isAsc ? asc(technicians.fullName) : desc(technicians.fullName);
      if (filters.sortBy === 'createdAt') {
        orderExpr = isAsc ? asc(technicians.createdAt) : desc(technicians.createdAt);
      } else if (filters.sortBy === 'status') {
        orderExpr = isAsc ? asc(technicians.status) : desc(technicians.status);
      }

      const [techRows, countResult] = await Promise.all([
        database
          .select({
            id: technicians.id,
            fullName: technicians.fullName,
            phone: technicians.phone,
            email: technicians.email,
            status: technicians.status,
            skills: technicians.skills,
            address: technicians.address,
            emergencyContact: technicians.emergencyContact,
            userId: technicians.userId,
            createdAt: technicians.createdAt,
            updatedAt: technicians.updatedAt,
            portalEnabled: sql<boolean>`COALESCE(${technicianPortalAccess.portalEnabled}, false)`,
          })
          .from(technicians)
          .leftJoin(technicianPortalAccess, eq(technicians.id, technicianPortalAccess.technicianId))
          .where(whereClause)
          .orderBy(orderExpr)
          .limit(limit)
          .offset(offset),
        database
          .select({ count: sql<number>`count(*)` })
          .from(technicians)
          .where(whereClause),
      ]);

      const total = Number(countResult[0]?.count || 0);

      const rows = techRows.map((t) => {
        const activeJobs = memoryJobCards.filter(
          (j) => j.technicianId === t.id && (j.status === 'ASSIGNED' || j.status === 'IN_PROGRESS' || j.status === 'SCHEDULED')
        ).length;
        const completedJobs = memoryJobCards.filter(
          (j) => j.technicianId === t.id && j.status === 'COMPLETED'
        ).length;

        return {
          ...t,
          portalEnabled: Boolean(t.portalEnabled),
          activeJobsCount: activeJobs,
          completedJobsCount: completedJobs,
        };
      });

      return {
        data: rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1,
        },
      };
    } catch (err: any) {
      console.warn('[TechniciansRepository.findPaginated] DB query fallback:', err?.message);
    }

    // Memory fallback
    let filtered = [...memoryTechnicians];

    if (filters.status && (filters.status as string) !== 'ALL') {
      const queryStatus = (filters.status as string) === 'SUSPENDED' ? 'INACTIVE' : filters.status;
      filtered = filtered.filter((t) => t.status === queryStatus);
    }

    if (filters.search?.trim()) {
      const term = filters.search.trim().toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.fullName.toLowerCase().includes(term) ||
          t.phone.toLowerCase().includes(term) ||
          (t.email && t.email.toLowerCase().includes(term)) ||
          (t.address && t.address.toLowerCase().includes(term))
      );
    }

    const total = filtered.length;
    const isAsc = filters.sortOrder === 'asc';

    filtered.sort((a, b) => {
      if (filters.sortBy === 'createdAt') {
        return isAsc
          ? new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (filters.sortBy === 'status') {
        return isAsc ? a.status.localeCompare(b.status) : b.status.localeCompare(a.status);
      }
      return isAsc ? a.fullName.localeCompare(b.fullName) : b.fullName.localeCompare(a.fullName);
    });

    const paged = filtered.slice(offset, offset + limit).map((t) => {
      const activeJobs = memoryJobCards.filter(
        (j) => j.technicianId === t.id && (j.status === 'ASSIGNED' || j.status === 'IN_PROGRESS' || j.status === 'SCHEDULED')
      ).length;
      const completedJobs = memoryJobCards.filter(
        (j) => j.technicianId === t.id && j.status === 'COMPLETED'
      ).length;

      return {
        ...t,
        portalEnabled: Boolean(t.portalEnabled),
        activeJobsCount: activeJobs,
        completedJobsCount: completedJobs,
      };
    });

    return {
      data: paged,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Find single technician by ID with active assignments & recent job history
   */
  async findById(id: string, database = db) {
    try {
      await this.ensureDefaultTechnicians(database);

      const rows = await database
        .select({
          id: technicians.id,
          fullName: technicians.fullName,
          phone: technicians.phone,
          email: technicians.email,
          status: technicians.status,
          skills: technicians.skills,
          address: technicians.address,
          emergencyContact: technicians.emergencyContact,
          userId: technicians.userId,
          createdAt: technicians.createdAt,
          updatedAt: technicians.updatedAt,
          portalEnabled: sql<boolean>`COALESCE(${technicianPortalAccess.portalEnabled}, false)`,
        })
        .from(technicians)
        .leftJoin(technicianPortalAccess, eq(technicians.id, technicianPortalAccess.technicianId))
        .where(eq(technicians.id, id))
        .limit(1);

      if (rows[0]) {
        let recentJobs: any[] = [];
        try {
          recentJobs = await database
            .select({
              id: jobCards.id,
              jobCardNumber: jobCards.jobCardNumber,
              status: jobCards.status,
              problemReported: jobCards.problemReported,
              workPerformed: jobCards.workPerformed,
              createdAt: jobCards.createdAt,
              completedAt: jobCards.completedAt,
              serviceNumber: services.serviceNumber,
              serviceType: services.serviceType,
              customerName: customers.fullName,
              customerPhone: customers.phone,
              productName: products.name,
            })
            .from(jobCards)
            .leftJoin(services, eq(jobCards.serviceId, services.id))
            .leftJoin(customers, eq(jobCards.customerId, customers.id))
            .leftJoin(customerAssets, eq(jobCards.assetId, customerAssets.id))
            .leftJoin(products, eq(customerAssets.productId, products.id))
            .where(eq(jobCards.technicianId, id))
            .orderBy(desc(jobCards.createdAt))
            .limit(10);
        } catch {}

        if (recentJobs.length === 0) {
          recentJobs = memoryJobCards
            .filter((j) => j.technicianId === id)
            .map((j) => ({
              id: j.id,
              jobCardNumber: j.jobCardNumber,
              status: j.status,
              problemReported: j.problemReported,
              workPerformed: j.workPerformed,
              createdAt: j.createdAt,
              completedAt: j.completedAt,
              serviceNumber: j.serviceNumber || 'SRV-2026-0001',
              serviceType: j.serviceType || 'GENERAL_SERVICE',
              customerName: j.customerName || 'Customer',
              customerPhone: j.customerPhone || '',
              productName: j.productName || 'Equipment',
            }));
        }

        return {
          ...rows[0],
          recentJobs,
        };
      }
    } catch (err: any) {
      console.warn('[TechniciansRepository.findById] DB query fallback:', err?.message);
    }

    const tech =
      memoryTechnicians.find((t) => t.id === id || t.phone === id) ||
      INITIAL_TECHNICIANS.find((t) => t.id === id || t.phone === id);
    if (!tech) return null;

    const recentJobs = memoryJobCards
      .filter((j) => j.technicianId === id)
      .map((j) => ({
        id: j.id,
        jobCardNumber: j.jobCardNumber,
        status: j.status,
        problemReported: j.problemReported,
        workPerformed: j.workPerformed,
        createdAt: j.createdAt,
        completedAt: j.completedAt,
        serviceNumber: j.serviceNumber || 'SRV-2026-0001',
        serviceType: j.serviceType || 'GENERAL_SERVICE',
        customerName: j.customerName || 'Customer',
        customerPhone: j.customerPhone || '',
        productName: j.productName || 'Equipment',
      }));

    return {
      ...tech,
      portalEnabled: Boolean(tech.portalEnabled),
      recentJobs,
    };
  }

  /**
   * Complete 360° Admin Profile for an individual technician
   * Assembled live from authoritative CRM records:
   * Technician identity + Portal Access + Work Summary + Services + Job Cards + Customers + Assets + Parts + Collections
   */
  async getTechnician360AdminProfile(id: string, database = db): Promise<TechnicianAdmin360Profile | null> {
    await this.ensureDefaultTechnicians(database);

    // 1. Authoritative Technician Record & Portal Access
    let techRow: any = null;
    try {
      const [row] = await database
        .select({
          id: technicians.id,
          fullName: technicians.fullName,
          phone: technicians.phone,
          email: technicians.email,
          status: technicians.status,
          skills: technicians.skills,
          address: technicians.address,
          emergencyContact: technicians.emergencyContact,
          userId: technicians.userId,
          createdAt: technicians.createdAt,
          updatedAt: technicians.updatedAt,
          portalEnabled: sql<boolean>`COALESCE(${technicianPortalAccess.portalEnabled}, false)`,
        })
        .from(technicians)
        .leftJoin(technicianPortalAccess, eq(technicians.id, technicianPortalAccess.technicianId))
        .where(eq(technicians.id, id))
        .limit(1);
      techRow = row;
    } catch (err: any) {
      console.warn('[getTechnician360AdminProfile] DB technician fetch fallback:', err?.message);
    }

    if (!techRow) {
      const fallbackTech =
        memoryTechnicians.find((t) => t.id === id || t.phone === id) ||
        INITIAL_TECHNICIANS.find((t) => t.id === id || t.phone === id);
      if (!fallbackTech) return null;
      techRow = {
        ...fallbackTech,
        portalEnabled: Boolean(fallbackTech.portalEnabled),
      };
    }

    const techId = techRow.id;

    // 2. Authoritative Work Summary (reusing verified calculation)
    const summary = await technicianPortalRepository.getPersonalTechnicianSummary(techId, database);

    let availability: 'AVAILABLE' | 'BUSY' | 'ON_LEAVE' | 'OFF_DUTY' = 'AVAILABLE';
    if (techRow.status === 'ON_LEAVE') {
      availability = 'ON_LEAVE';
    } else if (techRow.status === 'INACTIVE') {
      availability = 'OFF_DUTY';
    } else if (summary.workloadBreakdown.inProgress > 0) {
      availability = 'BUSY';
    }

    // 3. Authoritative Assigned Services
    let serviceRows: any[] = [];
    try {
      serviceRows = await database
        .select({
          id: services.id,
          serviceNumber: services.serviceNumber,
          customerId: services.customerId,
          customerName: customers.fullName,
          customerPhone: customers.phone,
          customerEmail: customers.email,
          assetId: services.assetId,
          assetCustomName: customerAssets.customName,
          assetSerialNumber: customerAssets.serialNumber,
          productName: products.name,
          productBrand: products.brand,
          serviceType: services.serviceType,
          serviceLocation: services.serviceLocation,
          serviceClassification: services.serviceClassification,
          scheduledDate: services.scheduledDate,
          scheduledTimeSlot: services.scheduledTimeSlot,
          status: services.status,
          priority: services.priority,
          customerNotes: services.customerNotes,
          internalNotes: services.internalNotes,
          completedAt: services.completedAt,
          createdAt: services.createdAt,
          jobCardId: jobCards.id,
          jobCardNumber: jobCards.jobCardNumber,
          jobCardStatus: jobCards.status,
        })
        .from(services)
        .leftJoin(customers, eq(services.customerId, customers.id))
        .leftJoin(customerAssets, eq(services.assetId, customerAssets.id))
        .leftJoin(products, eq(customerAssets.productId, products.id))
        .leftJoin(jobCards, eq(services.id, jobCards.serviceId))
        .where(eq(services.technicianId, techId))
        .orderBy(desc(services.scheduledDate), desc(services.createdAt));
    } catch (err: any) {
      console.warn('[getTechnician360AdminProfile] DB services fetch fallback:', err?.message);
    }

    if (serviceRows.length === 0) {
      serviceRows = memoryServices
        .filter((s) => s.technicianId === techId)
        .map((s) => {
          const linkedJc = memoryJobCards.find((j) => j.serviceId === s.id);
          return {
            id: s.id,
            serviceNumber: s.serviceNumber,
            customerId: s.customerId,
            customerName: s.customerName || 'Customer',
            customerPhone: s.customerPhone || '',
            customerEmail: s.customerEmail || null,
            customerAddress: s.customerAddress || null,
            assetId: s.assetId,
            assetCustomName: s.machineName || s.customName || 'Equipment',
            assetSerialNumber: null,
            assetModelNumber: null,
            productName: s.productName || 'Equipment',
            productBrand: null,
            serviceType: s.serviceType,
            serviceLocation: s.serviceLocation || 'DOORSTEP',
            serviceClassification: s.serviceClassification || 'GENERAL',
            scheduledDate: s.scheduledDate,
            scheduledTimeSlot: s.scheduledTimeSlot || null,
            status: s.status,
            priority: s.priority || 'NORMAL',
            customerNotes: s.customerNotes || null,
            internalNotes: s.internalNotes || null,
            completedAt: s.completedAt || null,
            createdAt: s.createdAt,
            jobCardId: linkedJc?.id || null,
            jobCardNumber: linkedJc?.jobCardNumber || null,
            jobCardStatus: linkedJc?.status || null,
          };
        });
    }

    // 4. Authoritative Job Cards
    let jobCardRows: any[] = [];
    try {
      jobCardRows = await database
        .select({
          id: jobCards.id,
          jobCardNumber: jobCards.jobCardNumber,
          serviceId: jobCards.serviceId,
          serviceNumber: services.serviceNumber,
          serviceType: services.serviceType,
          customerId: jobCards.customerId,
          customerName: customers.fullName,
          customerPhone: customers.phone,
          assetId: jobCards.assetId,
          assetCustomName: customerAssets.customName,
          productName: products.name,
          problemReported: jobCards.problemReported,
          diagnosis: jobCards.diagnosis,
          workPerformed: jobCards.workPerformed,
          partsReplaced: jobCards.partsReplaced,
          technicianNotes: jobCards.technicianNotes,
          customerRemarks: jobCards.customerRemarks,
          startedAt: jobCards.startedAt,
          completedAt: jobCards.completedAt,
          laborCharges: jobCards.laborCharges,
          partsCharges: jobCards.partsCharges,
          totalCharges: jobCards.totalCharges,
          status: jobCards.status,
          createdAt: jobCards.createdAt,
        })
        .from(jobCards)
        .leftJoin(services, eq(jobCards.serviceId, services.id))
        .leftJoin(customers, eq(jobCards.customerId, customers.id))
        .leftJoin(customerAssets, eq(jobCards.assetId, customerAssets.id))
        .leftJoin(products, eq(customerAssets.productId, products.id))
        .where(eq(jobCards.technicianId, techId))
        .orderBy(desc(jobCards.createdAt));
    } catch (err: any) {
      console.warn('[getTechnician360AdminProfile] DB job cards fetch fallback:', err?.message);
    }

    if (jobCardRows.length === 0) {
      jobCardRows = memoryJobCards
        .filter((j) => j.technicianId === techId)
        .map((j) => {
          const s = memoryServices.find((s) => s.id === j.serviceId);
          return {
            id: j.id,
            jobCardNumber: j.jobCardNumber,
            serviceId: j.serviceId,
            serviceNumber: s?.serviceNumber || j.serviceNumber || 'SRV',
            serviceType: s?.serviceType || 'GENERAL_SERVICE',
            customerId: j.customerId,
            customerName: j.customerName || 'Customer',
            customerPhone: j.customerPhone || '',
            assetId: j.assetId,
            assetCustomName: j.productName || 'Equipment',
            productName: j.productName || 'Equipment',
            problemReported: j.problemReported,
            diagnosis: j.diagnosis,
            workPerformed: j.workPerformed,
            partsReplaced: j.partsReplaced,
            technicianNotes: j.technicianNotes,
            customerRemarks: j.customerRemarks,
            startedAt: j.startedAt,
            completedAt: j.completedAt,
            laborCharges: j.laborCharges || '0.00',
            partsCharges: j.partsCharges || '0.00',
            totalCharges: j.totalCharges || '0.00',
            status: j.status,
            createdAt: j.createdAt,
          };
        });
    }

    // 5. Invoices & Payments linked to this technician's services or job cards
    const serviceIds = serviceRows.map((s) => s.id).filter(Boolean);
    const jobCardIds = jobCardRows.map((j) => j.id).filter(Boolean);

    let invoiceRows: any[] = [];
    if (serviceIds.length > 0 || jobCardIds.length > 0) {
      try {
        const orConditions: any[] = [];
        if (serviceIds.length > 0) {
          orConditions.push(inArray(invoices.serviceId, serviceIds));
        }
        if (jobCardIds.length > 0) {
          orConditions.push(inArray(invoices.jobCardId, jobCardIds));
        }
        invoiceRows = await database
          .select({
            id: invoices.id,
            invoiceNumber: invoices.invoiceNumber,
            customerId: invoices.customerId,
            serviceId: invoices.serviceId,
            jobCardId: invoices.jobCardId,
            invoiceDate: invoices.invoiceDate,
            dueDate: invoices.dueDate,
            totalAmount: invoices.totalAmount,
            status: invoices.status,
          })
          .from(invoices)
          .where(or(...orConditions));
      } catch (err: any) {
        console.warn('[getTechnician360AdminProfile] DB invoices fetch fallback:', err?.message);
      }
    }

    if (invoiceRows.length === 0 && (serviceIds.length > 0 || jobCardIds.length > 0)) {
      invoiceRows = memoryInvoices.filter(
        (inv) =>
          (inv.serviceId && serviceIds.includes(inv.serviceId)) ||
          (inv.jobCardId && jobCardIds.includes(inv.jobCardId))
      );
    }

    // Map invoices by serviceId and jobCardId for fast lookup
    const invoiceByServiceId = new Map<string, any>();
    const invoiceByJobCardId = new Map<string, any>();
    invoiceRows.forEach((inv) => {
      if (inv.serviceId) invoiceByServiceId.set(inv.serviceId, inv);
      if (inv.jobCardId) invoiceByJobCardId.set(inv.jobCardId, inv);
    });

    const invoiceIds = invoiceRows.map((inv) => inv.id).filter(Boolean);
    let paymentRows: any[] = [];
    if (invoiceIds.length > 0) {
      try {
        paymentRows = await database
          .select({
            id: payments.id,
            paymentNumber: payments.paymentNumber,
            customerId: payments.customerId,
            customerName: customers.fullName,
            invoiceId: payments.invoiceId,
            invoiceNumber: invoices.invoiceNumber,
            amount: payments.amount,
            paymentDate: payments.paymentDate,
            paymentMethod: payments.paymentMethod,
            status: payments.status,
            referenceNumber: payments.referenceNumber,
          })
          .from(payments)
          .leftJoin(invoices, eq(payments.invoiceId, invoices.id))
          .leftJoin(customers, eq(payments.customerId, customers.id))
          .where(inArray(payments.invoiceId, invoiceIds))
          .orderBy(desc(payments.paymentDate));
      } catch (err: any) {
        console.warn('[getTechnician360AdminProfile] DB payments fetch fallback:', err?.message);
      }
    }

    if (paymentRows.length === 0 && invoiceIds.length > 0) {
      paymentRows = memoryPayments.filter((p) => invoiceIds.includes(p.invoiceId));
    }

    // Compute Financial Metrics from Authoritative records
    let totalInvoiced = 0;
    invoiceRows.forEach((inv) => {
      if (inv.status !== 'CANCELLED') {
        totalInvoiced += parseFloat(inv.totalAmount) || 0;
      }
    });

    let totalCollected = 0;
    paymentRows.forEach((p) => {
      if (p.status === 'COMPLETED') {
        totalCollected += parseFloat(p.amount) || 0;
      }
    });

    const pendingBalance = Math.max(0, totalInvoiced - totalCollected);
    const collectionsCount = paymentRows.filter((p) => p.status === 'COMPLETED').length;

    // Helper for clean machine name resolution
    const resolveMachineName = (row: any) => {
      return row.assetCustomName || row.productName || 'Equipment';
    };

    // Format Assigned Services
    const assignedServices: TechnicianAdminServiceItem[] = serviceRows.map((s) => {
      const linkedInv = invoiceByServiceId.get(s.id) || (s.jobCardId ? invoiceByJobCardId.get(s.jobCardId) : null);
      return {
        id: s.id,
        serviceNumber: s.serviceNumber,
        customerId: s.customerId,
        customerName: s.customerName || 'Customer',
        customerPhone: s.customerPhone || '',
        customerEmail: s.customerEmail || null,
        customerAddress: s.customerAddress || null,
        assetId: s.assetId,
        machineName: resolveMachineName(s),
        serialNumber: s.assetSerialNumber || null,
        modelNumber: s.assetModelNumber || null,
        serviceType: s.serviceType,
        serviceLocation: s.serviceLocation,
        serviceClassification: s.serviceClassification,
        scheduledDate: s.scheduledDate ? new Date(s.scheduledDate).toISOString() : '',
        scheduledTimeSlot: s.scheduledTimeSlot || null,
        status: s.status,
        priority: s.priority || 'NORMAL',
        customerNotes: s.customerNotes || null,
        internalNotes: s.internalNotes || null,
        completedAt: s.completedAt ? new Date(s.completedAt).toISOString() : null,
        createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : '',
        jobCardId: s.jobCardId || null,
        jobCardNumber: s.jobCardNumber || null,
        jobCardStatus: s.jobCardStatus || null,
        invoiceId: linkedInv?.id || null,
        invoiceNumber: linkedInv?.invoiceNumber || null,
        invoiceTotal: linkedInv?.totalAmount || null,
        invoiceStatus: linkedInv?.status || null,
        amountPaid: null,
      };
    });

    // Format Job Cards
    const jobCardsFormatted: TechnicianAdminJobCardItem[] = jobCardRows.map((j) => ({
      id: j.id,
      jobCardNumber: j.jobCardNumber,
      serviceId: j.serviceId,
      serviceNumber: j.serviceNumber || null,
      serviceType: j.serviceType || null,
      customerId: j.customerId,
      customerName: j.customerName || 'Customer',
      customerPhone: j.customerPhone || '',
      assetId: j.assetId,
      assetName: j.assetCustomName || j.productName || 'Machine',
      problemReported: j.problemReported || null,
      diagnosis: j.diagnosis || null,
      workPerformed: j.workPerformed || null,
      partsReplaced: j.partsReplaced || [],
      technicianNotes: j.technicianNotes || null,
      customerRemarks: j.customerRemarks || null,
      startedAt: j.startedAt ? new Date(j.startedAt).toISOString() : null,
      completedAt: j.completedAt ? new Date(j.completedAt).toISOString() : null,
      laborCharges: String(j.laborCharges ?? '0.00'),
      partsCharges: String(j.partsCharges ?? '0.00'),
      totalCharges: String(j.totalCharges ?? '0.00'),
      status: j.status,
      createdAt: j.createdAt ? new Date(j.createdAt).toISOString() : '',
    }));

    // Current Work: In progress, started, diagnosis, or scheduled today (and not completed/cancelled)
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const currentWork = assignedServices.filter((s) => {
      const isStatusActive =
        s.status === 'IN_PROGRESS' ||
        s.jobCardStatus === 'IN_PROGRESS' ||
        s.jobCardStatus === 'STARTED' ||
        s.jobCardStatus === 'DIAGNOSIS';
      const sDate = s.scheduledDate ? new Date(s.scheduledDate) : null;
      const isTodayScheduled =
        sDate && sDate >= startOfToday && sDate <= endOfToday && s.status !== 'COMPLETED' && s.status !== 'CANCELLED';
      return isStatusActive || isTodayScheduled;
    });

    // Upcoming Work: Scheduled after today
    const upcomingWork = assignedServices.filter((s) => {
      const sDate = s.scheduledDate ? new Date(s.scheduledDate) : null;
      return sDate && sDate > endOfToday && (s.status === 'SCHEDULED' || s.status === 'ASSIGNED');
    });

    // Completed Services
    const completedServices = assignedServices.filter((s) => s.status === 'COMPLETED');

    // Aggregate Distinct Customers Handled
    const customerMap = new Map<string, TechnicianAdminCustomerItem>();
    assignedServices.forEach((s) => {
      if (!s.customerId) return;
      const existing = customerMap.get(s.customerId);
      const sDate = s.completedAt || s.scheduledDate || s.createdAt;
      if (!existing) {
        customerMap.set(s.customerId, {
          customerId: s.customerId,
          customerName: s.customerName,
          phone: s.customerPhone,
          email: s.customerEmail,
          address: s.customerAddress,
          totalServices: 1,
          lastServiceDate: sDate,
          lastServiceNumber: s.serviceNumber,
        });
      } else {
        existing.totalServices += 1;
        if (sDate && (!existing.lastServiceDate || new Date(sDate) > new Date(existing.lastServiceDate))) {
          existing.lastServiceDate = sDate;
          existing.lastServiceNumber = s.serviceNumber;
        }
      }
    });
    const customersHandled = Array.from(customerMap.values()).sort(
      (a, b) => b.totalServices - a.totalServices
    );

    // Aggregate Distinct Assets / Equipment Serviced
    const assetMap = new Map<string, TechnicianAdminAssetItem>();
    assignedServices.forEach((s) => {
      if (!s.assetId) return;
      const existing = assetMap.get(s.assetId);
      const sDate = s.completedAt || s.scheduledDate || s.createdAt;
      if (!existing) {
        assetMap.set(s.assetId, {
          assetId: s.assetId,
          assetName: s.machineName,
          serialNumber: s.serialNumber,
          modelNumber: s.modelNumber,
          customerName: s.customerName,
          customerId: s.customerId,
          totalServices: 1,
          lastServiceDate: sDate,
        });
      } else {
        existing.totalServices += 1;
        if (sDate && (!existing.lastServiceDate || new Date(sDate) > new Date(existing.lastServiceDate))) {
          existing.lastServiceDate = sDate;
        }
      }
    });
    const assetsHandled = Array.from(assetMap.values()).sort(
      (a, b) => b.totalServices - a.totalServices
    );

    // Aggregate Parts / Materials Used from Job Cards
    const partsUsed: TechnicianAdminPartItem[] = [];
    jobCardRows.forEach((j) => {
      const parts = Array.isArray(j.partsReplaced) ? j.partsReplaced : [];
      parts.forEach((p: any) => {
        if (!p) return;
        partsUsed.push({
          partName: p.partName || p.itemName || p.name || 'Component / Spare Part',
          partSku: p.partSku || p.sku || null,
          quantity: Number(p.quantity || 1),
          isWarrantyCovered: Boolean(p.isWarrantyCovered),
          price: p.price ?? p.unitPrice ?? null,
          jobCardId: j.id,
          jobCardNumber: j.jobCardNumber,
          date: j.completedAt ? new Date(j.completedAt).toISOString() : j.createdAt ? new Date(j.createdAt).toISOString() : '',
        });
      });
    });

    // Payments formatted
    const paymentsFormatted: TechnicianAdminPaymentItem[] = paymentRows.map((p) => ({
      id: p.id,
      paymentNumber: p.paymentNumber,
      invoiceId: p.invoiceId,
      invoiceNumber: p.invoiceNumber || 'INV',
      customerId: p.customerId,
      customerName: p.customerName || 'Customer',
      amount: String(p.amount ?? '0.00'),
      paymentDate: p.paymentDate ? new Date(p.paymentDate).toISOString() : '',
      paymentMethod: p.paymentMethod,
      status: p.status,
      referenceNumber: p.referenceNumber || null,
    }));

    return {
      technician: {
        id: techRow.id,
        fullName: techRow.fullName,
        phone: techRow.phone,
        email: techRow.email || null,
        status: techRow.status,
        availability,
        skills: techRow.skills || [],
        address: techRow.address || null,
        emergencyContact: techRow.emergencyContact || null,
        portalEnabled: Boolean(techRow.portalEnabled),
        createdAt: techRow.createdAt ? new Date(techRow.createdAt).toISOString() : '',
        updatedAt: techRow.updatedAt ? new Date(techRow.updatedAt).toISOString() : '',
      },
      workSummary: {
        assignedCount: summary.assignedCount,
        inProgressCount: summary.workloadBreakdown.inProgress,
        completedCount: summary.completedCount,
        upcomingCount: summary.workloadBreakdown.upcoming,
        currentWorkload: summary.currentWorkload,
        completionRate: summary.completionRate,
        averageCompletionTimeMinutes: summary.averageCompletionTimeMinutes,
        averageCompletionTimeFormatted: summary.averageCompletionTimeFormatted,
        isAverageCompletionTimeReliable: summary.isAverageCompletionTimeReliable,
        sampleSize: summary.sampleSize,
      },
      financialSummary: {
        totalInvoiced,
        totalCollected,
        pendingBalance,
        collectionsCount,
      },
      currentWork,
      upcomingWork,
      assignedServices,
      completedServices,
      jobCards: jobCardsFormatted,
      customersHandled,
      assetsHandled,
      partsUsed,
      payments: paymentsFormatted,
    };
  }

  /**
   * Get High-Level Operational KPIs for Technicians
   */
  async getKPIs(database = db) {
    try {
      await this.ensureDefaultTechnicians(database);

      const query = sql`
        SELECT
          COUNT(*)::int AS total_technicians,
          COUNT(*) FILTER (WHERE ${technicians.status} = 'ACTIVE')::int AS active_technicians,
          COUNT(*) FILTER (WHERE ${technicians.status} = 'ON_LEAVE')::int AS on_leave,
          COUNT(*) FILTER (WHERE ${technicians.status} = 'INACTIVE')::int AS inactive_technicians
        FROM ${technicians}
      `;

      const result = await database.execute(query);
      const row = result[0] as any;

      if (row) {
        return {
          totalTechnicians: Number(row.total_technicians) || 0,
          activeTechnicians: Number(row.active_technicians) || 0,
          onLeave: Number(row.on_leave) || 0,
          inactiveTechnicians: Number(row.inactive_technicians) || 0,
        };
      }
    } catch (err: any) {
      console.warn('[TechniciansRepository.getKPIs] DB query fallback:', err?.message);
    }

    return {
      totalTechnicians: memoryTechnicians.length,
      activeTechnicians: memoryTechnicians.filter((t) => t.status === 'ACTIVE').length,
      onLeave: memoryTechnicians.filter((t) => t.status === 'ON_LEAVE').length,
      inactiveTechnicians: memoryTechnicians.filter((t) => t.status === 'INACTIVE').length,
    };
  }

  /**
   * Create a new field technician
   */
  async create(input: CreateTechnicianInput, actorId?: string, database = db) {
    try {
      await this.ensureDefaultTechnicians(database);

      // Check phone uniqueness
      const existing = await database
        .select()
        .from(technicians)
        .where(eq(technicians.phone, input.phone))
        .limit(1);

      if (existing[0]) {
        throw new Error(`A technician with phone number "${input.phone}" already exists`);
      }

      const dbStatus: 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE' = input.status === 'SUSPENDED' ? 'INACTIVE' : (input.status || 'ACTIVE');

      const [newTech] = await database
        .insert(technicians)
        .values({
          id: randomUUID(),
          fullName: input.fullName,
          phone: input.phone,
          email: input.email || null,
          address: input.address || null,
          skills: input.skills || ['RO Installation', 'General Service'],
          emergencyContact: input.emergencyContact || null,
          userId: input.userId || null,
          status: dbStatus,
        })
        .returning();

      if (!newTech) {
        throw new Error('Failed to create technician');
      }

      // Safe additive portal access initialization if specified
      let portalEnabled = false;
      if (input.portalEnabled !== undefined) {
        try {
          await technicianPortalRepository.setPortalAccessStatus(newTech.id, input.portalEnabled, database);
          portalEnabled = input.portalEnabled;
        } catch (portalErr) {
          console.warn('[TechniciansRepository.create] Error setting initial portal access:', portalErr);
        }
      }

      const createdTech = {
        ...newTech,
        portalEnabled,
      };

      // Audit Log
      try {
        if (actorId) {
          await database.insert(auditLogs).values({
            actorId,
            action: 'CREATE',
            entityType: 'USER',
            entityId: newTech.id,
            afterState: createdTech,
          });
        }
      } catch {}

      memoryTechnicians.unshift(createdTech);
      return createdTech;
    } catch (err: any) {
      if (err.message?.includes('already exists')) throw err;
      console.warn('[TechniciansRepository.create] DB insert notice, using memory fallback:', err?.message);

      const existingMem = memoryTechnicians.find((t) => t.phone === input.phone);
      if (existingMem) {
        throw new Error(`A technician with phone number "${input.phone}" already exists`);
      }

      const dbStatus: 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE' = input.status === 'SUSPENDED' ? 'INACTIVE' : (input.status || 'ACTIVE');
      const newTech = {
        id: randomUUID(),
        fullName: input.fullName,
        phone: input.phone,
        email: input.email || null,
        address: input.address || null,
        skills: input.skills || ['RO Installation', 'General Service'],
        emergencyContact: input.emergencyContact || null,
        userId: input.userId || null,
        status: dbStatus,
        portalEnabled: Boolean(input.portalEnabled),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      memoryTechnicians.unshift(newTech);
      return newTech;
    }
  }

  /**
   * Update technician profile or status
   */
  async update(id: string, input: UpdateTechnicianInput, actorId?: string, database = db) {
    try {
      await this.ensureDefaultTechnicians(database);

      const existing = await this.findById(id, database);
      if (!existing) {
        throw new Error('Technician not found');
      }

      const updateData: Record<string, any> = { updatedAt: new Date() };

      if (input.fullName) updateData.fullName = input.fullName;
      if (input.phone) updateData.phone = input.phone;
      if (input.email !== undefined) updateData.email = input.email;
      if (input.address !== undefined) updateData.address = input.address;
      if (input.skills) updateData.skills = input.skills;
      if (input.emergencyContact !== undefined) updateData.emergencyContact = input.emergencyContact;
      if (input.status) {
        updateData.status = (input.status as string) === 'SUSPENDED' ? 'INACTIVE' : input.status;
      }
      if (input.userId !== undefined) updateData.userId = input.userId;

      const [updated] = await database
        .update(technicians)
        .set(updateData)
        .where(eq(technicians.id, id))
        .returning();

      // Handle portal access update if provided in payload
      let portalEnabled = existing.portalEnabled;
      if (input.portalEnabled !== undefined) {
        const portalRes = await this.setPortalAccess(id, input.portalEnabled, actorId, database);
        portalEnabled = portalRes.portalEnabled;
      }

      const finalTech = {
        ...(updated || existing),
        ...updateData,
        portalEnabled: Boolean(portalEnabled),
      };

      // Audit Log
      try {
        if (actorId) {
          await database.insert(auditLogs).values({
            actorId,
            action: 'UPDATE',
            entityType: 'USER',
            entityId: id,
            beforeState: existing,
            afterState: finalTech,
          });
        }
      } catch {}

      const memIdx = memoryTechnicians.findIndex((t) => t.id === id);
      if (memIdx !== -1) {
        memoryTechnicians[memIdx] = { ...memoryTechnicians[memIdx], ...finalTech };
      }

      return finalTech;
    } catch (err: any) {
      if (err.message?.includes('not found')) throw err;
      console.warn('[TechniciansRepository.update] DB update notice, using memory fallback:', err?.message);

      const tech = memoryTechnicians.find((t) => t.id === id);
      if (!tech) {
        throw new Error('Technician not found');
      }

      if (input.fullName) tech.fullName = input.fullName;
      if (input.phone) tech.phone = input.phone;
      if (input.email !== undefined) tech.email = input.email;
      if (input.address !== undefined) tech.address = input.address;
      if (input.skills) tech.skills = input.skills;
      if (input.emergencyContact !== undefined) tech.emergencyContact = input.emergencyContact;
      if (input.status) {
        tech.status = (input.status as string) === 'SUSPENDED' ? 'INACTIVE' : input.status;
      }
      if (input.userId !== undefined) tech.userId = input.userId;
      if (input.portalEnabled !== undefined) {
        tech.portalEnabled = input.portalEnabled;
        if (!input.portalEnabled) {
          technicianAuthService.revokeAllSessionsForTechnician(id).catch(() => {});
        }
      }
      tech.updatedAt = new Date();

      return tech;
    }
  }

  /**
   * Set or toggle technician portal access status
   * Only callable by administrative roles with users.manage permission
   */
  async setPortalAccess(id: string, portalEnabled: boolean, actorId?: string, database = db) {
    await this.ensureDefaultTechnicians(database);

    const existing = await this.findById(id, database);
    if (!existing) {
      throw new Error('Technician not found');
    }

    try {
      await technicianPortalRepository.setPortalAccessStatus(id, portalEnabled, database);

      // Audit Log
      if (actorId) {
        try {
          await database.insert(auditLogs).values({
            actorId,
            action: 'UPDATE',
            entityType: 'USER',
            entityId: id,
            beforeState: { portalEnabled: existing.portalEnabled ?? false },
            afterState: { portalEnabled },
          });
        } catch {}
      }
    } catch (err: any) {
      console.warn('[TechniciansRepository.setPortalAccess] DB update notice, using memory fallback:', err?.message);
    }

    // When portal access is disabled, immediately revoke all active sessions and OTP challenges for this technician
    if (!portalEnabled) {
      try {
        await technicianAuthService.revokeAllSessionsForTechnician(id);
      } catch (err) {
        console.warn('[TechniciansRepository.setPortalAccess] Failed to revoke active sessions:', err);
      }
    }

    // Synchronize memory fallback
    const memIdx = memoryTechnicians.findIndex((t) => t.id === id);
    if (memIdx !== -1) {
      memoryTechnicians[memIdx] = {
        ...memoryTechnicians[memIdx],
        portalEnabled,
      };
    }

    return {
      id,
      fullName: existing.fullName,
      phone: existing.phone,
      portalEnabled,
      message: `Technician Portal access has been ${portalEnabled ? 'enabled' : 'disabled'} for ${existing.fullName}.`,
    };
  }

  /**
   * Check if a technician has active or historical dependent records
   */
  async checkDependencies(id: string, database = db) {
    let serviceCount = 0;
    let jobCardCount = 0;

    try {
      const [srvRes, jcRes] = await Promise.all([
        database
          .select({ count: sql<number>`count(*)` })
          .from(services)
          .where(eq(services.technicianId, id)),
        database
          .select({ count: sql<number>`count(*)` })
          .from(jobCards)
          .where(eq(jobCards.technicianId, id)),
      ]);

      serviceCount = Number(srvRes[0]?.count || 0);
      jobCardCount = Number(jcRes[0]?.count || 0);
    } catch (err: any) {
      console.warn('[TechniciansRepository.checkDependencies] DB check notice:', err?.message);
    }

    const memJobs = memoryJobCards.filter((j) => j.technicianId === id).length;
    jobCardCount = Math.max(jobCardCount, memJobs);

    const totalDependencies = serviceCount + jobCardCount;

    return {
      hasDependencies: totalDependencies > 0,
      serviceCount,
      jobCardCount,
      totalDependencies,
    };
  }

  /**
   * Delete technician if no protected dependent records exist
   */
  async delete(id: string, actorId?: string, database = db) {
    const existing = await this.findById(id, database);
    if (!existing) {
      throw new Error('Technician not found');
    }

    // Dependency check to ensure referential safety
    const dep = await this.checkDependencies(id, database);
    if (dep.hasDependencies) {
      const parts: string[] = [];
      if (dep.jobCardCount > 0) parts.push(`${dep.jobCardCount} job card(s)`);
      if (dep.serviceCount > 0) parts.push(`${dep.serviceCount} service record(s)`);
      throw new Error(
        `Cannot delete technician "${existing.fullName}". There are ${parts.join(' and ')} assigned to this technician. Please reassign these records or set the technician status to Inactive.`
      );
    }

    // Perform database deletion
    try {
      await database.delete(technicians).where(eq(technicians.id, id));

      // Audit Log
      try {
        if (actorId) {
          await database.insert(auditLogs).values({
            actorId,
            action: 'DELETE',
            entityType: 'USER',
            entityId: id,
            beforeState: existing,
          });
        }
      } catch {}
    } catch (err: any) {
      console.warn('[TechniciansRepository.delete] DB delete notice, using memory fallback:', err?.message);
    }

    // Remove from in-memory array
    const memIdx = memoryTechnicians.findIndex((t) => t.id === id);
    if (memIdx !== -1) {
      memoryTechnicians.splice(memIdx, 1);
    }

    return { success: true, id, message: 'Technician deleted successfully' };
  }
}

export const techniciansRepository = new TechniciansRepository();
