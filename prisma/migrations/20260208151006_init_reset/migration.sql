-- CreateEnum
CREATE TYPE "termination_reason" AS ENUM ('user_termination', 'connection_lost');

-- CreateEnum
CREATE TYPE "event_type" AS ENUM ('session_start', 'heartbeat', 'session_end');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "firebase_uid" TEXT,
    "apple_user_id" TEXT,
    "google_user_id" TEXT,
    "email" TEXT NOT NULL,
    "display_name" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'google',
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "stripe_customer_id" TEXT,
    "trial_active" BOOLEAN NOT NULL DEFAULT false,
    "trial_starts_at" TIMESTAMPTZ,
    "trial_ends_at" TIMESTAMPTZ,
    "trial_tier" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "plan_id" TEXT,
    "plan_name" TEXT,
    "price_amount" DECIMAL(10,2),
    "price_currency" TEXT DEFAULT 'USD',
    "billing_period" TEXT,
    "current_period_start" TIMESTAMPTZ,
    "current_period_end" TIMESTAMPTZ,
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "apple_environment" TEXT,
    "apple_original_transaction_id" TEXT,
    "apple_product_id" TEXT,
    "apple_transaction_id" TEXT,
    "subscription_type" TEXT NOT NULL DEFAULT 'stripe',

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apple_iap_purchases" (
    "id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "original_transaction_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "environment" TEXT,
    "purchase_date" TIMESTAMPTZ NOT NULL,
    "expires_date" TIMESTAMPTZ,
    "receipt_data" TEXT,
    "linked_user_id" TEXT,
    "linked_email" TEXT,
    "linked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "apple_iap_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "connection_sessions" (
    "id" TEXT NOT NULL,
    "client_session_id" TEXT NOT NULL,
    "session_start" TIMESTAMPTZ NOT NULL,
    "session_end" TIMESTAMPTZ,
    "duration_seconds" INTEGER NOT NULL DEFAULT 0,
    "server_location" TEXT,
    "platform" TEXT NOT NULL,
    "app_version" TEXT,
    "bytes_transferred" BIGINT NOT NULL DEFAULT 0,
    "subscription_tier" TEXT,
    "termination_reason" "termination_reason" NOT NULL DEFAULT 'user_termination',
    "disconnect_reason" TEXT,
    "event_type" "event_type" NOT NULL DEFAULT 'session_start',
    "protocol" TEXT DEFAULT 'wireguard',
    "network_type" TEXT,
    "heartbeat_timestamp" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "connection_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_aggregates" (
    "id" TEXT NOT NULL,
    "aggregation_date" TIMESTAMPTZ NOT NULL,
    "platform" TEXT NOT NULL,
    "server_location" TEXT NOT NULL,
    "subscription_tier" TEXT,
    "total_sessions" INTEGER NOT NULL,
    "total_duration" INTEGER NOT NULL,
    "total_bytes" BIGINT NOT NULL,
    "avg_duration" INTEGER NOT NULL,
    "avg_bytes" BIGINT NOT NULL,
    "unique_users" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "session_aggregates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_contacts" (
    "id" TEXT NOT NULL,
    "reference_id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "work_email" TEXT NOT NULL,
    "team_size" INTEGER NOT NULL,
    "country_region" TEXT,
    "has_consent" BOOLEAN NOT NULL,
    "phone" TEXT,
    "use_case" TEXT,
    "preferred_contact_method" TEXT,
    "preferred_contact_time" TEXT,
    "message" TEXT,
    "user_agent" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sales_team_notified" BOOLEAN NOT NULL DEFAULT false,
    "customer_confirmation_sent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sales_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_sessions" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "data_consumed" DECIMAL(15,2) NOT NULL,
    "average_session_bandwidth" DECIMAL(15,2) NOT NULL,
    "session_duration" DECIMAL(10,2) NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL,
    "ended_at" TIMESTAMPTZ NOT NULL,
    "termination_reason" TEXT NOT NULL,
    "server_location" TEXT,
    "processed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vpn_configs" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "etag" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "vpn_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trial_grants" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "device_hash" TEXT NOT NULL,
    "granted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'auto',
    "metadata" JSONB,

    CONSTRAINT "trial_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trial_device_fingerprints" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "platform" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trial_device_fingerprints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "device_hash" TEXT,
    "platform" TEXT,
    "environment" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_firebase_uid_key" ON "users"("firebase_uid");

-- CreateIndex
CREATE UNIQUE INDEX "users_apple_user_id_key" ON "users"("apple_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_user_id_key" ON "users"("google_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_stripe_customer_id_key" ON "users"("stripe_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_apple_transaction_id_key" ON "subscriptions"("apple_transaction_id");

-- CreateIndex
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "subscriptions_subscription_type_idx" ON "subscriptions"("subscription_type");

-- CreateIndex
CREATE INDEX "subscriptions_stripe_customer_id_idx" ON "subscriptions"("stripe_customer_id");

-- CreateIndex
CREATE INDEX "subscriptions_apple_transaction_id_idx" ON "subscriptions"("apple_transaction_id");

-- CreateIndex
CREATE INDEX "subscriptions_apple_original_transaction_id_idx" ON "subscriptions"("apple_original_transaction_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "subscriptions_current_period_end_idx" ON "subscriptions"("current_period_end");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_period_unique" ON "subscriptions"("stripe_subscription_id", "current_period_start");

-- CreateIndex
CREATE UNIQUE INDEX "apple_iap_purchases_transaction_id_key" ON "apple_iap_purchases"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "apple_iap_purchases_original_transaction_id_key" ON "apple_iap_purchases"("original_transaction_id");

-- CreateIndex
CREATE INDEX "apple_iap_purchases_linked_user_id_idx" ON "apple_iap_purchases"("linked_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "connection_sessions_client_session_id_key" ON "connection_sessions"("client_session_id");

-- CreateIndex
CREATE INDEX "connection_sessions_session_start_idx" ON "connection_sessions"("session_start");

-- CreateIndex
CREATE INDEX "connection_sessions_session_end_idx" ON "connection_sessions"("session_end");

-- CreateIndex
CREATE INDEX "connection_sessions_duration_seconds_idx" ON "connection_sessions"("duration_seconds");

-- CreateIndex
CREATE INDEX "connection_sessions_platform_idx" ON "connection_sessions"("platform");

-- CreateIndex
CREATE INDEX "connection_sessions_server_location_idx" ON "connection_sessions"("server_location");

-- CreateIndex
CREATE INDEX "connection_sessions_termination_reason_idx" ON "connection_sessions"("termination_reason");

-- CreateIndex
CREATE INDEX "connection_sessions_event_type_idx" ON "connection_sessions"("event_type");

-- CreateIndex
CREATE INDEX "connection_sessions_heartbeat_timestamp_idx" ON "connection_sessions"("heartbeat_timestamp");

-- CreateIndex
CREATE INDEX "connection_sessions_created_at_idx" ON "connection_sessions"("created_at");

-- CreateIndex
CREATE INDEX "connection_sessions_subscription_tier_idx" ON "connection_sessions"("subscription_tier");

-- CreateIndex
CREATE INDEX "session_aggregates_aggregation_date_idx" ON "session_aggregates"("aggregation_date");

-- CreateIndex
CREATE INDEX "session_aggregates_platform_idx" ON "session_aggregates"("platform");

-- CreateIndex
CREATE INDEX "session_aggregates_server_location_idx" ON "session_aggregates"("server_location");

-- CreateIndex
CREATE INDEX "session_aggregates_subscription_tier_idx" ON "session_aggregates"("subscription_tier");

-- CreateIndex
CREATE UNIQUE INDEX "session_aggregates_aggregation_date_platform_server_locatio_key" ON "session_aggregates"("aggregation_date", "platform", "server_location", "subscription_tier");

-- CreateIndex
CREATE UNIQUE INDEX "sales_contacts_reference_id_key" ON "sales_contacts"("reference_id");

-- CreateIndex
CREATE INDEX "sales_contacts_work_email_idx" ON "sales_contacts"("work_email");

-- CreateIndex
CREATE INDEX "sales_contacts_reference_id_idx" ON "sales_contacts"("reference_id");

-- CreateIndex
CREATE INDEX "sales_contacts_created_at_idx" ON "sales_contacts"("created_at");

-- CreateIndex
CREATE INDEX "sales_contacts_status_idx" ON "sales_contacts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "processed_sessions_session_id_key" ON "processed_sessions"("session_id");

-- CreateIndex
CREATE INDEX "processed_sessions_user_id_idx" ON "processed_sessions"("user_id");

-- CreateIndex
CREATE INDEX "processed_sessions_started_at_idx" ON "processed_sessions"("started_at");

-- CreateIndex
CREATE INDEX "processed_sessions_ended_at_idx" ON "processed_sessions"("ended_at");

-- CreateIndex
CREATE INDEX "processed_sessions_server_location_idx" ON "processed_sessions"("server_location");

-- CreateIndex
CREATE INDEX "processed_sessions_termination_reason_idx" ON "processed_sessions"("termination_reason");

-- CreateIndex
CREATE INDEX "processed_sessions_processed_at_idx" ON "processed_sessions"("processed_at");

-- CreateIndex
CREATE UNIQUE INDEX "vpn_configs_version_key" ON "vpn_configs"("version");

-- CreateIndex
CREATE INDEX "vpn_configs_is_active_created_at_idx" ON "vpn_configs"("is_active", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "trial_grants_user_id_key" ON "trial_grants"("user_id");

-- CreateIndex
CREATE INDEX "trial_grants_device_hash" ON "trial_grants"("device_hash");

-- CreateIndex
CREATE UNIQUE INDEX "trial_device_fingerprints_hash_key" ON "trial_device_fingerprints"("hash");

-- CreateIndex
CREATE INDEX "trial_device_fingerprints_user_id" ON "trial_device_fingerprints"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "push_tokens_token_key" ON "push_tokens"("token");

-- CreateIndex
CREATE INDEX "push_tokens_user_id" ON "push_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apple_iap_purchases" ADD CONSTRAINT "apple_iap_purchases_linked_user_id_fkey" FOREIGN KEY ("linked_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_grants" ADD CONSTRAINT "trial_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trial_device_fingerprints" ADD CONSTRAINT "trial_device_fingerprints_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
