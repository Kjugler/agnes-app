-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "stripeSessionId" TEXT NOT NULL,
    "amountTotal" INTEGER,
    "currency" TEXT,
    "contestPlayerId" TEXT,
    "referralCode" TEXT,
    "pointsAwarded" BOOLEAN NOT NULL DEFAULT false,
    "commissionCents" INTEGER,
    "friendSavedCents" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reservedAt" DATETIME,
    "reservedById" TEXT,
    "labelPrintedAt" DATETIME,
    "shippedAt" DATETIME,
    "labelPrintedById" TEXT,
    "shippedById" TEXT,
    "shippingName" TEXT,
    "shippingAddressLine1" TEXT,
    "shippingAddressLine2" TEXT,
    "shippingCity" TEXT,
    "shippingState" TEXT,
    "shippingPostalCode" TEXT,
    "shippingCountry" TEXT,
    "shippingPhone" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Order_reservedById_fkey" FOREIGN KEY ("reservedById") REFERENCES "FulfillmentUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_labelPrintedById_fkey" FOREIGN KEY ("labelPrintedById") REFERENCES "FulfillmentUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_shippedById_fkey" FOREIGN KEY ("shippedById") REFERENCES "FulfillmentUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("amountTotal", "commissionCents", "contestPlayerId", "createdAt", "currency", "customerId", "friendSavedCents", "id", "labelPrintedAt", "labelPrintedById", "pointsAwarded", "referralCode", "shippedAt", "shippedById", "shippingAddressLine1", "shippingAddressLine2", "shippingCity", "shippingCountry", "shippingName", "shippingPhone", "shippingPostalCode", "shippingState", "status", "stripeSessionId", "updatedAt") SELECT "amountTotal", "commissionCents", "contestPlayerId", "createdAt", "currency", "customerId", "friendSavedCents", "id", "labelPrintedAt", "labelPrintedById", "pointsAwarded", "referralCode", "shippedAt", "shippedById", "shippingAddressLine1", "shippingAddressLine2", "shippingCity", "shippingCountry", "shippingName", "shippingPhone", "shippingPostalCode", "shippingState", "status", "stripeSessionId", "updatedAt" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_stripeSessionId_key" ON "Order"("stripeSessionId");
CREATE INDEX "Order_customerId_createdAt_idx" ON "Order"("customerId", "createdAt");
CREATE INDEX "Order_stripeSessionId_idx" ON "Order"("stripeSessionId");
CREATE INDEX "Order_contestPlayerId_idx" ON "Order"("contestPlayerId");
CREATE INDEX "Order_status_idx" ON "Order"("status");
CREATE INDEX "Order_reservedById_idx" ON "Order"("reservedById");
CREATE INDEX "Order_status_reservedAt_idx" ON "Order"("status", "reservedAt");
CREATE INDEX "Order_labelPrintedById_idx" ON "Order"("labelPrintedById");
CREATE INDEX "Order_shippedById_idx" ON "Order"("shippedById");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
