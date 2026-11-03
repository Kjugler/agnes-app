-- Complimentary ebook review copies. Separate from Purchase, Order, and promotional consent.

CREATE TABLE "ComplimentaryEbookGrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "company" TEXT,
    "role" TEXT,
    "contactStreet" TEXT,
    "contactCity" TEXT,
    "contactState" TEXT,
    "contactZip" TEXT,
    "contactCountry" TEXT,
    "deliveryInstruction" TEXT,
    "purpose" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "ComplimentaryEbookGrant_active_email_title_key"
ON "ComplimentaryEbookGrant"("email", "titleKey")
WHERE "revokedAt" IS NULL;

CREATE INDEX "ComplimentaryEbookGrant_email_titleKey_idx"
ON "ComplimentaryEbookGrant"("email", "titleKey");

CREATE TABLE "ComplimentaryEbookSend" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "grantId" TEXT NOT NULL,
    "occurredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" TEXT NOT NULL,
    "providerMessageId" TEXT,
    CONSTRAINT "ComplimentaryEbookSend_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "ComplimentaryEbookGrant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ComplimentaryEbookSend_grantId_occurredAt_idx"
ON "ComplimentaryEbookSend"("grantId", "occurredAt");
