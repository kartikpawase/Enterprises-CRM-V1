import { eq, sql, and, notInArray, inArray, isNull } from 'drizzle-orm';
import { db } from '../../database/client';
import {
  services,
  customers,
  customerAddresses,
  customerAssets,
  products,
  technicians,
  warranties,
  jobCards,
  rentals,
  reminders,
  invoices,
  serviceSchedules,
} from '../../database/schema';
import { memoryServices } from '../services/services.repository';
import { memoryRentals } from '../rentals/rental.repository';
import { memoryInvoices } from '../invoices/invoices.repository';

export interface DueServiceItem {
  id: string;
  serviceNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerNumber: string;
  serviceType: string;
  serviceLocation: string;
  serviceClassification: string;
  machineModel: string;
  machineSerialNumber?: string | null;
  scheduledDate: string;
  scheduledTimeSlot?: string | null;
  technicianId?: string | null;
  technicianName?: string | null;
  technicianPhone?: string | null;
  status: string;
  priority: string;
  customerNotes?: string | null;
  internalNotes?: string | null;
  address?: string | null;
  jobCardNumber?: string | null;
}

export interface DueRentalItem {
  id: string;
  rentalNumber: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerNumber: string;
  machineModel: string;
  machineType: string;
  serialNumber: string;
  monthlyRent: string;
  billingAmount: string;
  outstandingAmount: string;
  nextDueDate: string;
  rentalStatus: string;
  paymentStatus: string;
  billingFrequency: string;
  installationAddress?: string | null;
  notes?: string | null;
}

export interface DueOtherActivityItem {
  id: string;
  activityType: 'REMINDER' | 'INVOICE_DUE' | 'WARRANTY_SCHEDULE';
  title: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerNumber: string;
  date: string;
  status: string;
  priority?: string | null;
  amount?: string | null;
  details?: string | null;
  referenceId?: string | null;
  referenceNumber?: string | null;
}

export interface DuesDateResult {
  selectedDate: string;
  summary: {
    totalActivities: number;
    servicesCount: number;
    doorstepVisitsCount: number;
    rentalPaymentsCount: number;
    otherActivitiesCount: number;
  };
  services: DueServiceItem[];
  doorstepVisits: DueServiceItem[];
  rentalPayments: DueRentalItem[];
  otherActivities: DueOtherActivityItem[];
}

export class DuesRepository {
  /**
   * Authoritative extraction of all CRM duties, visits, services, rentals and activities
   * whose scheduled/due date matches targetDateStr (YYYY-MM-DD)
   */
  async getDuesForDate(targetDateStr: string): Promise<DuesDateResult> {
    const database = db;

    // 1. Query Services and Doorstep visits scheduled on targetDate
    const serviceList: DueServiceItem[] = [];
    const doorstepList: DueServiceItem[] = [];
    const seenServiceIds = new Set<string>();

    try {
      const rawServices = await database
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
          customerId: customers.id,
          customerName: customers.fullName,
          customerPhone: customers.phone,
          customerNumber: customers.customerNumber,
          addressLine1: customerAddresses.addressLine1,
          addressCity: customerAddresses.city,
          addressPostalCode: customerAddresses.postalCode,
          productName: sql<string>`COALESCE(${customerAssets.customName}, ${products.name}, 'Equipment')`,
          serialNumber: customerAssets.serialNumber,
          technicianId: technicians.id,
          technicianName: technicians.fullName,
          technicianPhone: technicians.phone,
          jobCardNumber: jobCards.jobCardNumber,
        })
        .from(services)
        .innerJoin(customers, eq(services.customerId, customers.id))
        .leftJoin(
          customerAddresses,
          and(eq(customerAddresses.customerId, customers.id), eq(customerAddresses.isDefault, true))
        )
        .leftJoin(customerAssets, eq(services.assetId, customerAssets.id))
        .leftJoin(products, eq(customerAssets.productId, products.id))
        .leftJoin(technicians, eq(services.technicianId, technicians.id))
        .leftJoin(jobCards, eq(services.id, jobCards.serviceId))
        .where(
          and(
            sql`(DATE(${services.scheduledDate} AT TIME ZONE 'Asia/Kolkata') = ${targetDateStr}::date OR DATE(${services.scheduledDate}) = ${targetDateStr}::date)`,
            notInArray(services.status, ['CANCELLED'])
          )
        )
        .orderBy(sql`${services.scheduledDate} ASC, ${services.serviceNumber} ASC`);

      for (const row of rawServices) {
        seenServiceIds.add(row.id);
        const addrStr = [row.addressLine1, row.addressCity, row.addressPostalCode].filter(Boolean).join(', ') || null;

        const item: DueServiceItem = {
          id: row.id,
          serviceNumber: row.serviceNumber,
          customerId: row.customerId,
          customerName: row.customerName,
          customerPhone: row.customerPhone,
          customerNumber: row.customerNumber,
          serviceType: row.serviceType,
          serviceLocation: row.serviceLocation,
          serviceClassification: row.serviceClassification,
          machineModel: row.productName,
          machineSerialNumber: row.serialNumber,
          scheduledDate: row.scheduledDate instanceof Date ? row.scheduledDate.toISOString() : String(row.scheduledDate),
          scheduledTimeSlot: row.scheduledTimeSlot,
          technicianId: row.technicianId,
          technicianName: row.technicianName,
          technicianPhone: row.technicianPhone,
          status: row.status,
          priority: row.priority,
          customerNotes: row.customerNotes,
          internalNotes: row.internalNotes,
          address: addrStr,
          jobCardNumber: row.jobCardNumber,
        };

        if (row.serviceLocation === 'DOORSTEP') {
          doorstepList.push(item);
        } else {
          serviceList.push(item);
        }
      }
    } catch (err) {
      console.warn('[DuesRepository.getDuesForDate] rawServices DB notice:', err);
    }

    for (const m of memoryServices) {
      if (!m || !m.id || seenServiceIds.has(m.id)) continue;
      if (m.status === 'CANCELLED') continue;
      const mDateStr = m.scheduledDate instanceof Date ? m.scheduledDate.toISOString().split('T')[0] : typeof m.scheduledDate === 'string' ? m.scheduledDate.split('T')[0] : '';
      if (mDateStr === targetDateStr) {
        seenServiceIds.add(m.id);
        const item: DueServiceItem = {
          id: m.id,
          serviceNumber: m.serviceNumber || 'SRV-MEM',
          customerId: m.customerId,
          customerName: m.customerName || (m as any).customer?.fullName || 'Customer',
          customerPhone: m.customerPhone || (m as any).customer?.phone || '',
          customerNumber: m.customerNumber || (m as any).customer?.customerNumber || '',
          serviceType: m.serviceType || 'PERIODIC_MAINTENANCE',
          serviceLocation: m.serviceLocation || 'DOORSTEP',
          serviceClassification: m.serviceClassification || 'GENERAL',
          machineModel: m.productName || 'Equipment',
          machineSerialNumber: m.serialNumber || null,
          scheduledDate: m.scheduledDate instanceof Date ? m.scheduledDate.toISOString() : String(m.scheduledDate),
          scheduledTimeSlot: m.scheduledTimeSlot || null,
          technicianId: m.technicianId || null,
          technicianName: m.technicianName || null,
          technicianPhone: m.technicianPhone || null,
          status: m.status || 'SCHEDULED',
          priority: m.priority || 'NORMAL',
          customerNotes: m.customerNotes || null,
          internalNotes: m.internalNotes || null,
          address: m.address || null,
          jobCardNumber: m.jobCardNumber || null,
        };
        if (m.serviceLocation === 'DOORSTEP') {
          doorstepList.push(item);
        } else {
          serviceList.push(item);
        }
      }
    }

    // 2. Query Rental Agreements where nextDueDate falls on targetDate
    const rawRentals = await database
      .select({
        id: rentals.id,
        rentalNumber: rentals.rentalNumber,
        machineModel: rentals.machineModel,
        machineType: rentals.machineType,
        serialNumber: rentals.serialNumber,
        monthlyRent: rentals.monthlyRent,
        billingAmount: rentals.billingAmount,
        outstandingAmount: rentals.outstandingAmount,
        nextDueDate: rentals.nextDueDate,
        rentalStatus: rentals.rentalStatus,
        paymentStatus: rentals.paymentStatus,
        billingFrequency: rentals.billingFrequency,
        installationAddress: rentals.installationAddress,
        notes: rentals.notes,
        customerId: customers.id,
        customerName: customers.fullName,
        customerPhone: customers.phone,
        customerNumber: customers.customerNumber,
      })
      .from(rentals)
      .innerJoin(customers, eq(rentals.customerId, customers.id))
      .where(
        and(
          sql`(DATE(${rentals.nextDueDate} AT TIME ZONE 'Asia/Kolkata') = ${targetDateStr}::date OR DATE(${rentals.nextDueDate}) = ${targetDateStr}::date)`,
          notInArray(rentals.rentalStatus, ['TERMINATED', 'CANCELLED', 'RETURNED'])
        )
      )
      .orderBy(sql`${rentals.nextDueDate} ASC, ${rentals.rentalNumber} ASC`);

    const rentalList: DueRentalItem[] = rawRentals.map((r) => ({
      id: r.id,
      rentalNumber: r.rentalNumber,
      customerId: r.customerId,
      customerName: r.customerName,
      customerPhone: r.customerPhone,
      customerNumber: r.customerNumber,
      machineModel: r.machineModel,
      machineType: r.machineType,
      serialNumber: r.serialNumber,
      monthlyRent: String(r.monthlyRent || '0.00'),
      billingAmount: String(r.billingAmount || '0.00'),
      outstandingAmount: String(r.outstandingAmount || '0.00'),
      nextDueDate: r.nextDueDate instanceof Date ? r.nextDueDate.toISOString() : String(r.nextDueDate),
      rentalStatus: r.rentalStatus,
      paymentStatus: r.paymentStatus,
      billingFrequency: r.billingFrequency,
      installationAddress: r.installationAddress,
      notes: r.notes,
    }));

    // 3. Query Other CRM Scheduled Activities
    const otherList: DueOtherActivityItem[] = [];

    // A. Reminders
    const rawReminders = await database
      .select({
        id: reminders.id,
        reminderNumber: reminders.reminderNumber,
        reminderType: reminders.reminderType,
        reminderDate: reminders.reminderDate,
        reminderTime: reminders.reminderTime,
        priority: reminders.priority,
        status: reminders.status,
        notes: reminders.notes,
        customerId: customers.id,
        customerName: customers.fullName,
        customerPhone: customers.phone,
        customerNumber: customers.customerNumber,
      })
      .from(reminders)
      .innerJoin(customers, eq(reminders.customerId, customers.id))
      .where(
        and(
          sql`(DATE(${reminders.reminderDate} AT TIME ZONE 'Asia/Kolkata') = ${targetDateStr}::date OR DATE(${reminders.reminderDate}) = ${targetDateStr}::date)`,
          notInArray(reminders.status, ['COMPLETED'])
        )
      )
      .orderBy(sql`${reminders.reminderDate} ASC`);

    for (const rem of rawReminders) {
      otherList.push({
        id: rem.id,
        activityType: 'REMINDER',
        title: `${rem.reminderType.replace(/_/g, ' ')} (${rem.reminderNumber})`,
        customerId: rem.customerId,
        customerName: rem.customerName,
        customerPhone: rem.customerPhone,
        customerNumber: rem.customerNumber,
        date: rem.reminderDate instanceof Date ? rem.reminderDate.toISOString() : String(rem.reminderDate),
        status: rem.status,
        priority: rem.priority,
        details: [rem.reminderTime, rem.notes].filter(Boolean).join(' — '),
        referenceNumber: rem.reminderNumber,
      });
    }

    // B. Unpaid Invoices Due on Target Date
    const rawInvoices = await database
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        dueDate: invoices.dueDate,
        totalAmount: invoices.totalAmount,
        status: invoices.status,
        customerId: customers.id,
        customerName: customers.fullName,
        customerPhone: customers.phone,
        customerNumber: customers.customerNumber,
      })
      .from(invoices)
      .innerJoin(customers, eq(invoices.customerId, customers.id))
      .where(
        and(
          sql`(DATE(${invoices.dueDate} AT TIME ZONE 'Asia/Kolkata') = ${targetDateStr}::date OR DATE(${invoices.dueDate}) = ${targetDateStr}::date)`,
          inArray(invoices.status, ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE']),
          isNull(invoices.cancelledAt)
        )
      )
      .orderBy(sql`${invoices.dueDate} ASC`);

    for (const inv of rawInvoices) {
      otherList.push({
        id: inv.id,
        activityType: 'INVOICE_DUE',
        title: `Invoice Payment Due: ${inv.invoiceNumber}`,
        customerId: inv.customerId,
        customerName: inv.customerName,
        customerPhone: inv.customerPhone,
        customerNumber: inv.customerNumber,
        date: inv.dueDate instanceof Date ? inv.dueDate.toISOString() : String(inv.dueDate),
        status: inv.status,
        amount: String(inv.totalAmount || '0.00'),
        details: `Due amount: ₹${Number(inv.totalAmount || 0).toLocaleString('en-IN')}`,
        referenceNumber: inv.invoiceNumber,
      });
    }

    // C. Warranty Scheduled Service Intervals
    const rawSchedules = await database
      .select({
        id: serviceSchedules.id,
        scheduleIndex: serviceSchedules.scheduleIndex,
        totalSchedules: serviceSchedules.totalSchedules,
        plannedDate: serviceSchedules.plannedDate,
        status: serviceSchedules.status,
        customerId: customers.id,
        customerName: customers.fullName,
        customerPhone: customers.phone,
        customerNumber: customers.customerNumber,
        productName: sql<string>`COALESCE(${customerAssets.customName}, ${products.name}, 'Equipment')`,
        serialNumber: customerAssets.serialNumber,
      })
      .from(serviceSchedules)
      .innerJoin(customers, eq(serviceSchedules.customerId, customers.id))
      .leftJoin(customerAssets, eq(serviceSchedules.assetId, customerAssets.id))
      .leftJoin(products, eq(customerAssets.productId, products.id))
      .where(
        and(
          sql`(DATE(${serviceSchedules.plannedDate} AT TIME ZONE 'Asia/Kolkata') = ${targetDateStr}::date OR DATE(${serviceSchedules.plannedDate}) = ${targetDateStr}::date)`,
          eq(serviceSchedules.status, 'PENDING')
        )
      )
      .orderBy(sql`${serviceSchedules.plannedDate} ASC`);

    for (const sched of rawSchedules) {
      otherList.push({
        id: sched.id,
        activityType: 'WARRANTY_SCHEDULE',
        title: `Warranty Maintenance #${sched.scheduleIndex} of ${sched.totalSchedules}`,
        customerId: sched.customerId,
        customerName: sched.customerName,
        customerPhone: sched.customerPhone,
        customerNumber: sched.customerNumber,
        date: sched.plannedDate instanceof Date ? sched.plannedDate.toISOString() : String(sched.plannedDate),
        status: sched.status,
        details: `Machine: ${sched.productName}${sched.serialNumber ? ` (SN: ${sched.serialNumber})` : ''}`,
      });
    }

    const totalActivities =
      serviceList.length + doorstepList.length + rentalList.length + otherList.length;

    return {
      selectedDate: targetDateStr,
      summary: {
        totalActivities,
        servicesCount: serviceList.length + doorstepList.length,
        doorstepVisitsCount: doorstepList.length,
        rentalPaymentsCount: rentalList.length,
        otherActivitiesCount: otherList.length,
      },
      services: serviceList,
      doorstepVisits: doorstepList,
      rentalPayments: rentalList,
      otherActivities: otherList,
    };
  }

  /**
   * Month overview aggregation: returns a map of date string -> total activity count
   * for dates in the given year and month (1-12)
   */
  async getMonthSummary(year: number, month: number): Promise<Record<string, number>> {
    const padMonth = String(month).padStart(2, '0');
    const startStr = `${year}-${padMonth}-01`;
    // Calculate last day of month
    const lastDay = new Date(year, month, 0).getDate();
    const endStr = `${year}-${padMonth}-${String(lastDay).padStart(2, '0')}`;

    const dateCounts: Record<string, number> = {};

    // 1. Service dates in month
    try {
      const srvRows = await db
        .select({
          dateStr: sql<string>`DATE(${services.scheduledDate} AT TIME ZONE 'Asia/Kolkata')::text`,
          count: sql<number>`count(*)`,
        })
        .from(services)
        .where(
          and(
            sql`DATE(${services.scheduledDate} AT TIME ZONE 'Asia/Kolkata') BETWEEN ${startStr}::date AND ${endStr}::date`,
            notInArray(services.status, ['CANCELLED'])
          )
        )
        .groupBy(sql`DATE(${services.scheduledDate} AT TIME ZONE 'Asia/Kolkata')`);

      for (const r of srvRows) {
        if (r.dateStr) {
          dateCounts[r.dateStr] = (dateCounts[r.dateStr] || 0) + Number(r.count || 0);
        }
      }
    } catch (err) {
      console.warn('[DuesRepository.getMonthSummary] srvRows DB notice:', err);
    }

    for (const m of memoryServices) {
      if (!m || m.status === 'CANCELLED') continue;
      const dStr = m.scheduledDate instanceof Date ? m.scheduledDate.toISOString().split('T')[0] : typeof m.scheduledDate === 'string' ? m.scheduledDate.split('T')[0] : '';
      if (dStr >= startStr && dStr <= endStr) {
        dateCounts[dStr] = (dateCounts[dStr] || 0) + 1;
      }
    }

    // 2. Rental nextDueDates in month
    const rntRows = await db
      .select({
        dateStr: sql<string>`DATE(${rentals.nextDueDate} AT TIME ZONE 'Asia/Kolkata')::text`,
        count: sql<number>`count(*)`,
      })
      .from(rentals)
      .where(
        and(
          sql`DATE(${rentals.nextDueDate} AT TIME ZONE 'Asia/Kolkata') BETWEEN ${startStr}::date AND ${endStr}::date`,
          notInArray(rentals.rentalStatus, ['TERMINATED', 'CANCELLED', 'RETURNED'])
        )
      )
      .groupBy(sql`DATE(${rentals.nextDueDate} AT TIME ZONE 'Asia/Kolkata')`);

    for (const r of rntRows) {
      if (r.dateStr) {
        dateCounts[r.dateStr] = (dateCounts[r.dateStr] || 0) + Number(r.count || 0);
      }
    }

    // 3. Reminders in month
    const remRows = await db
      .select({
        dateStr: sql<string>`DATE(${reminders.reminderDate} AT TIME ZONE 'Asia/Kolkata')::text`,
        count: sql<number>`count(*)`,
      })
      .from(reminders)
      .where(
        and(
          sql`DATE(${reminders.reminderDate} AT TIME ZONE 'Asia/Kolkata') BETWEEN ${startStr}::date AND ${endStr}::date`,
          notInArray(reminders.status, ['COMPLETED'])
        )
      )
      .groupBy(sql`DATE(${reminders.reminderDate} AT TIME ZONE 'Asia/Kolkata')`);

    for (const r of remRows) {
      if (r.dateStr) {
        dateCounts[r.dateStr] = (dateCounts[r.dateStr] || 0) + Number(r.count || 0);
      }
    }

    return dateCounts;
  }
}

export const duesRepository = new DuesRepository();
