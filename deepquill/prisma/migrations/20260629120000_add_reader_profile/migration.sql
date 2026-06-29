-- CreateTable
CREATE TABLE "ReaderProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "source" TEXT,
    "readerType" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReaderProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ReaderProfile_userId_key" ON "ReaderProfile"("userId");

-- CreateIndex
CREATE INDEX "ReaderProfile_source_idx" ON "ReaderProfile"("source");

-- CreateIndex
CREATE INDEX "ReaderProfile_status_idx" ON "ReaderProfile"("status");

-- CreateIndex
CREATE INDEX "ReaderProfile_createdAt_idx" ON "ReaderProfile"("createdAt");
