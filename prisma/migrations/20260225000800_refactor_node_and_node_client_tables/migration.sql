/*
  Warnings:

  - You are about to drop the column `user_id` on the `node_clients` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `nodes` table. All the data in the column will be lost.
  - Added the required column `client_public_key` to the `node_clients` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "node_clients" DROP CONSTRAINT "node_clients_user_id_fkey";

-- DropIndex
DROP INDEX "node_clients_user_id_idx";

-- AlterTable
ALTER TABLE "node_clients" DROP COLUMN "user_id",
ADD COLUMN     "client_public_key" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "nodes" DROP COLUMN "name";

-- CreateIndex
CREATE INDEX "node_clients_client_public_key_idx" ON "node_clients"("client_public_key");
