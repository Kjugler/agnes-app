-- CreateTable
CREATE TABLE "FulfillmentUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

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
    "status" TEXT NOT NULL DEFAULT 'pending',
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
    CONSTRAINT "Order_labelPrintedById_fkey" FOREIGN KEY ("labelPrintedById") REFERENCES "FulfillmentUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Order_shippedById_fkey" FOREIGN KEY ("shippedById") REFERENCES "FulfillmentUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("amountTotal", "contestPlayerId", "createdAt", "currency", "customerId", "id", "pointsAwarded", "referralCode", "shippingAddressLine1", "shippingAddressLine2", "shippingCity", "shippingCountry", "shippingName", "shippingPhone", "shippingPostalCode", "shippingState", "stripeSessionId", "updatedAt") SELECT "amountTotal", "contestPlayerId", "createdAt", "currency", "customerId", "id", "pointsAwarded", "referralCode", "shippingAddressLine1", "shippingAddressLine2", "shippingCity", "shippingCountry", "shippingName", "shippingPhone", "shippingPostalCode", "shippingState", "stripeSessionId", "updatedAt" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_stripeSessionId_key" ON "Order"("stripeSessionId");
CREATE INDEX "Order_customerId_createdAt_idx" ON "Order"("customerId", "createdAt");
CREATE INDEX "Order_stripeSessionId_idx" ON "Order"("stripeSessionId");
CREATE INDEX "Order_contestPlayerId_idx" ON "Order"("contestPlayerId");
CREATE INDEX "Order_status_idx" ON "Order"("status");
CREATE INDEX "Order_labelPrintedById_idx" ON "Order"("labelPrintedById");
CREATE INDEX "Order_shippedById_idx" ON "Order"("shippedById");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "FulfillmentUser_email_key" ON "FulfillmentUser"("email");

-- CreateIndex
CREATE INDEX "FulfillmentUser_email_idx" ON "FulfillmentUser"("email");
