/*
  Warnings:

  - A unique constraint covering the columns `[client_public_key]` on the table `node_clients` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "node_clients_client_public_key_key" ON "node_clients"("client_public_key");
