-- Jody Concierge: reading progress + email updates consent on ReaderProfile

-- AlterTable
ALTER TABLE "ReaderProfile" ADD COLUMN "lastCompletedChapterId" TEXT;
ALTER TABLE "ReaderProfile" ADD COLUMN "lastCompletedAt" DATETIME;
ALTER TABLE "ReaderProfile" ADD COLUMN "emailUpdatesConsent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ReaderProfile" ADD COLUMN "emailUpdatesConsentAt" DATETIME;
ALTER TABLE "ReaderProfile" ADD COLUMN "jodyVerifiedAt" DATETIME;
