-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "keyType" TEXT;

-- CreateTable
CREATE TABLE "KeyType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KeyType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KeyType_name_key" ON "KeyType"("name");

-- CreateIndex
CREATE INDEX "KeyType_deletedAt_idx" ON "KeyType"("deletedAt");

-- Seed "Vehicle Key" as the default key type so the Key Type dropdown on
-- Customer Registration is never empty out of the box.
INSERT INTO "KeyType" ("id", "name", "createdAt", "updatedAt") VALUES
  (gen_random_uuid(), 'Vehicle Key', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
