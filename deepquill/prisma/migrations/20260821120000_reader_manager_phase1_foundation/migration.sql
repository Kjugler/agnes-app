-- Reader Manager Phase 1 foundation: additive tables only.
-- Does not alter Purchase, Order, ReaderProfile, or any existing table.

-- CreateTable
CREATE TABLE "ReaderEvidence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sourceLabel" TEXT,
    "purchaseDate" DATETIME,
    "stripeSessionId" TEXT,
    "details" TEXT,
    "reason" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorLabel" TEXT NOT NULL,
    "actorId" TEXT,
    "origin" TEXT NOT NULL,
    "originRef" TEXT NOT NULL,
    "supersededById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReaderEvidence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReaderEvidence_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "ReaderEvidence" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReaderCommunication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "recipientEmailSnapshot" TEXT,
    "category" TEXT NOT NULL,
    "templateOrAskId" TEXT,
    "batchLabel" TEXT,
    "batchId" TEXT,
    "trigger" TEXT NOT NULL,
    "jobName" TEXT,
    "occurredAt" DATETIME NOT NULL,
    "outcome" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "source" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "caption" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReaderCommunication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReaderIdentityReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "primaryUserId" TEXT NOT NULL,
    "otherUserId" TEXT,
    "reasonCode" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL,
    "resolutionReason" TEXT,
    "resolvedAt" DATETIME,
    "actorType" TEXT NOT NULL,
    "actorLabel" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReaderIdentityReview_primaryUserId_fkey" FOREIGN KEY ("primaryUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ReaderIdentityReview_otherUserId_fkey" FOREIGN KEY ("otherUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReaderAdminAudit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "relatedUserId" TEXT,
    "actorType" TEXT NOT NULL,
    "actorLabel" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReaderAdminAudit_relatedUserId_fkey" FOREIGN KEY ("relatedUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReaderContactDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorLabel" TEXT NOT NULL,
    "actorId" TEXT,
    "origin" TEXT NOT NULL,
    "originRef" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReaderContactDecision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ReaderEvidence_userId_createdAt_idx" ON "ReaderEvidence"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ReaderEvidence_status_idx" ON "ReaderEvidence"("status");

-- CreateIndex
CREATE INDEX "ReaderEvidence_kind_idx" ON "ReaderEvidence"("kind");

-- CreateIndex
CREATE INDEX "ReaderEvidence_stripeSessionId_idx" ON "ReaderEvidence"("stripeSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ReaderEvidence_origin_originRef_key" ON "ReaderEvidence"("origin", "originRef");

-- CreateIndex
CREATE INDEX "ReaderCommunication_userId_occurredAt_idx" ON "ReaderCommunication"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "ReaderCommunication_category_idx" ON "ReaderCommunication"("category");

-- CreateIndex
CREATE INDEX "ReaderCommunication_outcome_idx" ON "ReaderCommunication"("outcome");

-- CreateIndex
CREATE UNIQUE INDEX "ReaderCommunication_source_sourceRef_key" ON "ReaderCommunication"("source", "sourceRef");

-- CreateIndex
CREATE INDEX "ReaderIdentityReview_status_createdAt_idx" ON "ReaderIdentityReview"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ReaderIdentityReview_primaryUserId_idx" ON "ReaderIdentityReview"("primaryUserId");

-- CreateIndex
CREATE INDEX "ReaderIdentityReview_otherUserId_idx" ON "ReaderIdentityReview"("otherUserId");

-- CreateIndex
CREATE INDEX "ReaderAdminAudit_relatedUserId_createdAt_idx" ON "ReaderAdminAudit"("relatedUserId", "createdAt");

-- CreateIndex
CREATE INDEX "ReaderAdminAudit_entityType_entityId_idx" ON "ReaderAdminAudit"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ReaderAdminAudit_createdAt_idx" ON "ReaderAdminAudit"("createdAt");

-- CreateIndex
CREATE INDEX "ReaderContactDecision_userId_createdAt_idx" ON "ReaderContactDecision"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReaderContactDecision_origin_originRef_key" ON "ReaderContactDecision"("origin", "originRef");
