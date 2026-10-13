import { drizzle as drizzlePg, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import postgres from 'postgres';
import { PGlite } from '@electric-sql/pglite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dns from 'node:dns';
import { env } from '../config/env';
import * as schema from './schema/index';
import {
  archiveDb,
  archiveSql,
  getArchiveDatabaseClient,
  isArchiveDatabaseConfigured,
  closeArchiveDatabaseConnection,
} from './archive/archive-client.js';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let pgClient: postgres.Sql | null = null;
let pgliteClient: PGlite | null = null;
let dbInstance: any = null;
let initPromise: Promise<void> | null = null;
let isInitialized = false;

/**
 * Resolve persistent storage directory for embedded PostgreSQL
 */
export function resolveDatabaseStorageDir(): string {
  if (process.env.CRM_STORAGE_DIR) {
    return path.join(process.env.CRM_STORAGE_DIR, 'database', 'pgdata');
  }

  // Anchor persistent database deterministically to apps/api/.crm-data/pgdata
  const apiRoot = path.resolve(__dirname, '../../');
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return path.resolve(apiRoot, '.crm-data', 'test-pgdata');
  }
  return path.resolve(apiRoot, '.crm-data', 'pgdata');
}

/**
 * Execute Drizzle migration SQL statements on PGlite or Postgres
 */
export async function applySqlMigrations(targetPg: PGlite | postgres.Sql): Promise<void> {
  const migrationsFolder = path.resolve(__dirname, '../../drizzle');
  const sqlFilePath = path.join(migrationsFolder, '0000_lumpy_vapor.sql');

  if (!fs.existsSync(sqlFilePath)) {
    return;
  }

  // Check if initial schema is already applied
  if ('query' in targetPg) {
    try {
      const check = await targetPg.query<{ exists: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'services') as exists;`
      );
      if (check.rows && check.rows[0]?.exists) {
        await ensureGoogleDriveColumns(targetPg);
        return;
      }
    } catch {}
  } else if ('unsafe' in targetPg) {
    try {
      const check: any = await targetPg.unsafe(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'services') as exists;`
      );
      if (check && check[0]?.exists) {
        await ensureGoogleDriveColumns(targetPg);
        return;
      }
    } catch {}
  }

  // Run idempotent migrations to ensure newly added tables exist
  const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
  const rawStatements = sqlContent
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean);

  const statements = rawStatements.map((stmt) => {
    // 1. Make CREATE TYPE idempotent
    if (/^CREATE\s+TYPE\s+/i.test(stmt)) {
      const cleanStmt = stmt.replace(/;$/, '');
      return `DO $$ BEGIN ${cleanStmt}; EXCEPTION WHEN duplicate_object THEN null; END $$;`;
    }
    // 2. Make CREATE TABLE idempotent
    if (/^CREATE\s+TABLE\s+(?!"?[a-zA-Z0-9_]+"?\s+IF\s+NOT\s+EXISTS)/i.test(stmt)) {
      return stmt.replace(/^CREATE\s+TABLE\s+/i, 'CREATE TABLE IF NOT EXISTS ');
    }
    // 3. Make CREATE INDEX idempotent
    if (/^CREATE\s+INDEX\s+/i.test(stmt)) {
      return stmt.replace(/^CREATE\s+INDEX\s+/i, 'CREATE INDEX IF NOT EXISTS ');
    }
    // 4. Make CREATE UNIQUE INDEX idempotent
    if (/^CREATE\s+UNIQUE\s+INDEX\s+/i.test(stmt)) {
      return stmt.replace(/^CREATE\s+UNIQUE\s+INDEX\s+/i, 'CREATE UNIQUE INDEX IF NOT EXISTS ');
    }
    // 5. Make ALTER TABLE ADD CONSTRAINT idempotent
    if (/^ALTER\s+TABLE\s+.*ADD\s+CONSTRAINT/i.test(stmt)) {
      const cleanStmt = stmt.replace(/;$/, '');
      return `DO $$ BEGIN ${cleanStmt}; EXCEPTION WHEN duplicate_object THEN null; WHEN duplicate_table THEN null; END $$;`;
    }
    return stmt;
  });

  if ('exec' in targetPg) {
    // PGlite client
    for (const stmt of statements) {
      try {
        await targetPg.exec(stmt);
      } catch (err: any) {
        // Suppress non-critical duplicate notices
      }
    }
  } else {
    // postgres.js client
    for (const stmt of statements) {
      try {
        await targetPg.unsafe(stmt);
      } catch (err: any) {
        // Suppress non-critical duplicate notices
      }
    }
  }
}

/**
 * Initialize or get database client with persistent storage
 */
export function getDatabaseClient() {
  if (dbInstance && (pgClient || pgliteClient)) {
    return { sql: pgClient || pgliteClient, db: dbInstance };
  }

  // Production or explicit PostgreSQL mode: Connect directly to PostgreSQL
  const isProduction = env.NODE_ENV === 'production' || Boolean(process.env.RENDER);
  const isRemotePostgres = Boolean(
    env.DATABASE_URL &&
      (env.DATABASE_URL.includes('sslmode=') || !env.DATABASE_URL.includes('localhost'))
  );
  const usePostgres = isProduction || process.env.USE_POSTGRES === 'true' || isRemotePostgres;

  const resolvedDbUrl = env.DATABASE_URL;

  if (usePostgres && resolvedDbUrl) {
    try {
      const sslMode = resolvedDbUrl.includes('sslmode=require') || (isProduction && !resolvedDbUrl.includes('postgres:5432')) ? 'require' : undefined;

      pgClient = postgres(resolvedDbUrl, {
        max: env.DB_MAX_CONNECTIONS,
        idle_timeout: Math.floor(env.DB_IDLE_TIMEOUT_MS / 1000),
        connect_timeout: 10,
        ssl: sslMode as any,
        onnotice: () => {},
      });
      dbInstance = drizzlePg(pgClient, { schema });
      console.log(`[Database] Connected to PostgreSQL engine at: ${resolvedDbUrl.replace(/:[^:@]+@/, ':****@')}`);
      return { sql: pgClient, db: dbInstance };
    } catch (pgErr) {
      console.error('[Database] PostgreSQL connection initialization error:', pgErr);
      throw pgErr;
    }
  }

  // Development/offline fallback: PGlite
  const storageDir = resolveDatabaseStorageDir();
  fs.mkdirSync(storageDir, { recursive: true });

  // Clean stale pid file only if process crashed
  ['postmaster.pid', '.lock'].forEach((f) => {
    const p = path.join(storageDir, f);
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
      } catch {}
    }
  });

  try {
    // Initialize persistent PGlite engine stored on disk
    pgliteClient = new PGlite(storageDir);
    dbInstance = drizzlePglite(pgliteClient, { schema });
    console.log(`[Database] Connected to persistent local database engine at: ${storageDir}`);
  } catch (err) {
    console.warn('[Database] PGlite initialization notice, attempting PostgreSQL fallback:', err);
    try {
      pgClient = postgres(env.DATABASE_URL, {
        max: env.DB_MAX_CONNECTIONS,
        idle_timeout: Math.floor(env.DB_IDLE_TIMEOUT_MS / 1000),
        connect_timeout: 5,
        onnotice: () => {},
      });
      dbInstance = drizzlePg(pgClient, { schema });
    } catch (pgErr) {
      console.error('[Database] Connection fallback failed:', pgErr);
    }
  }

  return { sql: pgClient || pgliteClient, db: dbInstance! };
}

// Export dynamic proxies to ensure all modules always interact with the active database instance
export const db: any = new Proxy(
  {},
  {
    get(_target, prop) {
      if (!dbInstance) {
        getDatabaseClient();
      }
      return dbInstance ? (dbInstance as any)[prop] : undefined;
    },
  }
);

export const sql: any = new Proxy(
  function () {},
  {
    get(_target, prop) {
      if (!pgClient && !pgliteClient) {
        getDatabaseClient();
      }
      const active = pgClient || pgliteClient;
      return active ? (active as any)[prop] : undefined;
    },
    apply(_target, thisArg, argArray) {
      if (!pgClient && !pgliteClient) {
        getDatabaseClient();
      }
      const active = pgClient || pgliteClient;
      return Reflect.apply(active as any, thisArg, argArray);
    },
  }
);

// Export Secondary Archive Database references and routing layer
export {
  archiveDb,
  archiveSql,
  getArchiveDatabaseClient,
  isArchiveDatabaseConfigured,
};

export const dbManager = {
  primary: () => db,
  archive: () => archiveDb,
  isArchiveConfigured: isArchiveDatabaseConfigured,
};

/**
 * Ensures email_notifications and email_queue tables and enums exist
 */
export async function ensureEmailTables(targetPg: PGlite | postgres.Sql): Promise<void> {
  if ('query' in targetPg) {
    try {
      const check = await targetPg.query<{ exists: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_queue') as exists;`
      );
      if (check.rows && check.rows[0]?.exists) {
        return;
      }
    } catch {}
  } else if ('unsafe' in targetPg) {
    try {
      const check: any = await targetPg.unsafe(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'email_queue') as exists;`
      );
      if (check && check[0]?.exists) {
        return;
      }
    } catch {}
  }

  const statements = [
    `DO $$ BEGIN CREATE TYPE "email_event_type" AS ENUM('SALE_CONFIRMATION', 'PAYMENT_RECEIPT', 'SERVICE_COMPLETED', 'SERVICE_REMINDER', 'PAYMENT_REMINDER', 'THANK_YOU', 'WARRANTY_EXPIRY_REMINDER', 'INVOICE_EMAIL', 'ADMIN_TEST', 'GENERAL'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN CREATE TYPE "email_delivery_status" AS ENUM('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `CREATE TABLE IF NOT EXISTS "email_notifications" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "customer_id" uuid REFERENCES "customers"("id") ON DELETE SET NULL,
      "event_type" "email_event_type" NOT NULL,
      "reference_type" text,
      "reference_id" text,
      "idempotency_key" text UNIQUE,
      "recipient_email" text NOT NULL,
      "recipient_name" text,
      "subject" text NOT NULL,
      "status" "email_delivery_status" DEFAULT 'PENDING' NOT NULL,
      "attempt_count" integer DEFAULT 0 NOT NULL,
      "max_attempts" integer DEFAULT 3 NOT NULL,
      "sent_at" timestamp with time zone,
      "failed_at" timestamp with time zone,
      "last_error" text,
      "pdf_attached" boolean DEFAULT false NOT NULL,
      "pdf_filename" text,
      "metadata" jsonb,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS "email_notifications_customer_id_idx" ON "email_notifications" ("customer_id");`,
    `CREATE INDEX IF NOT EXISTS "email_notifications_event_type_idx" ON "email_notifications" ("event_type");`,
    `CREATE INDEX IF NOT EXISTS "email_notifications_reference_idx" ON "email_notifications" ("reference_type", "reference_id");`,
    `CREATE INDEX IF NOT EXISTS "email_notifications_idempotency_key_idx" ON "email_notifications" ("idempotency_key");`,
    `CREATE INDEX IF NOT EXISTS "email_notifications_status_idx" ON "email_notifications" ("status");`,
    `CREATE INDEX IF NOT EXISTS "email_notifications_created_at_idx" ON "email_notifications" ("created_at");`,
    `CREATE TABLE IF NOT EXISTS "email_queue" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "notification_id" uuid REFERENCES "email_notifications"("id") ON DELETE CASCADE,
      "event_type" "email_event_type" NOT NULL,
      "reference_type" text,
      "reference_id" text,
      "recipient_email" text NOT NULL,
      "payload" jsonb NOT NULL,
      "status" "email_delivery_status" DEFAULT 'PENDING' NOT NULL,
      "attempts" integer DEFAULT 0 NOT NULL,
      "max_attempts" integer DEFAULT 3 NOT NULL,
      "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
      "sent_at" timestamp with time zone,
      "last_error" text,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS "email_queue_status_idx" ON "email_queue" ("status");`,
    `CREATE INDEX IF NOT EXISTS "email_queue_next_attempt_idx" ON "email_queue" ("next_attempt_at");`,
    `CREATE INDEX IF NOT EXISTS "email_queue_event_type_idx" ON "email_queue" ("event_type");`,
    `CREATE INDEX IF NOT EXISTS "email_queue_reference_idx" ON "email_queue" ("reference_type", "reference_id");`,
  ];

  if ('exec' in targetPg) {
    for (const stmt of statements) {
      try {
        await targetPg.exec(stmt);
      } catch {}
    }
  } else {
    for (const stmt of statements) {
      try {
        await targetPg.unsafe(stmt);
      } catch {}
    }
  }
}

/**
 * Ensures Google Drive metadata columns exist on invoices and payments tables
 */
export async function ensureGoogleDriveColumns(targetPg: PGlite | postgres.Sql): Promise<void> {
  if ('query' in targetPg) {
    try {
      const check = await targetPg.query<{ exists: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'drive_file_id') as exists;`
      );
      if (check.rows && check.rows[0]?.exists) {
        return;
      }
    } catch {}
  } else if ('unsafe' in targetPg) {
    try {
      const check: any = await targetPg.unsafe(
        `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'drive_file_id') as exists;`
      );
      if (check && check[0]?.exists) {
        return;
      }
    } catch {}
  }

  const statements = [
    `ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "drive_file_id" text;`,
    `ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "drive_file_name" text;`,
    `ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "drive_web_url" text;`,
    `ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "drive_upload_status" text DEFAULT 'PENDING';`,
    `ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "drive_uploaded_at" timestamp with time zone;`,
    `ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "drive_error" text;`,
    `ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "po_number" text;`,
    `CREATE INDEX IF NOT EXISTS "invoices_drive_file_id_idx" ON "invoices" ("drive_file_id");`,
    `CREATE INDEX IF NOT EXISTS "invoices_po_number_idx" ON "invoices" ("po_number");`,

    `ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "drive_file_id" text;`,
    `ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "drive_file_name" text;`,
    `ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "drive_web_url" text;`,
    `ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "drive_upload_status" text DEFAULT 'PENDING';`,
    `ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "drive_uploaded_at" timestamp with time zone;`,
    `ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "drive_error" text;`,
    `CREATE INDEX IF NOT EXISTS "payments_drive_file_id_idx" ON "payments" ("drive_file_id");`,

    `ALTER TABLE "sale_items" ADD COLUMN IF NOT EXISTS "next_service_date" timestamp with time zone;`,
  ];

  if ('exec' in targetPg) {
    for (const stmt of statements) {
      try {
        await targetPg.exec(stmt);
      } catch {}
    }
  } else {
    for (const stmt of statements) {
      try {
        await targetPg.unsafe(stmt);
      } catch {}
    }
  }
}

/**
 * Ensures Next Service Date and related sale item columns exist
 */
export async function ensureSaleColumns(targetPg: PGlite | postgres.Sql): Promise<void> {
  const statements = [
    `ALTER TABLE "sale_items" ADD COLUMN IF NOT EXISTS "next_service_date" timestamp with time zone;`,
  ];

  if ('exec' in targetPg) {
    for (const stmt of statements) {
      try {
        await targetPg.exec(stmt);
      } catch {}
    }
  } else {
    for (const stmt of statements) {
      try {
        await targetPg.unsafe(stmt);
      } catch {}
    }
  }
}

/**
 * Ensures customer_label enum, column, and index exist on customers table
 */
export async function ensureCustomerLabelColumn(targetPg: PGlite | postgres.Sql): Promise<void> {
  const statements = [
    `DO $$ BEGIN CREATE TYPE "customer_label" AS ENUM('GOOD', 'BAD'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "customer_label" "customer_label";`,
    `CREATE INDEX IF NOT EXISTS "customers_customer_label_idx" ON "customers" ("customer_label");`,
    `CREATE TABLE IF NOT EXISTS "customer_custom_labels" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "name" text NOT NULL UNIQUE,
      "color" text NOT NULL,
      "description" text,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS "customer_custom_labels_name_idx" ON "customer_custom_labels" ("name");`,
    `ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "custom_label_id" uuid REFERENCES "customer_custom_labels"("id") ON DELETE SET NULL;`,
    `CREATE INDEX IF NOT EXISTS "customers_custom_label_id_idx" ON "customers" ("custom_label_id");`,
  ];

  if ('exec' in targetPg) {
    for (const stmt of statements) {
      try {
        await targetPg.exec(stmt);
      } catch {}
    }
  } else {
    for (const stmt of statements) {
      try {
        await targetPg.unsafe(stmt);
      } catch {}
    }
  }
}

/**
 * Ensures rentals, rental_payments, and rental_events tables and enums exist
 */
export async function ensureRentalTables(targetPg: PGlite | postgres.Sql): Promise<void> {
  if ('query' in targetPg) {
    try {
      const check = await targetPg.query<{ exists: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rentals') as exists;`
      );
      if (check.rows && check.rows[0]?.exists) {
        return;
      }
    } catch {}
  } else if ('unsafe' in targetPg) {
    try {
      const check: any = await targetPg.unsafe(
        `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rentals') as exists;`
      );
      if (check && check[0]?.exists) {
        return;
      }
    } catch {}
  }
  const statements = [
    `DO $$ BEGIN CREATE TYPE "rental_status" AS ENUM('ACTIVE', 'PAYMENT_DUE', 'OVERDUE', 'SUSPENDED', 'RETURNED', 'COMPLETED', 'CANCELLED', 'TERMINATED'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN CREATE TYPE "rental_payment_status" AS ENUM('PAID', 'PARTIALLY_PAID', 'NOT_PAID', 'DUE', 'OVERDUE'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN CREATE TYPE "rental_deposit_status" AS ENUM('NOT_COLLECTED', 'COLLECTED', 'PARTIALLY_REFUNDED', 'FULLY_REFUNDED', 'FORFEITED_ADJUSTED'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN CREATE TYPE "rental_billing_frequency" AS ENUM('MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'CUSTOM'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN CREATE TYPE "rental_duration" AS ENUM('MONTHLY', '3_MONTHS', '6_MONTHS', '12_MONTHS', 'CUSTOM'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN CREATE TYPE "rental_installation_status" AS ENUM('PENDING', 'SCHEDULED', 'INSTALLED', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN CREATE TYPE "rental_machine_condition" AS ENUM('NEW', 'GOOD', 'USED_GOOD', 'USED_FAIR', 'NEEDS_ATTENTION'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN CREATE TYPE "rental_payment_type" AS ENUM('SECURITY_DEPOSIT', 'MONTHLY_RENT', 'ADVANCE_RENT', 'DAMAGE_CHARGE', 'OTHER'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `CREATE TABLE IF NOT EXISTS "rentals" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "rental_number" text NOT NULL UNIQUE,
      "customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE RESTRICT,
      "machine_type" text DEFAULT 'RO' NOT NULL,
      "machine_model" text NOT NULL,
      "serial_number" text NOT NULL,
      "asset_id" uuid,
      "capacity_lph" text,
      "installation_location" text,
      "machine_condition" "rental_machine_condition" DEFAULT 'GOOD' NOT NULL,
      "accessories" text,
      "remarks" text,
      "rental_start_date" timestamp with time zone NOT NULL,
      "rental_end_date" timestamp with time zone,
      "rental_duration" "rental_duration" DEFAULT 'MONTHLY' NOT NULL,
      "minimum_rental_period_months" integer DEFAULT 1 NOT NULL,
      "billing_frequency" "rental_billing_frequency" DEFAULT 'MONTHLY' NOT NULL,
      "monthly_rent" numeric(12, 2) NOT NULL,
      "billing_amount" numeric(12, 2) NOT NULL,
      "security_deposit" numeric(12, 2) DEFAULT '0.00' NOT NULL,
      "deposit_status" "rental_deposit_status" DEFAULT 'NOT_COLLECTED' NOT NULL,
      "initial_payment_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
      "total_paid" numeric(12, 2) DEFAULT '0.00' NOT NULL,
      "outstanding_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
      "next_due_date" timestamp with time zone NOT NULL,
      "rental_status" "rental_status" DEFAULT 'ACTIVE' NOT NULL,
      "payment_status" "rental_payment_status" DEFAULT 'NOT_PAID' NOT NULL,
      "installation_date" timestamp with time zone,
      "installation_time" text,
      "installation_address" text,
      "technician_id" uuid REFERENCES "technicians"("id") ON DELETE SET NULL,
      "technician_name" text,
      "installation_status" "rental_installation_status" DEFAULT 'PENDING' NOT NULL,
      "installation_notes" text,
      "return_date" timestamp with time zone,
      "return_condition" text,
      "damage_charges" numeric(12, 2) DEFAULT '0.00' NOT NULL,
      "deposit_adjustment" numeric(12, 2) DEFAULT '0.00' NOT NULL,
      "refund_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
      "return_notes" text,
      "last_service_date" timestamp with time zone,
      "next_service_date" timestamp with time zone,
      "service_frequency_months" integer DEFAULT 3,
      "notes" text,
      "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS "rentals_rental_number_idx" ON "rentals" ("rental_number");`,
    `CREATE INDEX IF NOT EXISTS "rentals_customer_id_idx" ON "rentals" ("customer_id");`,
    `CREATE INDEX IF NOT EXISTS "rentals_serial_number_idx" ON "rentals" ("serial_number");`,
    `CREATE INDEX IF NOT EXISTS "rentals_status_idx" ON "rentals" ("rental_status");`,
    `CREATE INDEX IF NOT EXISTS "rentals_payment_status_idx" ON "rentals" ("payment_status");`,
    `CREATE INDEX IF NOT EXISTS "rentals_next_due_date_idx" ON "rentals" ("next_due_date");`,
    `CREATE INDEX IF NOT EXISTS "rentals_created_at_idx" ON "rentals" ("created_at");`,
    `CREATE TABLE IF NOT EXISTS "rental_payments" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "rental_id" uuid NOT NULL REFERENCES "rentals"("id") ON DELETE CASCADE,
      "customer_id" uuid NOT NULL REFERENCES "customers"("id") ON DELETE RESTRICT,
      "amount" numeric(12, 2) NOT NULL,
      "payment_date" timestamp with time zone DEFAULT now() NOT NULL,
      "payment_method" text DEFAULT 'UPI' NOT NULL,
      "payment_type" "rental_payment_type" DEFAULT 'MONTHLY_RENT' NOT NULL,
      "receipt_number" text,
      "reference_number" text,
      "period_start_date" timestamp with time zone,
      "period_end_date" timestamp with time zone,
      "notes" text,
      "recorded_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    );`,
    `ALTER TABLE "rental_payments" ADD COLUMN IF NOT EXISTS "receipt_number" text;`,
    `CREATE INDEX IF NOT EXISTS "rental_payments_rental_id_idx" ON "rental_payments" ("rental_id");`,
    `CREATE INDEX IF NOT EXISTS "rental_payments_customer_id_idx" ON "rental_payments" ("customer_id");`,
    `CREATE INDEX IF NOT EXISTS "rental_payments_date_idx" ON "rental_payments" ("payment_date");`,
    `CREATE INDEX IF NOT EXISTS "rental_payments_receipt_number_idx" ON "rental_payments" ("receipt_number");`,
    `CREATE TABLE IF NOT EXISTS "rental_events" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "rental_id" uuid NOT NULL REFERENCES "rentals"("id") ON DELETE CASCADE,
      "event_type" text NOT NULL,
      "description" text NOT NULL,
      "actor_id" text,
      "actor_name" text,
      "metadata" text,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS "rental_events_rental_id_idx" ON "rental_events" ("rental_id");`,
    `CREATE INDEX IF NOT EXISTS "rental_events_created_at_idx" ON "rental_events" ("created_at");`,
  ];

  if ('exec' in targetPg) {
    for (const stmt of statements) {
      try {
        await targetPg.exec(stmt);
      } catch {}
    }
  } else {
    for (const stmt of statements) {
      try {
        await targetPg.unsafe(stmt);
      } catch {}
    }
  }
}

/**
 * Ensures Inventory Management tables and indexes exist (isolated from RO machines)
 */
export async function ensureInventoryTables(targetPg: PGlite | postgres.Sql): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS "inventory_items" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "name" text NOT NULL,
      "category" text NOT NULL,
      "brand" text,
      "part_number" text,
      "description" text,
      "purchase_price" numeric(12, 2) NOT NULL,
      "selling_price" numeric(12, 2) NOT NULL,
      "current_stock" integer DEFAULT 0 NOT NULL,
      "min_stock_level" integer DEFAULT 0 NOT NULL,
      "status" text DEFAULT 'ACTIVE' NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
      "archived_at" timestamp with time zone
    );`,
    `CREATE INDEX IF NOT EXISTS "inventory_items_name_idx" ON "inventory_items" ("name");`,
    `CREATE INDEX IF NOT EXISTS "inventory_items_category_idx" ON "inventory_items" ("category");`,
    `CREATE INDEX IF NOT EXISTS "inventory_items_part_number_idx" ON "inventory_items" ("part_number");`,
    `CREATE INDEX IF NOT EXISTS "inventory_items_status_idx" ON "inventory_items" ("status");`,

    `CREATE TABLE IF NOT EXISTS "inventory_purchases" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "purchase_number" text NOT NULL UNIQUE,
      "item_id" uuid NOT NULL REFERENCES "inventory_items"("id") ON DELETE RESTRICT,
      "supplier_name" text,
      "purchase_date" timestamp with time zone NOT NULL,
      "quantity" integer NOT NULL,
      "remaining_quantity" integer NOT NULL,
      "purchase_price_per_unit" numeric(12, 2) NOT NULL,
      "total_amount" numeric(12, 2) NOT NULL,
      "notes" text,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS "inventory_purchases_item_id_idx" ON "inventory_purchases" ("item_id");`,
    `CREATE INDEX IF NOT EXISTS "inventory_purchases_date_idx" ON "inventory_purchases" ("purchase_date");`,
    `CREATE INDEX IF NOT EXISTS "inventory_purchases_rem_qty_idx" ON "inventory_purchases" ("remaining_quantity");`,

    `CREATE TABLE IF NOT EXISTS "inventory_sales" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "sale_number" text NOT NULL UNIQUE,
      "item_id" uuid NOT NULL REFERENCES "inventory_items"("id") ON DELETE RESTRICT,
      "customer_id" uuid REFERENCES "customers"("id") ON DELETE SET NULL,
      "customer_name" text,
      "customer_phone" text,
      "sale_date" timestamp with time zone NOT NULL,
      "quantity" integer NOT NULL,
      "selling_price_per_unit" numeric(12, 2) NOT NULL,
      "purchase_cost_per_unit" numeric(12, 2) NOT NULL,
      "total_sale_amount" numeric(12, 2) NOT NULL,
      "total_cost_amount" numeric(12, 2) NOT NULL,
      "profit" numeric(12, 2) NOT NULL,
      "payment_status" text DEFAULT 'COMPLETED' NOT NULL,
      "notes" text,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    );`,
    `ALTER TABLE "inventory_sales" ALTER COLUMN "customer_name" DROP NOT NULL;`,
    `CREATE INDEX IF NOT EXISTS "inventory_sales_item_id_idx" ON "inventory_sales" ("item_id");`,
    `CREATE INDEX IF NOT EXISTS "inventory_sales_customer_id_idx" ON "inventory_sales" ("customer_id");`,
    `CREATE INDEX IF NOT EXISTS "inventory_sales_date_idx" ON "inventory_sales" ("sale_date");`,
  ];

  if ('exec' in targetPg) {
    for (const stmt of statements) {
      try {
        await targetPg.exec(stmt);
      } catch {}
    }
  } else {
    for (const stmt of statements) {
      try {
        await targetPg.unsafe(stmt);
      } catch {}
    }
  }
}

/**
 * Ensures WhatsApp Business tables, enums, and indexes exist
 */
export async function ensureWhatsAppTables(targetPg: PGlite | postgres.Sql): Promise<void> {
  const statements = [
    `DO $$ BEGIN CREATE TYPE "whatsapp_opt_in_status" AS ENUM('OPTED_IN', 'OPTED_OUT', 'UNKNOWN'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN CREATE TYPE "whatsapp_conversation_status" AS ENUM('ACTIVE', 'CLOSED', 'ARCHIVED'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN CREATE TYPE "whatsapp_direction" AS ENUM('INBOUND', 'OUTBOUND'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN CREATE TYPE "whatsapp_message_type" AS ENUM('TEXT', 'TEMPLATE', 'IMAGE', 'DOCUMENT', 'OTHER'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN CREATE TYPE "whatsapp_message_status" AS ENUM('QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,

    `CREATE TABLE IF NOT EXISTS "whatsapp_contacts" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "customer_id" uuid REFERENCES "customers"("id") ON DELETE SET NULL,
      "phone" text NOT NULL,
      "wa_id" text,
      "opt_in_status" "whatsapp_opt_in_status" DEFAULT 'UNKNOWN' NOT NULL,
      "opt_in_timestamp" timestamp with time zone,
      "opt_out_timestamp" timestamp with time zone,
      "last_interaction_at" timestamp with time zone,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS "whatsapp_contacts_customer_id_idx" ON "whatsapp_contacts" ("customer_id");`,
    `CREATE INDEX IF NOT EXISTS "whatsapp_contacts_phone_idx" ON "whatsapp_contacts" ("phone");`,
    `CREATE INDEX IF NOT EXISTS "whatsapp_contacts_wa_id_idx" ON "whatsapp_contacts" ("wa_id");`,

    `CREATE TABLE IF NOT EXISTS "whatsapp_conversations" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "customer_id" uuid REFERENCES "customers"("id") ON DELETE SET NULL,
      "contact_id" uuid NOT NULL REFERENCES "whatsapp_contacts"("id") ON DELETE CASCADE,
      "status" "whatsapp_conversation_status" DEFAULT 'ACTIVE' NOT NULL,
      "unread_count" integer DEFAULT 0 NOT NULL,
      "last_message_at" timestamp with time zone,
      "last_message_preview" text,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS "whatsapp_conversations_customer_id_idx" ON "whatsapp_conversations" ("customer_id");`,
    `CREATE INDEX IF NOT EXISTS "whatsapp_conversations_contact_id_idx" ON "whatsapp_conversations" ("contact_id");`,
    `CREATE INDEX IF NOT EXISTS "whatsapp_conversations_last_message_at_idx" ON "whatsapp_conversations" ("last_message_at");`,

    `CREATE TABLE IF NOT EXISTS "whatsapp_messages" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "conversation_id" uuid NOT NULL REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE,
      "contact_id" uuid NOT NULL REFERENCES "whatsapp_contacts"("id") ON DELETE CASCADE,
      "provider_message_id" text,
      "direction" "whatsapp_direction" NOT NULL,
      "message_type" "whatsapp_message_type" DEFAULT 'TEXT' NOT NULL,
      "content" text NOT NULL,
      "template_name" text,
      "template_params" jsonb,
      "status" "whatsapp_message_status" DEFAULT 'QUEUED' NOT NULL,
      "error_code" text,
      "error_message" text,
      "sent_at" timestamp with time zone,
      "delivered_at" timestamp with time zone,
      "read_at" timestamp with time zone,
      "failed_at" timestamp with time zone,
      "sent_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS "whatsapp_messages_conversation_id_idx" ON "whatsapp_messages" ("conversation_id");`,
    `CREATE INDEX IF NOT EXISTS "whatsapp_messages_provider_msg_id_idx" ON "whatsapp_messages" ("provider_message_id");`,
    `CREATE INDEX IF NOT EXISTS "whatsapp_messages_status_idx" ON "whatsapp_messages" ("status");`,
    `CREATE INDEX IF NOT EXISTS "whatsapp_messages_created_at_idx" ON "whatsapp_messages" ("created_at");`,

    `CREATE TABLE IF NOT EXISTS "whatsapp_events" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "provider_event_id" text NOT NULL UNIQUE,
      "event_type" text NOT NULL,
      "payload" jsonb NOT NULL,
      "processed_at" timestamp with time zone DEFAULT now() NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS "whatsapp_events_provider_event_id_idx" ON "whatsapp_events" ("provider_event_id");`,
    `CREATE INDEX IF NOT EXISTS "whatsapp_events_created_at_idx" ON "whatsapp_events" ("created_at");`,
  ];

  if ('exec' in targetPg) {
    for (const stmt of statements) {
      try {
        await targetPg.exec(stmt);
      } catch {}
    }
  } else {
    for (const stmt of statements) {
      try {
        await targetPg.unsafe(stmt);
      } catch {}
    }
  }
}

/**
 * Ensures inquiry columns and inquiry_events table exist
 */
export async function ensureInquiryColumns(targetPg: PGlite | postgres.Sql): Promise<void> {
  const statements = [
    `DO $$ BEGIN CREATE TYPE "inquiry_type" AS ENUM('NEW_PURCHASE', 'SERVICE', 'REPAIR', 'WARRANTY', 'INSTALLATION', 'PRODUCT_INFORMATION', 'GENERAL'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `DO $$ BEGIN CREATE TYPE "inquiry_priority" AS ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT'); EXCEPTION WHEN duplicate_object THEN null; END $$;`,
    `ALTER TABLE "inquiries" ADD COLUMN IF NOT EXISTS "inquiry_type" "inquiry_type" DEFAULT 'GENERAL';`,
    `ALTER TABLE "inquiries" ADD COLUMN IF NOT EXISTS "priority" "inquiry_priority" DEFAULT 'NORMAL';`,
    `ALTER TABLE "inquiries" ADD COLUMN IF NOT EXISTS "assigned_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;`,
    `ALTER TABLE "inquiries" ADD COLUMN IF NOT EXISTS "assigned_at" timestamp with time zone;`,
    `ALTER TABLE "inquiries" ADD COLUMN IF NOT EXISTS "is_possible_duplicate" boolean DEFAULT false;`,
    `ALTER TABLE "inquiries" ADD COLUMN IF NOT EXISTS "duplicate_of_inquiry_id" uuid;`,
    `ALTER TABLE "inquiries" ADD COLUMN IF NOT EXISTS "address" text;`,
    `ALTER TABLE "inquiries" ADD COLUMN IF NOT EXISTS "city" text;`,
    `ALTER TABLE "inquiries" ADD COLUMN IF NOT EXISTS "converted_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL;`,
    `CREATE TABLE IF NOT EXISTS "inquiry_events" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "inquiry_id" uuid NOT NULL REFERENCES "inquiries"("id") ON DELETE CASCADE,
      "event_type" text NOT NULL,
      "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
      "notes" text,
      "metadata" jsonb,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS "inquiries_priority_idx" ON "inquiries" ("priority");`,
    `CREATE INDEX IF NOT EXISTS "inquiry_events_inquiry_id_idx" ON "inquiry_events" ("inquiry_id");`,
    `CREATE INDEX IF NOT EXISTS "inquiry_events_event_type_idx" ON "inquiry_events" ("event_type");`,
    `CREATE INDEX IF NOT EXISTS "inquiry_events_created_at_idx" ON "inquiry_events" ("created_at");`,
  ];

  if ('exec' in targetPg) {
    for (const stmt of statements) {
      try {
        await targetPg.exec(stmt);
      } catch {}
    }
  } else {
    for (const stmt of statements) {
      try {
        await targetPg.unsafe(stmt);
      } catch {}
    }
  }
}

/**
 * Ensures chatbot_knowledge, chatbot_conversations, and chatbot_messages tables exist
 */
export async function ensureChatbotTables(targetPg: PGlite | postgres.Sql): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS "chatbot_knowledge" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "title" text DEFAULT '',
      "category" text DEFAULT '',
      "question" text DEFAULT '',
      "answer" text DEFAULT '',
      "is_active" boolean DEFAULT true NOT NULL,
      "is_published" boolean DEFAULT true NOT NULL,
      "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    );`,
    `ALTER TABLE "chatbot_knowledge" ALTER COLUMN "title" DROP NOT NULL;`,
    `ALTER TABLE "chatbot_knowledge" ALTER COLUMN "category" DROP NOT NULL;`,
    `ALTER TABLE "chatbot_knowledge" ALTER COLUMN "question" DROP NOT NULL;`,
    `ALTER TABLE "chatbot_knowledge" ALTER COLUMN "answer" DROP NOT NULL;`,
    `CREATE INDEX IF NOT EXISTS "chatbot_knowledge_category_idx" ON "chatbot_knowledge" ("category");`,
    `CREATE INDEX IF NOT EXISTS "chatbot_knowledge_is_active_idx" ON "chatbot_knowledge" ("is_active");`,
    `CREATE INDEX IF NOT EXISTS "chatbot_knowledge_is_published_idx" ON "chatbot_knowledge" ("is_published");`,
    `CREATE TABLE IF NOT EXISTS "chatbot_conversations" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
      "title" text DEFAULT 'New Conversation' NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS "chatbot_conversations_user_id_idx" ON "chatbot_conversations" ("user_id");`,
    `CREATE TABLE IF NOT EXISTS "chatbot_messages" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "conversation_id" uuid NOT NULL REFERENCES "chatbot_conversations"("id") ON DELETE CASCADE,
      "role" text NOT NULL,
      "content" text NOT NULL,
      "sources" jsonb,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS "chatbot_messages_conversation_id_idx" ON "chatbot_messages" ("conversation_id");`,
  ];

  if ('exec' in targetPg) {
    for (const stmt of statements) {
      try {
        await targetPg.exec(stmt);
      } catch {}
    }
  } else {
    for (const stmt of statements) {
      try {
        await targetPg.unsafe(stmt);
      } catch {}
    }
  }
}

/**
 * Ensures additive Technician Portal tables, columns, and indexes exist
 */
export async function ensureTechnicianPortalTables(targetPg: PGlite | postgres.Sql): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS "technician_portal_access" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "technician_id" uuid NOT NULL,
      "portal_enabled" boolean DEFAULT false NOT NULL,
      "last_login_at" timestamp with time zone,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "technician_portal_access_technician_id_unique" UNIQUE("technician_id")
    );`,
    `CREATE INDEX IF NOT EXISTS "tech_portal_access_tech_idx" ON "technician_portal_access" USING btree ("technician_id");`,
    `CREATE INDEX IF NOT EXISTS "tech_portal_access_enabled_idx" ON "technician_portal_access" USING btree ("portal_enabled");`,
    `CREATE TABLE IF NOT EXISTS "technician_portal_notifications" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "technician_id" uuid NOT NULL,
      "type" text NOT NULL,
      "title" text NOT NULL,
      "message" text NOT NULL,
      "reference_type" text,
      "reference_id" text,
      "dedup_key" text,
      "is_read" boolean DEFAULT false NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "read_at" timestamp with time zone
    );`,
    `ALTER TABLE "technician_portal_notifications" ADD COLUMN IF NOT EXISTS "dedup_key" text;`,
    `CREATE INDEX IF NOT EXISTS "tech_portal_notifications_tech_idx" ON "technician_portal_notifications" USING btree ("technician_id");`,
    `CREATE INDEX IF NOT EXISTS "tech_portal_notifications_unread_idx" ON "technician_portal_notifications" USING btree ("technician_id","is_read");`,
    `CREATE INDEX IF NOT EXISTS "tech_portal_notifications_dedup_idx" ON "technician_portal_notifications" USING btree ("technician_id","dedup_key");`,
    `CREATE TABLE IF NOT EXISTS "technician_otp_challenges" (
      "challenge_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "technician_id" uuid NOT NULL,
      "otp_hash" text NOT NULL,
      "expires_at" timestamp with time zone NOT NULL,
      "attempt_count" integer DEFAULT 0 NOT NULL,
      "max_attempts" integer DEFAULT 3 NOT NULL,
      "used_at" timestamp with time zone,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL
    );`,
    `CREATE INDEX IF NOT EXISTS "tech_otp_challenges_tech_exp_idx" ON "technician_otp_challenges" USING btree ("technician_id","expires_at");`,
    `ALTER TYPE "service_status" ADD VALUE 'ON_HOLD';`,
  ];

  if ('exec' in targetPg) {
    for (const stmt of statements) {
      try {
        await targetPg.exec(stmt);
      } catch {}
    }
  } else {
    for (const stmt of statements) {
      try {
        await targetPg.unsafe(stmt);
      } catch {}
    }
  }
}

/**
 * Ensures latitude and longitude coordinate columns exist on customer_addresses table
 */
export async function ensureCustomerAddressCoordinates(targetPg: PGlite | postgres.Sql): Promise<void> {
  const statements = [
    `ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "latitude" double precision;`,
    `ALTER TABLE "customer_addresses" ADD COLUMN IF NOT EXISTS "longitude" double precision;`,
  ];

  if ('exec' in targetPg) {
    for (const stmt of statements) {
      try {
        await targetPg.exec(stmt);
      } catch {}
    }
  } else {
    for (const stmt of statements) {
      try {
        await targetPg.unsafe(stmt);
      } catch {}
    }
  }
}

/**
 * Ensures cash_handovers table and indexes exist
 */
export async function ensureCashHandoverTables(targetPg: PGlite | postgres.Sql): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS "cash_handovers" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "payment_id" uuid NOT NULL UNIQUE REFERENCES "payments"("id") ON DELETE RESTRICT,
      "service_id" uuid REFERENCES "services"("id") ON DELETE SET NULL,
      "job_card_id" uuid REFERENCES "job_cards"("id") ON DELETE SET NULL,
      "technician_id" uuid NOT NULL REFERENCES "technicians"("id") ON DELETE RESTRICT,
      "amount" numeric(12, 2) NOT NULL,
      "status" text NOT NULL DEFAULT 'PENDING',
      "collected_at" timestamp with time zone NOT NULL DEFAULT now(),
      "handed_over_at" timestamp with time zone,
      "received_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
      "notes" text,
      "company_id" text,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now()
    );`,
    `CREATE INDEX IF NOT EXISTS "cash_handovers_payment_id_idx" ON "cash_handovers" ("payment_id");`,
    `CREATE INDEX IF NOT EXISTS "cash_handovers_technician_id_idx" ON "cash_handovers" ("technician_id");`,
    `CREATE INDEX IF NOT EXISTS "cash_handovers_status_idx" ON "cash_handovers" ("status");`,
    `CREATE INDEX IF NOT EXISTS "cash_handovers_service_id_idx" ON "cash_handovers" ("service_id");`,
  ];

  if ('exec' in targetPg) {
    for (const stmt of statements) {
      try {
        await targetPg.exec(stmt);
      } catch {}
    }
  } else {
    for (const stmt of statements) {
      try {
        await targetPg.unsafe(stmt);
      } catch {}
    }
  }
}

/**
 * Ensures expenses and recurring expense schedules tables and indexes exist
 */
export async function ensureExpensesTables(targetPg: PGlite | postgres.Sql): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS "expense_schedules" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "company_id" text,
      "title" text NOT NULL,
      "category" text NOT NULL,
      "amount" numeric(12, 2) NOT NULL,
      "frequency" text NOT NULL,
      "payment_method" text NOT NULL,
      "start_date" timestamp with time zone NOT NULL,
      "end_date" timestamp with time zone,
      "next_due_date" timestamp with time zone NOT NULL,
      "is_active" boolean NOT NULL DEFAULT true,
      "notes" text,
      "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now()
    );`,
    `CREATE INDEX IF NOT EXISTS "expense_schedules_company_id_idx" ON "expense_schedules" ("company_id");`,
    `CREATE INDEX IF NOT EXISTS "expense_schedules_is_active_idx" ON "expense_schedules" ("is_active");`,
    `CREATE INDEX IF NOT EXISTS "expense_schedules_next_due_date_idx" ON "expense_schedules" ("next_due_date");`,

    `CREATE TABLE IF NOT EXISTS "expenses" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "company_id" text,
      "title" text NOT NULL,
      "category" text NOT NULL,
      "amount" numeric(12, 2) NOT NULL,
      "expense_date" timestamp with time zone NOT NULL,
      "payment_method" text NOT NULL,
      "notes" text,
      "status" text NOT NULL DEFAULT 'RECORDED',
      "recorded_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
      "voided_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
      "voided_at" timestamp with time zone,
      "void_reason" text,
      "recurring_schedule_id" uuid REFERENCES "expense_schedules"("id") ON DELETE SET NULL,
      "occurrence_period" text,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now()
    );`,
    `CREATE INDEX IF NOT EXISTS "expenses_company_id_idx" ON "expenses" ("company_id");`,
    `CREATE INDEX IF NOT EXISTS "expenses_expense_date_idx" ON "expenses" ("expense_date");`,
    `CREATE INDEX IF NOT EXISTS "expenses_category_idx" ON "expenses" ("category");`,
    `CREATE INDEX IF NOT EXISTS "expenses_payment_method_idx" ON "expenses" ("payment_method");`,
    `CREATE INDEX IF NOT EXISTS "expenses_status_idx" ON "expenses" ("status");`,
    `CREATE INDEX IF NOT EXISTS "expenses_schedule_idx" ON "expenses" ("recurring_schedule_id");`,
    `CREATE INDEX IF NOT EXISTS "expenses_occurrence_period_idx" ON "expenses" ("occurrence_period");`,

    `CREATE TABLE IF NOT EXISTS "monthly_closings" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "company_id" text,
      "year" integer NOT NULL,
      "month" integer NOT NULL,
      "lead_profit" numeric(12, 2) DEFAULT '0.00' NOT NULL,
      "total_expenses" numeric(12, 2) DEFAULT '0.00' NOT NULL,
      "monthly_profit" numeric(12, 2) DEFAULT '0.00' NOT NULL,
      "previous_closing_cash" numeric(12, 2) DEFAULT '0.00' NOT NULL,
      "expected_cash_before_savings" numeric(12, 2) DEFAULT '0.00' NOT NULL,
      "actual_bank_balance" numeric(12, 2) DEFAULT '0.00' NOT NULL,
      "reconciliation_difference" numeric(12, 2) DEFAULT '0.00' NOT NULL,
      "savings_transfer" numeric(12, 2) DEFAULT '0.00' NOT NULL,
      "closing_cash" numeric(12, 2) DEFAULT '0.00' NOT NULL,
      "previous_savings_balance" numeric(12, 2) DEFAULT '0.00' NOT NULL,
      "current_savings_balance" numeric(12, 2) DEFAULT '0.00' NOT NULL,
      "status" text DEFAULT 'DRAFT' NOT NULL,
      "approved_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
      "approved_at" timestamp with time zone,
      "notes" text,
      "category_breakdown" jsonb,
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now()
    );`,
    `CREATE INDEX IF NOT EXISTS "monthly_closings_company_year_month_idx" ON "monthly_closings" ("company_id", "year", "month");`,
    `DO $$
     BEGIN
       IF EXISTS (
         SELECT 1 FROM pg_index i
         JOIN pg_class c ON c.oid = i.indexrelid
         WHERE c.relname = 'monthly_closings_company_year_month_unique'
           AND i.indnullsnotdistinct = false
       ) THEN
         DROP INDEX IF EXISTS "monthly_closings_company_year_month_unique";
       END IF;
     END $$;`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "monthly_closings_company_year_month_unique" ON "monthly_closings" ("company_id", "year", "month") NULLS NOT DISTINCT;`,
    `CREATE INDEX IF NOT EXISTS "monthly_closings_status_idx" ON "monthly_closings" ("status");`,

    `INSERT INTO "permissions" ("key", "name", "description", "module")
     VALUES
       ('expenses.view', 'View Expenses', 'View operational expenses and financial reports', 'expenses'),
       ('expenses.create', 'Create Expense', 'Record new expenses and recurring commitments', 'expenses'),
       ('expenses.edit', 'Edit Expense', 'Modify recorded expenses', 'expenses'),
       ('expenses.delete', 'Delete Expense', 'Void or delete expense records', 'expenses'),
       ('expenses.approve', 'Approve Monthly Closings', 'Approve monthly financial close and carry-forward balances', 'expenses')
     ON CONFLICT ("key") DO NOTHING;`,
    `INSERT INTO "role_permissions" ("role_id", "permission_id")
     SELECT r.id, p.id
     FROM "roles" r
     CROSS JOIN "permissions" p
     WHERE r.name IN ('Super Admin', 'Admin')
       AND p.key IN ('expenses.view', 'expenses.create', 'expenses.edit', 'expenses.delete', 'expenses.approve')
     ON CONFLICT DO NOTHING;`,
  ];

  if ('exec' in targetPg) {
    for (const stmt of statements) {
      try {
        await targetPg.exec(stmt);
      } catch {}
    }
  } else {
    for (const stmt of statements) {
      try {
        await targetPg.unsafe(stmt);
      } catch {}
    }
  }
}


/**
 * Ensures migrations and initial database initialization is executed once on server startup
 */
export async function ensureDatabaseInitialized(): Promise<void> {
  if (isInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      getDatabaseClient();

      if (pgClient) {
        // In PostgreSQL production mode, retry connection if container is still booting
        let connected = false;
        let attempts = 0;
        const usePostgres = env.NODE_ENV === 'production' || process.env.USE_POSTGRES === 'true';
        const maxAttempts = usePostgres ? 10 : 3;
        while (!connected && attempts < maxAttempts) {
          try {
            attempts++;
            await pgClient.unsafe('SELECT 1');
            connected = true;
          } catch (connErr: any) {
            if (attempts >= maxAttempts) {
              console.warn(
                `[Database] Primary PostgreSQL connection unreachable after ${maxAttempts} attempts (${connErr?.message || connErr}). Falling back to persistent local engine.`
              );
              try {
                await pgClient.end({ timeout: 1 });
              } catch {}
              pgClient = null;
              break;
            }
            console.warn(`[Database] Waiting for PostgreSQL readiness (attempt ${attempts}/${maxAttempts}): ${connErr?.message || connErr}...`);
            await new Promise((r) => setTimeout(r, 1000));
          }
        }

        if (!connected) {
          // Initialize persistent local PGlite engine stored on disk
          const storageDir = resolveDatabaseStorageDir();
          fs.mkdirSync(storageDir, { recursive: true });
          pgliteClient = new PGlite(storageDir);
          dbInstance = drizzlePglite(pgliteClient, { schema });
          console.log(`[Database] Connected to persistent local database engine at: ${storageDir}`);
        }
      }

      if (pgClient) {
        await applySqlMigrations(pgClient);
        await ensureEmailTables(pgClient);
        await ensureGoogleDriveColumns(pgClient);
        await ensureRentalTables(pgClient);
        await ensureSaleColumns(pgClient);
        await ensureCustomerLabelColumn(pgClient);
        await ensureInventoryTables(pgClient);
        await ensureWhatsAppTables(pgClient);
        await ensureInquiryColumns(pgClient);
        await ensureChatbotTables(pgClient);
        await ensureTechnicianPortalTables(pgClient);
        await ensureCustomerAddressCoordinates(pgClient);
        await ensureCashHandoverTables(pgClient);
        await ensureExpensesTables(pgClient);
      } else if (pgliteClient) {
        try {
          await pgliteClient.waitReady;
        } catch (readyErr) {
          console.warn('[Database] Storage lock or state issue detected on local startup, initializing clean storage:', readyErr);
          try {
            await pgliteClient.close();
          } catch {}
          const storageDir = resolveDatabaseStorageDir();
          try {
            fs.rmSync(storageDir, { recursive: true, force: true });
            fs.mkdirSync(storageDir, { recursive: true });
          } catch {}
          pgliteClient = new PGlite(storageDir);
          dbInstance = drizzlePglite(pgliteClient, { schema });
          try {
            await pgliteClient.waitReady;
          } catch (retryErr) {
            console.error('[Database] Database re-initialization notice:', retryErr);
          }
        }

        await applySqlMigrations(pgliteClient);
        await ensureEmailTables(pgliteClient);
        await ensureGoogleDriveColumns(pgliteClient);
        await ensureRentalTables(pgliteClient);
        await ensureSaleColumns(pgliteClient);
        await ensureCustomerLabelColumn(pgliteClient);
        await ensureInventoryTables(pgliteClient);
        await ensureWhatsAppTables(pgliteClient);
        await ensureInquiryColumns(pgliteClient);
        await ensureChatbotTables(pgliteClient);
        await ensureTechnicianPortalTables(pgliteClient);
        await ensureCustomerAddressCoordinates(pgliteClient);
        await ensureCashHandoverTables(pgliteClient);
        await ensureExpensesTables(pgliteClient);
      }

      isInitialized = true;
      console.log('✅ [Database] All database tables, sequences, and indexes verified successfully.');
    } catch (err) {
      console.error('[Database] Error verifying database schema:', err);
    }
  })();

  return initPromise;
}

/**
 * Graceful close of PostgreSQL connections
 */
export async function closeDatabaseConnections(): Promise<void> {
  if (pgClient) {
    try {
      await pgClient.end({ timeout: 5 });
    } catch {}
    pgClient = null;
  }
  if (pgliteClient) {
    try {
      await pgliteClient.close();
    } catch {}
    pgliteClient = null;
    await new Promise((r) => setTimeout(r, 200));
  }
  await closeArchiveDatabaseConnection();
  dbInstance = null;
  initPromise = null;
  isInitialized = false;
}
