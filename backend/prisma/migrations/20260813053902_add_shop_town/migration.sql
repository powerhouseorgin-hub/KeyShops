-- Adds a real town/city-level locality column to Shop, distinct from the
-- district-level value historically stored in companyDetails' JSON `city`
-- key. Backs the public Shops/Machines town filter (see ShopService,
-- PromotionService). Purely additive/nullable - existing rows are
-- unaffected until backfilled (see scripts/backfill-shop-town.ts).
ALTER TABLE "Shop" ADD COLUMN "town" TEXT;

CREATE INDEX "Shop_isActive_town_idx" ON "Shop"("isActive", "town");
