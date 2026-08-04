-- Backs the Super Admin Shop Management screen's cursor pagination
-- (WHERE "deletedAt" IS NULL ORDER BY "createdAt" DESC, no isActive filter).
CREATE INDEX "Shop_deletedAt_createdAt_idx" ON "Shop"("deletedAt", "createdAt");
