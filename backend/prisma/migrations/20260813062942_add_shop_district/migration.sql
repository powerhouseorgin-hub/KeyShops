-- Adds a district-level locality column to Shop, alongside the existing
-- town column, so the location filter can match a shop against either
-- granularity depending on which one a visitor picks from the full Tamil
-- Nadu district+town list (see frontend/src/utils/tamilNaduLocations.js).
-- Purely additive/nullable - existing rows are unaffected until backfilled
-- (see scripts/backfill-shop-town.ts, extended to also fill district).
ALTER TABLE "Shop" ADD COLUMN "district" TEXT;

CREATE INDEX "Shop_isActive_district_idx" ON "Shop"("isActive", "district");
