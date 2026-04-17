-- Add user_id to connection_sessions so stats can be filtered per user.
-- Nullable so existing rows and unauthenticated recordings are preserved.
ALTER TABLE "connection_sessions" ADD COLUMN "user_id" TEXT;

CREATE INDEX "connection_sessions_user_id_idx" ON "connection_sessions"("user_id");

ALTER TABLE "connection_sessions"
  ADD CONSTRAINT "connection_sessions_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
