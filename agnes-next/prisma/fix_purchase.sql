CREATE TABLE IF NOT EXISTS "Purchase" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "userId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL UNIQUE,
  "amount" INTEGER,
  "currency" TEXT,
  "source" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Purchase_userId_createdAt_idx"
ON "Purchase" ("userId","createdAt");
