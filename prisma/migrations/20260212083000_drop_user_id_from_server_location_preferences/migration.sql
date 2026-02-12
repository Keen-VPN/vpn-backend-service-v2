-- Drop user_id from server_location_preferences (identify requests by client_session_id only)

-- Drop foreign key if it exists
ALTER TABLE "server_location_preferences" DROP CONSTRAINT IF EXISTS "server_location_preferences_user_id_fkey";

-- Drop index on user_id if it exists
DROP INDEX IF EXISTS "server_location_preferences_user_id_idx";

-- Drop the column
ALTER TABLE "server_location_preferences" DROP COLUMN IF EXISTS "user_id";
