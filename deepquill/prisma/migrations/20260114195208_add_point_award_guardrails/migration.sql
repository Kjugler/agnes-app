-- CreateTable
CREATE TABLE "PointAward" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "awardDay" TEXT NOT NULL,
    "sku" TEXT,
    "referrerId" TEXT,
    "referredUserId" TEXT,
    "purchaseId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PointAward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PointAward_userId_idx" ON "PointAward"("userId");

-- CreateIndex
CREATE INDEX "PointAward_kind_idx" ON "PointAward"("kind");

-- CreateIndex
CREATE INDEX "PointAward_awardDay_idx" ON "PointAward"("awardDay");

-- CreateIndex
CREATE INDEX "PointAward_referrerId_referredUserId_idx" ON "PointAward"("referrerId", "referredUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PointAward_userId_kind_awardDay_key" ON "PointAward"("userId", "kind", "awardDay");

-- CreateIndex
CREATE UNIQUE INDEX "PointAward_referrerId_referredUserId_sku_kind_key" ON "PointAward"("referrerId", "referredUserId", "sku", "kind");
