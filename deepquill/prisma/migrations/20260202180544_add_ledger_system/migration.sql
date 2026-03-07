/*
  Warnings:

  - A unique constraint covering the columns `[sessionId,type,userId]` on the table `Ledger` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Ledger" ADD COLUMN "amount" INTEGER;
ALTER TABLE "Ledger" ADD COLUMN "currency" TEXT;
ALTER TABLE "Ledger" ADD COLUMN "meta" JSONB;
ALTER TABLE "Ledger" ADD COLUMN "sessionId" TEXT;

-- CreateIndex
CREATE INDEX "Ledger_sessionId_idx" ON "Ledger"("sessionId");

-- CreateIndex
CREATE INDEX "Ledger_type_createdAt_idx" ON "Ledger"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Ledger_sessionId_type_userId_key" ON "Ledger"("sessionId", "type", "userId");
