-- CreateTable
CREATE TABLE "ProductType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductType_name_key" ON "ProductType"("name");

-- CreateIndex
CREATE INDEX "ProductType_deletedAt_idx" ON "ProductType"("deletedAt");

-- Seed the previously-hardcoded default product types so the Inventory
-- Product Creation dropdown keeps working exactly as before, with the
-- Super Admin now able to add/edit/delete on top of these defaults.
INSERT INTO "ProductType" ("id", "name", "createdAt", "updatedAt") VALUES
  (gen_random_uuid(), 'Key Cutting Machines', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Used Machines', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'ECM Service', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Meter Service', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Scanning Service', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
