-- Add Stripe trial usage tracking on users.
ALTER TABLE "users"
  ADD COLUMN "stripe_trial_used_at" TIMESTAMPTZ(6),
  ADD COLUMN "stripe_trial_subscription_id" TEXT;

-- Optional helper index for analytics / quick lookups (not unique).
CREATE INDEX IF NOT EXISTS "users_stripe_trial_used_at_idx"
  ON "users" ("stripe_trial_used_at");

