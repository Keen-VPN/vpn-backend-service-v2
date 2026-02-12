-- CreateTable
CREATE TABLE "server_location_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "server_location_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "server_location_preferences_user_id_idx" ON "server_location_preferences"("user_id");

-- AddForeignKey
ALTER TABLE "server_location_preferences" ADD CONSTRAINT "server_location_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
