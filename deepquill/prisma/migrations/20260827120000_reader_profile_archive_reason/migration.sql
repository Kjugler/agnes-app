-- Additive archive metadata on ReaderProfile.
-- Existing rows stay unarchived with NULL reason/details/prior status.
-- Does not rebuild ReaderProfile, User, Purchase, Order, or any other table.

-- AlterTable
ALTER TABLE "ReaderProfile" ADD COLUMN "archiveReasonCode" TEXT;
ALTER TABLE "ReaderProfile" ADD COLUMN "archiveDetails" TEXT;
ALTER TABLE "ReaderProfile" ADD COLUMN "archivePriorStatus" TEXT;
