-- Add new columns to Signal
ALTER TABLE "Signal" ADD COLUMN "author" TEXT;
ALTER TABLE "Signal" ADD COLUMN "locationName" TEXT;
ALTER TABLE "Signal" ADD COLUMN "locationLat" REAL;
ALTER TABLE "Signal" ADD COLUMN "locationLng" REAL;
ALTER TABLE "Signal" ADD COLUMN "publishAt" DATETIME;
ALTER TABLE "Signal" ADD COLUMN "publishStatus" TEXT DEFAULT 'PUBLISHED';

-- Create SignalComment
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
CREATE INDEX "SignalComment_signalId_createdAt_idx" ON "SignalComment"("signalId", "createdAt");

-- Create SignalCommentUpvote
CREATE TABLE "SignalCommentUpvote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "commentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "SignalCommentUpvote_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "SignalComment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SignalCommentUpvote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SignalCommentUpvote_commentId_userId_key" ON "SignalCommentUpvote"("commentId", "userId");
CREATE INDEX "SignalCommentUpvote_commentId_idx" ON "SignalCommentUpvote"("commentId");

-- Create SignalEvent
CREATE TABLE "SignalEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signalId" TEXT NOT NULL,
    "eventText" TEXT NOT NULL,
    CONSTRAINT "SignalEvent_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "SignalEvent_signalId_createdAt_idx" ON "SignalEvent"("signalId", "createdAt");
