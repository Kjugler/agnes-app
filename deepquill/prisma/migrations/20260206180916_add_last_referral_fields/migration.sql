-- AlterTable
ALTER TABLE "User" ADD COLUMN "lastReferralAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "lastReferralCode" TEXT;
ALTER TABLE "User" ADD COLUMN "lastReferralEmail" TEXT;
ALTER TABLE "User" ADD COLUMN "lastReferralSource" TEXT;
ALTER TABLE "User" ADD COLUMN "lastReferredByUserId" TEXT;
