CREATE TABLE IF NOT EXISTS "monthly_closings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
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
	"approved_by" uuid REFERENCES "users"("id") ON DELETE set null,
	"approved_at" timestamp with time zone,
	"notes" text,
	"category_breakdown" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "monthly_closings_company_year_month_idx" ON "monthly_closings" ("company_id", "year", "month");
CREATE UNIQUE INDEX IF NOT EXISTS "monthly_closings_company_year_month_unique" ON "monthly_closings" ("company_id", "year", "month") NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS "monthly_closings_status_idx" ON "monthly_closings" ("status");
