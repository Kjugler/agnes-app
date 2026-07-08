-- AlterTable
ALTER TABLE "User" ADD COLUMN "readerRecommendationOutreachBatch" TEXT;

-- Backfill Batch 1 label for recipients already sent the recommendation email
UPDATE "User"
SET "readerRecommendationOutreachBatch" = 'Recommendation Email Batch 1'
WHERE "readerRecommendationOutreachSentAt" IS NOT NULL
  AND ("readerRecommendationOutreachBatch" IS NULL OR "readerRecommendationOutreachBatch" = '');
