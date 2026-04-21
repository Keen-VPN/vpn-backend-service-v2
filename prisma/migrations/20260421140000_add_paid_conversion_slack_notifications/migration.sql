CREATE TABLE "paid_conversion_slack_notifications" (
    "id" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paid_conversion_slack_notifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "paid_conversion_slack_notifications_dedupe_key_key" ON "paid_conversion_slack_notifications"("dedupe_key");
CREATE INDEX "paid_conversion_slack_notifications_user_id_idx" ON "paid_conversion_slack_notifications"("user_id");
