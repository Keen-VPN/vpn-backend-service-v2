-- CreateEnum
CREATE TYPE "billing_alignment_status" AS ENUM (
  'not_required',
  'local_entitlement_only',
  'stripe_alignment_pending',
  'stripe_aligned',
  'stripe_alignment_failed'
);

-- AlterTable
ALTER TABLE "subscription_transfer_requests" ADD COLUMN "proof_hash" VARCHAR(64),
ADD COLUMN "proof_size_bytes" INTEGER,
ADD COLUMN "proof_original_filename" VARCHAR(255),
ADD COLUMN "proof_uploaded_at" TIMESTAMPTZ(6),
ADD COLUMN "client_device_fingerprint" VARCHAR(128),
ADD COLUMN "risk_score" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "risk_flags" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "billing_alignment_status" "billing_alignment_status" NOT NULL DEFAULT 'not_required';

CREATE INDEX "subscription_transfer_requests_proof_hash_idx" ON "subscription_transfer_requests"("proof_hash");

-- AlterTable
ALTER TABLE "subscription_credit_ledger" ADD COLUMN "billing_alignment_status" "billing_alignment_status" NOT NULL DEFAULT 'not_required';
