-- Backs the Super Admin Customer Registry's cross-shop cursor pagination
-- (no shopId filter, ORDER BY "createdAt" DESC).
CREATE INDEX "Customer_deletedAt_createdAt_idx" ON "Customer"("deletedAt", "createdAt");
