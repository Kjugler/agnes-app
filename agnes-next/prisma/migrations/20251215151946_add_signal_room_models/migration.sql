-- CreateTable
CREATE TABLE "Signal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "userId" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "heldReason" TEXT,
    "heldAt" DATETIME,
    "approvedAt" DATETIME,
    "rejectedAt" DATETIME,
    "countryCode" TEXT,
    "region" TEXT,
    CONSTRAINT "Signal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SignalReply" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signalId" TEXT NOT NULL,
    "userId" TEXT,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "text" TEXT NOT NULL,
    CONSTRAINT "SignalReply_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SignalReply_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SignalAcknowledge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "SignalAcknowledge_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SignalAcknowledge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Signal_createdAt_idx" ON "Signal"("createdAt");

-- CreateIndex
CREATE INDEX "Signal_status_createdAt_idx" ON "Signal"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Signal_countryCode_region_createdAt_idx" ON "Signal"("countryCode", "region", "createdAt");

-- CreateIndex
CREATE INDEX "SignalReply_signalId_createdAt_idx" ON "SignalReply"("signalId", "createdAt");

-- CreateIndex
CREATE INDEX "SignalAcknowledge_signalId_createdAt_idx" ON "SignalAcknowledge"("signalId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SignalAcknowledge_signalId_userId_key" ON "SignalAcknowledge"("signalId", "userId");
