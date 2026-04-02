-- CreateTable
CREATE TABLE "DailyContestSummary" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "summaryDate" TEXT NOT NULL,
    "firstUserId" TEXT,
    "secondUserId" TEXT,
    "thirdUserId" TEXT,
    "firstDailyPoints" INTEGER,
    "secondDailyPoints" INTEGER,
    "thirdDailyPoints" INTEGER,
    "firstDisplayName" TEXT,
    "secondDisplayName" TEXT,
    "thirdDisplayName" TEXT,
    "firstDisplayOverride" TEXT,
    "secondDisplayOverride" TEXT,
    "thirdDisplayOverride" TEXT,
    "contestantCount" INTEGER NOT NULL DEFAULT 0,
    "liveLeaderUserId" TEXT,
    "liveLeaderDisplayName" TEXT,
    "liveLeaderTotalPoints" INTEGER,
    "cashChallengeWinnerUserId" TEXT,
    "cashChallengeWinnerDisplayName" TEXT,
    "cashChallengeClaimInstructions" TEXT,
    "cashChallengeClaimed" BOOLEAN NOT NULL DEFAULT false,
    "placementPointsAwardedAt" DATETIME,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "manuallyEditedNames" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "DailyContestSummary_firstUserId_fkey" FOREIGN KEY ("firstUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DailyContestSummary_secondUserId_fkey" FOREIGN KEY ("secondUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DailyContestSummary_thirdUserId_fkey" FOREIGN KEY ("thirdUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DailyContestSummary_liveLeaderUserId_fkey" FOREIGN KEY ("liveLeaderUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DailyContestSummary_cashChallengeWinnerUserId_fkey" FOREIGN KEY ("cashChallengeWinnerUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyContestSummary_summaryDate_key" ON "DailyContestSummary"("summaryDate");

-- CreateIndex
CREATE INDEX "DailyContestSummary_summaryDate_idx" ON "DailyContestSummary"("summaryDate");
