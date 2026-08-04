-- Backs the public Dealers/Find-a-Shop directory's cursor pagination
-- (WHERE "isActive" = true ORDER BY "createdAt" DESC).
CREATE INDEX "Shop_isActive_createdAt_idx" ON "Shop"("isActive", "createdAt");
