-- CreateTable
CREATE TABLE "nodes" (
    "id" TEXT NOT NULL,
    "ip_address" TEXT NOT NULL,
    "public_key" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "city" TEXT,
    "country" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "capacity" INTEGER NOT NULL,
    "current_connections" INTEGER NOT NULL DEFAULT 0,
    "cpu_usage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bandwidth_usage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "last_heartbeat" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nodes_public_key_key" ON "nodes"("public_key");

-- CreateIndex
CREATE INDEX "nodes_region_idx" ON "nodes"("region");

-- CreateIndex
CREATE INDEX "nodes_status_idx" ON "nodes"("status");
