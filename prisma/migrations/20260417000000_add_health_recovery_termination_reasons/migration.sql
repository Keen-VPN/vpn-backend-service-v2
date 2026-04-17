-- Add new termination reasons for VPN health recovery events.
-- HEALTH_CHECK_FAILURE: session ended because periodic health probes failed.
-- RECOVERY_EXHAUSTED:   session ended because all auto-reconnect attempts were used up.

ALTER TYPE "termination_reason" ADD VALUE IF NOT EXISTS 'health_check_failure';
ALTER TYPE "termination_reason" ADD VALUE IF NOT EXISTS 'recovery_exhausted';
