-- Phase 1A: Jody mobile chapter delivery tracking
-- SQLite

ALTER TABLE "ReaderProfile" ADD COLUMN "lastDeliveredChapterId" TEXT;
ALTER TABLE "ReaderProfile" ADD COLUMN "lastDeliveredAt" DATETIME;
