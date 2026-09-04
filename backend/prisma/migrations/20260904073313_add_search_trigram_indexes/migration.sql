-- Speeds up the app's many `contains`/insensitive-mode searches (shop
-- directory, customer registry, master key catalog). A plain B-Tree index
-- can't serve a leading-wildcard ILIKE '%term%' at all, so these queries
-- fall back to a full sequential scan today - harmless at the platform's
-- current tiny row counts, but a real, avoidable-now foot-gun as any one
-- shop's customer history or the shop directory actually grows.
--
-- Deliberately NOT modeled in schema.prisma's `@@index` (gin_trgm_ops needs
-- either the `postgresqlExtensions` preview feature or Prisma's
-- `Unsupported` escape hatch, both more churn than this warrants) - Postgres
-- picks up and uses a matching index automatically regardless of whether
-- Prisma's schema is aware of it, since `contains` always compiles to the
-- same ILIKE SQL either way.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_shop_name_trgm ON "Shop" USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_shop_companydetails_trgm ON "Shop" USING gin ("companyDetails" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_customer_name_trgm ON "Customer" USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customer_phone_trgm ON "Customer" USING gin (phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customer_keynumber_trgm ON "Customer" USING gin ("keyNumber" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customer_vehiclenumber_trgm ON "Customer" USING gin ("vehicleNumber" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customer_capturedaddress_trgm ON "Customer" USING gin ("capturedAddress" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customer_address_trgm ON "Customer" USING gin (address gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_masterkey_keynumber_trgm ON "MasterKey" USING gin ("keyNumber" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_masterkey_category_trgm ON "MasterKey" USING gin (category gin_trgm_ops);
