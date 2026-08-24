-- Additive idempotency ledger for Reader Manager mutations.
-- resultJson stores a minimal mutation receipt only (IDs/action/warnings), never
-- the reader GET payload or PII. Does not alter Purchase, Order, ReaderProfile,
-- User, or existing lifecycle tables.

-- CreateTable
CREATE TABLE "ReaderMutationIdempotency" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "origin" TEXT NOT NULL,
    "originRef" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "relatedUserId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "resultJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "ReaderMutationIdempotency_origin_originRef_key" ON "ReaderMutationIdempotency"("origin", "originRef");

-- CreateIndex
CREATE INDEX "ReaderMutationIdempotency_createdAt_idx" ON "ReaderMutationIdempotency"("createdAt");
