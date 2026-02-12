-- AlterTable: allow anonymous server location preference requests (userId optional)
ALTER TABLE "server_location_preferences" ALTER COLUMN "user_id" DROP NOT NULL;
