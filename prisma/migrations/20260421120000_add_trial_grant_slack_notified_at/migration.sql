-- Slack trial-started notifications: dedupe marker (per unified user / linked cluster handled in app code)
ALTER TABLE "trial_grants" ADD COLUMN "slack_trial_started_notified_at" TIMESTAMPTZ(6);
