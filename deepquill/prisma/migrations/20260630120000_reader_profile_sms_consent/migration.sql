-- Reader Manager Phase IIa: SMS consent on ReaderProfile + unique phone on User

-- AlterTable
ALTER TABLE "ReaderProfile" ADD COLUMN "smsConsentGranted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ReaderProfile" ADD COLUMN "smsConsentAt" DATETIME;
ALTER TABLE "ReaderProfile" ADD COLUMN "smsConsentSource" TEXT;
ALTER TABLE "ReaderProfile" ADD COLUMN "smsConsentNotes" TEXT;

-- Keep one User per phone before unique index (legacy duplicates → phone cleared on extras)
UPDATE "User"
SET "phone" = NULL
WHERE "id" IN (
  SELECT "u"."id"
  FROM "User" AS "u"
  WHERE "u"."phone" IS NOT NULL
    AND trim("u"."phone") != ''
    AND "u"."id" NOT IN (
      SELECT MIN("id")
      FROM "User"
      WHERE "phone" IS NOT NULL AND trim("phone") != ''
      GROUP BY "phone"
    )
);

-- CreateIndex (SQLite: multiple NULL phones remain allowed)
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
