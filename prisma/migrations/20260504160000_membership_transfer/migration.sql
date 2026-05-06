-- CreateEnum
CREATE TYPE "transfer_request_status" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "subscription_transfer_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "expiry_date" TIMESTAMPTZ(6) NOT NULL,
    "proof_url" TEXT NOT NULL,
    "proof_mime_type" TEXT,
    "proof_blob" BYTEA,
    "status" "transfer_request_status" NOT NULL DEFAULT 'pending',
    "requested_credit_days" INTEGER NOT NULL,
    "approved_credit_days" INTEGER,
    "admin_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "reviewed_at" TIMESTAMPTZ(6),
    "reviewed_by_admin_id" TEXT,

    CONSTRAINT "subscription_transfer_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_credit_ledger" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "transfer_request_id" TEXT NOT NULL,
    "credit_days" INTEGER NOT NULL,
    "subscription_id" TEXT,
    "previous_period_end" TIMESTAMPTZ(6),
    "new_period_end" TIMESTAMPTZ(6) NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_admin_id" TEXT,

    CONSTRAINT "subscription_credit_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscription_transfer_requests_user_id_key" ON "subscription_transfer_requests"("user_id");

-- CreateIndex
CREATE INDEX "subscription_transfer_requests_status_idx" ON "subscription_transfer_requests"("status");

-- CreateIndex
CREATE INDEX "subscription_transfer_requests_created_at_idx" ON "subscription_transfer_requests"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_credit_ledger_transfer_request_id_key" ON "subscription_credit_ledger"("transfer_request_id");

-- CreateIndex
CREATE INDEX "subscription_credit_ledger_user_id_idx" ON "subscription_credit_ledger"("user_id");

-- AddForeignKey
ALTER TABLE "subscription_transfer_requests" ADD CONSTRAINT "subscription_transfer_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_credit_ledger" ADD CONSTRAINT "subscription_credit_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_credit_ledger" ADD CONSTRAINT "subscription_credit_ledger_transfer_request_id_fkey" FOREIGN KEY ("transfer_request_id") REFERENCES "subscription_transfer_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_credit_ledger" ADD CONSTRAINT "subscription_credit_ledger_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
