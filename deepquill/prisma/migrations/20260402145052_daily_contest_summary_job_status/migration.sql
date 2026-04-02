-- CreateTable
CREATE TABLE "DailyContestSummaryJobStatus" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lastRunAt" DATETIME,
    "lastSuccessAt" DATETIME,
    "lastError" TEXT,
    "updatedAt" DATETIME NOT NULL
);
