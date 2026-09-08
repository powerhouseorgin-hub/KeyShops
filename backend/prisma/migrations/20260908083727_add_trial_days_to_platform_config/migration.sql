-- Adds a Super-Admin-configurable trial length (days) used by the new
-- free-trial signup path in AuthService.registerShop (Plan.TRIAL). Purely
-- additive with a default; the existing single "default" PlatformConfig
-- row is unaffected other than gaining this column at its default value.
ALTER TABLE "PlatformConfig" ADD COLUMN "trialDays" INTEGER NOT NULL DEFAULT 14;
