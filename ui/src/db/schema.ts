/**
 * WealthFlow AI — database schema (Drizzle / Postgres).
 *
 * Multi-tenant: per-user data tables (accounts, uploads, transactions,
 * recommendations, profile) carry an `owner_id` → `user.id` (cascade delete).
 * `fx_rates` and `news_items` are GLOBAL (market data, not personal). Better Auth
 * owns `user/session/account/verification`. Mastra keeps its own `mastra_*` tables
 * (storage + memory) via @mastra/pg — they are NOT defined here; drizzle-kit only
 * manages the tables in this file.
 *
 * Money is stored as `numeric` (arbitrary precision) and read back as a string by
 * the `postgres` driver — never use JS floats for balances/amounts. Helpers in
 * src/db/money.ts wrap the conversions.
 */
import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  numeric,
  timestamp,
  jsonb,
  real,
  integer,
  boolean,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ── enums ────────────────────────────────────────────────────────────────────

export const accountTypeEnum = pgEnum("account_type", [
  "local_bank", // e.g. Meezan, HBL, UBL — PKR
  "usd_bank", // local or offshore USD account
  "fintech", // Easypaisa, JazzCash, SadaPay, NayaPay, Payoneer, Wise...
  "brokerage", // IBKR, local brokers — invest in stocks; v1 tracks cash/total balance only
  "crypto_exchange", // Binance, etc. — spot balances
  "stablecoin_wallet", // self-custody USDT/USDC
  "cash", // physical cash
]);

export const txnDirectionEnum = pgEnum("txn_direction", ["in", "out"]);

export const txnTypeEnum = pgEnum("txn_type", [
  "income", // salary, freelance, business revenue, remittance, crypto income
  "expense", // recurring + lifestyle + operational spending
  "transfer", // movement between the user's own accounts (half of a linked pair)
  "investment", // deploying capital into an asset (buying USDT, stocks, etc.)
]);

export const txnStatusEnum = pgEnum("txn_status", [
  "confirmed", // user reviewed & accepted (or manually entered)
  "needs_review", // extracted but not yet confirmed
]);

export const uploadStatusEnum = pgEnum("upload_status", [
  "pending", // stored in blob, not yet processed
  "extracted", // vision model returned a result
  "confirmed", // user confirmed → transaction(s) created
  "failed", // extraction errored
]);

export const fxRateTypeEnum = pgEnum("fx_rate_type", [
  "interbank", // official / bank rate
  "open_market", // free-market / "grey" rate — the one that actually applies to the user
]);

export const recommendationStatusEnum = pgEnum("recommendation_status", [
  "new",
  "acted",
  "dismissed",
  "snoozed",
]);

// ── accounts ─────────────────────────────────────────────────────────────────
// Layer 1 (Financial Reality Mapping) made concrete: the set of financial rails
// the user actually has. Entered manually, rarely changes.

export const accounts = pgTable(
  "accounts",
  {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // user-facing label, e.g. "Meezan PKR", "Payoneer USD"
  type: accountTypeEnum("type").notNull(),
  currency: text("currency").notNull(), // ISO 4217 (PKR, USD) or "USDT"/"USDC" for stablecoins
  institution: text("institution"), // "Meezan Bank", "Binance", "Payoneer", ...
  currentBalance: numeric("current_balance", { precision: 20, scale: 4 })
    .notNull()
    .default("0"),
  lastReconciledAt: timestamp("last_reconciled_at", { withTimezone: true }),
  notes: text("notes"),
  archived: timestamp("archived", { withTimezone: true }), // soft-delete marker
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("accounts_owner_idx").on(t.ownerId)],
);

// ── uploads ──────────────────────────────────────────────────────────────────
// Raw screenshot/receipt the user uploaded, kept so extraction can be re-run if
// the vision model improves. blobKey points into SeaweedFS (S3-compatible).

export const uploads = pgTable(
  "uploads",
  {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  blobKey: text("blob_key").notNull(), // S3 key in the screenshots bucket
  contentType: text("content_type"), // image/png, image/jpeg, application/pdf
  byteSize: integer("byte_size"),
  status: uploadStatusEnum("status").notNull().default("pending"),
  detectedInstitution: text("detected_institution"), // vision model's guess from app branding
  detectedAccountId: uuid("detected_account_id").references(() => accounts.id, {
    onDelete: "set null",
  }), // best-effort institution→account mapping; user confirms
  extractionRawJson: jsonb("extraction_raw_json"), // full structured output from the vision model
  error: text("error"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [index("uploads_owner_idx").on(t.ownerId)],
);

// ── transactions ─────────────────────────────────────────────────────────────
// Layer 4 (Cashflow Intelligence) input. Dedup key = (accountId, externalId):
// every PK bank/fintech receipt carries a transaction reference id. If the vision
// model can't find one, the app asks the user to type it in before saving.

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    uploadId: uuid("upload_id").references(() => uploads.id, { onDelete: "set null" }),
    externalId: text("external_id"), // bank/fintech txn reference — dedup key (nullable until user supplies it)
    amount: numeric("amount", { precision: 20, scale: 4 }).notNull(), // always positive; direction carries sign
    currency: text("currency").notNull(),
    direction: txnDirectionEnum("direction").notNull(),
    txnType: txnTypeEnum("txn_type").notNull().default("expense"),
    counterparty: text("counterparty"), // merchant / sender / receiver as extracted
    category: text("category"), // free-text LLM category, e.g. "groceries", "client payment"
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    confidence: real("confidence"), // 0..1 from the vision model (null if manually entered)
    rawExtractedJson: jsonb("raw_extracted_json"), // the single-txn slice of the vision output
    status: txnStatusEnum("status").notNull().default("needs_review"),
    transferLinkId: uuid("transfer_link_id"), // points at the paired txn for a self-transfer (set on both rows)
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // dedup: at most one transaction per (account, externalId) when externalId is
    // present. accountId is already owner-scoped (an account belongs to one owner).
    uniqueIndex("transactions_account_external_id_uq")
      .on(t.accountId, t.externalId)
      .where(sql`${t.externalId} is not null`),
    index("transactions_account_occurred_idx").on(t.accountId, t.occurredAt),
    index("transactions_owner_occurred_idx").on(t.ownerId, t.occurredAt),
  ],
);

// ── fx_rates ─────────────────────────────────────────────────────────────────
// Both interbank and open-market rates are tracked; the spread between them is
// itself signal ("your PKR is worth less than your bank says"). Refreshed by a
// scheduled job hitting /api/cron/fx-rates.

export const fxRates = pgTable(
  "fx_rates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    base: text("base").notNull(), // e.g. "USD"
    quote: text("quote").notNull(), // e.g. "PKR"  → rate = how many PKR per 1 USD
    rate: numeric("rate", { precision: 20, scale: 8 }).notNull(),
    rateType: fxRateTypeEnum("rate_type").notNull(),
    source: text("source").notNull(), // which feed this came from
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("fx_rates_pair_type_fetched_idx").on(t.base, t.quote, t.rateType, t.fetchedAt)],
);

// ── profile ──────────────────────────────────────────────────────────────────
// One row per user (PK = owner_id → user.id). Holds the user's geography,
// display-currency preference, a seed capability graph (Layer 2 — expanded later),
// psychology notes (Layer 5 — empty in v1, will be inferred from transaction series
// + confirmed), and preferences.

export const profile = pgTable("profile", {
  ownerId: text("owner_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  geography: text("geography"), // free text for now, e.g. "Pakistan"
  displayCurrencyPref: text("display_currency_pref").notNull().default("USD"), // "USD" | "PKR"
  homeCurrency: text("home_currency").notNull().default("PKR"), // the user's primary local currency
  capabilityGraphJson: jsonb("capability_graph_json").notNull().default({}),
  psychologyNotesJson: jsonb("psychology_notes_json").notNull().default([]),
  preferencesJson: jsonb("preferences_json").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── news_items ───────────────────────────────────────────────────────────────
// Layer 3 (Economic Awareness) v1 slice: curated free RSS, summarized + tagged +
// given a one-line "your exposure" note keyed off the profile. Informational only.

export const newsItems = pgTable(
  "news_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: text("source").notNull(), // feed name
    url: text("url").notNull(),
    title: text("title").notNull(),
    summary: text("summary"), // LLM summary
    relevanceTags: jsonb("relevance_tags").notNull().default([]), // e.g. ["PKR","freelance","crypto-regulation"]
    exposureNote: text("exposure_note"), // LLM: "affects you because…" (null = judged not relevant)
    publishedAt: timestamp("published_at", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("news_items_url_uq").on(t.url),
    index("news_items_published_idx").on(t.publishedAt),
  ],
);

// ── recommendations ──────────────────────────────────────────────────────────
// Layer 8 output: weekly grounded leverage suggestions. Every row carries its
// reasoning + grounding so the user can judge validity. status feeds the future
// learning loop (Layer 9); outcomeNote is filled in later.

export const recommendations = pgTable(
  "recommendations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(), // the suggestion itself
    reasoning: text("reasoning").notNull(), // the chain of thought, shown to the user
    groundingJson: jsonb("grounding_json").notNull().default({}), // { transactionIds, accountIds, newsItemIds, metrics }
    status: recommendationStatusEnum("status").notNull().default("new"),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    outcomeNote: text("outcome_note"), // filled later — did it work? did the user act?
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("recommendations_status_created_idx").on(t.status, t.createdAt),
    index("recommendations_owner_created_idx").on(t.ownerId, t.createdAt),
  ],
);

// ── auth (Better Auth, drizzleAdapter) ───────────────────────────────────────
// Standard Better Auth tables — column names/types match Better Auth's defaults
// exactly (this is essentially what `@better-auth/cli generate` emits). Multi-user:
// every per-user data table above references `user.id` via `owner_id`. Kept here so
// everything migrates together.
// NOTE: `emailVerified` is a BOOLEAN (Better Auth's schema), not a timestamp;
// `timestamp` columns use Drizzle's default `mode: "date"` (Date in/out), which is
// what the Better Auth Drizzle adapter expects.

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"), // for emailAndPassword provider
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

// ── inferred types ───────────────────────────────────────────────────────────

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Upload = typeof uploads.$inferSelect;
export type NewUpload = typeof uploads.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type FxRate = typeof fxRates.$inferSelect;
export type NewFxRate = typeof fxRates.$inferInsert;
export type Profile = typeof profile.$inferSelect;
export type NewProfile = typeof profile.$inferInsert;
export type NewsItem = typeof newsItems.$inferSelect;
export type NewNewsItem = typeof newsItems.$inferInsert;
export type Recommendation = typeof recommendations.$inferSelect;
export type NewRecommendation = typeof recommendations.$inferInsert;
