-- CreateTable
CREATE TABLE "ShopCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopCategory_name_key" ON "ShopCategory"("name");

-- CreateIndex
CREATE INDEX "ShopCategory_deletedAt_idx" ON "ShopCategory"("deletedAt");

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "categoryId" TEXT;

-- CreateIndex
CREATE INDEX "Shop_categoryId_idx" ON "Shop"("categoryId");

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ShopCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed default category so the registration dropdown is never empty
INSERT INTO "ShopCategory" ("id", "name", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'Dealers', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
