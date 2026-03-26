-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Signal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "text" TEXT NOT NULL,
    "title" TEXT,
    "type" TEXT DEFAULT 'NARRATIVE',
    "content" TEXT,
    "mediaType" TEXT,
    "mediaUrl" TEXT,
    "locationTag" TEXT,
    "tags" TEXT,
    "discussionEnabled" BOOLEAN NOT NULL DEFAULT true,
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
CREATE INDEX "Signal_countryCode_region_createdAt_idx" ON "Signal"("countryCode", "region", "createdAt");
CREATE INDEX "Signal_type_createdAt_idx" ON "Signal"("type", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
