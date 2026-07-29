-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "referralPoints" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "referrerShopId" TEXT NOT NULL,
    "referredShopId" TEXT NOT NULL,
    "pointsAwarded" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Referral_referredShopId_key" ON "Referral"("referredShopId");

-- CreateIndex
CREATE INDEX "Referral_referrerShopId_idx" ON "Referral"("referrerShopId");

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerShopId_fkey" FOREIGN KEY ("referrerShopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredShopId_fkey" FOREIGN KEY ("referredShopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
