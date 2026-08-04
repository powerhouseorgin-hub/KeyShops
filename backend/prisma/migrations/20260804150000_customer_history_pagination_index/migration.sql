-- Backs the Shop Admin Customer History screen's cursor pagination
-- (WHERE "shopId" = X AND "deletedAt" IS NULL ORDER BY "createdAt" DESC).
CREATE INDEX "Customer_shopId_deletedAt_createdAt_idx" ON "Customer"("shopId", "deletedAt", "createdAt");
