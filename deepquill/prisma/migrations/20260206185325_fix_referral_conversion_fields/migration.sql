-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ReferralConversion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "referrerUserId" TEXT NOT NULL,
    "referralCode" TEXT NOT NULL,
    "buyerEmail" TEXT,
    "stripeSessionId" TEXT NOT NULL,
    "commissionCents" INTEGER NOT NULL,
    "savingsCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastDigestDate" DATETIME,
    CONSTRAINT "ReferralConversion_referrerUserId_fkey" FOREIGN KEY ("referrerUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ReferralConversion" ("buyerEmail", "commissionCents", "createdAt", "id", "lastDigestDate", "referralCode", "referrerUserId", "stripeSessionId") SELECT "buyerEmail", "commissionCents", "createdAt", "id", "lastDigestDate", "referralCode", "referrerUserId", "stripeSessionId" FROM "ReferralConversion";
DROP TABLE "ReferralConversion";
ALTER TABLE "new_ReferralConversion" RENAME TO "ReferralConversion";
CREATE UNIQUE INDEX "ReferralConversion_stripeSessionId_key" ON "ReferralConversion"("stripeSessionId");
CREATE INDEX "ReferralConversion_referrerUserId_createdAt_idx" ON "ReferralConversion"("referrerUserId", "createdAt");
CREATE INDEX "ReferralConversion_referralCode_idx" ON "ReferralConversion"("referralCode");
CREATE INDEX "ReferralConversion_lastDigestDate_idx" ON "ReferralConversion"("lastDigestDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
