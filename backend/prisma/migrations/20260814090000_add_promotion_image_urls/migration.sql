ALTER TABLE "Promotion" ADD COLUMN "imageUrls" TEXT[] NOT NULL DEFAULT '{}';

-- Backfill: every existing listing that already had a single cover photo
-- gets it seeded into the new array too, so reopening it for edit shows
-- that photo in the new multi-upload UI instead of an empty slate.
UPDATE "Promotion" SET "imageUrls" = ARRAY["imageUrl"] WHERE "imageUrl" IS NOT NULL;
