-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT,
    "phone" TEXT,
    "shippingStreet" TEXT,
    "shippingCity" TEXT,
    "shippingState" TEXT,
    "shippingZip" TEXT,
    "shippingCountry" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Customer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Customer" ("createdAt", "email", "id", "name", "phone", "shippingCity", "shippingCountry", "shippingState", "shippingStreet", "shippingZip", "updatedAt") SELECT "createdAt", "email", "id", "name", "phone", "shippingCity", "shippingCountry", "shippingState", "shippingStreet", "shippingZip", "updatedAt" FROM "Customer";
DROP TABLE "Customer";
ALTER TABLE "new_Customer" RENAME TO "Customer";
CREATE UNIQUE INDEX "Customer_email_key" ON "Customer"("email");
CREATE UNIQUE INDEX "Customer_userId_key" ON "Customer"("userId");
CREATE INDEX "Customer_email_idx" ON "Customer"("email");
CREATE INDEX "Customer_userId_idx" ON "Customer"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
