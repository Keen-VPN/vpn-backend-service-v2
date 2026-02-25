/*
  Warnings:

  - The values [DRAINING] on the enum `node_status` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the `sales_contacts` table. If the table is not empty, all the data it contains will be lost.
  - Made the column `ip` on table `nodes` required. This step will fail if there are existing NULL values in that column.
  - Made the column `health_score` on table `nodes` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "node_status_new" AS ENUM ('ONLINE', 'OFFLINE');
ALTER TABLE "nodes" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "nodes" ALTER COLUMN "status" TYPE "node_status_new" USING ("status"::text::"node_status_new");
ALTER TYPE "node_status" RENAME TO "node_status_old";
ALTER TYPE "node_status_new" RENAME TO "node_status";
DROP TYPE "node_status_old";
ALTER TABLE "nodes" ALTER COLUMN "status" SET DEFAULT 'ONLINE';
COMMIT;

-- DropIndex
DROP INDEX "node_clients_client_public_key_idx";

-- DropIndex
DROP INDEX "node_clients_node_id_client_public_key_idx";

-- AlterTable
ALTER TABLE "nodes" ALTER COLUMN "ip" SET NOT NULL,
ALTER COLUMN "health_score" SET NOT NULL;

-- DropTable
DROP TABLE "sales_contacts";
