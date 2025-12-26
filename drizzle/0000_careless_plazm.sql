CREATE TABLE IF NOT EXISTS "set_lookup_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text,
	"currency" text DEFAULT 'USD' NOT NULL,
	"force_refresh" boolean DEFAULT false NOT NULL,
	"input_sets" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"total_sets" integer NOT NULL,
	"error_summary" jsonb,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "set_price_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_fetched_at" timestamp DEFAULT now() NOT NULL,
	"set_number" text NOT NULL,
	"condition" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"item_type" text DEFAULT 'SET',
	"item_name" text,
	"items_sold" integer,
	"avg_sold_price" numeric(10, 2),
	"min_sold_price" numeric(10, 2),
	"max_sold_price" numeric(10, 2),
	"qty_sold_avg" numeric(10, 2),
	"items_for_sale" integer,
	"avg_sale_price" numeric(10, 2),
	"min_sale_price" numeric(10, 2),
	"max_sale_price" numeric(10, 2),
	"qty_for_sale_avg" numeric(10, 2),
	"raw_data" jsonb,
	"is_valid" boolean DEFAULT true NOT NULL,
	"error_message" text
);
