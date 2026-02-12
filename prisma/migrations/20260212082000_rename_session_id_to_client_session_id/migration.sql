-- Rename session_id to client_session_id (same as connection_sessions)
ALTER TABLE "server_location_preferences" RENAME COLUMN "session_id" TO "client_session_id";

-- Update index: drop old name, ensure new index exists
DROP INDEX IF EXISTS "server_location_preferences_session_id_idx";
CREATE INDEX IF NOT EXISTS "server_location_preferences_client_session_id_idx" ON "server_location_preferences"("client_session_id");
