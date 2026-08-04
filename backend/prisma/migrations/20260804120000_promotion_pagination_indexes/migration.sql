-- Backs the Machines/Inventory feed's cursor pagination (ORDER BY "createdAt" DESC)
-- and its category filter (WHERE "productType" = ...).
CREATE INDEX "Promotion_createdAt_idx" ON "Promotion"("createdAt");
CREATE INDEX "Promotion_productType_idx" ON "Promotion"("productType");
