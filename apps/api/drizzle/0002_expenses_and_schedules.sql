CREATE TABLE IF NOT EXISTS "expense_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" text,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"frequency" text NOT NULL,
	"payment_method" text NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone,
	"next_due_date" timestamp with time zone NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE restrict,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "expense_schedules_company_id_idx" ON "expense_schedules" ("company_id");
CREATE INDEX IF NOT EXISTS "expense_schedules_is_active_idx" ON "expense_schedules" ("is_active");
CREATE INDEX IF NOT EXISTS "expense_schedules_next_due_date_idx" ON "expense_schedules" ("next_due_date");

CREATE TABLE IF NOT EXISTS "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" text,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"expense_date" timestamp with time zone NOT NULL,
	"payment_method" text NOT NULL,
	"notes" text,
	"status" text DEFAULT 'RECORDED' NOT NULL,
	"recorded_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE restrict,
	"voided_by" uuid REFERENCES "users"("id") ON DELETE set null,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"recurring_schedule_id" uuid REFERENCES "expense_schedules"("id") ON DELETE set null,
	"occurrence_period" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "expenses_company_id_idx" ON "expenses" ("company_id");
CREATE INDEX IF NOT EXISTS "expenses_expense_date_idx" ON "expenses" ("expense_date");
CREATE INDEX IF NOT EXISTS "expenses_category_idx" ON "expenses" ("category");
CREATE INDEX IF NOT EXISTS "expenses_payment_method_idx" ON "expenses" ("payment_method");
CREATE INDEX IF NOT EXISTS "expenses_status_idx" ON "expenses" ("status");
CREATE INDEX IF NOT EXISTS "expenses_schedule_idx" ON "expenses" ("recurring_schedule_id");
CREATE INDEX IF NOT EXISTS "expenses_occurrence_period_idx" ON "expenses" ("occurrence_period");
