-- AlterTable
ALTER TABLE "User" ADD COLUMN "overrideRepRole" TEXT;

-- Existing override-eligible users (pre-role) default to regional for payout eligibility
UPDATE "User" SET "overrideRepRole" = 'regional' WHERE "overrideEligible" = 1 AND ("overrideRepRole" IS NULL OR "overrideRepRole" = '');
