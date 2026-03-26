-- CreateTable
CREATE TABLE "SignalComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signalId" TEXT NOT NULL,
    "userId" TEXT,
    "commentText" TEXT NOT NULL,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "isFlagged" BOOLEAN NOT NULL DEFAULT false,
    "flagReason" TEXT,
    CONSTRAINT "SignalComment_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SignalComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SignalCommentUpvote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "SignalCommentUpvote_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "SignalComment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SignalCommentUpvote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SignalEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signalId" TEXT NOT NULL,
    "eventText" TEXT NOT NULL,
    CONSTRAINT "SignalEvent_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Signal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT,
    "author" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "text" TEXT NOT NULL,
    "title" TEXT,
    "type" TEXT DEFAULT 'NARRATIVE',
    "content" TEXT,
    "mediaType" TEXT,
    "mediaUrl" TEXT,
    "locationTag" TEXT,
    "locationName" TEXT,
    "locationLat" REAL,
    "locationLng" REAL,
    "tags" JSONB,
    "discussionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "publishAt" DATETIME,
    "publishStatus" TEXT DEFAULT 'PUBLISHED',
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "heldReason" TEXT,
    "heldAt" DATETIME,
    "approvedAt" DATETIME,
    "rejectedAt" DATETIME,
    "countryCode" TEXT,
    "region" TEXT,
    CONSTRAINT "Signal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Signal" ("approvedAt", "countryCode", "createdAt", "heldAt", "heldReason", "id", "isAnonymous", "isSystem", "region", "rejectedAt", "status", "text", "updatedAt", "userId") SELECT "approvedAt", "countryCode", "createdAt", "heldAt", "heldReason", "id", "isAnonymous", "isSystem", "region", "rejectedAt", "status", "text", "updatedAt", "userId" FROM "Signal";
DROP TABLE "Signal";
ALTER TABLE "new_Signal" RENAME TO "Signal";
CREATE INDEX "Signal_createdAt_idx" ON "Signal"("createdAt");
CREATE INDEX "Signal_status_createdAt_idx" ON "Signal"("status", "createdAt");
CREATE INDEX "Signal_publishStatus_createdAt_idx" ON "Signal"("publishStatus", "createdAt");
CREATE INDEX "Signal_type_createdAt_idx" ON "Signal"("type", "createdAt");
CREATE INDEX "Signal_countryCode_region_createdAt_idx" ON "Signal"("countryCode", "region", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "SignalComment_signalId_createdAt_idx" ON "SignalComment"("signalId", "createdAt");

-- CreateIndex
CREATE INDEX "SignalCommentUpvote_commentId_idx" ON "SignalCommentUpvote"("commentId");

-- CreateIndex
CREATE UNIQUE INDEX "SignalCommentUpvote_commentId_userId_key" ON "SignalCommentUpvote"("commentId", "userId");

-- CreateIndex
CREATE INDEX "SignalEvent_signalId_createdAt_idx" ON "SignalEvent"("signalId", "createdAt");
