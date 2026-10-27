-- CreateTable
CREATE TABLE "PromotionalNurtureRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startedAt" DATETIME NOT NULL,
    "finishedAt" DATETIME,
    "status" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "reason" TEXT,
    "examined" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "suppressed" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE INDEX "PromotionalNurtureRun_status_startedAt_idx" ON "PromotionalNurtureRun"("status", "startedAt");
