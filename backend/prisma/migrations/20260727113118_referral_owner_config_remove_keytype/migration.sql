-- AlterTable
ALTER TABLE "Customer" DROP COLUMN "keyType";

-- AlterTable
ALTER TABLE "PlatformConfig" ADD COLUMN     "ownerAddress" TEXT,
ADD COLUMN     "ownerName" TEXT,
ADD COLUMN     "ownerPhone" TEXT;

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referredByCode" TEXT;

-- DropTable
DROP TABLE "KeyType";

-- CreateIndex
CREATE UNIQUE INDEX "Shop_referralCode_key" ON "Shop"("referralCode");

