-- Drop the "Service" suffix from product type names, matching the frontend
-- rename of the ECM Service / Meter Service / Scanning Service dashboard
-- cards to ECM / Meter / Scanning.
UPDATE "ProductType" SET "name" = 'ECM' WHERE "name" = 'ECM Service';
UPDATE "ProductType" SET "name" = 'Meter' WHERE "name" = 'Meter Service';
UPDATE "ProductType" SET "name" = 'Scanning' WHERE "name" = 'Scanning Service';

-- Keep existing listings' free-form productType column in sync so the
-- Inventory category filter chips still match their listings.
UPDATE "Promotion" SET "productType" = 'ECM' WHERE "productType" = 'ECM Service';
UPDATE "Promotion" SET "productType" = 'Meter' WHERE "productType" = 'Meter Service';
UPDATE "Promotion" SET "productType" = 'Scanning' WHERE "productType" = 'Scanning Service';
