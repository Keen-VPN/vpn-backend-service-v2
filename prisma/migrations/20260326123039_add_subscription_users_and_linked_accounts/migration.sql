-- CreateEnum
CREATE TYPE "subscription_user_role" AS ENUM ('owner', 'linked');

-- CreateTable
CREATE TABLE "subscription_users" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "subscription_user_role" NOT NULL DEFAULT 'owner',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "linked_accounts" (
    "id" TEXT NOT NULL,
    "primary_user_id" TEXT NOT NULL,
    "linked_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "linked_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscription_users_user_id_idx" ON "subscription_users"("user_id");

-- CreateIndex
CREATE INDEX "subscription_users_subscription_id_idx" ON "subscription_users"("subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_users_subscription_id_user_id_key" ON "subscription_users"("subscription_id", "user_id");

-- CreateIndex
CREATE INDEX "linked_accounts_primary_user_id_idx" ON "linked_accounts"("primary_user_id");

-- CreateIndex
CREATE INDEX "linked_accounts_linked_user_id_idx" ON "linked_accounts"("linked_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "linked_accounts_primary_user_id_linked_user_id_key" ON "linked_accounts"("primary_user_id", "linked_user_id");

-- AddForeignKey
ALTER TABLE "subscription_users" ADD CONSTRAINT "subscription_users_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_users" ADD CONSTRAINT "subscription_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linked_accounts" ADD CONSTRAINT "linked_accounts_primary_user_id_fkey" FOREIGN KEY ("primary_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "linked_accounts" ADD CONSTRAINT "linked_accounts_linked_user_id_fkey" FOREIGN KEY ("linked_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
