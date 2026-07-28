-- Add configurable platform-wide yearly subscription price
ALTER TABLE "PlatformConfig" ADD COLUMN "subscriptionPrice" DOUBLE PRECISION NOT NULL DEFAULT 999;
