/*
Warnings:

- The values [closed] on the enum `contact_status` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;

CREATE TYPE "contact_status_new" AS ENUM ('pending', 'contacted', 'converted', 'spam');

ALTER TYPE "contact_status" RENAME TO "contact_status_old";

ALTER TYPE "contact_status_new" RENAME TO "contact_status";

DROP TYPE "contact_status_old";

COMMIT;

-- CreateTable
CREATE TABLE "sales_contacts" (
    "id" TEXT NOT NULL,
    "reference_id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "work_email" TEXT NOT NULL,
    "team_size" INTEGER NOT NULL,
    "country_region" TEXT,
    "has_consent" BOOLEAN NOT NULL,
    "phone" TEXT,
    "use_case" TEXT,
    "preferred_contact_method" TEXT,
    "preferred_contact_time" TEXT,
    "message" TEXT,
    "status" "contact_status" NOT NULL DEFAULT 'pending',
    "sales_team_notified" BOOLEAN NOT NULL DEFAULT false,
    "customer_confirmation_sent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "sales_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_contacts_reference_id_key" ON "sales_contacts" ("reference_id");

-- CreateIndex
CREATE INDEX "sales_contacts_work_email_idx" ON "sales_contacts" ("work_email");

-- CreateIndex
CREATE INDEX "sales_contacts_reference_id_idx" ON "sales_contacts" ("reference_id");

-- CreateIndex
CREATE INDEX "sales_contacts_created_at_idx" ON "sales_contacts" ("created_at");

-- CreateIndex
CREATE INDEX "sales_contacts_status_idx" ON "sales_contacts" ("status");