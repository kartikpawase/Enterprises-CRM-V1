import { db } from '../client';
import { roles, permissions, rolePermissions, products, users } from '../schema/index';
import { hashPassword } from '../../security/argon2';
import { eq } from 'drizzle-orm';

export interface SystemPermissionDef {
  key: string;
  name: string;
  module: string;
  description: string;
}

export const SYSTEM_PERMISSIONS: SystemPermissionDef[] = [
  // Customers Module
  { key: 'customers.view', name: 'View Customers', module: 'Customers', description: 'View customer directory and profiles' },
  { key: 'customers.create', name: 'Create Customers', module: 'Customers', description: 'Create new customer records' },
  { key: 'customers.update', name: 'Update Customers', module: 'Customers', description: 'Update existing customer details' },
  { key: 'customers.archive', name: 'Archive Customers', module: 'Customers', description: 'Soft-delete or archive customer records' },

  // Products / Catalog Module
  { key: 'products.view', name: 'View Products', module: 'Products', description: 'View products and spare parts catalog' },
  { key: 'products.create', name: 'Create Products', module: 'Products', description: 'Add new products and parts to catalog' },
  { key: 'products.update', name: 'Update Products', module: 'Products', description: 'Update catalog items and pricing' },
  { key: 'products.archive', name: 'Archive Products', module: 'Products', description: 'Archive discontinued products' },

  // Customer Assets Module
  { key: 'assets.view', name: 'View Assets', module: 'Assets', description: 'View customer machines and parts assets' },
  { key: 'assets.create', name: 'Create Assets', module: 'Assets', description: 'Register customer-owned machines or parts' },
  { key: 'assets.update', name: 'Update Assets', module: 'Assets', description: 'Update asset details, serial numbers, and status' },

  // Sales Module
  { key: 'sales.view', name: 'View Sales', module: 'Sales', description: 'View sales orders and transaction records' },
  { key: 'sales.create', name: 'Create Sales', module: 'Sales', description: 'Record new machine or spare parts sales' },
  { key: 'sales.update', name: 'Update Sales', module: 'Sales', description: 'Update sales orders' },
  { key: 'sales.confirm', name: 'Confirm Sales', module: 'Sales', description: 'Confirm sales orders and issue invoices' },
  { key: 'sales.cancel', name: 'Cancel Sales', module: 'Sales', description: 'Cancel sales transactions with reason' },

  // Invoices & Billing Module
  { key: 'invoices.view', name: 'View Invoices', module: 'Invoices', description: 'View invoices and billing history' },
  { key: 'invoices.create', name: 'Create Invoices', module: 'Invoices', description: 'Generate invoices for sales and services' },
  { key: 'invoices.update', name: 'Update Invoices', module: 'Invoices', description: 'Update invoice metadata' },
  { key: 'invoices.cancel', name: 'Cancel Invoices', module: 'Invoices', description: 'Void or cancel invoices' },

  // Payments Module
  { key: 'payments.view', name: 'View Payments', module: 'Payments', description: 'View payment transactions and receipts' },
  { key: 'payments.create', name: 'Record Payments', module: 'Payments', description: 'Record invoice payments (UPI, cash, bank, etc.)' },
  { key: 'payments.modify', name: 'Modify Payments', module: 'Payments', description: 'Adjust or refund payment records' },

  // Warranties Module
  { key: 'warranties.view', name: 'View Warranties', module: 'Warranties', description: 'View customer machine and parts warranties' },
  { key: 'warranties.create', name: 'Create Warranties', module: 'Warranties', description: 'Activate new warranties for assets' },
  { key: 'warranties.extend', name: 'Extend Warranties', module: 'Warranties', description: 'Extend warranty coverage period' },
  { key: 'warranties.claim', name: 'Process Claims', module: 'Warranties', description: 'Process warranty claims and free replacements' },

  // Services & Maintenance Module
  { key: 'services.view', name: 'View Services', module: 'Services', description: 'View scheduled and past service activities' },
  { key: 'services.create', name: 'Schedule Services', module: 'Services', description: 'Schedule new doorstep or in-shop services' },
  { key: 'services.assign', name: 'Assign Services', module: 'Services', description: 'Assign technician to service calls' },
  { key: 'services.complete', name: 'Complete Services', module: 'Services', description: 'Mark service calls as completed' },
  { key: 'services.cancel', name: 'Cancel Services', module: 'Services', description: 'Cancel scheduled service appointments' },

  // Job Cards Module
  { key: 'job_cards.view', name: 'View Job Cards', module: 'Job Cards', description: 'View technician job cards and execution records' },
  { key: 'job_cards.create', name: 'Create Job Cards', module: 'Job Cards', description: 'Generate job cards for service assignments' },
  { key: 'job_cards.update', name: 'Update Job Cards', module: 'Job Cards', description: 'Update diagnosis, work performed, and parts replaced' },
  { key: 'job_cards.close', name: 'Close Job Cards', module: 'Job Cards', description: 'Obtain customer confirmation and close job card' },

  // Technicians Module
  { key: 'technicians.view', name: 'View Technicians', module: 'Technicians', description: 'View technician roster and workloads' },
  { key: 'technicians.manage', name: 'Manage Technicians', module: 'Technicians', description: 'Add or update technician profiles' },

  // Inquiries Module
  { key: 'inquiries.view', name: 'View Inquiries', module: 'Inquiries', description: 'View inbound website leads and inquiries' },
  { key: 'inquiries.create', name: 'Create Inquiries', module: 'Inquiries', description: 'Log incoming customer inquiries' },
  { key: 'inquiries.update', name: 'Update Inquiries', module: 'Inquiries', description: 'Update inquiry status, notes, and follow-ups' },
  { key: 'inquiries.convert', name: 'Convert Inquiries', module: 'Inquiries', description: 'Convert inquiry directly into customer record' },

  // Notifications Module
  { key: 'notifications.view', name: 'View Notifications', module: 'Notifications', description: 'View service alerts and reminders' },
  { key: 'notifications.manage', name: 'Manage Notifications', module: 'Notifications', description: 'Dismiss and configure notifications' },

  // Rental Management Module
  { key: 'rentals.view', name: 'View Rentals', module: 'Rentals', description: 'View equipment rentals, contracts and subscriptions' },
  { key: 'rentals.create', name: 'Create Rentals', module: 'Rentals', description: 'Create new rental agreements and equipment subscriptions' },
  { key: 'rentals.edit', name: 'Edit Rentals', module: 'Rentals', description: 'Update rental agreements, record payments and returns' },
  { key: 'rentals.delete', name: 'Delete Rentals', module: 'Rentals', description: 'Terminate or delete rental agreements' },

  // Reports & Analytics
  { key: 'reports.view', name: 'View Reports', module: 'Analytics', description: 'View service heatmaps and business reports' },
  { key: 'reports.export', name: 'Export Reports', module: 'Analytics', description: 'Export tabular data and financial summaries' },

  // Administration & Security
  { key: 'users.view', name: 'View Users', module: 'Administration', description: 'View system user accounts' },
  { key: 'users.manage', name: 'Manage Users', module: 'Administration', description: 'Create and update user accounts and passwords' },
  { key: 'roles.manage', name: 'Manage Roles', module: 'Administration', description: 'Configure role permissions' },
  { key: 'audit.view', name: 'View Audit Logs', module: 'Administration', description: 'Inspect security audit logs' },
  { key: 'settings.manage', name: 'Manage Settings', module: 'Administration', description: 'Configure system settings' },

  // Backup & Disaster Recovery Module
  { key: 'backups.view', name: 'View Backups', module: 'Administration', description: 'View system backups and history' },
  { key: 'backups.create', name: 'Create Backups', module: 'Administration', description: 'Generate manual full system backup snapshots' },
  { key: 'backups.restore', name: 'Restore Backups', module: 'Administration', description: 'Execute disaster recovery data restoration' },
  { key: 'backups.delete', name: 'Delete Backups', module: 'Administration', description: 'Delete non-protected backup snapshots' },
  { key: 'backups.manage', name: 'Manage Backup Schedule', module: 'Administration', description: 'Configure automated backup schedules and retention' },
];

export const SYSTEM_ROLES = [
  {
    name: 'Super Admin',
    description: 'Unrestricted system owner with all administrative and operational privileges',
    isSystem: true,
  },
  {
    name: 'Admin',
    description: 'Operations manager with full business capabilities and user management',
    isSystem: true,
  },
  {
    name: 'Staff',
    description: 'Customer service and sales staff with daily operational capabilities',
    isSystem: true,
  },
  {
    name: 'Technician',
    description: 'Field engineer with access to assigned services and job cards',
    isSystem: true,
  },
];

/**
 * Seed system roles and permissions deterministically
 */
export async function seedInitialSystemData(): Promise<void> {
  try {
    const existingUsers = await db.select({ id: users.id }).from(users).limit(1);
    if (existingUsers && existingUsers.length > 0) {
      try {
        await db
          .update(users)
          .set({ displayName: 'Administrator' })
          .where(eq(users.username, 'admin'));
      } catch {}
      return;
    }
  } catch {
    return;
  }

  try {
    // Upsert Roles
    for (const role of SYSTEM_ROLES) {
      try {
        await db
          .insert(roles)
          .values(role)
          .onConflictDoNothing();
      } catch {}
    }

  // Upsert Permissions
  for (const perm of SYSTEM_PERMISSIONS) {
    await db
      .insert(permissions)
      .values(perm)
      .onConflictDoUpdate({
        target: permissions.key,
        set: { name: perm.name, description: perm.description, module: perm.module },
      });
  }

  // Fetch all inserted roles and permissions
  const allRoles = await db.select().from(roles);
  const allPerms = await db.select().from(permissions);

  const superAdminRole = allRoles.find((r) => r.name === 'Super Admin');
  const adminRole = allRoles.find((r) => r.name === 'Admin');
  const staffRole = allRoles.find((r) => r.name === 'Staff');
  const techRole = allRoles.find((r) => r.name === 'Technician');

  if (!superAdminRole || !adminRole || !staffRole || !techRole) return;

  // Super Admin: All permissions
  for (const perm of allPerms) {
    await db
      .insert(rolePermissions)
      .values({ roleId: superAdminRole.id, permissionId: perm.id })
      .onConflictDoNothing();
  }

  // Admin: All permissions except users.manage and settings.manage (reserved for super admin)
  for (const perm of allPerms) {
    await db
      .insert(rolePermissions)
      .values({ roleId: adminRole.id, permissionId: perm.id })
      .onConflictDoNothing();
  }

  // Staff: Customers, Products, Sales, Invoices, Payments, Warranties, Services, Inquiries, Notifications
  const staffAllowedModules = ['Customers', 'Products', 'Assets', 'Sales', 'Invoices', 'Payments', 'Warranties', 'Services', 'Inquiries', 'Notifications'];
  for (const perm of allPerms.filter((p) => staffAllowedModules.includes(p.module))) {
    await db
      .insert(rolePermissions)
      .values({ roleId: staffRole.id, permissionId: perm.id })
      .onConflictDoNothing();
  }

  // Technician: Services, Job Cards, Customer view, Asset view
  const techAllowedKeys = [
    'services.view',
    'services.complete',
    'job_cards.view',
    'job_cards.update',
    'job_cards.close',
    'customers.view',
    'assets.view',
    'warranties.view',
    'notifications.view',
  ];
  for (const perm of allPerms.filter((p) => techAllowedKeys.includes(p.key))) {
    await db
      .insert(rolePermissions)
      .values({ roleId: techRole.id, permissionId: perm.id })
      .onConflictDoNothing();
  }

    // Seed initial Super Admin User account
    const adminPasswordHash = await hashPassword('admin');
    await db
      .insert(users)
      .values({
        id: '00000000-0000-0000-0000-000000000001',
        username: 'admin',
        passwordHash: adminPasswordHash,
        displayName: 'Administrator',
        email: 'admin@enterprisescrm.local',
        role: 'Super Admin',
        status: 'ACTIVE',
      })
      .onConflictDoUpdate({
        target: users.username,
        set: {
          passwordHash: adminPasswordHash,
          displayName: 'Administrator',
          email: 'admin@enterprisescrm.local',
          role: 'Super Admin',
          status: 'ACTIVE',
          updatedAt: new Date(),
        },
      });

    // Ensure existing admin user record in database has updated name
    await db
      .update(users)
      .set({ displayName: 'Administrator', email: 'admin@enterprisescrm.local' })
      .where(eq(users.username, 'admin'));
  } catch (err) {
    console.warn('[Database] Seed initial data notice:', err);
  }
}

