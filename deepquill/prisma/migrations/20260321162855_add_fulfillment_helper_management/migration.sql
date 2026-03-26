-- CreateTable
CREATE TABLE "FulfillmentPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fulfillmentUserId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "paidAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FulfillmentPayment_fulfillmentUserId_fkey" FOREIGN KEY ("fulfillmentUserId") REFERENCES "FulfillmentUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FulfillmentUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_FulfillmentUser" ("createdAt", "email", "id", "name", "updatedAt") SELECT "createdAt", "email", "id", "name", "updatedAt" FROM "FulfillmentUser";
DROP TABLE "FulfillmentUser";
ALTER TABLE "new_FulfillmentUser" RENAME TO "FulfillmentUser";
CREATE UNIQUE INDEX "FulfillmentUser_email_key" ON "FulfillmentUser"("email");
CREATE INDEX "FulfillmentUser_email_idx" ON "FulfillmentUser"("email");
CREATE INDEX "FulfillmentUser_active_idx" ON "FulfillmentUser"("active");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "FulfillmentPayment_fulfillmentUserId_idx" ON "FulfillmentPayment"("fulfillmentUserId");
