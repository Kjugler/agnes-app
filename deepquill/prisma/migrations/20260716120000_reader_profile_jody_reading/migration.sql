-- Jody Concierge: reading progress + email updates consent on ReaderProfile

ALTER TABLE "ReaderProfile" ADD COLUMN IF NOT EXISTS "lastCompletedChapterId" TEXT;
ALTER TABLE "ReaderProfile" ADD COLUMN IF NOT EXISTS "lastCompletedAt" TIMESTAMP(3);
ALTER TABLE "ReaderProfile" ADD COLUMN IF NOT EXISTS "emailUpdatesConsent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ReaderProfile" ADD COLUMN IF NOT EXISTS "emailUpdatesConsentAt" TIMESTAMP(3);
ALTER TABLE "ReaderProfile" ADD COLUMN IF NOT EXISTS "jodyVerifiedAt" TIMESTAMP(3);
