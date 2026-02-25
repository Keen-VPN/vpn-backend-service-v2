-- AlterEnum
ALTER TYPE "node_status" ADD VALUE 'DRAINING';

-- AlterTable
ALTER TABLE "nodes" ADD COLUMN     "health_score" DOUBLE PRECISION DEFAULT 100;
