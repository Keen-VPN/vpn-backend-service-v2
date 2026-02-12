-- Add client_session_id and other columns expected by the current Prisma schema.
-- The connection_sessions table may have been created from an older schema (e.g. with user_id instead of client_session_id).

-- Allow inserts without user_id if column exists (session is identified by client_session_id only)
DO $$
BEGIN
  ALTER TABLE "connection_sessions" ALTER COLUMN "user_id" DROP NOT NULL;
EXCEPTION
  WHEN undefined_column THEN NULL;
END $$;

-- Add client_session_id (nullable first so we can backfill existing rows)
ALTER TABLE "connection_sessions" ADD COLUMN IF NOT EXISTS "client_session_id" TEXT;

-- Backfill existing rows so we can set NOT NULL
UPDATE "connection_sessions" SET "client_session_id" = "id" WHERE "client_session_id" IS NULL;

-- Now enforce NOT NULL and UNIQUE
ALTER TABLE "connection_sessions" ALTER COLUMN "client_session_id" SET NOT NULL;

-- Drop existing unique constraint if it exists (e.g. from a partial migration), then add
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'connection_sessions_client_session_id_key'
  ) THEN
    ALTER TABLE "connection_sessions" ADD CONSTRAINT "connection_sessions_client_session_id_key" UNIQUE ("client_session_id");
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL; -- constraint already exists
END $$;

-- Add other columns the schema expects (ignore if they already exist)
ALTER TABLE "connection_sessions" ADD COLUMN IF NOT EXISTS "disconnect_reason" TEXT;
ALTER TABLE "connection_sessions" ADD COLUMN IF NOT EXISTS "protocol" TEXT DEFAULT 'wireguard';
ALTER TABLE "connection_sessions" ADD COLUMN IF NOT EXISTS "network_type" TEXT;
