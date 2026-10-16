-- Optional promotional-email permission on ReaderProfile.
-- Existing rows stay without marketing consent. Reading access is unchanged.
-- Does not rebuild ReaderProfile, User, Purchase, Order, or referral tables.

-- AlterTable
ALTER TABLE "ReaderProfile" ADD COLUMN "emailMarketingConsentSource" TEXT;
ALTER TABLE "ReaderProfile" ADD COLUMN "emailMarketingOptOutAt" DATETIME;
ALTER TABLE "ReaderProfile" ADD COLUMN "emailMarketingOptOutSource" TEXT;
