-- Adds Super Admin-controlled display order for Shop Categories (see
-- ShopCategoryService.getAllCategories/reorderCategories).
ALTER TABLE "ShopCategory" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "ShopCategory_sortOrder_idx" ON "ShopCategory"("sortOrder");

-- Backfill: give existing rows a stable initial order matching their
-- current alphabetical sort, so the dropdown doesn't visually reshuffle
-- until an admin explicitly drags to reorder.
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY name ASC) - 1 AS rn
  FROM "ShopCategory"
)
UPDATE "ShopCategory" sc
SET "sortOrder" = ordered.rn
FROM ordered
WHERE sc.id = ordered.id;
