/*
  Warnings:

  - The `status` column on the `nodes` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `user_agent` on the `sales_contacts` table. All the data in the column will be lost.
  - The `status` column on the `sales_contacts` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `subscriptions` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the `vpn_configs` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('active', 'inactive', 'trialing', 'past_due', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "contact_status" AS ENUM ('pending', 'contacted', 'closed');

-- CreateEnum
CREATE TYPE "node_status" AS ENUM ('ONLINE', 'OFFLINE');

-- AlterTable
ALTER TABLE "nodes" DROP COLUMN "status",
ADD COLUMN     "status" "node_status" NOT NULL DEFAULT 'ONLINE';

-- AlterTable
ALTER TABLE "sales_contacts" DROP COLUMN "user_agent",
DROP COLUMN "status",
ADD COLUMN     "status" "contact_status" NOT NULL DEFAULT 'pending';

-- AlterTable
ALTER TABLE "subscriptions" DROP COLUMN "status",
ADD COLUMN     "status" "subscription_status" NOT NULL DEFAULT 'inactive';

-- DropTable
DROP TABLE "vpn_configs";

-- CreateIndex
CREATE INDEX "connection_sessions_platform_session_start_idx" ON "connection_sessions"("platform", "session_start");

-- CreateIndex
CREATE INDEX "node_clients_node_id_client_public_key_idx" ON "node_clients"("node_id", "client_public_key");

-- CreateIndex
CREATE INDEX "nodes_status_idx" ON "nodes"("status");

-- CreateIndex
CREATE INDEX "nodes_region_status_idx" ON "nodes"("region", "status");

-- CreateIndex
CREATE INDEX "sales_contacts_status_idx" ON "sales_contacts"("status");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "users_provider_idx" ON "users"("provider");
