-- AlterTable
ALTER TABLE "Order" ADD COLUMN "commissionCents" INTEGER;
ALTER TABLE "Order" ADD COLUMN "friendSavedCents" INTEGER;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "fname" TEXT,
    "lname" TEXT,
    "firstName" TEXT,
    "code" TEXT NOT NULL,
    "referralCode" TEXT NOT NULL,
    "referredBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "points" INTEGER NOT NULL DEFAULT 0,
    "earnedPurchaseBook" BOOLEAN NOT NULL DEFAULT false,
    "rabbit1Completed" BOOLEAN NOT NULL DEFAULT false,
    "rabbitStep" INTEGER NOT NULL DEFAULT 500,
    "rabbitTarget" INTEGER,
    "rabbitCatches" INTEGER NOT NULL DEFAULT 0,
    "lastRabbitBonusIntent" TEXT,
    "rabbitSeq" INTEGER NOT NULL DEFAULT 1,
    "lastRabbitCatchAt" DATETIME,
    "phone" TEXT,
    "handleX" TEXT,
    "handleInstagram" TEXT,
    "handleTiktok" TEXT,
    "handleTruth" TEXT,
    "referralEarningsCents" INTEGER NOT NULL DEFAULT 0,
    "associateBalanceCents" INTEGER NOT NULL DEFAULT 0,
    "associateLifetimeEarnedCents" INTEGER NOT NULL DEFAULT 0,
    "associateFriendsSavedCents" INTEGER NOT NULL DEFAULT 0
);
INSERT INTO "new_User" ("code", "createdAt", "earnedPurchaseBook", "email", "firstName", "fname", "handleInstagram", "handleTiktok", "handleTruth", "handleX", "id", "lastRabbitBonusIntent", "lastRabbitCatchAt", "lname", "phone", "points", "rabbit1Completed", "rabbitCatches", "rabbitSeq", "rabbitStep", "rabbitTarget", "referralCode", "referralEarningsCents", "referredBy") SELECT "code", "createdAt", "earnedPurchaseBook", "email", "firstName", "fname", "handleInstagram", "handleTiktok", "handleTruth", "handleX", "id", "lastRabbitBonusIntent", "lastRabbitCatchAt", "lname", "phone", "points", "rabbit1Completed", "rabbitCatches", "rabbitSeq", "rabbitStep", "rabbitTarget", "referralCode", "referralEarningsCents", "referredBy" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_code_key" ON "User"("code");
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
CREATE INDEX "User_referralCode_idx" ON "User"("referralCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
