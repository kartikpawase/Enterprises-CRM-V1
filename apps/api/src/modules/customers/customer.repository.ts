import { db } from '../../database/client';
import {
  customers,
  customerCustomLabels,
  customerAddresses,
  customerAssets,
  users,
  sales,
  saleItems,
  invoices,
  invoiceItems,
  payments,
  services,
  serviceSchedules,
  warranties,
  warrantyEvents,
  jobCards,
  customerActivities,
  reminders,
  inquiries,
  documents,
  documentAttachments,
  whatsappContacts,
  whatsappConversations,
  whatsappMessages,
  whatsappEvents,
  rentals,
  rentalPayments,
  rentalEvents,
  emailNotifications,
  appSettings,
  products,
  technicians,
} from '../../database/schema/index';
import { eq, and, or, ilike, desc, asc, count, sum, sql, inArray, gt, gte, lte, ne, isNull } from 'drizzle-orm';
import { generateBusinessNumber } from '../../database/sequences';
import { assetsRepository, memoryAssets } from '../assets/assets.repository';
import { invoicesRepository, memoryInvoices } from '../invoices/invoices.repository';
import { salesRepository, memorySales } from '../sales/sales.repository';
import { paymentsRepository, memoryPayments } from '../payments/payments.repository';
import { servicesRepository, memoryServices } from '../services/services.repository';
import { warrantiesRepository, memoryWarranties } from '../warranties/warranties.repository';
import { rentalRepository, memoryRentals } from '../rentals/rental.repository';
import { jobCardsRepository } from '../job-cards/job-cards.repository';
import type {
  CreateCustomerInput,
  UpdateCustomerInput,
  CustomerQueryFilterInput,
} from '@crm/validation';

// Resilient fallback memory store for local development and desktop offline
export const memoryCustomers: any[] = [];

export class CustomerRepository {
  /**
   * Find paginated customer directory list with server search, filters and sorting
   */
  async findPaginated(filters: CustomerQueryFilterInput, database = db) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.max(1, Math.min(1000, filters.limit || 20));
    const offset = (page - 1) * limit;

    const conditions: any[] = [];

    // Filter by status (ACTIVE, INACTIVE, ARCHIVED; omit when undefined or ALL)
    if (filters.status && (filters.status as string) !== 'ALL') {
      conditions.push(eq(customers.status, filters.status as any));
    }

    // Filter by customer type (INDIVIDUAL, COMMERCIAL; omit when undefined or ALL)
    if (filters.customerType && (filters.customerType as string) !== 'ALL') {
      conditions.push(eq(customers.customerType, filters.customerType as any));
    }

    // Filter by customer label (GOOD, BAD, NONE; omit when undefined or ALL)
    if (filters.customerLabel && (filters.customerLabel as string) !== 'ALL') {
      if ((filters.customerLabel as string) === 'NONE') {
        conditions.push(isNull(customers.customerLabel));
      } else {
        conditions.push(eq(customers.customerLabel, filters.customerLabel as any));
      }
    }

    // Filter by city (from customerAddresses)
    if (filters.city && filters.city !== 'ALL') {
      const cityPattern = `%${filters.city.trim()}%`;
      const addressQuery = database
        .select({ customerId: customerAddresses.customerId })
        .from(customerAddresses)
        .where(ilike(customerAddresses.city, cityPattern));

      conditions.push(inArray(customers.id, addressQuery));
    }

    // Filter by date range (createdAt)
    if (filters.startDate) {
      const start = new Date(filters.startDate);
      start.setHours(0, 0, 0, 0);
      conditions.push(gte(customers.createdAt, start));
    }

    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      conditions.push(lte(customers.createdAt, end));
    }

    // Search query across name, phone, email, customerNumber, companyName, notes
    if (filters.search && filters.search.trim()) {
      const searchPattern = `%${filters.search.trim()}%`;
      conditions.push(
        or(
          ilike(customers.fullName, searchPattern),
          ilike(customers.phone, searchPattern),
          ilike(customers.email, searchPattern),
          ilike(customers.customerNumber, searchPattern),
          ilike(customers.companyName, searchPattern),
          ilike(customers.notes, searchPattern)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Sorting resolution: Default to createdAt DESC, customerNumber DESC
    let orderByClauses;
    const direction = filters.sortOrder === 'asc' ? asc : desc;
    switch (filters.sortBy) {
      case 'fullName':
      case 'name':
        orderByClauses = [direction(customers.fullName), asc(customers.customerNumber)];
        break;
      case 'phone':
        orderByClauses = [direction(customers.phone), asc(customers.customerNumber)];
        break;
      case 'updatedAt':
        orderByClauses = [direction(customers.updatedAt), asc(customers.customerNumber)];
        break;
      case 'createdAt':
        orderByClauses = [direction(customers.createdAt), asc(customers.customerNumber)];
        break;
      case 'customerNumber':
      case 'customerId':
        orderByClauses = [direction(customers.customerNumber), desc(customers.id)];
        break;
      case 'id':
      default:
        orderByClauses = [direction(customers.createdAt), direction(customers.customerNumber)];
        break;
    }

    // Execute count and paginated query concurrently
    let total = 0;
    let records: any[] = [];

    try {
      const [totalRecordRes, recordsRes] = await Promise.all([
        database
          .select({ total: count() })
          .from(customers)
          .where(whereClause),
        database.query.customers.findMany({
          where: whereClause,
          orderBy: orderByClauses,
          limit,
          offset,
          with: {
            addresses: {
              orderBy: [desc(customerAddresses.isDefault), desc(customerAddresses.createdAt)],
            },
            assets: {
              limit: 10,
              with: {
                product: true,
              },
            },
          },
        }),
      ]);

      total = Number(totalRecordRes[0]?.total || 0);
      records = recordsRes;
    } catch (dbErr: any) {
      console.warn('[CustomerRepository.findPaginated] Database query fallback:', dbErr?.message);
      records = memoryCustomers;
      total = memoryCustomers.length;
    }

    const customerIds = records.map((r) => r.id);
    const customLabelIds = records.map((r) => r.customLabelId).filter(Boolean);

    const customLabelsById: Record<string, any> = {};
    if (customLabelIds.length > 0) {
      try {
        const customLabelsList = await database
          .select()
          .from(customerCustomLabels)
          .where(inArray(customerCustomLabels.id, customLabelIds));
        for (const cl of customLabelsList) {
          customLabelsById[cl.id] = {
            id: cl.id,
            name: cl.name,
            color: cl.color,
            description: cl.description,
          };
        }
      } catch {}
    }

    const servicesByCustomer: Record<string, any[]> = {};
    const invoicesByCustomer: Record<string, any[]> = {};
    const paymentsByCustomer: Record<string, any[]> = {};
    const warrantiesByCustomer: Record<string, any[]> = {};

    if (customerIds.length > 0) {
      const [servicesListRes, invoicesListRes, paymentsListRes, warrantiesListRes] = await Promise.allSettled([
        database.query?.services?.findMany
          ? database.query.services.findMany({
              where: inArray(services.customerId, customerIds),
              orderBy: desc(services.scheduledDate),
            })
          : Promise.resolve([]),
        database.query?.invoices?.findMany
          ? database.query.invoices.findMany({
              where: inArray(invoices.customerId, customerIds),
              orderBy: desc(invoices.invoiceDate),
            })
          : Promise.resolve([]),
        database.query?.payments?.findMany
          ? database.query.payments.findMany({
              where: inArray(payments.customerId, customerIds),
              orderBy: desc(payments.paymentDate),
            })
          : Promise.resolve([]),
        database.query?.warranties?.findMany
          ? database.query.warranties.findMany({
              where: inArray(warranties.customerId, customerIds),
            })
          : Promise.resolve([]),
      ]);

      if (servicesListRes.status === 'fulfilled') {
        for (const s of servicesListRes.value) {
          if (!servicesByCustomer[s.customerId]) servicesByCustomer[s.customerId] = [];
          servicesByCustomer[s.customerId].push(s);
        }
      }
      if (invoicesListRes.status === 'fulfilled') {
        for (const inv of invoicesListRes.value) {
          if (!invoicesByCustomer[inv.customerId]) invoicesByCustomer[inv.customerId] = [];
          invoicesByCustomer[inv.customerId].push(inv);
        }
      }
      if (paymentsListRes.status === 'fulfilled') {
        for (const p of paymentsListRes.value) {
          if (!paymentsByCustomer[p.customerId]) paymentsByCustomer[p.customerId] = [];
          paymentsByCustomer[p.customerId].push(p);
        }
      }
      if (warrantiesListRes.status === 'fulfilled') {
        for (const w of warrantiesListRes.value) {
          if (!warrantiesByCustomer[w.customerId]) warrantiesByCustomer[w.customerId] = [];
          warrantiesByCustomer[w.customerId].push(w);
        }
      }
    }

    const enhancedRecords = records.map((cust) => {
      const dbServices = servicesByCustomer[cust.id] || [];
      const memServices = memoryServices.filter((s) => s.customerId === cust.id);
      const custServices = [...dbServices, ...memServices.filter((ms) => !dbServices.some((ds) => ds.id === ms.id))];

      const dbInvoices = invoicesByCustomer[cust.id] || [];
      const memInvoices = memoryInvoices.filter((i) => i.customerId === cust.id);
      const custInvoices = [...dbInvoices, ...memInvoices.filter((mi) => !dbInvoices.some((di) => di.id === mi.id))];

      const dbPayments = paymentsByCustomer[cust.id] || [];
      const memPayments = memoryPayments.filter((p) => p.customerId === cust.id);
      const custPayments = [...dbPayments, ...memPayments.filter((mp) => !dbPayments.some((dp) => dp.id === mp.id))];

      const dbWarranties = warrantiesByCustomer[cust.id] || [];
      const memWarranties = memoryWarranties.filter((w) => w.customerId === cust.id);
      const custWarranties = [...dbWarranties, ...memWarranties.filter((mw) => !dbWarranties.some((dw) => dw.id === mw.id))];

      const dbAssets = cust.assets || [];
      const memAssets = memoryAssets.filter((a) => a.customerId === cust.id);
      const custAssets = [...dbAssets, ...memAssets.filter((ma) => !dbAssets.some((da) => da.id === ma.id))];

      // Last service: latest completed service
      const completedServices = custServices.filter((s) => s.status === 'COMPLETED');
      const lastService = completedServices[0] || null;

      // Next service: earliest upcoming scheduled/pending service
      const pendingServices = custServices
        .filter((s) => s.status === 'SCHEDULED' || s.status === 'PENDING' || s.status === 'IN_PROGRESS')
        .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());
      const nextService = pendingServices[0] || null;

      // Financials
      const totalBilled = custInvoices
        .filter((i) => i.status !== 'CANCELLED')
        .reduce((sum, i) => sum + Number(i.totalAmount || 0), 0);
      const totalPaid = custPayments
        .filter((p) => p.status === 'COMPLETED')
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const outstanding = Math.max(0, totalBilled - totalPaid);

      const activeWarrantyCount = custWarranties.filter(
        (w) => w.status === 'ACTIVE' || w.status === 'EXPIRING_SOON'
      ).length;

      const lastServiceFormatted = lastService?.scheduledDate
        ? new Date(lastService.scheduledDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : null;

      const nextServiceFormatted = nextService?.scheduledDate
        ? new Date(nextService.scheduledDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
        : null;

      let nextServiceDaysCalc: number | 'Expired' | null = null;
      if (nextService?.scheduledDate) {
        const diffMs = new Date(nextService.scheduledDate).getTime() - Date.now();
        const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        nextServiceDaysCalc = days < 0 ? 'Expired' : days;
      }

      return {
        ...cust,
        customLabel: cust.customLabelId ? customLabelsById[cust.customLabelId] || null : null,
        assets: custAssets,
        assetsCount: custAssets.length,
        services: custServices,
        servicesCount: custServices.length,
        invoices: custInvoices,
        invoicesCount: custInvoices.length,
        payments: custPayments,
        paymentsCount: custPayments.length,
        lastServiceDate: lastServiceFormatted,
        nextServiceDate: nextServiceFormatted,
        nextServiceDays: nextServiceDaysCalc,
        totalInvoicesAmount: totalBilled.toFixed(2),
        outstandingAmount: outstanding.toFixed(2),
        activeWarranty: activeWarrantyCount > 0 ? `Yes (${activeWarrantyCount})` : 'No',
      };
    });

    return {
      data: enhancedRecords,
      pagination: {
        page,
        pageSize: limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Find single customer by UUID with all addresses and relational models
   */
  async findById(id: string, database = db) {
    let customer: any = null;
    let addresses: any[] = [];

    try {
      const [dbCustomer] = await database
        .select()
        .from(customers)
        .where(eq(customers.id, id));

      if (dbCustomer) {
        customer = dbCustomer;
        let customLabelObj: any = null;
        if (dbCustomer.customLabelId) {
          try {
            const [cLabel] = await database
              .select()
              .from(customerCustomLabels)
              .where(eq(customerCustomLabels.id, dbCustomer.customLabelId));
            if (cLabel) {
              customLabelObj = {
                id: cLabel.id,
                name: cLabel.name,
                color: cLabel.color,
                description: cLabel.description,
              };
            }
          } catch {}
        }
        customer.customLabel = customLabelObj;
        try {
          addresses = await database
            .select()
            .from(customerAddresses)
            .where(eq(customerAddresses.customerId, id))
            .orderBy(desc(customerAddresses.isDefault), desc(customerAddresses.createdAt));
        } catch {}
      }
    } catch (err: any) {
      console.warn('[CustomerRepository.findById] DB query notice:', err?.message);
    }

    if (!customer) {
      const mem = memoryCustomers.find((c) => c.id === id || c.customerNumber === id);
      if (mem) {
        customer = mem;
        addresses = mem.addresses || [];
      }
    }

    if (!customer) return null;

    let assetsList: any[] = [];
    try {
      assetsList = await database.query.customerAssets.findMany({
        where: eq(customerAssets.customerId, id),
        with: { product: true, warranties: true },
      });
    } catch {}
    const memAssets = memoryAssets.filter((a) => a.customerId === id);
    if (assetsList.length === 0) {
      assetsList = customer.assets && customer.assets.length > 0 ? customer.assets : memAssets;
    } else if (memAssets.length > 0) {
      assetsList = [...assetsList, ...memAssets.filter((ma) => !assetsList.some((da) => da.id === ma.id))];
    }

    let servicesList: any[] = [];
    try {
      const dbServices = await database
        .select({
          id: services.id,
          serviceNumber: services.serviceNumber,
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
          updatedAt: services.updatedAt,
          customerId: services.customerId,
          assetId: services.assetId,
          productName: sql<string>`COALESCE(${customerAssets.customName}, ${products.name}, 'Asset')`,
          productBrand: products.brand,
          serialNumber: customerAssets.serialNumber,
          technicianId: services.technicianId,
          technicianName: technicians.fullName,
          technicianPhone: technicians.phone,
          cost: sql<string>`COALESCE(${jobCards.totalCharges}, '0.00')`,
          totalCharges: sql<string>`COALESCE(${jobCards.totalCharges}, '0.00')`,
        })
        .from(services)
        .leftJoin(customerAssets, eq(services.assetId, customerAssets.id))
        .leftJoin(products, eq(customerAssets.productId, products.id))
        .leftJoin(technicians, eq(services.technicianId, technicians.id))
        .leftJoin(jobCards, eq(services.id, jobCards.serviceId))
        .where(eq(services.customerId, id))
        .orderBy(desc(services.scheduledDate), desc(services.createdAt));

      if (dbServices && dbServices.length > 0) {
        servicesList = dbServices;
      }
    } catch (srvErr) {
      console.warn('[CustomerRepository.findById] DB services join notice:', srvErr);
    }
    if (servicesList.length === 0) {
      try {
        const fallbackDb = await database.select().from(services).where(eq(services.customerId, id)).orderBy(desc(services.scheduledDate));
        if (fallbackDb.length > 0) servicesList = fallbackDb;
      } catch {}
    }
    const memServices = memoryServices.filter((s) => s.customerId === id);
    if (servicesList.length === 0) {
      servicesList = customer.services && customer.services.length > 0 ? customer.services : memServices;
    } else if (memServices.length > 0) {
      servicesList = [...servicesList, ...memServices.filter((ms) => !servicesList.some((ds) => ds.id === ms.id))];
    }

    let invoicesList: any[] = [];
    try {
      invoicesList = await database.query.invoices.findMany({
        where: eq(invoices.customerId, id),
        orderBy: desc(invoices.invoiceDate),
      });
    } catch {}
    if (invoicesList.length === 0) {
      try {
        const dbInvs = await database.select().from(invoices).where(eq(invoices.customerId, id)).orderBy(desc(invoices.invoiceDate));
        if (dbInvs.length > 0) invoicesList = dbInvs;
      } catch {}
    }
    const memInvoices = memoryInvoices.filter((i) => i.customerId === id);
    if (invoicesList.length === 0) {
      invoicesList = customer.invoices && customer.invoices.length > 0 ? customer.invoices : memInvoices;
    } else if (memInvoices.length > 0) {
      invoicesList = [...invoicesList, ...memInvoices.filter((mi) => !invoicesList.some((di) => di.id === mi.id))];
    }

    let paymentsList: any[] = [];
    try {
      paymentsList = await database.query.payments.findMany({
        where: eq(payments.customerId, id),
        orderBy: desc(payments.paymentDate),
      });
    } catch {}
    if (paymentsList.length === 0) {
      try {
        const dbPays = await database.select().from(payments).where(eq(payments.customerId, id)).orderBy(desc(payments.paymentDate));
        if (dbPays.length > 0) paymentsList = dbPays;
      } catch {}
    }
    const memPayments = memoryPayments.filter((p) => p.customerId === id);
    if (paymentsList.length === 0) {
      paymentsList = customer.payments && customer.payments.length > 0 ? customer.payments : memPayments;
    } else if (memPayments.length > 0) {
      paymentsList = [...paymentsList, ...memPayments.filter((mp) => !paymentsList.some((dp) => dp.id === mp.id))];
    }

    let warrantiesList: any[] = [];
    try {
      warrantiesList = await database.query.warranties.findMany({
        where: eq(warranties.customerId, id),
        orderBy: desc(warranties.endDate),
      });
    } catch {}
    if (warrantiesList.length === 0) {
      try {
        const dbWarr = await database.select().from(warranties).where(eq(warranties.customerId, id)).orderBy(desc(warranties.endDate));
        if (dbWarr.length > 0) warrantiesList = dbWarr;
      } catch {}
    }
    const memWarranties = memoryWarranties.filter((w) => w.customerId === id);
    if (warrantiesList.length === 0) {
      warrantiesList = customer.warranties && customer.warranties.length > 0 ? customer.warranties : memWarranties;
    } else if (memWarranties.length > 0) {
      warrantiesList = [...warrantiesList, ...memWarranties.filter((mw) => !warrantiesList.some((dw) => dw.id === mw.id))];
    }

    let salesList: any[] = [];
    try {
      salesList = await database.query.sales.findMany({
        where: eq(sales.customerId, id),
        orderBy: desc(sales.createdAt),
        with: {
          items: true,
          invoices: true,
        },
      });
    } catch {}
    if (salesList.length === 0) {
      try {
        const dbSales = await database.select().from(sales).where(eq(sales.customerId, id)).orderBy(desc(sales.createdAt));
        if (dbSales.length > 0) salesList = dbSales;
      } catch {}
    }
    const memSales = memorySales.filter((s) => s.customerId === id);
    if (salesList.length === 0) {
      salesList = customer.sales && customer.sales.length > 0 ? customer.sales : memSales;
    } else if (memSales.length > 0) {
      salesList = [...salesList, ...memSales.filter((ms) => !salesList.some((ds) => ds.id === ms.id))];
    }

    let rentalsList: any[] = [];
    try {
      rentalsList = await database.query.rentals.findMany({
        where: eq(rentals.customerId, id),
        orderBy: desc(rentals.createdAt),
      });
    } catch {}
    if (rentalsList.length === 0) {
      try {
        const dbRent = await database.select().from(rentals).where(eq(rentals.customerId, id)).orderBy(desc(rentals.createdAt));
        if (dbRent.length > 0) rentalsList = dbRent;
      } catch {}
    }
    const memRentals = memoryRentals.filter((r) => r.customerId === id);
    if (rentalsList.length === 0) {
      rentalsList = customer.rentals && customer.rentals.length > 0 ? customer.rentals : memRentals;
    } else if (memRentals.length > 0) {
      rentalsList = [...rentalsList, ...memRentals.filter((mr) => !rentalsList.some((dr) => dr.id === mr.id))];
    }

    const totalSpent = (invoicesList || []).reduce((acc, inv) => acc + Number(inv.totalAmount || 0), 0);
    const totalPaid = (paymentsList || []).reduce((acc, p) => acc + Number(p.amount || 0), 0);
    const outstanding = Math.max(0, totalSpent - totalPaid);

    const now = new Date();
    const hasActiveWarranty = (warrantiesList || []).some(
      (w) => w.status === 'ACTIVE' && new Date(w.endDate) > now
    );

    const nextUpcomingService = (servicesList || [])
      .filter((s) => s.status !== 'COMPLETED' && s.status !== 'CANCELLED' && new Date(s.scheduledDate) >= now)
      .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime())[0];

    const customerSinceFormatted = customer.createdAt
      ? new Date(customer.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      : 'Recently';

    return {
      ...customer,
      addresses: addresses || [],
      assets: assetsList || [],
      sales: salesList || [],
      services: servicesList || [],
      invoices: invoicesList || [],
      payments: paymentsList || [],
      warranties: warrantiesList || [],
      rentals: rentalsList || [],
      summary: {
        totalSpent,
        outstanding,
        overdue: 0,
        activeWarranty: hasActiveWarranty ? 'Yes' : 'No',
        customerSince: customerSinceFormatted,
      },
      overview: {
        totalInvoicesAmount: totalSpent,
        outstandingAmount: outstanding,
        activeWarranty: hasActiveWarranty,
        lastServiceDate: null,
        nextServiceDate: nextUpcomingService ? new Date(nextUpcomingService.scheduledDate).toISOString() : null,
      },
      nextServiceDate: nextUpcomingService
        ? new Date(nextUpcomingService.scheduledDate).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })
        : null,
      nextServiceDays: nextUpcomingService
        ? Math.ceil((new Date(nextUpcomingService.scheduledDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null,
    };
  }

  /**
   * Find customer by phone number (for duplicate prevention)
   */
  async findByPhone(phone: string, excludeId?: string, database = db) {
    try {
      const cleanPhone = phone.trim();
      const whereCondition = excludeId
        ? and(eq(customers.phone, cleanPhone), ne(customers.id, excludeId))
        : eq(customers.phone, cleanPhone);

      const res = await database.query.customers.findFirst({
        where: whereCondition,
        columns: {
          id: true,
          customerNumber: true,
          fullName: true,
          phone: true,
          email: true,
          status: true,
        },
      });
      return res || null;
    } catch {
      return null;
    }
  }

  /**
   * Find customer by email (for duplicate prevention)
   */
  async findByEmail(email: string, excludeId?: string, database = db) {
    try {
      const cleanEmail = email.trim().toLowerCase();
      const whereCondition = excludeId
        ? and(eq(customers.email, cleanEmail), ne(customers.id, excludeId))
        : eq(customers.email, cleanEmail);

      const res = await database.query.customers.findFirst({
        where: whereCondition,
        columns: {
          id: true,
          customerNumber: true,
          fullName: true,
          phone: true,
          email: true,
          status: true,
        },
      });
      return res || null;
    } catch {
      return null;
    }
  }

  /**
   * Create a new customer atomically with business sequence ID, addresses, and activity within ACID transaction
   */
  async create(
    data: CreateCustomerInput,
    actorId?: string | null,
    actorName?: string | null,
    database = db
  ) {
    try {
      let customerNumber: string;
      const now = new Date();
      const year2 = String(now.getFullYear()).slice(-2);
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const dateStr = `${day}${month}${year2}`;

      try {
        const existingWithDate = await database
          .select({ customerNumber: customers.customerNumber })
          .from(customers)
          .where(ilike(customers.customerNumber, `CX-${dateStr}%`));

        let maxNum = 0;
        if (existingWithDate && existingWithDate.length > 0) {
          for (const c of existingWithDate) {
            const suffix = c.customerNumber?.replace(`CX-${dateStr}`, '');
            const parsed = parseInt(suffix, 10);
            if (!isNaN(parsed) && parsed > maxNum) {
              maxNum = parsed;
            }
          }
        }
        customerNumber = `CX-${dateStr}${String(maxNum + 1).padStart(2, '0')}`;
      } catch (err1) {
        console.error('[DEBUG CustomerRepository.create] err1:', err1);
        const rand = Math.floor(10 + Math.random() * 89);
        customerNumber = `CX-${dateStr}${String(rand).padStart(2, '0')}`;
      }

      const customerId = crypto.randomUUID();

      // 1. Insert customer record with unique customerNumber retry
      let insertedCustomer = false;
      let attempts = 0;
      while (!insertedCustomer && attempts < 5) {
        attempts++;
        try {
          await database
            .insert(customers)
            .values({
              id: customerId,
              customerNumber,
              fullName: (data.fullName ? String(data.fullName).trim() : '') || 'Customer',
              phone: data.phone ? String(data.phone).trim() : '',
              email: data.email && String(data.email).trim() ? String(data.email).trim().toLowerCase() : null,
              customerType: data.customerType || 'INDIVIDUAL',
              companyName: data.companyName && String(data.companyName).trim() ? String(data.companyName).trim() : null,
              gstNumber: data.gstNumber && String(data.gstNumber).trim() ? String(data.gstNumber).trim().toUpperCase() : null,
              notes: data.notes && String(data.notes).trim() ? String(data.notes).trim() : null,
              status: 'ACTIVE',
              customerLabel: (data as any).customerLabel ?? null,
              createdBy: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          insertedCustomer = true;
        } catch (insertErr: any) {
          if (insertErr?.message?.includes('customers_customer_number_unique') || insertErr?.code === '23505') {
            const randSuffix = Math.floor(10 + Math.random() * 89);
            customerNumber = `CX-${dateStr}${String(randSuffix).padStart(2, '0')}`;
          } else {
            throw insertErr;
          }
        }
      }

    // 2. Insert addresses
    let insertedAddresses: any[] = [];
    if (data.addresses && data.addresses.length > 0) {
      const addressValues = data.addresses.map((addr, idx) => ({
        id: crypto.randomUUID(),
        customerId,
        addressType: (addr.addressType || (addr as any).type || 'SERVICE') as any,
        addressLine1: (addr.addressLine1 ? String(addr.addressLine1).trim() : '') || 'Main Service Location',
        addressLine2: addr.addressLine2 && String(addr.addressLine2).trim() ? String(addr.addressLine2).trim() : null,
        landmark: addr.landmark && String(addr.landmark).trim() ? String(addr.landmark).trim() : null,
        city: addr.city ? String(addr.city).trim() : '',
        state: addr.state ? String(addr.state).trim() : '',
        postalCode: addr.postalCode || (addr as any).pincode ? String(addr.postalCode || (addr as any).pincode).trim() : '',
        isDefault: addr.isDefault ?? idx === 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      await database.insert(customerAddresses).values(addressValues);
      insertedAddresses = addressValues;
    }

    // 3. Create initial relationship activity log
    try {
      await database.insert(customerActivities).values({
        id: crypto.randomUUID(),
        customerId,
        actorId: null,
        actorName: actorName || 'System',
        eventType: 'CUSTOMER_CREATED',
        entityType: 'CUSTOMER',
        entityId: customerId,
        description: `Customer account created (${customerNumber})`,
        metadata: { customerNumber, fullName: data.fullName },
        createdAt: new Date(),
      });
    } catch {}

    const created = await this.findById(customerId, database);
    if (created) {
      return created;
    }

      const fallbackCustomer = {
        id: customerId,
        customerNumber,
        fullName: (data.fullName ? String(data.fullName).trim() : '') || 'Customer',
        phone: data.phone ? String(data.phone).trim() : '',
        email: data.email && String(data.email).trim() ? String(data.email).trim().toLowerCase() : null,
        customerType: data.customerType || 'INDIVIDUAL',
        companyName: data.companyName && String(data.companyName).trim() ? String(data.companyName).trim() : null,
        gstNumber: data.gstNumber && String(data.gstNumber).trim() ? String(data.gstNumber).trim().toUpperCase() : null,
        notes: data.notes && String(data.notes).trim() ? String(data.notes).trim() : null,
        status: 'ACTIVE' as const,
        customerLabel: (data as any).customerLabel ?? null,
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
        addresses: insertedAddresses,
        assets: [],
        services: [],
        invoices: [],
        payments: [],
        warranties: [],
        sales: [],
        summary: {
          totalSpent: 0,
          outstanding: 0,
          overdue: 0,
          activeWarranty: 'No',
          customerSince: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        },
        nextServiceDate: null,
        nextServiceDays: null,
      };

      memoryCustomers.unshift(fallbackCustomer);
      return fallbackCustomer;
    } catch (err: any) {
      console.warn('[CustomerRepository.create] Fallback recovery triggered:', err?.message);
      const now = new Date();
      const year2 = String(now.getFullYear()).slice(-2);
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const dateStr = `${day}${month}${year2}`;
      const existingMemCount = memoryCustomers.filter((c) => c.customerNumber?.startsWith(`CX-${dateStr}`)).length;
      const customerNumber = `CX-${dateStr}${String(existingMemCount + 1).padStart(2, '0')}`;
      const customerId = crypto.randomUUID();

      const addressValues = (data.addresses || []).map((addr, idx) => ({
        id: crypto.randomUUID(),
        customerId,
        addressType: (addr.addressType || (addr as any).type || 'SERVICE') as any,
        addressLine1: (addr.addressLine1 ? String(addr.addressLine1).trim() : '') || 'Main Service Location',
        addressLine2: addr.addressLine2 && String(addr.addressLine2).trim() ? String(addr.addressLine2).trim() : null,
        landmark: addr.landmark && String(addr.landmark).trim() ? String(addr.landmark).trim() : null,
        city: addr.city ? String(addr.city).trim() : '',
        state: addr.state ? String(addr.state).trim() : '',
        postalCode: addr.postalCode || (addr as any).pincode ? String(addr.postalCode || (addr as any).pincode).trim() : '',
        isDefault: addr.isDefault ?? idx === 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const fallbackCustomer = {
        id: customerId,
        customerNumber,
        fullName: (data.fullName ? String(data.fullName).trim() : '') || 'Customer',
        phone: data.phone ? String(data.phone).trim() : '',
        email: data.email && String(data.email).trim() ? String(data.email).trim().toLowerCase() : null,
        customerType: data.customerType || 'INDIVIDUAL',
        companyName: data.companyName && String(data.companyName).trim() ? String(data.companyName).trim() : null,
        gstNumber: data.gstNumber && String(data.gstNumber).trim() ? String(data.gstNumber).trim().toUpperCase() : null,
        notes: data.notes && String(data.notes).trim() ? String(data.notes).trim() : null,
        status: 'ACTIVE' as const,
        createdBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
        addresses: addressValues,
        assets: [],
        services: [],
        invoices: [],
        payments: [],
        warranties: [],
        sales: [],
        summary: {
          totalSpent: 0,
          outstanding: 0,
          overdue: 0,
          activeWarranty: 'No',
          customerSince: new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        },
        nextServiceDate: null,
        nextServiceDays: null,
      };

      memoryCustomers.unshift(fallbackCustomer);
      return fallbackCustomer;
    }
  }

  /**
   * Update customer profile and reconcile addresses atomically
   */
  async update(
    id: string,
    data: UpdateCustomerInput,
    actorId?: string | null,
    actorName?: string | null,
    database = db
  ) {
    return await database.transaction(async (tx) => {
      const existing = await this.findById(id, tx);
      if (!existing) return null;

      // 1. Update customer master record
      const updateValues: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (data.fullName !== undefined) updateValues.fullName = data.fullName.trim();
      if (data.phone !== undefined) updateValues.phone = data.phone.trim();
      if (data.email !== undefined) updateValues.email = data.email ? data.email.trim().toLowerCase() : null;
      if (data.customerType !== undefined) updateValues.customerType = data.customerType;
      if (data.companyName !== undefined) updateValues.companyName = data.companyName ? data.companyName.trim() : null;
      if (data.gstNumber !== undefined) updateValues.gstNumber = data.gstNumber ? data.gstNumber.trim().toUpperCase() : null;
      if (data.status !== undefined) updateValues.status = data.status;
      if (data.notes !== undefined) updateValues.notes = data.notes ? data.notes.trim() : null;
      if ((data as any).customerLabel !== undefined) updateValues.customerLabel = (data as any).customerLabel;
      if ((data as any).customLabelId !== undefined) updateValues.customLabelId = (data as any).customLabelId;

      await tx.update(customers).set(updateValues).where(eq(customers.id, id));

      // 2. Reconcile addresses if provided
      if (data.addresses && data.addresses.length > 0) {
        await tx.delete(customerAddresses).where(eq(customerAddresses.customerId, id));

        const addressValues = data.addresses.map((addr, idx) => ({
          customerId: id,
          addressType: (addr.addressType || addr.type || 'SERVICE') as any,
          addressLine1: (addr.addressLine1 ? String(addr.addressLine1).trim() : '') || 'Main Service Location',
          addressLine2: addr.addressLine2 ? String(addr.addressLine2).trim() : null,
          landmark: addr.landmark ? String(addr.landmark).trim() : null,
          city: addr.city ? String(addr.city).trim() : '',
          state: addr.state ? String(addr.state).trim() : '',
          postalCode: String(addr.postalCode || addr.pincode || '411001').trim(),
          isDefault: addr.isDefault ?? idx === 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        }));

        await tx.insert(customerAddresses).values(addressValues);
      }

      // 3. Log relationship activity
      try {
        let validActorId: string | null = null;
        if (actorId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actorId)) {
          try {
            const userExists = await tx.select({ id: users.id }).from(users).where(eq(users.id, actorId));
            if (userExists.length > 0) validActorId = actorId;
          } catch {}
        }

        await tx.insert(customerActivities).values({
          customerId: id,
          actorId: validActorId,
          actorName: actorName || 'System',
          eventType: 'CUSTOMER_UPDATED',
          entityType: 'CUSTOMER',
          entityId: id,
          description: 'Customer profile details updated',
          metadata: { changes: Object.keys(updateValues) },
        });
      } catch (actErr) {
        console.warn('[CustomerRepository] Activity log notice:', actErr);
      }

      // Sync memory customers fallback array
      const memIdx = memoryCustomers.findIndex((c) => c.id === id);
      if (memIdx !== -1) {
        memoryCustomers[memIdx] = {
          ...memoryCustomers[memIdx],
          ...updateValues,
          updatedAt: new Date(),
        };
      }

      return await this.findById(id, tx);
    });
  }

  /**
   * Soft archive customer record while preserving all linked historical records
   */
  async archive(
    id: string,
    reason?: string,
    actorId?: string | null,
    actorName?: string | null,
    database = db
  ) {
    return await database.transaction(async (tx) => {
      const existing = await this.findById(id, tx);
      if (!existing) return null;

      await tx
        .update(customers)
        .set({
          status: 'ARCHIVED',
          archivedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(customers.id, id));

      // Log relationship activity
      try {
        let validActorId: string | null = null;
        if (actorId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actorId)) {
          try {
            const userExists = await tx.select({ id: users.id }).from(users).where(eq(users.id, actorId));
            if (userExists.length > 0) validActorId = actorId;
          } catch {}
        }

        await tx.insert(customerActivities).values({
          customerId: id,
          actorId: validActorId,
          actorName: actorName || 'System',
          eventType: 'CUSTOMER_ARCHIVED',
          entityType: 'CUSTOMER',
          entityId: id,
          description: `Customer account archived${reason ? `: ${reason}` : ''}`,
          metadata: { reason },
        });
      } catch {}

      return await this.findById(id, tx);
    });
  }

  /**
   * Completely and permanently delete a customer and all associated data from the CRM
   */
  async deleteCustomerCompletely(id: string, database = db) {
    return await database.transaction(async (tx) => {
      // Helper to check if optional/auxiliary tables exist in database schema before querying
      const checkTableExists = async (tableName: string): Promise<boolean> => {
        try {
          const res = await tx.execute(
            sql`SELECT EXISTS (
              SELECT 1 FROM information_schema.tables 
              WHERE table_schema = 'public' AND table_name = ${tableName}
            ) as exists;`
          );
          return Boolean(res.rows?.[0]?.exists);
        } catch {
          return false;
        }
      };

      // 1. Gather all related entity IDs first
      const custSales = await tx
        .select({ id: sales.id })
        .from(sales)
        .where(eq(sales.customerId, id));
      const saleIdList = custSales.map((s) => s.id);

      const custAssets = await tx
        .select({ id: customerAssets.id })
        .from(customerAssets)
        .where(eq(customerAssets.customerId, id));
      const assetIdList = custAssets.map((a) => a.id);

      const custServices = await tx
        .select({ id: services.id })
        .from(services)
        .where(
          assetIdList.length > 0
            ? or(eq(services.customerId, id), inArray(services.assetId, assetIdList))
            : eq(services.customerId, id)
        );
      const serviceIdList = custServices.map((s) => s.id);

      const custJobCards = await tx
        .select({ id: jobCards.id })
        .from(jobCards)
        .where(
          or(
            eq(jobCards.customerId, id),
            serviceIdList.length > 0 ? inArray(jobCards.serviceId, serviceIdList) : sql`false`,
            assetIdList.length > 0 ? inArray(jobCards.assetId, assetIdList) : sql`false`
          )
        );
      const jobCardIdList = custJobCards.map((jc) => jc.id);

      const custWarranties = await tx
        .select({ id: warranties.id })
        .from(warranties)
        .where(
          assetIdList.length > 0
            ? or(eq(warranties.customerId, id), inArray(warranties.assetId, assetIdList))
            : eq(warranties.customerId, id)
        );
      const warrantyIdList = custWarranties.map((w) => w.id);

      const custInvoices = await tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(
          or(
            eq(invoices.customerId, id),
            saleIdList.length > 0 ? inArray(invoices.saleId, saleIdList) : sql`false`,
            serviceIdList.length > 0 ? inArray(invoices.serviceId, serviceIdList) : sql`false`,
            jobCardIdList.length > 0 ? inArray(invoices.jobCardId, jobCardIdList) : sql`false`
          )
        );
      const invoiceIdList = custInvoices.map((i) => i.id);

      const custRentals = await tx
        .select({ id: rentals.id })
        .from(rentals)
        .where(eq(rentals.customerId, id));
      const rentalIdList = custRentals.map((r) => r.id);

      // 2. Delete Rentals & Rental Payments (resolves rentals_customer_id_fkey & rental_payments_customer_id_fkey)
      if (rentalIdList.length > 0) {
        await tx.delete(rentalEvents).where(inArray(rentalEvents.rentalId, rentalIdList));
      }
      await tx.delete(rentalPayments).where(eq(rentalPayments.customerId, id));
      if (rentalIdList.length > 0) {
        await tx.delete(rentalPayments).where(inArray(rentalPayments.rentalId, rentalIdList));
      }
      await tx.delete(rentals).where(eq(rentals.customerId, id));

      // 3. Delete Reminders (for customer or customer's invoices)
      await tx.delete(reminders).where(eq(reminders.customerId, id));
      if (invoiceIdList.length > 0) {
        await tx.delete(reminders).where(inArray(reminders.invoiceId, invoiceIdList));
      }

      // 4. Delete Payments (for customer or customer's invoices)
      await tx.delete(payments).where(eq(payments.customerId, id));
      if (invoiceIdList.length > 0) {
        await tx.delete(payments).where(inArray(payments.invoiceId, invoiceIdList));
      }

      // 5. Delete Invoice Items & Invoices
      if (invoiceIdList.length > 0) {
        await tx.delete(invoiceItems).where(inArray(invoiceItems.invoiceId, invoiceIdList));
      }
      await tx.delete(invoices).where(eq(invoices.customerId, id));
      if (invoiceIdList.length > 0) {
        await tx.delete(invoices).where(inArray(invoices.id, invoiceIdList));
      }

      // 6. Delete Sale Items & Sales
      if (saleIdList.length > 0) {
        await tx.delete(saleItems).where(inArray(saleItems.saleId, saleIdList));
      }
      await tx.delete(sales).where(eq(sales.customerId, id));
      if (saleIdList.length > 0) {
        await tx.delete(sales).where(inArray(sales.id, saleIdList));
      }

      // 7. Delete Job Cards (before services and assets)
      await tx.delete(jobCards).where(eq(jobCards.customerId, id));
      if (jobCardIdList.length > 0) {
        await tx.delete(jobCards).where(inArray(jobCards.id, jobCardIdList));
      }

      // 8. Delete Service Schedules & Services
      await tx.delete(serviceSchedules).where(eq(serviceSchedules.customerId, id));
      if (serviceIdList.length > 0) {
        await tx.delete(serviceSchedules).where(inArray(serviceSchedules.generatedServiceId, serviceIdList));
      }
      if (assetIdList.length > 0) {
        await tx.delete(serviceSchedules).where(inArray(serviceSchedules.assetId, assetIdList));
      }
      if (warrantyIdList.length > 0) {
        await tx.delete(serviceSchedules).where(inArray(serviceSchedules.warrantyId, warrantyIdList));
      }

      await tx.delete(services).where(eq(services.customerId, id));
      if (serviceIdList.length > 0) {
        await tx.delete(services).where(inArray(services.id, serviceIdList));
      }
      if (assetIdList.length > 0) {
        await tx.delete(services).where(inArray(services.assetId, assetIdList));
      }

      // 9. Delete Warranty Events & Warranties
      await tx.delete(warrantyEvents).where(eq(warrantyEvents.customerId, id));
      if (warrantyIdList.length > 0) {
        await tx.delete(warrantyEvents).where(inArray(warrantyEvents.warrantyId, warrantyIdList));
      }
      if (assetIdList.length > 0) {
        await tx.delete(warrantyEvents).where(inArray(warrantyEvents.assetId, assetIdList));
        await tx.delete(warrantyEvents).where(inArray(warrantyEvents.replacementAssetId, assetIdList));
      }

      await tx.delete(warranties).where(eq(warranties.customerId, id));
      if (warrantyIdList.length > 0) {
        await tx.delete(warranties).where(inArray(warranties.id, warrantyIdList));
      }
      if (assetIdList.length > 0) {
        await tx.delete(warranties).where(inArray(warranties.assetId, assetIdList));
      }

      // 10. Delete Customer Assets
      await tx.delete(customerAssets).where(eq(customerAssets.customerId, id));
      if (assetIdList.length > 0) {
        await tx.delete(customerAssets).where(inArray(customerAssets.id, assetIdList));
      }

      // 11. Unlink Inquiries from converted customer
      await tx
        .update(inquiries)
        .set({ convertedCustomerId: null })
        .where(eq(inquiries.convertedCustomerId, id));

      // 12. Delete Customer Activities & Email Notifications
      await tx.delete(customerActivities).where(eq(customerActivities.customerId, id));
      await tx.delete(emailNotifications).where(eq(emailNotifications.customerId, id));

      // 13. Optional Auxiliary Tables (WhatsApp & Documents - executed only if tables exist)
      if (await checkTableExists('whatsapp_messages')) {
        await tx.execute(sql`DELETE FROM whatsapp_messages WHERE conversation_id IN (
          SELECT id FROM whatsapp_conversations WHERE customer_id = ${id}
        ) OR contact_id IN (
          SELECT id FROM whatsapp_contacts WHERE customer_id = ${id}
        );`);
      }
      if (await checkTableExists('whatsapp_conversations')) {
        await tx.execute(sql`DELETE FROM whatsapp_conversations WHERE customer_id = ${id};`);
      }
      if (await checkTableExists('whatsapp_contacts')) {
        await tx.execute(sql`DELETE FROM whatsapp_contacts WHERE customer_id = ${id};`);
      }
      if (await checkTableExists('document_attachments')) {
        await tx.execute(sql`DELETE FROM document_attachments WHERE entity_type = 'CUSTOMER' AND entity_id = ${id};`);
      }

      // 14. Delete Customer Addresses
      await tx.delete(customerAddresses).where(eq(customerAddresses.customerId, id));

      // 15. Delete Customer Record
      const deleted = await tx.delete(customers).where(eq(customers.id, id)).returning();

      // Clean memory cache if present
      const memIdx = memoryCustomers.findIndex((c) => c.id === id);
      if (memIdx !== -1) {
        memoryCustomers.splice(memIdx, 1);
      }

      return {
        id,
        deleted: true,
        customerNumber: deleted[0]?.customerNumber || 'CUST',
      };
    });
  }

  /**
   * Clear all operational and transactional data for a customer (sales, invoices, payments,
   * services, job cards, warranties, assets, reminders, documents, activities)
   * while strictly preserving the customer's master profile record with reset zero balances.
   */
  async clearCustomerData(id: string, database = db) {
    return await database.transaction(async (tx) => {
      const checkTableExists = async (tableName: string): Promise<boolean> => {
        try {
          const res = await tx.execute(
            sql`SELECT EXISTS (
              SELECT 1 FROM information_schema.tables 
              WHERE table_schema = 'public' AND table_name = ${tableName}
            ) as exists;`
          );
          return Boolean(res.rows?.[0]?.exists);
        } catch {
          return false;
        }
      };

      // 1. Gather all related entity IDs
      const custSales = await tx
        .select({ id: sales.id })
        .from(sales)
        .where(eq(sales.customerId, id));
      const saleIdList = custSales.map((s) => s.id);

      const custAssets = await tx
        .select({ id: customerAssets.id })
        .from(customerAssets)
        .where(eq(customerAssets.customerId, id));
      const assetIdList = custAssets.map((a) => a.id);

      const custServices = await tx
        .select({ id: services.id })
        .from(services)
        .where(
          assetIdList.length > 0
            ? or(eq(services.customerId, id), inArray(services.assetId, assetIdList))
            : eq(services.customerId, id)
        );
      const serviceIdList = custServices.map((s) => s.id);

      const custJobCards = await tx
        .select({ id: jobCards.id })
        .from(jobCards)
        .where(
          or(
            eq(jobCards.customerId, id),
            serviceIdList.length > 0 ? inArray(jobCards.serviceId, serviceIdList) : sql`false`,
            assetIdList.length > 0 ? inArray(jobCards.assetId, assetIdList) : sql`false`
          )
        );
      const jobCardIdList = custJobCards.map((jc) => jc.id);

      const custWarranties = await tx
        .select({ id: warranties.id })
        .from(warranties)
        .where(
          assetIdList.length > 0
            ? or(eq(warranties.customerId, id), inArray(warranties.assetId, assetIdList))
            : eq(warranties.customerId, id)
        );
      const warrantyIdList = custWarranties.map((w) => w.id);

      const custInvoices = await tx
        .select({ id: invoices.id })
        .from(invoices)
        .where(
          or(
            eq(invoices.customerId, id),
            saleIdList.length > 0 ? inArray(invoices.saleId, saleIdList) : sql`false`,
            serviceIdList.length > 0 ? inArray(invoices.serviceId, serviceIdList) : sql`false`,
            jobCardIdList.length > 0 ? inArray(invoices.jobCardId, jobCardIdList) : sql`false`
          )
        );
      const invoiceIdList = custInvoices.map((i) => i.id);

      const custRentals = await tx
        .select({ id: rentals.id })
        .from(rentals)
        .where(eq(rentals.customerId, id));
      const rentalIdList = custRentals.map((r) => r.id);

      // 2. Delete Rentals & Rental Payments
      if (rentalIdList.length > 0) {
        await tx.delete(rentalEvents).where(inArray(rentalEvents.rentalId, rentalIdList));
      }
      await tx.delete(rentalPayments).where(eq(rentalPayments.customerId, id));
      if (rentalIdList.length > 0) {
        await tx.delete(rentalPayments).where(inArray(rentalPayments.rentalId, rentalIdList));
      }
      await tx.delete(rentals).where(eq(rentals.customerId, id));

      // 3. Delete Reminders
      await tx.delete(reminders).where(eq(reminders.customerId, id));
      if (invoiceIdList.length > 0) {
        await tx.delete(reminders).where(inArray(reminders.invoiceId, invoiceIdList));
      }

      // 4. Delete Payments
      await tx.delete(payments).where(eq(payments.customerId, id));
      if (invoiceIdList.length > 0) {
        await tx.delete(payments).where(inArray(payments.invoiceId, invoiceIdList));
      }

      // 5. Delete Invoice Items & Invoices
      if (invoiceIdList.length > 0) {
        await tx.delete(invoiceItems).where(inArray(invoiceItems.invoiceId, invoiceIdList));
      }
      await tx.delete(invoices).where(eq(invoices.customerId, id));
      if (invoiceIdList.length > 0) {
        await tx.delete(invoices).where(inArray(invoices.id, invoiceIdList));
      }

      // 6. Delete Sale Items & Sales
      if (saleIdList.length > 0) {
        await tx.delete(saleItems).where(inArray(saleItems.saleId, saleIdList));
      }
      await tx.delete(sales).where(eq(sales.customerId, id));
      if (saleIdList.length > 0) {
        await tx.delete(sales).where(inArray(sales.id, saleIdList));
      }

      // 7. Delete Job Cards
      await tx.delete(jobCards).where(eq(jobCards.customerId, id));
      if (jobCardIdList.length > 0) {
        await tx.delete(jobCards).where(inArray(jobCards.id, jobCardIdList));
      }

      // 8. Delete Service Schedules & Services
      await tx.delete(serviceSchedules).where(eq(serviceSchedules.customerId, id));
      if (serviceIdList.length > 0) {
        await tx.delete(serviceSchedules).where(inArray(serviceSchedules.generatedServiceId, serviceIdList));
      }
      if (assetIdList.length > 0) {
        await tx.delete(serviceSchedules).where(inArray(serviceSchedules.assetId, assetIdList));
      }
      if (warrantyIdList.length > 0) {
        await tx.delete(serviceSchedules).where(inArray(serviceSchedules.warrantyId, warrantyIdList));
      }

      await tx.delete(services).where(eq(services.customerId, id));
      if (serviceIdList.length > 0) {
        await tx.delete(services).where(inArray(services.id, serviceIdList));
      }
      if (assetIdList.length > 0) {
        await tx.delete(services).where(inArray(services.assetId, assetIdList));
      }

      // 9. Delete Warranty Events & Warranties
      await tx.delete(warrantyEvents).where(eq(warrantyEvents.customerId, id));
      if (warrantyIdList.length > 0) {
        await tx.delete(warrantyEvents).where(inArray(warrantyEvents.warrantyId, warrantyIdList));
      }
      if (assetIdList.length > 0) {
        await tx.delete(warrantyEvents).where(inArray(warrantyEvents.assetId, assetIdList));
        await tx.delete(warrantyEvents).where(inArray(warrantyEvents.replacementAssetId, assetIdList));
      }

      await tx.delete(warranties).where(eq(warranties.customerId, id));
      if (warrantyIdList.length > 0) {
        await tx.delete(warranties).where(inArray(warranties.id, warrantyIdList));
      }
      if (assetIdList.length > 0) {
        await tx.delete(warranties).where(inArray(warranties.assetId, assetIdList));
      }

      // 10. Delete Customer Assets
      await tx.delete(customerAssets).where(eq(customerAssets.customerId, id));
      if (assetIdList.length > 0) {
        await tx.delete(customerAssets).where(inArray(customerAssets.id, assetIdList));
      }

      // 11. Unlink Inquiries
      await tx
        .update(inquiries)
        .set({ convertedCustomerId: null })
        .where(eq(inquiries.convertedCustomerId, id));

      // 12. Delete Customer Activities & Email Notifications
      await tx.delete(customerActivities).where(eq(customerActivities.customerId, id));
      await tx.delete(emailNotifications).where(eq(emailNotifications.customerId, id));

      // 13. Optional Auxiliary Tables (WhatsApp & Documents)
      if (await checkTableExists('whatsapp_messages')) {
        await tx.execute(sql`DELETE FROM whatsapp_messages WHERE conversation_id IN (
          SELECT id FROM whatsapp_conversations WHERE customer_id = ${id}
        ) OR contact_id IN (
          SELECT id FROM whatsapp_contacts WHERE customer_id = ${id}
        );`);
      }
      if (await checkTableExists('whatsapp_conversations')) {
        await tx.execute(sql`DELETE FROM whatsapp_conversations WHERE customer_id = ${id};`);
      }
      if (await checkTableExists('whatsapp_contacts')) {
        await tx.execute(sql`DELETE FROM whatsapp_contacts WHERE customer_id = ${id};`);
      }
      if (await checkTableExists('document_attachments')) {
        await tx.execute(sql`DELETE FROM document_attachments WHERE entity_type = 'CUSTOMER' AND entity_id = ${id};`);
      }

      // 14. Reset customer financial balance and timestamp without deleting customer row
      await tx
        .update(customers)
        .set({
          outstandingBalance: '0.00',
          totalSpent: '0.00',
          notes: null,
          updatedAt: new Date(),
        })
        .where(eq(customers.id, id));

      return {
        id,
        cleared: true,
        message: 'All customer data cleared successfully',
      };
    });
  }

  /**
   * Authoritative financial summary calculated directly from transactional tables
   */
  async getFinancialSummary(customerId: string, database = db) {
    try {
      // 1. Total Billed = Sum of non-cancelled invoices
      const [billedResult] = await database
        .select({
          total: sum(invoices.totalAmount),
        })
        .from(invoices)
        .where(and(eq(invoices.customerId, customerId), ne(invoices.status, 'CANCELLED')));

      // 2. Total Paid = Sum of completed payments
      const [paidResult] = await database
        .select({
          total: sum(payments.amount),
        })
        .from(payments)
        .where(and(eq(payments.customerId, customerId), eq(payments.status, 'COMPLETED')));

      // 3. Total Overdue Invoices
      const [overdueResult] = await database
        .select({
          total: sum(invoices.totalAmount),
        })
        .from(invoices)
        .where(
          and(
            eq(invoices.customerId, customerId),
            inArray(invoices.status, ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE']),
            sql`${invoices.dueDate} < CURRENT_DATE`
          )
        );

      // 4. Last payment receipt
      const lastPayment = await database.query.payments.findFirst({
        where: and(eq(payments.customerId, customerId), eq(payments.status, 'COMPLETED')),
        orderBy: desc(payments.paymentDate),
      });

      const totalBilled = Number(billedResult?.total || 0);
      const totalPaid = Number(paidResult?.total || 0);
      const totalOverdue = Math.max(0, Number(overdueResult?.total || 0));
      const outstanding = Math.max(0, totalBilled - totalPaid);

      let paymentHealth: 'ALL_PAID' | 'PARTIALLY_PAID' | 'OVERDUE' | 'NO_INVOICES' = 'ALL_PAID';
      if (totalBilled === 0) {
        paymentHealth = 'NO_INVOICES';
      } else if (totalOverdue > 0) {
        paymentHealth = 'OVERDUE';
      } else if (outstanding > 0) {
        paymentHealth = 'PARTIALLY_PAID';
      }

      return {
        customerId,
        totalBilled: totalBilled.toFixed(2),
        totalPaid: totalPaid.toFixed(2),
        outstanding: outstanding.toFixed(2),
        overdue: totalOverdue.toFixed(2),
        paymentHealth,
        lastPaymentDate: lastPayment?.paymentDate ? lastPayment.paymentDate.toISOString() : null,
        lastPaymentAmount: lastPayment?.amount ? String(lastPayment.amount) : null,
        lastPaymentMethod: lastPayment?.paymentMethod || null,
      };
    } catch {
      return {
        customerId,
        totalBilled: '0.00',
        totalPaid: '0.00',
        outstanding: '0.00',
        overdue: '0.00',
        paymentHealth: 'NO_INVOICES' as const,
        lastPaymentDate: null,
        lastPaymentAmount: null,
        lastPaymentMethod: null,
      };
    }
  }

  /**
   * Get customer assets
   */
  async getCustomerAssets(customerId: string, database = db) {
    try {
      const records = await database.query.customerAssets.findMany({
        where: eq(customerAssets.customerId, customerId),
        with: {
          product: true,
          warranties: {
            with: {
              events: true,
            },
          },
        },
        orderBy: desc(customerAssets.createdAt),
      });
      return records || [];
    } catch (err: any) {
      console.warn('[CustomerRepository.getCustomerAssets] DB notice:', err?.message);
      const mem = memoryCustomers.find((c) => c.id === customerId);
      const memCustAssets = memoryAssets.filter((a) => a.customerId === customerId);
      return memCustAssets.length > 0 ? memCustAssets : (mem?.assets || []);
    }
  }

  /**
   * Get customer sales history
   */
  async getCustomerSales(customerId: string, page = 1, limit = 20, database = db) {
    const offset = (page - 1) * limit;
    try {
      const [totalRec] = await database
        .select({ total: count() })
        .from(sales)
        .where(eq(sales.customerId, customerId));

      const records = await database.query.sales.findMany({
        where: eq(sales.customerId, customerId),
        orderBy: desc(sales.saleDate),
        limit,
        offset,
        with: {
          items: true,
        },
      });

      return {
        data: records || [],
        pagination: {
          page,
          pageSize: limit,
          total: Number(totalRec?.total || records?.length || 0),
        },
      };
    } catch (err: any) {
      console.warn('[CustomerRepository.getCustomerSales] DB notice:', err?.message);
      const mem = memoryCustomers.find((c) => c.id === customerId);
      const data = mem?.sales || [];
      return {
        data: data.slice(offset, offset + limit),
        pagination: {
          page,
          pageSize: limit,
          total: data.length,
        },
      };
    }
  }

  /**
   * Get customer invoices history
   */
  async getCustomerInvoices(customerId: string, page = 1, limit = 20, database = db) {
    const offset = (page - 1) * limit;
    try {
      const [totalRec] = await database
        .select({ total: count() })
        .from(invoices)
        .where(eq(invoices.customerId, customerId));

      const records = await database.query.invoices.findMany({
        where: eq(invoices.customerId, customerId),
        orderBy: desc(invoices.invoiceDate),
        limit,
        offset,
        with: {
          items: true,
        },
      });

      return {
        data: records || [],
        pagination: {
          page,
          pageSize: limit,
          total: Number(totalRec?.total || records?.length || 0),
        },
      };
    } catch (err: any) {
      console.warn('[CustomerRepository.getCustomerInvoices] DB notice:', err?.message);
      const mem = memoryCustomers.find((c) => c.id === customerId);
      const data = mem?.invoices || [];
      return {
        data: data.slice(offset, offset + limit),
        pagination: {
          page,
          pageSize: limit,
          total: data.length,
        },
      };
    }
  }

  /**
   * Get customer payments history
   */
  async getCustomerPayments(customerId: string, page = 1, limit = 20, database = db) {
    const offset = (page - 1) * limit;
    try {
      const [totalRec] = await database
        .select({ total: count() })
        .from(payments)
        .where(eq(payments.customerId, customerId));

      const records = await database.query.payments.findMany({
        where: eq(payments.customerId, customerId),
        orderBy: desc(payments.paymentDate),
        limit,
        offset,
      });

      return {
        data: records || [],
        pagination: {
          page,
          pageSize: limit,
          total: Number(totalRec?.total || records?.length || 0),
        },
      };
    } catch (err: any) {
      console.warn('[CustomerRepository.getCustomerPayments] DB notice:', err?.message);
      const mem = memoryCustomers.find((c) => c.id === customerId);
      const data = mem?.payments || [];
      return {
        data: data.slice(offset, offset + limit),
        pagination: {
          page,
          pageSize: limit,
          total: data.length,
        },
      };
    }
  }

  /**
   * Get customer service history
   */
  async getCustomerServices(customerId: string, page = 1, limit = 20, database = db) {
    const offset = (page - 1) * limit;
    try {
      const [totalRec] = await database
        .select({ total: count() })
        .from(services)
        .where(eq(services.customerId, customerId));

      const records = await database.query.services.findMany({
        where: eq(services.customerId, customerId),
        orderBy: desc(services.scheduledDate),
        limit,
        offset,
        with: {
          technician: true,
          jobCard: true,
          asset: {
            with: {
              product: true,
            },
          },
        },
      });

      return {
        data: records || [],
        pagination: {
          page,
          pageSize: limit,
          total: Number(totalRec?.total || records?.length || 0),
        },
      };
    } catch (err: any) {
      console.warn('[CustomerRepository.getCustomerServices] DB notice:', err?.message);
      const mem = memoryCustomers.find((c) => c.id === customerId);
      const data = mem?.services || [];
      return {
        data: data.slice(offset, offset + limit),
        pagination: {
          page,
          pageSize: limit,
          total: data.length,
        },
      };
    }
  }

  /**
   * Get customer warranty history
   */
  async getCustomerWarranties(customerId: string, database = db) {
    try {
      const records = await database.query.warranties.findMany({
        where: eq(warranties.customerId, customerId),
        with: {
          asset: {
            with: {
              product: true,
            },
          },
          events: true,
        },
        orderBy: desc(warranties.createdAt),
      });
      return records || [];
    } catch (err: any) {
      console.warn('[CustomerRepository.getCustomerWarranties] DB notice:', err?.message);
      const mem = memoryCustomers.find((c) => c.id === customerId);
      return mem?.warranties || [];
    }
  }

  /**
   * Get customer job cards
   */
  async getCustomerJobCards(customerId: string, page = 1, limit = 20, database = db) {
    const offset = (page - 1) * limit;
    try {
      const [totalRec] = await database
        .select({ total: count() })
        .from(jobCards)
        .where(eq(jobCards.customerId, customerId));

      const records = await database.query.jobCards.findMany({
        where: eq(jobCards.customerId, customerId),
        orderBy: desc(jobCards.createdAt),
        limit,
        offset,
        with: {
          technician: true,
        },
      });

      return {
        data: records || [],
        pagination: {
          page,
          pageSize: limit,
          total: Number(totalRec?.total || records?.length || 0),
        },
      };
    } catch (err: any) {
      console.warn('[CustomerRepository.getCustomerJobCards] DB notice:', err?.message);
      return {
        data: [],
        pagination: {
          page,
          pageSize: limit,
          total: 0,
        },
      };
    }
  }

  /**
   * Get chronological relationship activities
   */
  async getCustomerActivities(customerId: string, page = 1, limit = 50, database = db) {
    const offset = (page - 1) * limit;
    const combined: any[] = [];
    const seen = new Set<string>();

    const addAct = (a: any) => {
      if (!a) return;
      const key = a.id || `${a.eventType}-${a.entityId}-${a.timestamp}`;
      if (!seen.has(key)) {
        seen.add(key);
        combined.push({
          id: a.id || `act-${Math.random().toString(36).slice(2, 9)}`,
          customerId: a.customerId || customerId,
          eventType: a.eventType || 'ACTIVITY',
          entityType: a.entityType || 'CUSTOMER',
          entityId: a.entityId || a.id || customerId,
          description: a.description || 'Activity recorded',
          actorName: a.actorName || (a.metadata as any)?.actorName || 'Staff',
          timestamp: a.timestamp instanceof Date ? a.timestamp.toISOString() : (a.timestamp || a.createdAt || new Date().toISOString()),
          metadata: a.metadata || null,
        });
      }
    };

    // 1. Direct select from customerActivities table
    try {
      const dbActivities = await database
        .select()
        .from(customerActivities)
        .where(eq(customerActivities.customerId, customerId))
        .orderBy(desc(customerActivities.timestamp))
        .limit(100);
      dbActivities.forEach(addAct);
    } catch (err: any) {
      console.warn('[CustomerRepository.getCustomerActivities] DB select notice:', err?.message);
    }

    // 2. Synthesize activities from Customer's Sales
    try {
      const custSales = await database
        .select()
        .from(sales)
        .where(eq(sales.customerId, customerId))
        .orderBy(desc(sales.saleDate))
        .limit(20);
      custSales.forEach((s) => {
        addAct({
          id: `sale-act-${s.id}`,
          customerId,
          eventType: 'SALE_RECORDED',
          entityType: 'SALE',
          entityId: s.id,
          description: `Sale ${s.saleNumber} completed for ₹${parseFloat(s.totalAmount || '0').toFixed(2)}`,
          actorName: 'Sales Rep',
          timestamp: s.saleDate || s.createdAt,
          metadata: { saleNumber: s.saleNumber, totalAmount: s.totalAmount },
        });
      });
    } catch {}

    memorySales.filter((s) => s.customerId === customerId).forEach((s) => {
      addAct({
        id: `sale-act-${s.id}`,
        customerId,
        eventType: 'SALE_RECORDED',
        entityType: 'SALE',
        entityId: s.id,
        description: `Sale ${s.saleNumber} completed for ₹${parseFloat(s.totalAmount || '0').toFixed(2)}`,
        actorName: 'Sales Rep',
        timestamp: s.saleDate || s.createdAt,
        metadata: { saleNumber: s.saleNumber, totalAmount: s.totalAmount },
      });
    });

    // 3. Synthesize activities from Customer's Payments
    try {
      const custPayments = await database
        .select()
        .from(payments)
        .where(eq(payments.customerId, customerId))
        .orderBy(desc(payments.paymentDate))
        .limit(20);
      custPayments.forEach((p) => {
        addAct({
          id: `pay-act-${p.id}`,
          customerId,
          eventType: 'PAYMENT_RECEIVED',
          entityType: 'PAYMENT',
          entityId: p.id,
          description: `Payment ${p.paymentNumber} received: ₹${parseFloat(p.amount || '0').toFixed(2)} (${p.paymentMethod})`,
          actorName: 'Cashier / Accounts',
          timestamp: p.paymentDate || p.createdAt,
          metadata: { paymentNumber: p.paymentNumber, amount: p.amount, method: p.paymentMethod },
        });
      });
    } catch {}

    memoryPayments.filter((p) => p.customerId === customerId).forEach((p) => {
      addAct({
        id: `pay-act-${p.id}`,
        customerId,
        eventType: 'PAYMENT_RECEIVED',
        entityType: 'PAYMENT',
        entityId: p.id,
        description: `Payment ${p.paymentNumber} received: ₹${parseFloat(p.amount || '0').toFixed(2)} (${p.paymentMethod})`,
        actorName: 'Cashier / Accounts',
        timestamp: p.paymentDate || p.createdAt,
        metadata: { paymentNumber: p.paymentNumber, amount: p.amount, method: p.paymentMethod },
      });
    });

    // 4. Synthesize activities from Customer's Services
    try {
      const custServices = await database
        .select()
        .from(services)
        .where(eq(services.customerId, customerId))
        .orderBy(desc(services.scheduledDate))
        .limit(20);
      custServices.forEach((s) => {
        addAct({
          id: `srv-act-${s.id}`,
          customerId,
          eventType: s.status === 'COMPLETED' ? 'SERVICE_COMPLETED' : 'SERVICE_SCHEDULED',
          entityType: 'SERVICE',
          entityId: s.id,
          description: `Service ${s.serviceNumber} (${s.serviceType || 'Maintenance'}) - Status: ${s.status}`,
          actorName: 'Service Desk',
          timestamp: s.completedAt || s.scheduledDate || s.createdAt,
          metadata: { serviceNumber: s.serviceNumber, status: s.status },
        });
      });
    } catch {}

    memoryServices.filter((s) => s.customerId === customerId).forEach((s) => {
      addAct({
        id: `srv-act-${s.id}`,
        customerId,
        eventType: s.status === 'COMPLETED' ? 'SERVICE_COMPLETED' : 'SERVICE_SCHEDULED',
        entityType: 'SERVICE',
        entityId: s.id,
        description: `Service ${s.serviceNumber} (${s.serviceType || 'Maintenance'}) - Status: ${s.status}`,
        actorName: 'Service Desk',
        timestamp: s.completedAt || s.scheduledDate || s.createdAt,
        metadata: { serviceNumber: s.serviceNumber, status: s.status },
      });
    });

    // 5. Check memoryCustomers activities
    const mem = memoryCustomers.find((c) => c.id === customerId);
    if (mem?.activities) {
      mem.activities.forEach(addAct);
    }

    // Sort descending by timestamp
    combined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const paginated = combined.slice(offset, offset + limit);

    return {
      data: paginated,
      pagination: {
        page,
        pageSize: limit,
        total: combined.length,
      },
    };
  }

  /**
   * Add a customer note and log activity
   */
  async addNote(
    customerId: string,
    content: string,
    actorId?: string | null,
    actorName?: string | null,
    database = db
  ) {
    return await database.transaction(async (tx) => {
      const customer = await this.findById(customerId, tx);
      if (!customer) return null;

      const existingNotes = customer.notes ? `${customer.notes}\n\n` : '';
      const timestamp = new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const formattedNote = `${existingNotes}[${timestamp} by ${actorName || 'User'}]: ${content.trim()}`;

      await tx
        .update(customers)
        .set({ notes: formattedNote, updatedAt: new Date() })
        .where(eq(customers.id, customerId));

      try {
        let validActorId: string | null = null;
        if (actorId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(actorId)) {
          try {
            const userExists = await tx.select({ id: users.id }).from(users).where(eq(users.id, actorId));
            if (userExists.length > 0) validActorId = actorId;
          } catch {}
        }

        await tx.insert(customerActivities).values({
          customerId,
          actorId: validActorId,
          actorName: actorName || 'System',
          eventType: 'CUSTOMER_UPDATED',
          entityType: 'CUSTOMER_NOTE',
          entityId: customerId,
          description: 'Added customer relationship note',
          metadata: { noteSnippet: content.slice(0, 100) },
        });
      } catch {}

      return await this.findById(customerId, tx);
    });
  }

  /**
   * Retrieves or initializes the persistent metrics baseline timestamp from app_settings
   */
  async getMetricsBaseline(database = db): Promise<Date> {
    try {
      const [existingSetting] = await database
        .select()
        .from(appSettings)
        .where(eq(appSettings.category, 'CUSTOMER_METRICS_BASELINE'))
        .limit(1);

      if (existingSetting && existingSetting.value && (existingSetting.value as any).baselineDate) {
        return new Date((existingSetting.value as any).baselineDate);
      }

      // If no baseline setting exists yet, find max createdAt among legacy customers or now
      const [maxCust] = await database
        .select({ maxCreatedAt: sql<Date>`max(${customers.createdAt})` })
        .from(customers);

      const baselineDate = maxCust?.maxCreatedAt ? new Date(maxCust.maxCreatedAt) : new Date();

      await database
        .insert(appSettings)
        .values({
          category: 'CUSTOMER_METRICS_BASELINE',
          value: {
            baselineDate: baselineDate.toISOString(),
            establishedAt: new Date().toISOString(),
            description: 'Cutoff timestamp separating legacy customers from newly created CRM activity for dashboard metrics',
          },
        })
        .onConflictDoNothing();

      return baselineDate;
    } catch (err) {
      console.warn('[CustomerRepository] Error reading metrics baseline setting:', err);
      return new Date();
    }
  }

  /**
   * Calculates real-time customer dashboard metrics reflecting real CRM database records
   */
  async getCustomerDashboardStats(database = db) {
    const now = new Date();

    // Start & End of current calendar month
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const endOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    let totalCustomers = 0;
    let activeCustomers = 0;
    let newThisMonth = 0;
    let withWarranty = 0;
    let dueForService = 0;

    try {
      const [totalRes, activeRes, newMonthRes, warrantyRes, dueServiceRes] = await Promise.allSettled([
        // 1. Total Customers
        database
          .select({ count: count(customers.id) })
          .from(customers)
          .where(sql`${customers.archivedAt} IS NULL`),

        // 2. Active Customers
        database
          .select({ count: count(customers.id) })
          .from(customers)
          .where(and(eq(customers.status, 'ACTIVE'), sql`${customers.archivedAt} IS NULL`)),

        // 3. New This Month
        database
          .select({ count: count(customers.id) })
          .from(customers)
          .where(
            and(
              gte(customers.createdAt, startOfCurrentMonth),
              lte(customers.createdAt, endOfCurrentMonth),
              sql`${customers.archivedAt} IS NULL`
            )
          ),

        // 4. With Active Warranty
        database
          .select({ count: sql<number>`count(distinct ${customers.id})::int` })
          .from(customers)
          .innerJoin(warranties, eq(warranties.customerId, customers.id))
          .where(
            and(
              sql`${customers.archivedAt} IS NULL`,
              inArray(warranties.status, ['ACTIVE', 'EXPIRING_SOON']),
              gte(warranties.endDate, now)
            )
          ),

        // 5. Due for Service
        database
          .select({ count: sql<number>`count(distinct ${customers.id})::int` })
          .from(customers)
          .innerJoin(services, eq(services.customerId, customers.id))
          .where(
            and(
              sql`${customers.archivedAt} IS NULL`,
              inArray(services.status, ['SCHEDULED', 'ASSIGNED']),
              gte(services.scheduledDate, startOfToday)
            )
          ),
      ]);

      if (totalRes.status === 'fulfilled' && totalRes.value[0]) {
        totalCustomers = Number(totalRes.value[0].count || 0);
      }
      if (activeRes.status === 'fulfilled' && activeRes.value[0]) {
        activeCustomers = Number(activeRes.value[0].count || 0);
      }
      if (newMonthRes.status === 'fulfilled' && newMonthRes.value[0]) {
        newThisMonth = Number(newMonthRes.value[0].count || 0);
      }
      if (warrantyRes.status === 'fulfilled' && warrantyRes.value[0]) {
        withWarranty = Number(warrantyRes.value[0].count || 0);
      }
      if (dueServiceRes.status === 'fulfilled' && dueServiceRes.value[0]) {
        dueForService = Number(dueServiceRes.value[0].count || 0);
      }
    } catch (e) {
      console.warn('[CustomerRepository] getCustomerDashboardStats query notice:', e);
    }

    if (totalCustomers === 0 && memoryCustomers.length > 0) {
      const activeMems = memoryCustomers.filter((c) => !c.archivedAt);
      totalCustomers = activeMems.length;
      activeCustomers = activeMems.filter((c) => c.status === 'ACTIVE').length;
      newThisMonth = activeMems.filter((c) => {
        const d = new Date(c.createdAt || now);
        return d >= startOfCurrentMonth && d <= endOfCurrentMonth;
      }).length;
      withWarranty = activeMems.filter((c) => c.summary?.activeWarranty === 'Yes' || c.overview?.activeWarranty).length;
      dueForService = activeMems.filter((c) => c.nextServiceDate !== null).length;
    }

    return {
      totalCustomers,
      activeCustomers,
      newThisMonth,
      withWarranty,
      dueForService,
    };
  }

  /**
   * Custom Customer Label management methods
   */
  async getAllCustomLabels(database = db) {
    try {
      return await database
        .select()
        .from(customerCustomLabels)
        .orderBy(asc(customerCustomLabels.name));
    } catch (err: any) {
      console.warn('[getAllCustomLabels] Notice:', err?.message);
      return [];
    }
  }

  async getCustomLabelById(id: string, database = db) {
    try {
      const [label] = await database
        .select()
        .from(customerCustomLabels)
        .where(eq(customerCustomLabels.id, id));
      return label || null;
    } catch {
      return null;
    }
  }

  async createCustomLabel(
    data: { name: string; color: string; description?: string | null },
    database = db
  ) {
    const trimmedName = data.name.trim();
    const trimmedColor = data.color.trim();

    try {
      // Check if one already exists with the same name (case-insensitive)
      const existing = await database
        .select()
        .from(customerCustomLabels)
        .where(sql`lower(${customerCustomLabels.name}) = lower(${trimmedName})`);

      if (existing.length > 0) {
        return existing[0];
      }

      const [created] = await database
        .insert(customerCustomLabels)
        .values({
          name: trimmedName,
          color: trimmedColor,
          description: data.description ? data.description.trim() : null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      return created;
    } catch (err: any) {
      console.error('[createCustomLabel] Error:', err?.message);
      throw err;
    }
  }

  async updateCustomLabel(
    id: string,
    data: { name?: string; color?: string; description?: string | null },
    database = db
  ) {
    try {
      const updateValues: Record<string, any> = { updatedAt: new Date() };
      if (data.name !== undefined) updateValues.name = data.name.trim();
      if (data.color !== undefined) updateValues.color = data.color.trim();
      if (data.description !== undefined) {
        updateValues.description = data.description ? data.description.trim() : null;
      }

      const [updated] = await database
        .update(customerCustomLabels)
        .set(updateValues)
        .where(eq(customerCustomLabels.id, id))
        .returning();

      return updated;
    } catch (err: any) {
      console.error('[updateCustomLabel] Error:', err?.message);
      throw err;
    }
  }

  async deleteCustomLabel(id: string, database = db) {
    try {
      await database
        .delete(customerCustomLabels)
        .where(eq(customerCustomLabels.id, id));
      return { success: true };
    } catch (err: any) {
      console.error('[deleteCustomLabel] Error:', err?.message);
      throw err;
    }
  }
}

export const customerRepository = new CustomerRepository();
