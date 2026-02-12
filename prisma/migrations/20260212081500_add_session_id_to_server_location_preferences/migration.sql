-- Add session_id to server_location_preferences (optional, for requests identified by session token)
ALTER TABLE "server_location_preferences" ADD COLUMN IF NOT EXISTS "session_id" TEXT;

-- Ensure user_id is nullable (idempotent: no-op if already nullable)
DO $$
BEGIN
  ALTER TABLE "server_location_preferences" ALTER COLUMN "user_id" DROP NOT NULL;
EXCEPTION
  WHEN undefined_column THEN NULL;
END $$;

-- Index for lookups by session_id
CREATE INDEX IF NOT EXISTS "server_location_preferences_session_id_idx" ON "server_location_preferences"("session_id");
