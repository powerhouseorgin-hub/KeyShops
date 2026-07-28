-- Support Config: replace Owner Name/Phone/Address with Email + Customer Care Number.
-- ownerPhone is renamed (not dropped) to preserve the existing configured number.
ALTER TABLE "PlatformConfig" RENAME COLUMN "ownerPhone" TO "customerCareNumber";
ALTER TABLE "PlatformConfig" DROP COLUMN "ownerName";
ALTER TABLE "PlatformConfig" DROP COLUMN "ownerAddress";
ALTER TABLE "PlatformConfig" ADD COLUMN "email" TEXT;
