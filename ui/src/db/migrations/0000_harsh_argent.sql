CREATE TYPE "public"."account_type" AS ENUM('local_bank', 'usd_bank', 'fintech', 'crypto_exchange', 'stablecoin_wallet', 'cash');--> statement-breakpoint
CREATE TYPE "public"."fx_rate_type" AS ENUM('interbank', 'open_market');--> statement-breakpoint
CREATE TYPE "public"."recommendation_status" AS ENUM('new', 'acted', 'dismissed', 'snoozed');--> statement-breakpoint
CREATE TYPE "public"."txn_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TYPE "public"."txn_status" AS ENUM('confirmed', 'needs_review');--> statement-breakpoint
CREATE TYPE "public"."txn_type" AS ENUM('income', 'expense', 'transfer', 'investment');--> statement-breakpoint
CREATE TYPE "public"."upload_status" AS ENUM('pending', 'extracted', 'confirmed', 'failed');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp,
	"refreshTokenExpiresAt" timestamp,
	"scope" text,
	"password" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" "account_type" NOT NULL,
	"currency" text NOT NULL,
	"institution" text,
	"current_balance" numeric(20, 4) DEFAULT '0' NOT NULL,
	"last_reconciled_at" timestamp with time zone,
	"notes" text,
	"archived" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"base" text NOT NULL,
	"quote" text NOT NULL,
	"rate" numeric(20, 8) NOT NULL,
	"rate_type" "fx_rate_type" NOT NULL,
	"source" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "news_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"relevance_tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"exposure_note" text,
	"published_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"id" text PRIMARY KEY DEFAULT 'me' NOT NULL,
	"geography" text,
	"display_currency_pref" text DEFAULT 'USD' NOT NULL,
	"home_currency" text DEFAULT 'PKR' NOT NULL,
	"capability_graph_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"psychology_notes_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preferences_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"reasoning" text NOT NULL,
	"grounding_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "recommendation_status" DEFAULT 'new' NOT NULL,
	"snoozed_until" timestamp with time zone,
	"outcome_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"upload_id" uuid,
	"external_id" text,
	"amount" numeric(20, 4) NOT NULL,
	"currency" text NOT NULL,
	"direction" "txn_direction" NOT NULL,
	"txn_type" "txn_type" DEFAULT 'expense' NOT NULL,
	"counterparty" text,
	"category" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"confidence" real,
	"raw_extracted_json" jsonb,
	"status" "txn_status" DEFAULT 'needs_review' NOT NULL,
	"transfer_link_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blob_key" text NOT NULL,
	"content_type" text,
	"byte_size" integer,
	"status" "upload_status" DEFAULT 'pending' NOT NULL,
	"detected_institution" text,
	"detected_account_id" uuid,
	"extraction_raw_json" jsonb,
	"error" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_detected_account_id_accounts_id_fk" FOREIGN KEY ("detected_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fx_rates_pair_type_fetched_idx" ON "fx_rates" USING btree ("base","quote","rate_type","fetched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "news_items_url_uq" ON "news_items" USING btree ("url");--> statement-breakpoint
CREATE INDEX "news_items_published_idx" ON "news_items" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "recommendations_status_created_idx" ON "recommendations" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_account_external_id_uq" ON "transactions" USING btree ("account_id","external_id") WHERE "transactions"."external_id" is not null;--> statement-breakpoint
CREATE INDEX "transactions_account_occurred_idx" ON "transactions" USING btree ("account_id","occurred_at");--> statement-breakpoint
CREATE INDEX "transactions_occurred_idx" ON "transactions" USING btree ("occurred_at");