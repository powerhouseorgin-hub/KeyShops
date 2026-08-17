-- Adds a nullable logoUrl column to Shop for the Shop Details page's
-- logo header (falls back to a category icon when null - see
-- ShopService.mapPublicShop / uploadLogo). Purely additive; existing
-- rows are unaffected until a shop admin uploads one via Shop Settings.
ALTER TABLE "Shop" ADD COLUMN "logoUrl" TEXT;
