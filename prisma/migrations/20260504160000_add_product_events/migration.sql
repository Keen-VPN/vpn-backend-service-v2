-- Product analytics events for lightweight, privacy-safe feature measurement.
-- Raw connected IP addresses are intentionally not collected.
CREATE TABLE "product_events" (
  "id" TEXT NOT NULL,
  "user_id" TEXT,
  "event_name" TEXT NOT NULL,
  "platform" TEXT,
  "server_location" TEXT,
  "connection_status" TEXT,
  "ip_address_present" BOOLEAN,
  "properties" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "product_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "product_events_event_name_created_at_idx" ON "product_events"("event_name", "created_at");
CREATE INDEX "product_events_user_id_idx" ON "product_events"("user_id");
CREATE INDEX "product_events_platform_idx" ON "product_events"("platform");
CREATE INDEX "product_events_server_location_idx" ON "product_events"("server_location");

ALTER TABLE "product_events"
  ADD CONSTRAINT "product_events_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
