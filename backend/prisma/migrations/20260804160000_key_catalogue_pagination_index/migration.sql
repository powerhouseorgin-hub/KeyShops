-- Backs the Super Admin Master Catalogue screen's cross-shop cursor
-- pagination (WHERE "deletedAt" IS NULL ORDER BY "keyNumber" ASC).
CREATE INDEX "MasterKey_deletedAt_keyNumber_idx" ON "MasterKey"("deletedAt", "keyNumber");
