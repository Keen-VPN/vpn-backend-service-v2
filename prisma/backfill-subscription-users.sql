-- Backfill subscription_users from existing subscriptions.
-- Run AFTER the add_subscription_users migration has been applied.
-- Safe to run multiple times (ON CONFLICT DO NOTHING).

INSERT INTO subscription_users (id, subscription_id, user_id, role, created_at)
SELECT gen_random_uuid(), id, user_id, 'owner', created_at
FROM subscriptions
WHERE user_id IS NOT NULL
ON CONFLICT DO NOTHING;
