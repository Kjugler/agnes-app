-- Phase D: prospect nurture + lead attribution on ReaderProfile
-- SQLite

ALTER TABLE "ReaderProfile" ADD COLUMN "emailMarketingConsentAt" DATETIME;
ALTER TABLE "ReaderProfile" ADD COLUMN "leadAttribution" JSONB;
ALTER TABLE "ReaderProfile" ADD COLUMN "prospectNurtureEnrolledAt" DATETIME;
ALTER TABLE "ReaderProfile" ADD COLUMN "prospectNurtureStep" INTEGER;
ALTER TABLE "ReaderProfile" ADD COLUMN "prospectNurtureLastSentAt" DATETIME;
ALTER TABLE "ReaderProfile" ADD COLUMN "prospectNurtureSuppressedAt" DATETIME;
ALTER TABLE "ReaderProfile" ADD COLUMN "prospectNurtureSuppressedReason" TEXT;
