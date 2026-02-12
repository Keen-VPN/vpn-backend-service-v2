-- CreateTable: server_location_preferences (region + reason only; no user/session identifiers)
CREATE TABLE "server_location_preferences" (
    "id" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "server_location_preferences_pkey" PRIMARY KEY ("id")
);
